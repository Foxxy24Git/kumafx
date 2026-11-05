<template>
    <div class="geomap-page">
        <div class="geomap-content">
            <aside class="geomap-sidebar">
                <MonitorList :scrollbar="true" :on-monitor-click="focusMonitor" />
            </aside>
            <div ref="map" class="geomap"></div>
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
    },
    beforeUnmount() {
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
    }

    .geomap {
        height: 55%;
    }
}
</style>
