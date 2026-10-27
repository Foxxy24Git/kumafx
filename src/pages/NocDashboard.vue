<template>
    <div class="noc-page container-fluid py-4">
        <div class="noc-header mb-4">
            <div>
                <div class="noc-eyebrow">LIVE OPERATIONS</div>
                <h1>NOC Dashboard</h1>
                <p class="mb-0 text-muted">Ringkasan jaringan secara realtime dari Uptime Kuma</p>
            </div>
            <div class="noc-live" :class="{ disconnected: !$root.socket.connected }">
                <span class="noc-live-dot"></span>
                {{ $root.socket.connected ? "Live Monitoring" : "Connection lost · data may be stale" }}
            </div>
        </div>

        <div class="noc-cards mb-4">
            <button
                v-for="(card, index) in config.cards"
                :key="card.id"
                type="button"
                class="noc-kpi"
                :class="card.statusType === 'DOWN' ? 'noc-kpi-down' : 'noc-kpi-up'"
                @click="editCard(index)"
            >
                <span class="noc-kpi-label">{{ card.title || `Kartu ${index + 1}` }}</span>
                <span class="noc-kpi-value">{{ getCardCount(card, normalized) }}</span>
                <span class="noc-kpi-footer">
                    {{ card.statusType }} · {{ card.groupIds.length }} grup
                    <font-awesome-icon icon="pen" />
                </span>
            </button>
        </div>

        <div class="noc-main">
            <section class="noc-panel noc-treemap-panel">
                <div class="noc-panel-head">
                    <div><small>GROUP OVERVIEW</small><h2>Multi Core</h2></div>
                    <span class="noc-count">{{ filteredMonitors.length }} node · {{ treemapGroups.length }} grup</span>
                </div>
                <div class="noc-multicore-toolbar">
                    <div class="noc-brand"><span class="noc-live-dot"></span>ATM MULTI-CORE OPS</div>
                    <label class="noc-filter">Grup:
                        <select v-model="groupFilter">
                            <option value="ALL">Semua Grup ({{ normalized.groups.length }} Wilayah)</option>
                            <option v-for="group in normalized.groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option>
                        </select>
                    </label>
                    <label class="noc-filter">Status:
                        <select v-model="statusFilter">
                            <option value="ALL">Semua Status</option>
                            <option value="DOWN">Down (Offline)</option>
                            <option value="WARN">Warning (Latency/Jitter)</option>
                            <option value="UP">Up (Online)</option>
                            <option value="PAUSED">Maintenance / Paused</option>
                            <option value="PENDING">Pending</option>
                        </select>
                    </label>
                    <label class="noc-filter noc-search">Cari:
                        <input v-model.trim="searchQuery" type="search" placeholder="Nama ATM / IP / Lokasi..." />
                    </label>
                    <div class="noc-stats">
                        <button v-for="stat in statusStats" :key="stat.key" type="button" class="noc-stat" :class="[`noc-stat-${stat.key.toLowerCase()}`, { active: statusFilter === stat.key }]" @click="toggleStatus(stat.key)">
                            <i></i>{{ stat.count }} {{ stat.label }}
                        </button>
                    </div>
                    <button type="button" class="noc-toolbar-button" @click="resetFilters">↺ Reset Zoom</button>
                </div>
                <div ref="multicore" class="noc-multicore-list" :style="{ height: `${treemapHeight}px` }">
                    <div v-if="!treemapGroups.length" class="noc-empty">Tidak ada node ATM yang cocok dengan filter.</div>
                    <div
                        v-for="group in treemapGroups"
                        :key="group.id"
                        class="noc-group-card"
                        :style="{
                            position: 'absolute',
                            left: `${group.x}px`,
                            top: `${group.y}px`,
                            width: `${group.width}px`,
                            height: `${group.height}px`,
                        }"
                    >
                        <div class="noc-group-card-header" @dblclick="zoomGroup(group)">
                            <div class="noc-group-title">
                                <strong>{{ group.name }}</strong>
                                <span class="noc-group-count">({{ group.children.length }})</span>
                            </div>
                        </div>
                        <div class="noc-group-mosaic" :style="{ height: `${group.contentHeight}px` }">
                            <button
                                v-for="node in group.children"
                                :key="node.id"
                                type="button"
                                class="noc-mosaic-cell"
                                :class="`noc-cell-${node.status.toLowerCase()}`"
                                :aria-label="`${node.name} · ${node.status} · ${node.hostname}`"
                                :title="`${node.name} · ${node.hostname} · ${node.group}\n${node.status} · ${node.ping ?? '-'} ms · ${node.lastHeartbeat || '-'}\n${node.errorMessage || ''}`"
                                :style="{
                                    left: `${node.x}px`,
                                    top: `${node.y}px`,
                                    width: `${node.width}px`,
                                    height: `${node.height}px`,
                                }"
                                @click="selectedMonitor = node"
                            >
                                <strong class="noc-cell-name">{{ node.name }}</strong>
                                <span class="noc-cell-tag">{{ node.status }}</span>
                                <span class="noc-cell-tooltip" role="tooltip">
                                    {{ node.name }} · {{ node.hostname }} · {{ node.group }}<br />
                                    {{ node.status }} · {{ node.ping ?? "-" }} ms · {{ node.lastHeartbeat || "-" }}<br />
                                    {{ node.errorMessage || "" }}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
                <footer class="noc-status-footer">
                    <div class="noc-legend-chips">
                        <div class="noc-legend-chip"><span class="box bg-up"></span> Up (OK)</div>
                        <div class="noc-legend-chip"><span class="box bg-warn"></span> Warning (&gt;150ms / Jitter)</div>
                        <div class="noc-legend-chip"><span class="box bg-down"></span> Down (Packet Loss 100%)</div>
                        <div class="noc-legend-chip"><span class="box bg-paused"></span> Maintenance / Unmanaged</div>
                        <div class="noc-legend-chip"><span class="box bg-pending"></span> Pending</div>
                    </div>
                    <div>Sistem: Uptime Kuma Multi-Core Treemap | Kapasitas: 400+ ATM Node</div>
                </footer>
            </section>

            <div class="noc-right">
                <section class="noc-panel noc-circle-panel">
                    <div class="noc-panel-head">
                        <div>
                            <small>STATUS HIERARCHY</small>
                            <h2>Circle View</h2>
                        </div>
                        <span class="noc-count">Grup / Node / Tag</span>
                    </div>
                    <div v-if="!arcs.length" class="noc-empty">Belum ada data untuk ditampilkan.</div>
                    <svg
                        v-else
                        viewBox="0 0 600 600"
                        class="noc-circle"
                        role="img"
                        aria-label="Sunburst status by group hostname and tag"
                    >
                        <g
                            v-for="(arc, index) in arcs"
                            :key="`${arc.layer}-${arc.id}-${index}`"
                            class="noc-arc"
                            @click="selectArc(arc)"
                        >
                            <path :d="arc.path" :fill="arc.status === 'DOWN' ? '#ef4444' : '#a3d635'" />
                            <title>{{ arc.name }} · {{ arc.status }}</title>
                        </g>
                        <circle cx="300" cy="300" r="78" class="noc-circle-hole" />
                        <text x="300" y="292" class="noc-circle-center">NETWORK</text>
                        <text x="300" y="316" class="noc-circle-total">{{ normalized.monitors.length }} nodes</text>
                    </svg>
                    <div class="noc-legend">
                        <span>
                            <i class="noc-dot up"></i>
                            UP
                        </span>
                        <span>
                            <i class="noc-dot down"></i>
                            DOWN
                        </span>
                        <span>Inner: Group &nbsp;·&nbsp; Middle: Node &nbsp;·&nbsp; Outer: Tag</span>
                    </div>
                </section>

                <section class="noc-panel noc-down-panel">
                    <div class="noc-panel-head">
                        <div>
                            <small>ACTIVE INCIDENTS</small>
                            <h2>Jaringan Down</h2>
                        </div>
                        <span class="noc-down-count">{{ downMonitors.length }} DOWN</span>
                    </div>
                    <div v-if="!downMonitors.length" class="noc-empty">Semua hostname terpantau UP.</div>
                    <div v-else class="noc-down-grid">
                        <button
                            v-for="monitor in downMonitors"
                            :key="monitor.id"
                            type="button"
                            class="noc-down-card"
                            @click="selectedMonitor = monitor"
                        >
                            <strong>{{ monitor.name }}</strong>
                            <span>{{ monitor.group }}</span>
                            <span>{{ monitor.hostname || monitor.url || monitor.host || "IP tidak tersedia" }}</span>
                            <small>
                                {{ monitor.tags.length ? monitor.tags.map((t) => t.name).join(", ") : "No Tag" }}
                            </small>
                        </button>
                    </div>
                </section>
            </div>
        </div>

        <div v-if="editingCard !== null" class="noc-overlay" @click.self="editingCard = null">
            <div class="noc-modal" role="dialog" aria-modal="true" aria-label="Konfigurasi Kartu">
                <div class="noc-modal-head">
                    <h2>Konfigurasi Kartu {{ editingCard + 1 }}</h2>
                    <button type="button" class="btn-close" aria-label="Close" @click="editingCard = null"></button>
                </div>
                <label class="form-label mt-3">Judul kartu</label>
                <input v-model="draftCard.title" class="form-control" maxlength="100" placeholder="Contoh: UP ATM" />
                <label class="form-label mt-3">Status yang dihitung</label>
                <select v-model="draftCard.statusType" class="form-select">
                    <option value="UP">UP</option>
                    <option value="DOWN">DOWN</option>
                </select>
                <label class="form-label mt-3">Pilih grup (boleh lebih dari satu)</label>
                <div class="noc-group-options">
                    <label v-for="group in normalized.groups" :key="group.id" class="noc-group-option">
                        <input v-model="draftCard.groupIds" type="checkbox" :value="group.id" />
                        {{ group.name }}
                    </label>
                </div>
                <div v-if="saveError" class="text-danger mt-2">{{ saveError }}</div>
                <div class="noc-modal-actions">
                    <button type="button" class="btn btn-outline-secondary" @click="editingCard = null">Batal</button>
                    <button type="button" class="btn btn-primary" :disabled="saving" @click="saveCard">
                        {{ saving ? "Menyimpan..." : "Simpan" }}
                    </button>
                </div>
            </div>
        </div>

        <div v-if="selectedMonitor" class="noc-overlay" @click.self="selectedMonitor = null">
            <div class="noc-modal" role="dialog" aria-modal="true" aria-label="Detail Monitor">
                <div class="noc-modal-head">
                    <h2>{{ selectedMonitor.name }}</h2>
                    <button type="button" class="btn-close" aria-label="Close" @click="selectedMonitor = null"></button>
                </div>
                <dl class="noc-details">
                    <dt>Status</dt>
                    <dd :class="selectedMonitor.status === 'DOWN' ? 'text-danger' : 'text-success'">
                        {{ selectedMonitor.status || "UP" }}
                    </dd>
                    <dt>Grup</dt>
                    <dd>{{ selectedMonitor.group || selectedMonitor.name }}</dd>
                    <dt>Hostname / IP</dt>
                     <dd>{{ selectedMonitor.hostname || selectedMonitor.url || selectedMonitor.host || "-" }}</dd>
                     <dt>IP</dt>
                     <dd>{{ selectedMonitor.ip || "-" }}</dd>
                     <dt>Tipe</dt>
                    <dd>{{ selectedMonitor.type || "group" }}</dd>
                    <dt>Tag</dt>
                    <dd>
                        {{
                            selectedMonitor.tagNames?.join(", ") ||
                            selectedMonitor.tags?.map((t) => t.name).join(", ") ||
                            "No Tag"
                        }}
                    </dd>
                    <dt>Ping</dt>
                    <dd>{{ selectedMonitor.heartbeat?.ping ?? "-" }} ms</dd>
                    <dt>Waktu kejadian</dt>
                     <dd>{{ selectedMonitor.heartbeat?.time || selectedMonitor.lastHeartbeat || "-" }}</dd>
                     <dt>Uptime</dt>
                     <dd>{{ selectedMonitor.uptime ?? "-" }}</dd>
                     <dt>Error</dt>
                     <dd>{{ selectedMonitor.errorMessage || selectedMonitor.heartbeat?.msg || "-" }}</dd>
                     <dt>Uptime Kuma</dt>
                     <dd v-if="selectedMonitor.id"><router-link :to="`/dashboard/${selectedMonitor.id}`">Buka monitor #{{ selectedMonitor.id }}</router-link></dd>
                     <dd v-else>-</dd>
                 </dl>
            </div>
        </div>
    </div>
