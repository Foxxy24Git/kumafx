<template>
    <div class="geomap-page">
        <div class="geomap-content" :class="{ 'geomap-sidebar-collapsed': sidebarCollapsed }">
            <aside class="geomap-sidebar">
                <MonitorList :scrollbar="true" :on-monitor-click="focusMonitor" />
            </aside>
            <button
                class="geomap-sidebar-toggle"
                type="button"
                :aria-label="sidebarCollapsed ? 'Tampilkan daftar monitor' : 'Sembunyikan daftar monitor'"
                :title="sidebarCollapsed ? 'Tampilkan daftar monitor' : 'Sembunyikan daftar monitor'"
                @click="toggleSidebar"
            >
                {{ sidebarCollapsed ? ">" : "<" }}
            </button>
            <div ref="map" class="geomap">
                <button
                    class="geomap-fullscreen-toggle"
                    type="button"
                    :aria-label="isFullscreen ? 'Keluar dari layar penuh' : 'Tampilkan peta layar penuh'"
                    :title="isFullscreen ? 'Keluar dari layar penuh' : 'Tampilkan peta layar penuh'"
                    @click.stop="toggleFullscreen"
                >
                    {{ isFullscreen ? "⤢" : "⛶" }}
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import L from "leaflet";
import MonitorList from "../components/MonitorList.vue";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

const colors = {
    UP: "#8cb82b",
    DOWN: "#dc2626",
    WARN: "#eab308",
    PAUSED: "#64748b",
    PENDING: "#3b82f6",
};

export default {
    name: "NocGeoMap",
    components: {
        MonitorList,
    },
    data() {
        return {
            map: null,
            cluster: null,
            markers: new Map(),
            selectedMonitorId: null,
            search: "",
            statusFilter: "ALL",
            groupFilter: "ALL",
            sidebarCollapsed: false,
            isFullscreen: false,
        };
    },
    computed: {
        monitors() {
            return Object.values(this.$root.monitorList || {}).filter((m) => m.type !== "group");
        },
        groups() {
            return Object.values(this.$root.monitorList || {}).filter((m) => m.type === "group");
        },
        mappedMonitors() {
            return this.monitors.filter((m) => this.coordinates(m) && this.matches(m));
        },
        unmappedCount() {
            return this.monitors.filter((m) => !this.coordinates(m)).length;
        },
    },
    watch: {
        "$root.lastHeartbeatList": {
            deep: true,
            handler() {
                this.renderMarkers();
            },
        },
        search() {
            this.renderMarkers();
        },
        statusFilter() {
            this.renderMarkers();
        },
        groupFilter() {
            this.renderMarkers();
        },
        "$root.monitorList": {
            deep: true,
            handler() {
                this.renderMarkers();
            },
        },
    },
    mounted() {
        this.map = L.map(this.$refs.map, {
            preferCanvas: true,
        }).setView([-2.5489, 118.0149], 5);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
        }).addTo(this.map);

        this.cluster = L.markerClusterGroup({
            maxClusterRadius: 40,
            disableClusteringAtZoom: 16,
            iconCreateFunction: (cluster) => {
                const priority = ["DOWN", "WARN", "PENDING", "UP", "PAUSED"];
                const statuses = cluster.getAllChildMarkers().map((marker) => marker.options.monitorStatus);
                const status = priority.find((item) => statuses.includes(item)) || "PENDING";
                const color = colors[status];
                return L.divIcon({
                    html: `<div style="background-color: ${color};">${cluster.getChildCount()}</div>`,
                    className: `marker-cluster marker-cluster-${status.toLowerCase()}`,
                    iconSize: L.point(40, 40),
                });
            },
        });
        this.map.addLayer(this.cluster);
        this.renderMarkers();

        document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    },
    beforeUnmount() {
        document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
        if (this.map) {
            this.map.remove();
        }
    },
    methods: {
        coordinates(monitor) {
            const raw = String(monitor.coordinates || "").trim();
            if (!raw) {
                return null;
            }
            const parts = raw.split(",").map((item) => Number.parseFloat(item.trim()));
            if (parts.length !== 2) {
                return null;
            }
            const [lat, lng] = parts;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
            }
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return null;
            }
            return [lat, lng];
        },
        heartbeat(monitor) {
            return this.$root.lastHeartbeatList?.[monitor.id] || this.$root.lastHeartbeatList?.[String(monitor.id)];
        },
        status(monitor) {
            const beat = this.heartbeat(monitor);
            if (monitor.active === false || monitor.active === 0 || beat?.status === 3) {
                return "PAUSED";
            }
            if (!beat) {
                return "PENDING";
            }
            if (beat.status === 0) {
                return "DOWN";
            }
            if (beat.status === 2) {
                return "PENDING";
            }
            if (typeof beat.ping === "number" && beat.ping > 150) {
                return "WARN";
            }
            return "UP";
        },
        matches(monitor) {
            const query = this.search.toLowerCase();
            const textMatch = !query || `${monitor.name} ${monitor.hostname || ""} ${monitor.url || ""}`.toLowerCase().includes(query);
            const statusMatch = this.statusFilter === "ALL" || this.status(monitor) === this.statusFilter;
            const groupMatch = this.groupFilter === "ALL" || String(monitor.parent) === this.groupFilter;
            return textMatch && statusMatch && groupMatch;
        },
        renderMarkers() {
            if (!this.cluster) {
                return;
            }
            this.cluster.clearLayers();
            this.markers.clear();
            this.mappedMonitors.forEach((monitor) => {
                const beat = this.heartbeat(monitor);
                const status = this.status(monitor);
                const coords = this.coordinates(monitor);
                if (!coords) {
                    return;
                }
                const isSelected = String(monitor.id) === String(this.selectedMonitorId);
                const marker = L.circleMarker(coords, {
                    radius: isSelected ? 11 : 8,
                    color: isSelected ? "#ffd60a" : "#ffffff",
                    weight: isSelected ? 3 : 2,
                    fillColor: colors[status],
                    fillOpacity: 0.9,
                    monitorStatus: status,
                });
                const groupName = this.groups.find((g) => String(g.id) === String(monitor.parent))?.name || "Ungrouped";
                const pingText = beat && typeof beat.ping === "number" ? `${beat.ping} ms` : "N/A";
                const popupContent = `
                    <div style="font-size: 13px; line-height: 1.4;">
                        <strong>${this.escape(monitor.name)}</strong>
                        <div><span style="color:${colors[status]}; font-weight: bold;">${status}</span></div>
                        <div>${this.escape(monitor.hostname || monitor.url || "-")}</div>
                        <div>Group: ${this.escape(groupName)}</div>
                        <div>Ping: ${pingText}</div>
                        <div style="margin-top: 6px;"><a href="/dashboard/${monitor.id}">Open Monitor</a></div>
                    </div>
                `;
                marker.bindPopup(popupContent);
                this.cluster.addLayer(marker);
                this.markers.set(String(monitor.id), marker);
            });
        },
        focusMonitor(monitor) {
            const coords = this.coordinates(monitor);
            if (!coords) {
                this.$root.toastError(`"${monitor.name}" belum memiliki koordinat lokasi`);
                return;
            }

            this.selectedMonitorId = monitor.id;
            this.renderMarkers();

            this.map.setView(coords, Math.max(this.map.getZoom(), 14), {
                animate: true,
            });

            const marker = this.markers.get(String(monitor.id));
            if (marker) {
                if (this.cluster.getVisibleParent) {
                    const visibleParent = this.cluster.getVisibleParent(marker);
                    if (visibleParent && visibleParent !== marker) {
                        this.cluster.zoomToShowLayer(marker, () => marker.openPopup());
                        return;
                    }
                }
                marker.openPopup();
            }
        },
        toggleSidebar() {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            this.$nextTick(() => {
                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize();
                    }
                }, 220);
            });
        },
        toggleFullscreen() {
            if (!document.fullscreenElement) {
                this.$refs.map.requestFullscreen().catch(() => {
                    this.$root.toastError("Browser tidak mendukung mode layar penuh");
                });
            } else {
                document.exitFullscreen();
            }
        },
        handleFullscreenChange() {
            this.isFullscreen = document.fullscreenElement === this.$refs.map;
            this.$nextTick(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            });
        },
        escape(value) {
            return String(value).replace(/[&<>"']/g, (char) => {
                const map = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#039;",
                };
                return map[char];
            });
        },
    },
};
</script>

