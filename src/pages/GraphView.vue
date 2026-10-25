<template>
    <div ref="container" class="noc-graph-page">
        <!-- CANVAS MAIN AREA -->
        <div class="noc-canvas-wrapper" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @wheel="onWheel" @mouseleave="onMouseLeave">
            <canvas ref="canvas" class="noc-graph-canvas"></canvas>

            <!-- FLOATING CONTROL PANEL (KUMA STYLE) -->
            <div class="noc-floating-panel shadow-box" :class="{ 'panel-collapsed': isPanelCollapsed }" @wheel.stop>
                <div
                    class="noc-panel-header d-flex align-items-center justify-content-between cursor-pointer user-select-none"
                    @click="isPanelCollapsed = !isPanelCollapsed"
                >
                    <div class="d-flex align-items-center gap-2">
                        <font-awesome-icon icon="filter" class="text-primary" />
                        <span class="noc-panel-title">Kontrol Topologi</span>
                    </div>
                    <div class="d-flex align-items-center gap-2 ms-2">
                        <button
                            type="button"
                            class="btn btn-sm btn-link text-decoration-none p-0 noc-panel-fullscreen"
                            :title="isFullscreen ? 'Keluar Full Screen' : 'Full Screen'"
                            :aria-label="isFullscreen ? 'Keluar Full Screen' : 'Full Screen'"
                            @click.stop="toggleFullscreen"
                        >
                            <span aria-hidden="true">{{ isFullscreen ? '×' : '□' }}</span>
                        </button>
                        <button
                            type="button"
                            class="btn btn-sm btn-link text-decoration-none p-0 noc-panel-toggle"
                            @click.stop="isPanelCollapsed = !isPanelCollapsed"
                        >
                            <span v-if="isPanelCollapsed" class="text-primary fw-semibold">Buka ▾</span>
                            <span v-else class="text-secondary">Tutup ▴</span>
                        </button>
                    </div>
                </div>

                <div v-if="!isPanelCollapsed" class="noc-panel-content d-flex flex-column gap-3">
                    <!-- Search Input -->
                    <div>
                        <label class="form-label small fw-bold mb-1">Cari Perangkat / Wilayah:</label>
                        <div class="input-group input-group-sm">
                            <span class="input-group-text">
                                <font-awesome-icon icon="search" />
                            </span>
                            <input
                                v-model="searchQuery"
                                type="text"
                                class="form-control"
                                placeholder="Ketik ATM-..., KC-..., atau IP..."
                                @keyup.enter="focusSearchedNode"
                            />
                            <button v-if="searchQuery" class="btn btn-outline-secondary" type="button" @click="searchQuery = ''">
                                &times;
                            </button>
                        </div>
                        <div v-if="searchQuery && matchedNodeCount > 0" class="text-primary small mt-1 font-mono">
                            Ditemukan {{ matchedNodeCount }} node.
                        </div>
                    </div>

                    <!-- Filter Grup Wilayah -->
                    <div>
                        <label class="form-label small fw-bold mb-1">Grup Wilayah / Cabang:</label>
                        <select v-model="selectedGroup" class="form-select form-select-sm">
                            <option value="ALL">Semua Wilayah ({{ availableGroups.length }} Grup)</option>
                            <option v-for="g in availableGroups" :key="g" :value="g">{{ g }}</option>
                        </select>
                    </div>

                    <!-- Filter Status -->
                    <div>
                        <label class="form-label small fw-bold mb-1">Filter Status:</label>
                        <div class="btn-group btn-group-sm w-100 noc-status-btn-group" role="group">
                            <button
                                type="button"
                                class="btn"
                                :class="statusFilter === 'ALL' ? 'btn-primary active' : 'btn-outline-normal'"
                                @click="statusFilter = 'ALL'"
                            >
                                Semua
                            </button>
                            <button
                                type="button"
                                class="btn"
                                :class="statusFilter === 'UP' ? 'btn-primary active' : 'btn-outline-normal'"
                                @click="statusFilter = 'UP'"
                            >
                                UP ({{ stats.up }})
                            </button>
                            <button
                                type="button"
                                class="btn"
                                :class="statusFilter === 'DOWN' ? 'btn-danger active' : 'btn-outline-normal'"
                                @click="statusFilter = 'DOWN'"
                            >
                                DOWN ({{ stats.down }})
                            </button>
                        </div>
                    </div>

                    <!-- Filter Tipe Node -->
                    <div>
                        <label class="form-label small fw-bold mb-1">Tipe Node Tampil:</label>
                        <div class="d-flex flex-wrap gap-3 small">
                            <label class="form-check d-flex align-items-center gap-1 cursor-pointer mb-0">
                                <input v-model="showGroups" type="checkbox" class="form-check-input mt-0" />
                                <span>Grup</span>
                            </label>
                            <label class="form-check d-flex align-items-center gap-1 cursor-pointer mb-0">
                                <input v-model="showAtm" type="checkbox" class="form-check-input mt-0" />
                                <span>ATM</span>
                            </label>
                            <label class="form-check d-flex align-items-center gap-1 cursor-pointer mb-0">
                                <input v-model="showKantor" type="checkbox" class="form-check-input mt-0" />
                                <span>Kantor</span>
                            </label>
                            <label class="form-check d-flex align-items-center gap-1 cursor-pointer mb-0">
                                <input v-model="showBackup" type="checkbox" class="form-check-input mt-0" />
                                <span>Backup</span>
                            </label>
                        </div>
                    </div>

                    <!-- Physics & Animation Toggles -->
                    <div class="noc-section-divider pt-2">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="small">Animasi Partikel Flow:</span>
                            <div class="form-check form-switch mb-0">
                                <input v-model="enableParticles" class="form-check-input" type="checkbox" />
                            </div>
                        </div>

                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="small">Tampilkan Semua Label:</span>
                            <div class="form-check form-switch mb-0">
                                <input v-model="alwaysShowLabels" class="form-check-input" type="checkbox" />
                            </div>
                        </div>

                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="small">Simulasi Fisika Aktif:</span>
                            <div class="form-check form-switch mb-0">
                                <input v-model="isPhysicsActive" class="form-check-input" type="checkbox" />
                            </div>
                        </div>

                        <div class="noc-physics-status small font-mono mb-2" :class="physicsStatusClass">
                            <div class="d-flex align-items-center justify-content-between">
                                <span class="text-secondary">MODE FISIKA</span>
                                <span class="fw-bold text-primary">{{ physicsModeLabel }}</span>
                            </div>
                            <div class="mt-1 text-secondary">
                                {{ physicsStatusDetail }}
                            </div>
                            <div class="d-flex align-items-center gap-2 mt-2 pt-2 border-top border-secondary-subtle" aria-label="Monitoring heartbeat realtime aktif">
                                <span class="noc-live-heartbeat-dot" aria-hidden="true"></span>
                                <span class="fw-bold text-primary">LIVE HEARTBEAT</span>
                            </div>
                        </div>

                        <div class="mt-2">
                            <div class="d-flex justify-content-between text-secondary small">
                                <span>Jarak Pegas Link:</span>
                                <span class="font-mono text-primary">{{ linkDistance }}px</span>
                            </div>
                            <input v-model.number="linkDistance" type="range" class="form-range" min="30" max="180" step="5" />
                        </div>
                    </div>

                    <div class="d-flex gap-2 noc-section-divider pt-2">
                        <button type="button" class="btn btn-sm btn-outline-normal w-50" title="Reset Posisi Kamera" @click="resetCamera">
                            Reset View
                        </button>
                        <button type="button" class="btn btn-sm btn-primary w-50" title="Susun Ulang Posisi Node" @click="resetLayout">
                            Reset Layout
                        </button>
                    </div>
                </div>
            </div>

            <!-- FLOATING STATS & LEGEND (BOTTOM LEFT) -->
            <div class="noc-floating-legend">
                <div class="d-flex flex-wrap align-items-center gap-3 font-mono small">
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-circle group"></span>
                        <span class="text-light">Grup ({{ stats.group }})</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-circle kantor"></span>
                        <span class="text-light">Kantor ({{ stats.kantor }})</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-circle atm"></span>
                        <span class="text-light">ATM ({{ stats.atm }})</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-circle backup"></span>
                        <span class="text-warning">Backup ({{ stats.backup }})</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-line"></span>
                        <span class="text-info">Parent → Child</span>
                    </div>
                    <div class="vr bg-secondary opacity-50"></div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-dot up"></span>
                        <span class="text-primary">{{ stats.up }} UP</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-dot slow"></span>
                        <span class="text-warning">{{ stats.slow }} SLOW</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="legend-dot down"></span>
                        <span class="text-danger fw-bold">{{ stats.down }} DOWN</span>
                    </div>
                </div>
            </div>

            <!-- HOVER TOOLTIP CARD -->
            <div
                v-if="hoveredNode"
                class="noc-graph-tooltip"
                :data-live-tick="liveTick"
                :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
            >
                <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                    <span class="badge" :class="getBadgeClass(hoveredNode)">
                        {{ hoveredNode.type.toUpperCase() }}
                    </span>
                    <span class="font-mono small fw-bold" :class="getStatusTextColor(hoveredNode)">
                        ● {{ hoveredNode.status.toUpperCase() }}
                    </span>
                </div>
                <div class="fw-bold text-light font-sans mb-1">{{ hoveredNode.label }}</div>
                <div class="small text-secondary font-mono">
                    <div v-if="hoveredNode.group">Grup: <b class="text-light">{{ hoveredNode.group }}</b></div>
                    <div v-if="hoveredNode.hostname">IP: <span class="text-light">{{ hoveredNode.hostname }}</span></div>
                    <div v-if="hoveredNode.tag">Tag: <span class="text-info">{{ hoveredNode.tag }}</span></div>
                    <div v-if="hoveredNode.ping !== undefined">
                        Latency: <b :class="hoveredNode.ping > 150 ? 'text-warning' : 'text-primary'">{{ hoveredNode.ping ? hoveredNode.ping + 'ms' : 'RTO' }}</b>
                    </div>
                    <div v-if="hoveredNode.connectedCount !== undefined">
                        Terkoneksi: <span class="text-light">{{ hoveredNode.connectedCount }} node</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { markRaw } from "vue";