</template>

<script>
import {
    normalizeMonitors,
    getCardCount,
    getDescendantMonitorIds,
    buildSunburstData,
    buildTreemapData,
    layoutSunburst,
    layoutTreemap,
    normalizeKumaMonitors,
} from "../noc-dashboard";

const defaultCards = ["UP", "DOWN", "UP", "DOWN", "UP"].map((statusType, index) => ({
    id: `card-${index + 1}`,
    title: "",
    statusType,
    groupIds: [],
}));

export default {
    name: "NocDashboard",
    data() {
        return {
            config: { cards: defaultCards },
            editingCard: null,
            draftCard: null,
            selectedMonitor: null,
            saveError: "",
            saving: false,
            multicoreWidth: 900,
            groupFilter: "ALL",
            statusFilter: "ALL",
            searchQuery: "",
            resizeObserver: null,
        };
    },
    computed: {
        normalized() {
            return normalizeMonitors(this.$root.monitorList || {}, this.$root.lastHeartbeatList || {});
        },
        arcs() {
            return layoutSunburst(buildSunburstData(this.normalized), 600, 600);
        },
        statusStats() {
            return ["UP", "WARN", "DOWN", "PAUSED", "PENDING"].map(key => ({
                key,
                label: key === "PAUSED" ? "OFF" : key,
                count: this.multicoreMonitors.filter(m => m.status === (key === "WARN" ? "WARNING" : key)).length,
            }));
        },
        multicoreMonitors() {
            const adapted = new Map(normalizeKumaMonitors(this.$root.monitorList || {}, this.$root.lastHeartbeatList || {}).map(m => [String(m.id), m]));
            return this.normalized.monitors.map(m => ({ ...m, ...adapted.get(String(m.id)) }));
        },
        filteredMonitors() {
            const query = this.searchQuery.toLowerCase();
            const groupIds = this.groupFilter === "ALL" ? null : new Set(getDescendantMonitorIds([this.groupFilter], this.normalized.groupsById).map(String));
            return this.multicoreMonitors.filter(m =>
                (!groupIds || groupIds.has(String(m.id))) &&
                (this.statusFilter === "ALL" || m.status === (this.statusFilter === "WARN" ? "WARNING" : this.statusFilter)) &&
                (!query || [m.name, m.hostname, m.url, m.host, m.group].some(value => String(value || "").toLowerCase().includes(query)))
            );
        },
        treemapGroups() {
            const width = Math.max(320, this.multicoreWidth);
            const normalized = { ...this.normalized, monitors: this.filteredMonitors };
            const groups = layoutTreemap(buildTreemapData(normalized), width, this.treemapHeight);
            return groups.map(group => ({
                ...group,
                status: group.children.some(node => node.status === "DOWN") ? "DOWN" : "UP",
            }));
        },
        treemapHeight() {
            return Math.max(620, Math.ceil(this.filteredMonitors.length / Math.max(1, Math.floor(this.multicoreWidth / 32))) * 24 + this.treemapGroupsCount * 22);
        },
        treemapGroupsCount() {
            return new Set(this.filteredMonitors.map(m => m.groupId || "ungrouped")).size;
        },
        downMonitors() {
            return this.normalized.monitors
                .filter((m) => m.status === "DOWN")
                .sort((a, b) => a.name.localeCompare(b.name));
        },
    },
    mounted() {
        this.$root.getSocket().emit("getNocDashboardConfig", (response) => {
            if (response.ok) {
                this.config = response.data;
            }
        });
        this.$root.getSocket().on("nocDashboardConfigUpdated", this.onConfigUpdated);
        this.resizeObserver = new ResizeObserver(entries => {
            this.multicoreWidth = entries[0].contentRect.width;
        });
        this.resizeObserver.observe(this.$refs.multicore);
    },
    beforeUnmount() {
        this.$root.getSocket().off("nocDashboardConfigUpdated", this.onConfigUpdated);
        this.resizeObserver?.disconnect();
    },
    methods: {
        getCardCount,
        toggleStatus(status) {
            this.statusFilter = this.statusFilter === status ? "ALL" : status;
        },
        resetFilters() {
            this.groupFilter = "ALL";
            this.statusFilter = "ALL";
            this.searchQuery = "";
        },
        zoomGroup(group) {
            const selected = this.normalized.groups.find(item => item.name === group.name);
            this.groupFilter = selected ? String(selected.id) : "ALL";
        },
        trimText(value, maxLength) {
            const text = String(value || "");
            const max = Math.floor(Math.max(3, maxLength));
            return text.length > max ? `${text.slice(0, max - 1)}…` : text;
        },
        onConfigUpdated(config) {
            this.config = config;
        },
        editCard(index) {
            this.editingCard = index;
            this.draftCard = { ...this.config.cards[index], groupIds: [...this.config.cards[index].groupIds] };
            this.saveError = "";
        },
        saveCard() {
            if (!this.draftCard.title.trim()) {
                this.saveError = "Judul kartu wajib diisi.";
                return;
            }
            this.saving = true;
            const next = {
                cards: this.config.cards.map((card, index) => (index === this.editingCard ? this.draftCard : card)),
            };
            this.$root.getSocket().emit("saveNocDashboardConfig", next, (response) => {
                this.saving = false;
                if (response.ok) {
                    this.config = response.data;
                    this.editingCard = null;
                } else {
                    this.saveError = response.msg || "Gagal menyimpan konfigurasi.";
                }
            });
        },
        selectArc(arc) {
            if (arc.layer === 1) {
                this.openGroup(arc);
            } else if (arc.layer === 3) {
                this.selectedMonitor = arc.monitor;
            } else {
                this.selectedMonitor = arc;
            }
        },
        openGroup(group) {
            this.selectedMonitor = {
                ...group,
                status: group.status || (group.children.some((c) => c.status === "DOWN") ? "DOWN" : "UP"),
                group: group.name,
                tags: [],
            };
        },
    },
};
</script>