<style>
.geomap-page {
    height: calc(100vh - 90px);
    display: flex;
    flex-direction: column;
}

.geomap-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    flex-wrap: wrap;
    flex-shrink: 0;
}

.geomap-toolbar h1 {
    margin: 0;
    font-size: 1.35rem;
}

.geomap-toolbar input {
    min-width: 220px;
    width: auto;
}

.geomap-toolbar select {
    width: auto;
}

.geomap-content {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
    overflow: hidden;
}

.geomap {
    flex: 1;
    height: 100%;
    min-width: 0;
}

.geomap:fullscreen {
    width: 100vw;
    height: 100vh;
}

.geomap-fullscreen-toggle {
    position: absolute;
    z-index: 1000;
    top: 80px;
    left: 10px;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 2px solid rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    background: #fff;
    color: #333;
    font-size: 20px;
    line-height: 30px;
    text-align: center;
    cursor: pointer;
}

.geomap-fullscreen-toggle:hover {
    background: #f4f4f4;
}

.geomap-sidebar {
    width: 480px;
    max-width: 45vw;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    overflow: hidden;
    background-color: var(--bs-body-bg);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    transition: width 200ms ease, max-width 200ms ease, padding 200ms ease;
}

.geomap-sidebar-collapsed .geomap-sidebar {
    width: 0;
    max-width: 0;
    padding: 0;
    border: 0;
}

.geomap-sidebar-toggle {
    position: absolute;
    z-index: 1000;
    left: 480px;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 48px;
    padding: 0;
    border: 1px solid var(--bs-border-color);
    border-radius: 0 6px 6px 0;
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    cursor: pointer;
    transition: left 200ms ease;
}

.geomap-sidebar-collapsed .geomap-sidebar-toggle {
    left: 14px;
}

@media (max-width: 1066px) and (min-width: 992px) {
    .geomap-sidebar-toggle {
        left: 45vw;
    }
}

.geomap-sidebar .shadow-box {
    height: 100% !important;
    margin-bottom: 0 !important;
    display: flex;
    flex-direction: column;
}

@media (max-width: 991px) {
    .geomap-content {
        flex-direction: column;
    }

    .geomap-sidebar {
        width: 100%;
        max-width: 100%;
        height: 45%;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        transition: height 200ms ease, padding 200ms ease;
    }

    .geomap-sidebar-collapsed .geomap-sidebar {
        width: 100%;
        max-width: 100%;
        height: 0;
        padding: 0;
        border: 0;
    }

    .geomap-sidebar-toggle {
        left: 50%;
        top: 45%;
        transform: translate(-50%, -50%);
        width: 48px;
        height: 24px;
        border-radius: 0 0 6px 6px;
    }

    .geomap-sidebar-collapsed .geomap-sidebar-toggle {
        left: 50%;
        top: 12px;
    }

    .geomap {
        height: 55%;
    }

    .geomap-sidebar-collapsed .geomap {
        height: 100%;
    }
}
</style>
