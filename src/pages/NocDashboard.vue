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
                    <div>
                        <small>GROUP OVERVIEW</small>
                        <h2>Multi Core</h2>
                    </div>
                    <span class="noc-count">{{ normalized.groups.length }} grup</span>
                </div>
                <div v-if="!treemapRects.length" class="noc-empty">Belum ada monitor di dalam grup.</div>
                <div v-else class="noc-svg-wrap">
                    <svg viewBox="0 0 900 640" role="img" aria-label="Multi Core network treemap">
                        <g v-for="group in treemapRects" :key="group.id">
                            <rect
                                :x="group.x + 2"
                                :y="group.y + 2"
                                :width="Math.max(0, group.width - 4)"
                                :height="Math.max(0, group.height - 4)"
                                rx="5"
                                class="noc-group-bg"
                                @click="openGroup(group)"
                            />
                            <text :x="group.x + 10" :y="group.y + 19" class="noc-group-label" @click="openGroup(group)">
                                {{ trimText(group.name, group.width / 8) }}
                            </text>
                            <g
                                v-for="node in group.children"
                                :key="node.id"
                                class="noc-node"
                                @click="selectedMonitor = node"
                            >
                                <rect
                                    :x="node.x + 2"
                                    :y="node.y + 2"
                                    :width="Math.max(0, node.width - 4)"
                                    :height="Math.max(0, node.height - 4)"
                                    rx="3"
                                    :fill="node.status === 'DOWN' ? '#ef4444' : '#a3d635'"
                                />
                                <text
                                    v-if="node.width > 45 && node.height > 25"
                                    :x="node.x + 8"
                                    :y="node.y + 18"
                                    class="noc-node-label"
                                >
                                    {{ trimText(node.name, node.width / 9) }}
                                </text>
                                <text
                                    v-if="node.width > 65 && node.height > 43"
                                    :x="node.x + 8"
                                    :y="node.y + 34"
                                    class="noc-node-tag"
                                >
                                    {{ trimText(node.tagNames.join(", "), node.width / 10) }}
                                </text>
                                <title>{{ node.name }} · {{ node.tagNames.join(", ") }} · {{ node.status }}</title>
                            </g>
                        </g>
                    </svg>
                </div>
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
                    <dd>{{ selectedMonitor.heartbeat?.time || "-" }}</dd>
                </dl>
            </div>
        </div>
    </div>
</template>

<script>
import {
    normalizeMonitors,
    getCardCount,
    buildSunburstData,
    buildTreemapData,
    layoutSunburst,
    layoutTreemap,
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
        };
    },
    computed: {
        normalized() {
            return normalizeMonitors(this.$root.monitorList || {}, this.$root.lastHeartbeatList || {});
        },
        arcs() {
            return layoutSunburst(buildSunburstData(this.normalized), 600, 600);
        },
        treemapRects() {
            return layoutTreemap(buildTreemapData(this.normalized), 900, 640);
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
    },
    beforeUnmount() {
        this.$root.getSocket().off("nocDashboardConfigUpdated", this.onConfigUpdated);
    },
    methods: {
        getCardCount,
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

.noc-svg-wrap svg,
.noc-circle {
    width: 100%;
    height: auto;
    display: block;
}

.noc-svg-wrap {
    overflow: auto;
}

.noc-treemap-panel .noc-svg-wrap svg {
    min-width: 650px;
}

.noc-group-bg {
    fill: #26343e;
    stroke: #3d5362;
    stroke-width: 2;
    cursor: pointer;
}

.noc-group-label {
    fill: #e0e8ee;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
}

.noc-node {
    cursor: pointer;
}

.noc-node rect,
.noc-arc path {
    stroke: #142029;
    stroke-width: 2;
    transition: filter 0.15s;
}

.noc-node:hover rect,
.noc-arc:hover path {
    filter: brightness(1.2);
}

.noc-node-label {
    fill: #152321;
    font-weight: 700;
    font-size: 12px;
    pointer-events: none;
}

.noc-node-tag {
    fill: #26352b;
    font-size: 10px;
    pointer-events: none;
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