<style scoped lang="scss">
.noc-page {
    max-width: 1920px;
    color: #e7edf6;
}

.noc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
}

.noc-eyebrow,
.noc-panel-head small {
    color: #38bdf8;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
}

.noc-header h1 {
    font-weight: 800;
    letter-spacing: -0.04em;
    margin: 4px 0;
}

.noc-live {
    border: 1px solid #315945;
    color: #86efac;
    border-radius: 999px;
    padding: 7px 13px;
    white-space: nowrap;
    font-size: 12px;
}

.noc-live.disconnected {
    color: #fbbf24;
    border-color: #704f27;
}

.noc-live-dot,
.noc-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ade80;
    margin-right: 6px;
}

.noc-live.disconnected .noc-live-dot,
.noc-dot.down {
    background: #ef4444;
}

.noc-cards {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 13px;
}

.noc-kpi {
    border: 1px solid #243949;
    border-radius: 15px;
    padding: 18px;
    min-height: 134px;
    color: #d9e5ee;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    transition:
        transform 0.2s,
        border-color 0.2s;
}

.noc-kpi:hover {
    transform: translateY(-3px);
    border-color: #8ba5b7;
}

.noc-kpi-up {
    background: linear-gradient(130deg, #102b2c, #12221f);
}

.noc-kpi-down {
    background: linear-gradient(130deg, #362026, #251d25);
}

.noc-kpi-label {
    font-size: 13px;
    font-weight: 600;
}

.noc-kpi-value {
    font-weight: 800;
    font-size: 39px;
    line-height: 1.4;
}

.noc-kpi-up .noc-kpi-value {
    color: #4ade80;
}

.noc-kpi-down .noc-kpi-value {
    color: #fb7185;
}

.noc-kpi-footer {
    font-size: 11px;
    color: #9eb4c0;
    margin-top: auto;
    width: 100%;
    display: flex;
    justify-content: space-between;
}

.noc-main {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(360px, 1fr);
    gap: 18px;
    align-items: start;
}

.noc-right {
    display: grid;
    gap: 18px;
}

.noc-panel {
    background: #142029;
    border: 1px solid #283b48;
    border-radius: 16px;
    padding: 18px;
    min-width: 0;
}

.noc-multicore-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px;
    margin: -8px -8px 14px;
    background: #1b212b;
    border-bottom: 1px solid #2e3846;
    font-size: 11px;
}

.noc-brand {
    color: #38bdf8;
    font-weight: 700;
    white-space: nowrap;
}

.noc-filter {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #94a3b8;
    background: #12161c;
    border: 1px solid #2e3846;
    border-radius: 5px;
    padding: 4px 7px;
    white-space: nowrap;
}

.noc-filter select,
.noc-filter input {
    background: transparent;
    border: 0;
    outline: 0;
    color: #f1f5f9;
    font-size: 11px;
    min-width: 70px;
}

.noc-search input {
    width: 135px;
}

.noc-stats {
    display: flex;
    gap: 4px;
    margin-left: auto;
}

.noc-stat,
.noc-toolbar-button {
    border: 1px solid #2e3846;
    border-radius: 4px;
    background: #232a36;
    color: #cbd5e1;
    padding: 4px 7px;
    font-size: 10px;
    cursor: pointer;
}

.noc-stat.active,
.noc-toolbar-button:hover {
    outline: 1px solid #38bdf8;
}

.noc-stat i {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 4px;
    border-radius: 2px;
    background: #64748b;
}

.noc-stat-up i, .bg-up { background: #8cb82b; }
.noc-stat-warn i, .bg-warn { background: #eab308; }
.noc-stat-down i, .bg-down { background: #dc2626; }
.noc-stat-paused i, .bg-paused { background: #64748b; }
.noc-stat-pending i, .bg-pending { background: #3b82f6; }

.noc-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    gap: 10px;
}

.noc-panel-head h2 {
    font-size: 19px;
    font-weight: 700;
    margin: 4px 0 0;
}

.noc-count,
.noc-down-count {
    color: #a7b7c4;
    border: 1px solid #31424e;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    white-space: nowrap;
}

.noc-down-count {
    color: #fb7185;
    background: #361e29;
    border-color: #713340;
}

.noc-multicore-list {
    position: relative;
    width: 100%;
    overflow: hidden;
    padding: 6px;
    background: #0f1318;
}

.noc-group-card {
    box-sizing: border-box;
    background: #19202a;
    border: 2px solid #0d1117;
    border-radius: 4px;
    padding: 3px;
    min-width: 0;
    overflow: hidden;
    transition: background 0.2s;
}

.noc-group-card:hover {
    background: #1f2733;
}

.noc-group-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
    height: 16px;
    margin-bottom: 2px;
    font-size: 10px;
    color: #cbd5e1;
    cursor: pointer;
    user-select: none;
}

.noc-group-title {
    display: flex;
    align-items: center;
    width: 100%;
    justify-content: space-between;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
}

.noc-group-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 10.5px;
    font-weight: 700;
}

.noc-group-count {
    color: #64748b;
    font-size: 9px;
    font-weight: 600;
}

.noc-group-mosaic {
    position: relative;
    width: 100%;
}

.noc-mosaic-cell {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #161b22;
    border-radius: 2px;
    padding: 2px 3px;
    color: #111827;
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.15s ease, filter 0.15s ease, border-color 0.15s;
}

.noc-cell-up {
    background: #8cb82b;
}

.noc-cell-warn,
.noc-cell-warning {
    background: #eab308;
    color: #111827;
}

.noc-cell-down {
    background: #dc2626;
    color: #fff;
}

.noc-cell-paused {
    background: #64748b;
    color: #fff;
}

.noc-cell-pending {
    background: #3b82f6;
    color: #fff;
}

.noc-mosaic-cell:hover,
.noc-arc:hover path {
    filter: brightness(1.25);
    border-color: #fff;
}

.noc-cell-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 8px;
    line-height: 1.1;
}

.noc-cell-tag {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 7px;
    line-height: 1;
    opacity: 0.85;
}

.noc-cell-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: #0b1117;
    border: 1px solid #38bdf8;
    color: #e2e8f0;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
    z-index: 1000;
    pointer-events: none;
    line-height: 1.3;
    box-shadow: 0 4px 12px #000a;
}

.noc-mosaic-cell:hover .noc-cell-tooltip {
    display: block;
}

.noc-circle {
    max-width: 460px;
    margin: 0 auto;
}

.noc-arc {
    cursor: pointer;
}

.noc-circle-hole {
    fill: #142029;
}

.noc-circle-center,
.noc-circle-total {
    text-anchor: middle;
    fill: #9badba;
    font-weight: 800;
    letter-spacing: 2px;
    font-size: 13px;
}

.noc-circle-total {
    fill: #e9f1f5;
    font-size: 19px;
    letter-spacing: 0;
}

.noc-legend {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    justify-content: center;
    color: #91a5b3;
    font-size: 10px;
}

.noc-down-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
}

