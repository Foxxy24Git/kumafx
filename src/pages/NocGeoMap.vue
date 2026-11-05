<template>
    <div class="geomap-page">
        <div class="geomap-toolbar">
            <h1>Geo MAP</h1>
            <span class="badge bg-secondary">{{ mappedMonitors.length }} mapped / {{ unmappedCount }} unmapped</span>
            <input v-model.trim="search" type="search" placeholder="Search name / IP" class="form-control" />
            <select v-model="statusFilter" class="form-select">
                <option value="ALL">All status</option>
                <option value="UP">UP</option>
                <option value="DOWN">DOWN</option>
                <option value="WARN">WARN</option>
                <option value="PENDING">PENDING</option>
                <option value="PAUSED">PAUSED</option>
            </select>
            <select v-model="groupFilter" class="form-select">
                <option value="ALL">All groups</option>
                <option v-for="group in groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option>
            </select>
        </div>
        <div ref="map" class="geomap"></div>
    </div>
</template>

<script>
import L from "leaflet";
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
    data() {
        return {
            map: null,
            cluster: null,
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
            this.mappedMonitors.forEach((monitor) => {
                const beat = this.heartbeat(monitor);
                const status = this.status(monitor);
                const coords = this.coordinates(monitor);
                if (!coords) {
                    return;
                }
                const marker = L.circleMarker(coords, {
                    radius: 8,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: colors[status],
                    fillOpacity: 0.9,
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

<style scoped>
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

.geomap {
    flex: 1;
    min-height: 400px;
}
</style>