import { UP, DOWN } from "../util.ts";
import {
    getRepelWeight,
    applyLocalForces,
    buildTopologyLinks,
    applyTagAttraction,
    applySpringForce,
    applyCenterGravity,
    collectStatusChangedNodes,
    shouldTriggerMicroReheat,
    applyMicroReheatImpulse,
    reheatSimulationNodes,
    collectHostTags,
    buildLinkParticles,
} from "../noc-graph-cluster";

const TAG_POSITION_STORAGE_KEY = "uptime-kuma-graph-tag-positions";

export default {
    name: "NocGraphView",
    data() {
        return {

            // UI Controls
            isPanelCollapsed: false,
            isFullscreen: false,
            searchQuery: "",
            selectedGroup: "ALL",
            statusFilter: "ALL",
            showGroups: true,
            showAtm: true,
            showKantor: true,
            showBackup: true,
            enableParticles: true,
            alwaysShowLabels: false,
            isPhysicsActive: true,
            isPhysicsSleeping: false,
            physicsStableFrames: 0,
            linkDistance: 80,

            // Camera Transformation (Pan & Zoom)
            camera: {
                x: 0,
                y: 0,
                scale: 0.95,
            },

            // Graph Data Structures
            nodes: [],
            tagPositions: {},
            links: [],
            particles: [],
            liveTick: 0,

            // Interaction State
            hoveredNode: null,
            tooltipPos: { x: 0, y: 0 },
            canvasSize: { width: 0, height: 0 },
            isDragging: false,
            draggedNode: null,
            dragLastWorld: null,
            dragVelocity: { x: 0, y: 0 },
            isPanning: false,
            panStart: { x: 0, y: 0 },

            // Animation Frame
            animationFrameId: null,
            lastFrameTime: performance.now(),

            // Throttle timer for heartbeat driven graph refreshes
            liveSyncTimer: null,

            // Resize observer instance
            resizeObserver: null,
        };
    },
    computed: {
        // Enriched list of all monitors
        allMonitors() {
            const rawSource = this.$root.monitorList || {};

            const list = Object.values(rawSource);

            return list.map(m => {
                const groupName = (m.parent && rawSource[m.parent])
                    ? rawSource[m.parent].name.trim()
                    : "Lainnya";

                const rawTagObjects = m.tags || [];
                const rawTags = rawTagObjects.map(t => t.name);

                let isKantor = rawTags.some(t => ["KANTOR CABANG", "CAPEM", "Kantor KAS"].includes(t)) ||
                               /^(CABANG|Cabang|KTR CABANG)\b/i.test(m.name);

                const isBackup = /backup|cadangan|secondary|failover|4g|lte/i.test(m.name) ||
                                 rawTags.some(t => /backup|cadangan|secondary|failover/i.test(t));

                let type = "ATM";
                if (isBackup) {
                    type = "BACKUP";
                } else if (isKantor) {
                    type = "KANTOR";
                }

                let provider = rawTags.find(t => ["Telkom", "ICON+", "LA", "Lintasarta", "Indosat", "Biznet"].includes(t)) || "Non-Tag";

                return {
                    ...m,
                    group: groupName,
                    type: m.type === "group" ? "GROUP" : type,
                    tag: provider,
                    tags: rawTags,
                    tagColors: Object.fromEntries(rawTagObjects.map(t => [t.name, t.color])),
                };
            });
        },

        // Signature topology: hanya berubah jika monitor ditambah, dihapus,
        // diubah namanya, grupnya, atau tag-nya.
        topologySignature() {
            return this.allMonitors.map(m => `${m.id}:${m.name}:${m.parent}:${m.group}:${m.type}:${m.tags.join(",")}`).join("|");
        },

        availableGroups() {
            const groups = new Set();
            this.allMonitors.forEach(m => groups.add(m.group));
            return Array.from(groups).sort();
        },

        physicsModeLabel() {
            if (!this.isPhysicsActive) {
                return "OFF";
            }
            if (this.isPhysicsSleeping) {
                return "STABIL";
            }
            return "GLOBAL";
        },

        physicsStatusClass() {
            return "text-secondary";
        },

        physicsStatusDetail() {
            if (!this.isPhysicsActive) {
                return "Layout stabil; monitoring heartbeat tetap realtime.";
            }
            return `${this.nodes.length} node; repulsi, pegas, gravitasi, dan collision global aktif.`;
        },

        matchedNodeCount() {
            if (!this.searchQuery) {
                return 0;
            }
            const q = this.searchQuery.toLowerCase().trim();
            return this.nodes.filter(n => {
                return n.label.toLowerCase().includes(q) ||
                    (n.hostname && n.hostname.toLowerCase().includes(q)) ||
                    (n.group && n.group.toLowerCase().includes(q));
            }).length;
        },

        stats() {
            let up = 0;
            let slow = 0;
            let down = 0;
            let atm = 0;
            let kantor = 0;
            let backup = 0;
            let group = 0;

            this.allMonitors.forEach(m => {
                if (m.type === "GROUP") {
                    group++;
                }
                if (m.type === "ATM") {
                    atm++;
                } else if (m.type === "KANTOR") {
                    kantor++;
                } else if (m.type === "BACKUP") {
                    backup++;
                }

                const beat = this.getBeat(m.id);
                if (!beat) {
                    up++;
                } else if (beat.status === DOWN) {
                    down++;
                } else if (beat.ping && beat.ping > 150) {
                    slow++;
                } else {
                    up++;
                }
            });

            return { up, slow, down, atm, kantor, backup, group };
        },
    },
    watch: {
        topologySignature() {
            this.syncGraphData();
        },
        selectedGroup() {
            this.syncGraphData();
        },
        showGroups() {
            this.syncGraphData();
        },
        showAtm() {
            this.syncGraphData();
        },
        showKantor() {
            this.syncGraphData();
        },
        showBackup() {
            this.syncGraphData();
        },
        linkDistance() {
            this.updateLinkDistances();
        },
        isPhysicsActive(active) {
            if (active) {
                this.physicsStableFrames = 0;
                this.isPhysicsSleeping = false;
                reheatSimulationNodes(this.nodes, 2);
            }
        },
        statusFilter() {
            this.isPhysicsSleeping = false;
            this.physicsStableFrames = 0;
            this.syncGraphData();
        },
    },
    mounted() {
        try {
            this.tagPositions = JSON.parse(localStorage.getItem(TAG_POSITION_STORAGE_KEY) || "{}");
        } catch {
            this.tagPositions = {};
        }
        this.initCanvas();
        this.syncGraphData(true);
        this.startRenderLoop();

        // Refresh node status/latency in real time when heartbeats arrive, so the
        // graph no longer needs a browser refresh when a host goes down or up.
        this.$watch(() => this.$root.lastHeartbeatList, this.scheduleLiveSync);

        window.addEventListener("resize", this.handleResize);
        document.addEventListener("fullscreenchange", this.onFullscreenChange);
        document.addEventListener("webkitfullscreenchange", this.onFullscreenChange);
        if (typeof ResizeObserver !== "undefined" && this.$refs.canvas) {
            this.resizeObserver = new ResizeObserver(() => {
                this.handleResize();
            });
            this.resizeObserver.observe(this.$refs.canvas);
        }
    },
    beforeUnmount() {
        if (this.liveSyncTimer) {
            clearTimeout(this.liveSyncTimer);
        }
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        window.removeEventListener("resize", this.handleResize);
        document.removeEventListener("fullscreenchange", this.onFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", this.onFullscreenChange);
        if (this.getFullscreenElement() === this.$refs.container) {
            this.exitFullscreen();
        }
    },
    methods: {
        getFullscreenElement() {
            return document.fullscreenElement || document.webkitFullscreenElement || null;
        },

        async toggleFullscreen() {
            if (this.getFullscreenElement()) {
                await this.exitFullscreen();
                return;
            }
            const el = this.$refs.container;
            if (!el) {
                return;
            }
            try {
                if (el.requestFullscreen) {
                    await el.requestFullscreen();
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                }
            } catch (err) {
                console.warn("Gagal masuk full screen:", err);
            }
        },

        async exitFullscreen() {
            try {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } catch (err) {
                console.warn("Gagal keluar full screen:", err);
            }
        },

        onFullscreenChange() {
            this.isFullscreen = this.getFullscreenElement() === this.$refs.container;
        },

        getDummyMonitors() {
            const groups = [
                "BANDUNG", "JAKARTA", "SURABAYA", "MEDAN", "MAKASSAR",
                "DENPASAR", "YOGYAKARTA", "SEMARANG", "PALEMBANG", "BALIKPAPAN",
            ];
            const providers = ["Telkom", "ICON+", "LA", "Indosat", "Biznet"];
            const prefixes = ["WD", "Dispenser", "Recycler", "Video", "OffSite"];
            let idCounter = 90000;
            const monitors = {};

            groups.forEach((groupName, gIndex) => {
                const provider = providers[gIndex % providers.length];
                const parentId = 100 + gIndex;
                monitors[parentId] = {
                    id: parentId,
                    name: `CABANG ${groupName}`,
                    type: "group",
                    active: 1,
                };
                const nodeCount = 5 + Math.floor(Math.random() * 3);
                for (let i = 1; i <= nodeCount; i++) {
                    const id = idCounter++;
                    const isBackup = Math.random() > 0.85;
                    const ip = `10.${gIndex + 1}.1.${100 + i}`;
                    const tagObjects = [{ name: provider, color: "#14b8a6" }];
                    if (Math.random() > 0.4 && provider !== "Telkom") {
                        tagObjects.push({ name: "Telkom", color: "#ff4d4f" });
                    }
                    monitors[id] = {
                        id,
                        name: `${isBackup ? "BACKUP-" : ""}ATM-${prefixes[i % prefixes.length]}-${groupName}-${i}`,
                        type: "ping",
                        parent: parentId,
                        tags: tagObjects,
                        url: ip,
                        hostname: ip,
                    };
                }
            });

            this.dummyLastHeartbeats = this.buildDummyHeartbeats(monitors);
            return monitors;
        },
        buildDummyHeartbeats(monitors) {
            const beats = {};
            Object.values(monitors).forEach((monitor) => {
                if (monitor.type !== "group") {
                    beats[monitor.id] =
                        Math.random() > 0.8
                            ? { status: DOWN, ping: null }
                            : { status: UP, ping: Math.floor(Math.random() * 250) };
                }
            });
            return beats;
        },
        getBeat(monitorId) {
            if (this.$root.lastHeartbeatList?.[monitorId]) {
                return this.$root.lastHeartbeatList[monitorId];
            }
            return this.dummyLastHeartbeats?.[monitorId];
        },

        // Throttled refresh trigger for live heartbeat / REST poll updates.
        // Throttling keeps the 60 FPS render loop smooth on large topologies.
        scheduleLiveSync() {
            if (this.liveSyncTimer) {
                return;
            }

            this.liveSyncTimer = setTimeout(() => {
                this.liveSyncTimer = null;
                this.syncLiveData();
            }, 1000);
        },

        // Applies fresh heartbeat data to the graph. An active status filter
        // changes which nodes are visible, so the topology has to be rebuilt.
        syncLiveData() {
            if (this.statusFilter === "ALL") {
                this.refreshNodeStatuses();
            } else {
                this.syncGraphData();
            }
        },

        // Updates status and latency of the existing nodes in place, without
        // rebuilding the topology or resetting node positions.
        refreshNodeStatuses() {
            let statusChanged = false;

            this.nodes.forEach(node => {
                if (node.monitorId === undefined) {
                    return;
                }

                const beat = this.getBeat(node.monitorId);
                let status = "up";
                let ping = beat && beat.ping ? beat.ping : 0;

                if (beat && beat.status === DOWN) {
                    status = "down";
                } else if (beat && beat.ping > 150) {
                    status = "slow";
                }

                if (node.status !== status) {
                    statusChanged = true;
                    node.previousStatus = node.status;
                    node.status = status;
                }

                node.ping = ping;
                node.repelWeight = getRepelWeight(node);
            });
            this.liveTick++;

            // Realtime Reactive Micro-Reheat: awaken physics gently only when
            // nodes transition to or from DOWN status.
            const changedNodes = collectStatusChangedNodes(this.nodes);
            if (shouldTriggerMicroReheat(changedNodes)) {
                this.triggerMicroReheat(changedNodes);
            }
            changedNodes.forEach(n => {
                n.previousStatus = n.status;
            });

            // Particles only flow through healthy links, so they are rebuilt
            // when a link changed between up and down.
            if (statusChanged) {
                this.initParticles();
                this.draw();
            }
        },

        initCanvas(preserveView = false) {
            const canvas = this.$refs.canvas;
            if (!canvas) {
                return;
            }

            // PENTING: ukuran yang dipakai HARUS sama dengan ukuran tampilan CSS canvas.
            // Sebelumnya diukur dari container (100vh termasuk header) sehingga buffer
            // canvas lebih tinggi dari area tampilnya -> gambar teregang vertikal dan
            // posisi hit-test kursor meleset (harus digeser sedikit ke bawah).
            const rect = canvas.getBoundingClientRect();
            const cssWidth = Math.max(Math.round(rect.width) || canvas.clientWidth || 0, 1);
            const cssHeight = Math.max(Math.round(rect.height) || canvas.clientHeight || 0, 1);
            const dpr = window.devicePixelRatio || 1;

            const targetWidth = Math.round(cssWidth * dpr);
            const targetHeight = Math.round(cssHeight * dpr);
            if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
            }

            const prevWidth = this.canvasSize.width;
            const prevHeight = this.canvasSize.height;
            this.canvasSize = { width: cssWidth, height: cssHeight };

            if (preserveView && prevWidth > 0 && prevHeight > 0) {
                // Pertahankan titik dunia yang sama di tengah layar saat resize
                this.camera.x += (cssWidth - prevWidth) / 2;
                this.camera.y += (cssHeight - prevHeight) / 2;
            } else {
                // Center camera relatif terhadap area canvas (bukan halaman penuh)
                this.camera.x = cssWidth / 2;
                this.camera.y = cssHeight / 2;
            }
        },

        handleResize() {
            this.initCanvas(true);
        },

        buildDependencyGraph(monitors, existingNodeMap) {
            const visible = monitors.filter(m => {
                if (this.selectedGroup !== "ALL" && m.group !== this.selectedGroup) {
                    return false;
                }
                if (!this.showGroups && m.type === "GROUP") {
                    return false;
                }
                if (!this.showAtm && m.type === "ATM") {
                    return false;
                }
                if (!this.showKantor && m.type === "KANTOR") {
                    return false;
                }
                if (!this.showBackup && m.type === "BACKUP") {
                    return false;
                }
                const beat = this.getBeat(m.id);
                const isDown = beat && beat.status === DOWN;
                return !(this.statusFilter === "UP" && isDown) && !(this.statusFilter === "DOWN" && !isDown);
            });
            const nodes = visible.map((monitor, index) => {
                const existing = existingNodeMap.get(`MON_${monitor.id}`);
                const angle = index * Math.PI * 2 / Math.max(visible.length, 1);
                const beat = this.getBeat(monitor.id);
                const status = beat?.status === DOWN ? "down" : beat?.ping > 150 ? "slow" : "up";
                return markRaw({
                    ...monitor,
                    id: `MON_${monitor.id}`,
                    monitorId: monitor.id,
                    label: monitor.name,
                    status,
                    ping: beat?.ping || 0,
                    radius: monitor.type === "GROUP" ? 11 : monitor.type === "BACKUP" ? 5.5 : 8,
                    x: existing?.x ?? Math.cos(angle) * 220,
                    y: existing?.y ?? Math.sin(angle) * 220,
                    vx: existing?.vx ?? 0,
                    vy: existing?.vy ?? 0,
                    connectedCount: 0,
                });
            });
            if (nodes.length) {
                const existingCore = existingNodeMap.get("CORE");
                nodes.unshift(markRaw({
                    id: "CORE",
                    type: "CORE",
                    label: "CORE",
                    status: "up",
                    radius: 14,
                    x: existingCore?.x ?? 0,
                    y: existingCore?.y ?? 0,
                    vx: 0,
                    vy: 0,
                    connectedCount: 0,
                }));
            }
            const hostTags = collectHostTags(visible);
            Array.from(hostTags.keys()).forEach((name, index, all) => {
                const existing = existingNodeMap.get(`TAG_${name}`);
                const saved = this.tagPositions[name];
                const angle = index * Math.PI * 2 / Math.max(all.length, 1);
                nodes.push(markRaw({
                    id: `TAG_${name}`,
                    type: "TAG",
                    label: name,
                    color: hostTags.get(name),
                    status: "up",
                    radius: 9,
                    fixed: true,
                    x: existing?.x ?? saved?.x ?? Math.cos(angle) * 60,
                    y: existing?.y ?? saved?.y ?? Math.sin(angle) * 60,
                    vx: 0,
                    vy: 0,
                    connectedCount: 0,
                }));
            });
            const links = buildTopologyLinks(visible, nodes, this.linkDistance).map(link => markRaw(link));
            const tagMemberCount = new Map();
            links.forEach(link => {
                if (link.isTagLink) {
                    tagMemberCount.set(link.source, (tagMemberCount.get(link.source) || 0) + 1);
                }
            });
            links.forEach(link => {
                if (link.isTagLink) {
                    link.memberCount = tagMemberCount.get(link.source);
                }
            });
            links.forEach(link => {
                link.source.connectedCount++;
                link.target.connectedCount++;
            });
            this.nodes = markRaw(nodes);
            this.links = markRaw(links);
            this.initParticles();
            this.liveTick++;
        },

        // Build Graph Nodes and Links from Uptime Kuma monitors
        syncGraphData(initial = false) {
            this.physicsStableFrames = 0;
            const existingNodeMap = new Map();
            this.nodes.forEach(n => existingNodeMap.set(n.id, n));
            this.buildDependencyGraph(this.allMonitors, existingNodeMap);
        },

        initParticles() {
            this.particles = markRaw(buildLinkParticles(this.links));
        },

        updateLinkDistances() {
            this.links.forEach(l => {
                l.targetDist = this.linkDistance;
            });
            this.physicsStableFrames = 0;
            this.isPhysicsSleeping = false;
        },

        resetLayout() {
            this.tagPositions = {};
            localStorage.removeItem(TAG_POSITION_STORAGE_KEY);
            const count = Math.max(this.nodes.length, 1);
            this.nodes.forEach((node, index) => {
                const angle = index * Math.PI * 2 / count;
                node.x = Math.cos(angle) * 220;
                node.y = Math.sin(angle) * 220;
                node.vx = 0;
                node.vy = 0;
            });
            this.physicsStableFrames = 0;
            this.isPhysicsSleeping = false;
            this.isPhysicsActive = true;
        },

        triggerMicroReheat(target) {
            if (!this.isPhysicsActive) {
                return;
            }
            this.physicsStableFrames = 0;
            this.isPhysicsSleeping = false;

            let targets = [];
            if (Array.isArray(target) && target.length > 0) {
                targets = target;
            } else if (typeof target === "string") {
                const found = this.nodes.find(n => n.id === target);
                if (found) {
                    targets = [found];
                }
            } else if (target && typeof target === "object") {
                targets = [target];
            } else {
                targets = this.nodes.filter(n => n.status === "down");
                if (targets.length === 0) {
                    targets = this.nodes;
                }
            }

            targets.forEach(node => {
                applyMicroReheatImpulse(node, 2);
            });
        },

        microReheat(target) {
            this.triggerMicroReheat(target);
        },

        resetCamera() {
            const canvas = this.$refs.canvas;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                this.camera.x = rect.width / 2;
                this.camera.y = rect.height / 2;
                this.camera.scale = 0.95;
            }
        },

        focusSearchedNode() {
            if (!this.searchQuery) {
                return;
            }
            const q = this.searchQuery.toLowerCase().trim();
            const found = this.nodes.find(n => {
                return n.label.toLowerCase().includes(q) ||
                    (n.hostname && n.hostname.toLowerCase().includes(q));
            });

            const canvas = this.$refs.canvas;
            if (found && canvas) {
                const rect = canvas.getBoundingClientRect();
                this.camera.x = (rect.width / 2) - (found.x * 1.5);
                this.camera.y = (rect.height / 2) - (found.y * 1.5);
                this.camera.scale = 1.5;
                this.hoveredNode = found;
            }
        },

        // ==========================================
        // PHYSICS ENGINE LOOP (FORCE-DIRECTED 60 FPS)
        // ==========================================
        updatePhysics() {
            if ((!this.isPhysicsActive || this.isPhysicsSleeping) && !this.isDragging) {
                return;
            }

            const nodes = this.nodes;
            const links = this.links;
            if (!nodes.length) {
                return;
            }

            if (this.isDragging && this.draggedNode?.fixed && this.dragLastWorld) {
                this.draggedNode.x = this.dragLastWorld.x;
                this.draggedNode.y = this.dragLastWorld.y;
                this.dragVelocity = { x: 0, y: 0 };
            } else if (this.isDragging && this.draggedNode && this.dragLastWorld) {
                const node = this.draggedNode;
                const dx = (this.dragLastWorld.x - node.x) * 0.35;
                const dy = (this.dragLastWorld.y - node.y) * 0.35;
                node.x += dx;
                node.y += dy;
                this.dragVelocity = { x: dx, y: dy };
            }

            if (!this.isPhysicsActive) {
                return;
            }

            nodes.forEach((node) => {
                node.vx = node.vx || 0;
                node.vy = node.vy || 0;
            });
            const dragged = this.isDragging ? this.draggedNode : null;
            links.forEach(link => {
                if (link.isTagLink) {
                    if (!link.source.fixed) {
                        applyTagAttraction(link, { kSpring: 0.035 });
                    }
                } else if (link.isDependency) {
                    applySpringForce(link, { kSpring: 0.035 });
                }
            });
            applyCenterGravity(nodes, 0.003);
            applyLocalForces(nodes, { kRepel: 2200, cutoff: 160, minGap: 6, pinned: dragged });

            let maxMovement = 0;
            nodes.forEach((node) => {
                if (node.type === "CORE") {
                    node.x = 0;
                    node.y = 0;
                    node.vx = 0;
                    node.vy = 0;
                    return;
                }
                if (node === this.draggedNode || node.fixed) {
                    node.vx = 0;
                    node.vy = 0;
                    return;
                }
                node.vx *= 0.88;
                node.vy *= 0.88;
                const speed = Math.hypot(node.vx, node.vy);
                if (speed > 12) {
                    node.vx = node.vx / speed * 12;
                    node.vy = node.vy / speed * 12;
                }
                node.x += node.vx;
                node.y += node.vy;
                maxMovement = Math.max(maxMovement, speed);
            });
            if (maxMovement < 0.08 && !this.draggedNode && !this.isDragging) {
                this.physicsStableFrames++;
                if (this.physicsStableFrames > 60) {
                    this.isPhysicsSleeping = true;
                }
            } else {
                this.physicsStableFrames = 0;
                this.isPhysicsSleeping = false;
            }
        },

        // ==========================================
        // RENDER LOOP (HTML5 CANVAS 2D)
        // ==========================================
        startRenderLoop() {
            const render = () => {
                this.updatePhysics();
                this.draw();
                this.animationFrameId = requestAnimationFrame(render);
            };
            this.animationFrameId = requestAnimationFrame(render);
        },

        draw() {
            const canvas = this.$refs.canvas;
            if (!canvas) {
                return;
            }
            const ctx = canvas.getContext("2d");
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.width / dpr;
            const h = canvas.height / dpr;

            ctx.save();
            ctx.scale(dpr, dpr);

            // 1. Background Fill
            ctx.fillStyle = "#080c14";
            ctx.fillRect(0, 0, w, h);

            // Subtle Background Radial Glow
            const bgGlow = ctx.createRadialGradient(this.camera.x, this.camera.y, 10, this.camera.x, this.camera.y, 450 * this.camera.scale);
            bgGlow.addColorStop(0, "rgba(14, 30, 58, 0.35)");
            bgGlow.addColorStop(1, "rgba(8, 12, 20, 0)");
            ctx.fillStyle = bgGlow;
            ctx.fillRect(0, 0, w, h);

            // Apply Camera Transform
            ctx.translate(this.camera.x, this.camera.y);
            ctx.scale(this.camera.scale, this.camera.scale);

            // Determine Highlighted Nodes and Links (Hover & Cascade Dimming)
            const isHovering = !!this.hoveredNode;
            const connectedSet = new Set();
            if (this.hoveredNode) {
                connectedSet.add(this.hoveredNode.id);
                this.links.forEach(l => {
                    if (l.source.id === this.hoveredNode.id) {
                        connectedSet.add(l.target.id);
                    }
                    if (l.target.id === this.hoveredNode.id) {
                        connectedSet.add(l.source.id);
                    }
                });
            }

            // Search filter highlighting
            const isSearching = !!this.searchQuery;
            const q = this.searchQuery.toLowerCase().trim();

            // 2. DRAW LINKS
            for (let i = 0; i < this.links.length; i++) {
                const link = this.links[i];
                const src = link.source;
                const tgt = link.target;

                const isConnected = isHovering && (connectedSet.has(src.id) && connectedSet.has(tgt.id));
                let alpha = isHovering ? (isConnected ? 0.85 : 0.07) : 0.25;

                ctx.beginPath();
                ctx.moveTo(src.x, src.y);
                ctx.lineTo(tgt.x, tgt.y);

                if (link.isTagLink && tgt.status === "down") {
                    ctx.setLineDash([]);
                    ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(alpha * 2.4, 0.9)})`;
                    ctx.lineWidth = isConnected ? 2.5 : 1.6;
                } else if (link.isTagLink) {
                    ctx.setLineDash([2, 4]);
                    ctx.strokeStyle = this.rgbaFromHex(src.color, alpha);
                    ctx.lineWidth = isConnected ? 1.6 : 0.7;
                } else if (tgt.type === "BACKUP" && tgt.status !== "down") {
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
                    ctx.lineWidth = isConnected ? 2 : 1;
                } else if (tgt.status === "down") {
                    ctx.setLineDash([]);
                    ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(alpha * 2.4, 0.9)})`;
                    ctx.lineWidth = isConnected ? 2.5 : 1.6;
                } else {
                    ctx.setLineDash([]);
                    ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
                    ctx.lineWidth = isConnected ? 2 : 0.8;
                }

                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 3. DRAW PARTICLES (LINK FLOW)
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                if (!p.alert && !this.enableParticles) {
                    continue;
                }
                p.t = (p.t + p.speed) % 1;

                const src = p.link.source;
                const tgt = p.link.target;
                const progress = p.reverse ? 1 - p.t : p.t;
                const px = src.x + (tgt.x - src.x) * progress;
                const py = src.y + (tgt.y - src.y) * progress;

                const isDimmed = isHovering && (!connectedSet.has(src.id) || !connectedSet.has(tgt.id));
                if (isDimmed) {
                    continue;
                }
                ctx.beginPath();
                if (p.alert) {
                    ctx.fillStyle = "rgba(255, 99, 99, 0.55)";
                    ctx.shadowColor = "rgba(239, 68, 68, 0.45)";
                    ctx.shadowBlur = 12;
                    ctx.arc(px, py, 2.4, 0, Math.PI * 2);
                } else {
                    ctx.fillStyle = "#38bdf8";
                    ctx.shadowBlur = 0;
                    ctx.arc(px, py, 1.8, 0, Math.PI * 2);
                }
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            // 4. DRAW NODES
            const timePulse = Math.sin(Date.now() / 250);

            for (let i = 0; i < this.nodes.length; i++) {
                const node = this.nodes[i];
                const isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
                const isConnected = isHovering && connectedSet.has(node.id);
                const matchesSearch = isSearching && (
                    node.label.toLowerCase().includes(q) ||
                    (node.hostname && node.hostname.toLowerCase().includes(q))
                );

                let alpha = 1;
                if (isHovering && !isConnected) {
                    alpha = 0.12;
                } else if (isSearching && !matchesSearch) {
                    alpha = 0.15;
                }

                ctx.save();
                ctx.globalAlpha = alpha;

                // DOWN Pulsing Outer Ring
                if (node.status === "down") {
                    ctx.beginPath();
                    const pulseRadius = node.radius + 4 + (timePulse * 2.5);
                    ctx.arc(node.x, node.y, Math.max(pulseRadius, node.radius), 0, Math.PI * 2);
                    ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                // Highlighted Halo for Search matches or Active Hover
                if (matchesSearch || isHovered) {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
                    ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                // Node Base Circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

                if (node.type === "CORE") {
                    ctx.fillStyle = "#0f172a";
                    ctx.fill();
                    ctx.strokeStyle = "#e2e8f0";
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                } else if (node.type === "TAG") {
                    ctx.fillStyle = this.rgbaFromHex(node.color, 0.9);
                    ctx.fill();
                    ctx.strokeStyle = "#e2e8f0";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else if (node.type === "GROUP") {
                    ctx.fillStyle = node.status === "down" ? "#ef4444" : "#0284c7";
                    ctx.fill();
                    ctx.strokeStyle = "#38bdf8";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else if (node.type === "KANTOR") {
                    ctx.fillStyle = node.status === "down" ? "#ef4444" : "#8b5cf6";
                    ctx.fill();
                    ctx.strokeStyle = "#a78bfa";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else if (node.type === "BACKUP") {
                    ctx.fillStyle = node.status === "down" ? "#ef4444" : "#f59e0b";
                    ctx.fill();
                    ctx.strokeStyle = "#fbbf24";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    // ATM or general endpoint
                    if (node.status === "down") {
                        ctx.fillStyle = "#ef4444";
                    } else if (node.status === "slow") {
                        ctx.fillStyle = "#eab308";
                    } else {
                        ctx.fillStyle = "#22c55e";
                    }
                    ctx.fill();
                }

                // 5. DRAW LABELS
                // ==========================================
                // 5. ATURAN TAMPILAN LABEL (OBSIDIAN STYLE)
                // - Zoom jauh: Semua nama ATM/Backup TIDAK KELUAR (bersih seperti Image 1)
                // - Zoom mendekat (scale >= 1.2): BARU KELUAR NAMA, dan HANYA untuk yang DOWN
                // - Link yang UP tetap tidak keluar namanya saat zoom mendekat
                // ==========================================
                const isZoomedClose = this.camera.scale >= 1.2;
                const isEndpoint = node.type === "ATM" || node.type === "BACKUP";

                let shouldDrawLabel = false;
                if (this.alwaysShowLabels || isHovered || matchesSearch) {
                    shouldDrawLabel = true;
                } else if (node.type === "CORE" || node.type === "TAG") {
                    shouldDrawLabel = this.camera.scale >= 0.5;
                } else if (node.type === "GROUP") {
                    shouldDrawLabel = this.camera.scale >= 0.7;
                } else if (node.type === "KANTOR") {
                    shouldDrawLabel = this.camera.scale >= 0.75;
                } else if (isEndpoint) {
                    shouldDrawLabel = isZoomedClose && node.status === "down";
                }

                if (shouldDrawLabel && alpha > 0.3) {
                    ctx.font = node.type === "GROUP" ? "bold 11px monospace" : (node.type === "KANTOR" ? "bold 10px monospace" : "9px monospace");
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";

                    // Label shadow for contrast
                    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
                    ctx.fillText(node.label, node.x + 1, node.y + node.radius + 4);

                    ctx.fillStyle = isHovered ? "#38bdf8" : (matchesSearch ? "#facc15" : (node.status === "down" ? "#fca5a5" : "#e2e8f0"));
                    ctx.fillText(node.label, node.x, node.y + node.radius + 3);
                }

                ctx.restore();
            }

            ctx.restore();
        },

        // ==========================================
        // MOUSE & INTERACTION HANDLERS
        // ==========================================
        getCanvasMouseWorld(e) {
            const canvas = this.$refs.canvas;
            const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const scale = this.camera.scale || 1;
            const worldX = (mouseX - this.camera.x) / scale;
            const worldY = (mouseY - this.camera.y) / scale;

            return { worldX, worldY, clientX: e.clientX, clientY: e.clientY };
        },

        findNodeAt(worldX, worldY) {
            const scale = this.camera.scale || 1;

            // Toleransi hitbox dalam SATUAN LAYAR (px), lalu dikonversi ke world space.
            // Sebelumnya radius world statis -> saat zoom jauh node jadi minuscule
            // dan kursor mudah "miss" / meleset ke node lain.
            const minScreenRadius = 14;

            let best = null;
            let bestDistance = Infinity;

            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const n = this.nodes[i];
                const dx = worldX - n.x;
                const dy = worldY - n.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                const nodeScreenRadius = (n.radius || 6) * scale;
                const hitRadius = Math.max(nodeScreenRadius + 6, minScreenRadius) / scale;

                if (dist <= hitRadius) {
                    // Ambil node yang paling dekat dengan kursor (node kecil di atas
                    // node besar harus tetap bisa dipilih).
                    if (dist < bestDistance || (dist === bestDistance && best && n.radius < best.radius)) {
                        best = n;
                        bestDistance = dist;
                    }
                }
            }
            return best;
        },

        setTooltipPos(clientX, clientY) {
            // Estimasi ukuran tooltip untuk mencegah kartu keluar dari viewport
            const margin = 12;
            const estWidth = 260;
            const estHeight = 150;
            const maxX = window.innerWidth - estWidth - margin;
            const maxY = window.innerHeight - estHeight - margin;

            let x = clientX + 15;
            let y = clientY + 15;

            if (x > maxX) {
                x = Math.max(margin, clientX - estWidth - 15);
            }
            if (y > maxY) {
                y = Math.max(margin, clientY - estHeight - 15);
            }

            this.tooltipPos = { x, y };
        },

        onMouseDown(e) {
            const { worldX, worldY, clientX, clientY } = this.getCanvasMouseWorld(e);
            const hit = this.findNodeAt(worldX, worldY);

            if (hit) {
                this.isDragging = true;
                this.draggedNode = hit;
                this.dragLastWorld = { x: worldX, y: worldY };
                this.dragVelocity = { x: 0, y: 0 };
                this.hoveredNode = hit;
                this.physicsStableFrames = 0;
                this.isPhysicsSleeping = false;
                this.setTooltipPos(clientX, clientY);
            } else {
                this.isPanning = true;
                this.panStart = { x: e.clientX - this.camera.x, y: e.clientY - this.camera.y };
            }
        },

        onMouseMove(e) {
            const { worldX, worldY, clientX, clientY } = this.getCanvasMouseWorld(e);

            if (this.isDragging && this.draggedNode) {
                this.physicsStableFrames = 0;
                this.isPhysicsSleeping = false;
                this.dragLastWorld = { x: worldX, y: worldY };
                this.setTooltipPos(clientX, clientY);
                return;
            }

            if (this.isPanning) {
                this.camera.x = e.clientX - this.panStart.x;
                this.camera.y = e.clientY - this.panStart.y;
                return;
            }

            // Hover check
            const hit = this.findNodeAt(worldX, worldY);
            if (hit !== this.hoveredNode) {
                this.hoveredNode = hit;
            }
            if (hit) {
                this.setTooltipPos(clientX, clientY);
            }
        },

        onMouseUp() {
            if (this.isDragging && this.draggedNode?.fixed) {
                if (this.dragLastWorld) {
                    this.draggedNode.x = this.dragLastWorld.x;
                    this.draggedNode.y = this.dragLastWorld.y;
                }
                this.tagPositions[this.draggedNode.label] = { x: this.draggedNode.x, y: this.draggedNode.y };
                localStorage.setItem(TAG_POSITION_STORAGE_KEY, JSON.stringify(this.tagPositions));
            } else if (this.isDragging && this.draggedNode) {
                this.draggedNode.vx = (this.dragVelocity?.x || 0) * 1.5;
                this.draggedNode.vy = (this.dragVelocity?.y || 0) * 1.5;
            }
            this.isDragging = false;
            this.draggedNode = null;
            this.dragLastWorld = null;
            this.isPanning = false;
            this.physicsStableFrames = 0;
            this.isPhysicsSleeping = false;
        },

        onMouseLeave() {
            if (this.isDragging && this.draggedNode?.fixed) {
                if (this.dragLastWorld) {
                    this.draggedNode.x = this.dragLastWorld.x;
                    this.draggedNode.y = this.dragLastWorld.y;
                }
                this.tagPositions[this.draggedNode.label] = { x: this.draggedNode.x, y: this.draggedNode.y };
                localStorage.setItem(TAG_POSITION_STORAGE_KEY, JSON.stringify(this.tagPositions));
            } else if (this.isDragging && this.draggedNode) {
                this.draggedNode.vx = (this.dragVelocity?.x || 0) * 1.5;
                this.draggedNode.vy = (this.dragVelocity?.y || 0) * 1.5;
            }
            this.isDragging = false;
            this.draggedNode = null;
            this.dragLastWorld = null;
            this.isPanning = false;
            this.hoveredNode = null;
            this.physicsStableFrames = 0;
            this.isPhysicsSleeping = false;
        },

        onWheel(e) {
            e.preventDefault();
            const rect = this.$refs.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
            const newScale = Math.min(Math.max(this.camera.scale * zoomFactor, 0.25), 4.0);

            // Zoom centered at mouse position
            this.camera.x = mouseX - (mouseX - this.camera.x) * (newScale / this.camera.scale);
            this.camera.y = mouseY - (mouseY - this.camera.y) * (newScale / this.camera.scale);
            this.camera.scale = newScale;

            // Recompute hover agar hit-test mengikuti scale baru secara instan
            const hit = this.findNodeAt((e.clientX - rect.left - this.camera.x) / newScale, (e.clientY - rect.top - this.camera.y) / newScale);
            if (hit !== this.hoveredNode) {
                this.hoveredNode = hit;
            }
            if (hit) {
                this.setTooltipPos(e.clientX, e.clientY);
            } else {
                this.hoveredNode = null;
            }
        },

        rgbaFromHex(hex, alpha) {
            const normalized = String(hex || "#14b8a6").replace("#", "");
            const value = normalized.length === 3
                ? normalized.split("").map(c => c + c).join("")
                : normalized;
            const number = parseInt(value, 16);
            if (Number.isNaN(number)) {
                return `rgba(20, 184, 166, ${alpha})`;
            }
            const red = (number >> 16) & 255;
            const green = (number >> 8) & 255;
            const blue = number & 255;
            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        },

        getBadgeClass(node) {
            if (node.type === "GROUP") {
                return "bg-primary";
            }
            if (node.type === "KANTOR") {
                return "bg-purple-subtle text-purple";
            }
            if (node.type === "BACKUP") {
                return "bg-warning-subtle text-warning";
            }
            return "bg-info-subtle text-info";
        },

        getStatusTextColor(node) {
            if (node.status === "down") {
                return "text-danger";
            }
            if (node.status === "slow") {
                return "text-warning";
            }
            return "text-primary";
        },
    },
};
</script>

<style scoped>
.font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.font-sans {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.font-bold {
    font-weight: 700;
}

.bg-purple-subtle {
    background: rgba(139, 92, 246, 0.15);
}

.text-purple {
    color: #c4b5fd;
}

.noc-graph-page {
    background-color: #080c14;
    color: #e2e8f0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.noc-dot-blue {
    width: 8px;
    height: 8px;
    background-color: #38bdf8;
    border-radius: 50%;
    box-shadow: 0 0 6px #38bdf8;
}

/* CANVAS WRAPPER */
.noc-canvas-wrapper {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
}

.noc-canvas-wrapper:active {
    cursor: grabbing;
}

.noc-graph-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

/* FLOATING CONTROLS (KUMA STYLE) */
.noc-floating-panel {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 320px;
    max-width: calc(100% - 32px);
    max-height: calc(100% - 32px);
    display: flex;
    flex-direction: column;
    padding: 0;
    background-color: #0d1117;
    color: #b1b8c0;
    border: 1px solid #1d2634;
    border-radius: 10px;
    z-index: 10;
    box-shadow: 0 15px 70px rgba(0, 0, 0, 0.5);
    transition: width 0.2s ease;
    overflow: hidden;
}

.panel-collapsed {
    width: 230px;
}

.noc-panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid #1d2634;
}

.panel-collapsed .noc-panel-header {
    border-bottom: 0;
}

.noc-panel-title {
    font-weight: bold;
    color: #f0f6fc;
    white-space: nowrap;
}

.noc-panel-fullscreen {
    min-width: 20px;
    line-height: 1.2;
    color: #b1b8c0;
}

.noc-panel-fullscreen:hover,
.noc-panel-fullscreen:focus-visible {
    color: #5cdd8b;
}

.noc-panel-toggle {
    min-width: 42px;
    padding: 0;
    line-height: 1.2;
}

.noc-section-divider {
    border-top: 1px solid #1d2634;
}

.noc-floating-panel .form-label {
    color: #b1b8c0;
}

.noc-floating-panel .form-control,
.noc-floating-panel .form-select {
    color: #b1b8c0;
    background-color: #070a10;
    border-color: #1d2634;
}

.noc-floating-panel .form-control::placeholder {
    color: #6c757d;
}

.noc-floating-panel .form-control:focus,
.noc-floating-panel .form-select:focus {
    border-color: #5cdd8b;
    box-shadow: 0 0 0 0.2rem rgba(92, 221, 139, 0.25);
}

.noc-floating-panel .input-group-text {
    color: #b1b8c0;
    background-color: #282f39;
    border-color: #1d2634;
}

.noc-status-btn-group .btn {
    padding-left: 8px;
    padding-right: 8px;
}

.noc-floating-panel .btn-outline-normal {
    color: #b1b8c0;
    border-color: #1d2634;
}

.noc-floating-panel .btn-outline-normal:hover {
    color: #f0f6fc;
    background-color: #161b22;
}

.noc-floating-panel .btn-primary {
    color: #020b05;
}

.noc-floating-panel .form-check-input {
    background-color: #070a10;
    border-color: #1d2634;
}

.noc-floating-panel .form-switch .form-check-input:not(:checked) {
    background-color: #232f3b;
}

.noc-floating-panel .form-check-input:checked {
    background-color: #5cdd8b;
    border-color: #5cdd8b;
}

.noc-floating-panel .form-check-input:focus {
    box-shadow: 0 0 0 0.2rem rgba(92, 221, 139, 0.25);
}

.noc-floating-panel .form-range::-webkit-slider-thumb {
    background-color: #5cdd8b;
}

.noc-floating-panel .form-range::-moz-range-thumb {
    background-color: #5cdd8b;
}

.noc-floating-panel .form-range::-webkit-slider-runnable-track {
    background-color: #232f3b;
}

.noc-floating-panel .form-range::-moz-range-track {
    background-color: #232f3b;
}

.noc-physics-status {
    background-color: #070a10;
    border: 1px solid #1d2634;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 11px;
}

.noc-live-heartbeat-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #5cdd8b;
    box-shadow: 0 0 6px rgba(92, 221, 139, 0.6);
    animation: noc-heartbeat-pulse 1.6s infinite ease-in-out;
}

@keyframes noc-heartbeat-pulse {
    0%,
    100% {
        transform: scale(1);
        opacity: 1;
    }

    50% {
        transform: scale(0.8);
        opacity: 0.35;
    }
}

@media (prefers-reduced-motion: reduce) {
    .noc-live-heartbeat-dot {
        animation: none;
    }
}

.noc-panel-content {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    max-height: calc(100vh - 170px);
    padding: 1rem;
    overscroll-behavior: contain;
}

/* FLOATING LEGEND (BOTTOM BAR) */
.noc-floating-legend {
    position: absolute;
    bottom: 16px;
    left: 16px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(10px);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 6px 14px;
    z-index: 10;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}

.legend-circle {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.legend-circle.group {
    background: #0284c7;
    border: 1.5px solid #38bdf8;
}

.legend-line {
    display: inline-block;
    width: 18px;
    height: 2px;
    background: rgba(56, 189, 248, 0.8);
}

.legend-circle.kantor {
    background: #8b5cf6;
}

.legend-circle.atm {
    background: #22c55e;
}

.legend-circle.backup {
    background: #f59e0b;
}

.legend-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.legend-dot.up {
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
}

.legend-dot.slow {
    background: #eab308;
    box-shadow: 0 0 6px #eab308;
}

.legend-dot.down {
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
}

/* HOVER TOOLTIP */
.noc-graph-tooltip {
    position: fixed;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(8px);
    border: 1px solid #475569;
    border-radius: 8px;
    padding: 8px 12px;
    min-width: 180px;
    z-index: 30;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
}

.cursor-pointer {
    cursor: pointer;
}
</style>