.noc-down-card {
    color: #ffe5e9;
    border: 1px solid #87424c;
    border-radius: 9px;
    background: #572a35;
    text-align: left;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    overflow-wrap: anywhere;
}

.noc-down-card:hover {
    background: #76303e;
}

.noc-down-card strong {
    font-size: 14px;
}

.noc-down-card small {
    color: #ffb5bd;
}

.noc-empty {
    color: #91a5b3;
    text-align: center;
    padding: 55px 15px;
}

.noc-status-footer {
    height: 30px;
    background: #0d1117;
    border-top: 1px solid #2e3846;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    font-size: 11px;
    color: #64748b;
}

.noc-legend-chips {
    display: flex;
    gap: 14px;
}

.noc-legend-chip {
    display: flex;
    align-items: center;
    gap: 5px;
}

.noc-legend-chip .box {
    width: 10px;
    height: 10px;
    border-radius: 2px;
}

.noc-legend-chip .bg-up { background: #8cb82b; }
.noc-legend-chip .bg-warn { background: #eab308; }
.noc-legend-chip .bg-down { background: #dc2626; }
.noc-legend-chip .bg-paused { background: #64748b; }
.noc-legend-chip .bg-pending { background: #3b82f6; }

.noc-overlay {
    position: fixed;
    inset: 0;
    z-index: 1050;
    background: #000a;
    display: grid;
    place-items: center;
    padding: 20px;
}

.noc-modal {
    background: #17252f;
    border: 1px solid #3d5261;
    color: #eef4f7;
    border-radius: 14px;
    padding: 24px;
    width: min(100%, 480px);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 70px #0009;
}

.noc-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
}

.noc-modal-head h2 {
    font-size: 20px;
    margin: 0;
}

.noc-group-options {
    border: 1px solid #3d5261;
    border-radius: 7px;
    max-height: 200px;
    overflow: auto;
    padding: 9px;
}

.noc-group-option {
    display: block;
    padding: 6px;
    cursor: pointer;
}

.noc-group-option:hover {
    background: #294250;
}

.noc-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
}

.noc-details {
    display: grid;
    grid-template-columns: 120px 1fr;
    margin: 20px 0 0;
    gap: 8px;
    overflow-wrap: anywhere;
}

.noc-details dt {
    color: #9badba;
    font-weight: 500;
}

.noc-details dd {
    margin: 0;
    font-weight: 600;
}
@media (max-width: 1050px) {
    .noc-main {
        grid-template-columns: 1fr;
    }

    .noc-cards {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}
@media (max-width: 650px) {
    .noc-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .noc-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .noc-down-grid {
        grid-template-columns: 1fr;
    }
}
</style>
