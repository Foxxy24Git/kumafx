<template>
    <div class="topology-page container-fluid">
        <div class="topology-header d-flex flex-wrap align-items-center gap-2 mb-3">
            <div class="flex-grow-1">
                <h1 class="mb-1">{{ $t("Network Graph") }}</h1>
                <div class="text-secondary small">{{ nodeCount }} nodes · {{ edgeCount }} connections</div>
            </div>
            <input v-model.trim="search" class="form-control topology-search" :placeholder="$t('Search')" />
            <select v-model="tagFilter" class="form-select topology-filter">
                <option value="">{{ $t("All Tags") }}</option>
                <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
            </select>
            <select v-model="statusFilter" class="form-select topology-filter">
                <option value="">{{ $t("All Status") }}</option>
                <option value="1">{{ $t("Up") }}</option>
                <option value="0">{{ $t("Down") }}</option>
                <option value="2">{{ $t("Pending") }}</option>
            </select>
            <button class="btn btn-outline-normal" type="button" @click="resetView">
                <font-awesome-icon icon="undo" /> {{ $t("Reset") }}
            </button>
        </div>

        <div class="topology-layout shadow-box">
            <div ref="canvasWrap" class="topology-canvas-wrap">
                <canvas
                    ref="canvas"
                    @wheel.prevent="onWheel"
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @pointerleave="onPointerUp"
                />
                <div v-if="selectedNode" class="topology-detail shadow-box">
                    <button class="btn-close float-end" type="button" @click="selectedNode = null" />
                    <h3 class="h6 mb-2">{{ selectedNode.label }}</h3>
                    <div class="small text-secondary">{{ selectedNode.typeLabel }}</div>
                    <div v-if="selectedNode.tag" class="small mt-2">{{ selectedNode.tag }}</div>
                    <div v-if="selectedNode.monitor" class="small mt-2">
                        <div>{{ selectedNode.monitor.hostname || selectedNode.monitor.url || "-" }}</div>
                        <div>{{ statusLabel(selectedNode.monitor.id) }} · {{ lastPing(selectedNode.monitor.id) }}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { UP, DOWN, PENDING, MAINTENANCE } from "../util.ts";

const colors = {
    core: "#5cdd8b",
    branch: "#8ab4f8",
    tag: "#f8a306",
    atm: "#b1b8c0",
};

export default {
    data() {
        return {
            search: "",
            tagFilter: "",
            statusFilter: "",
            scale: 1,
            pan: {
                x: 0,
                y: 0,
            },
            dragging: null,
            selectedNode: null,
            nodes: [],
            edges: [],
            canvasSize: {
                width: 0,
                height: 0,
            },
            animation: null,
        };
    },
    computed: {
        monitors() {
            return Object.values(this.$root.monitorList);
        },
        tags() {
            const list = this.monitors.flatMap((m) => (m.tags || []).map((t) => t.name));
            return [...new Set(list)].sort();
        },
        nodeCount() {
            return this.nodes.length;
        },
        edgeCount() {
            return this.edges.length;
        },
        visibleNodes() {
            return this.nodes.filter((node) => {
                if (node.monitor && this.statusFilter !== "") {
                    const currentStatus = String(this.$root.lastHeartbeatList[node.monitor.id]?.status);
                    if (currentStatus !== this.statusFilter) {
                        return false;
                    }
                }
                if (this.tagFilter && node.tag !== this.tagFilter) {
                    return false;
                }
                if (this.search && !node.label.toLowerCase().includes(this.search.toLowerCase())) {
                    return false;
                }
                return true;
            });
        },
    },
    watch: {
        monitors: {
            deep: true,
            handler() {
                this.buildGraph();
            },
        },
        lastHeartbeatList: {
            deep: true,
            handler() {
                this.draw();
            },
        },
    },
    mounted() {
        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
        });
        this.resizeObserver.observe(this.$refs.canvasWrap);
        this.buildGraph();
        this.$root.emitter.on("newImportantHeartbeat", this.onHeartbeat);
    },
    beforeUnmount() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        cancelAnimationFrame(this.animation);
        this.$root.emitter.off("newImportantHeartbeat", this.onHeartbeat);
    },
    methods: {
        onHeartbeat() {
            this.draw();
        },
        buildGraph() {
            const monitors = this.monitors;
            const byId = new Map(monitors.map((m) => [m.id, m]));
            const nodes = [
                {
                    id: "core",
                    label: "DC PUSAT / NOC CORE",
                    type: "core",
                    typeLabel: "Core",
                },
            ];
            const edges = [];
            const groupIds = [...new Set(monitors.map((m) => m.parent).filter((id) => id != null))];

            groupIds.forEach((id, i) => {
                const m = byId.get(id);
                nodes.push({
                    id: `group:${id}`,
                    label: m?.name || `Group ${id}`,
                    type: "branch",
                    typeLabel: "Cabang",
                    tag: m?.tags?.[0]?.name,
                    parent: "core",
                    seed: i,
                });
                edges.push(["core", `group:${id}`]);
            });

            const tagNodes = new Map();
            monitors.forEach((m) => {
                (m.tags || []).forEach((tag) => {
                    const name = tag.name;
                    if (!tagNodes.has(name)) {
                        const id = `tag:${name}`;
                        tagNodes.set(name, id);
                        nodes.push({
                            id,
                            label: name,
                            type: "tag",
                            typeLabel: "ISP Tag",
                            tag: name,
                            seed: tagNodes.size,
                        });
                        edges.push(["core", id]);
                    }
                });
            });

            monitors
                .filter((m) => m.type !== "group")
                .forEach((m, i) => {
                    const tag = m.tags?.[0]?.name;
                    const id = `monitor:${m.id}`;
                    nodes.push({
                        id,
                        label: m.name,
                        type: "atm",
                        typeLabel: "ATM",
                        tag,
                        monitor: m,
                        parent: m.parent != null ? `group:${m.parent}` : "core",
                        seed: i,
                    });
                    const parentSource = m.parent != null && byId.has(m.parent) ? `group:${m.parent}` : "core";
                    edges.push([parentSource, id]);
                    if (tag && tagNodes.has(tag)) {
                        edges.push([tagNodes.get(tag), id]);
                    }
                });

            this.nodes = nodes;
            this.edges = edges;
            this.layoutNodes();
            this.draw();
        },
        layoutNodes() {
            const groups = this.nodes.filter((n) => n.type === "branch");
            const tags = this.nodes.filter((n) => n.type === "tag");
            const atms = this.nodes.filter((n) => n.type === "atm");

            const place = (items, radius, offset = 0) => {
                items.forEach((n, i) => {
                    const a = offset + (i / Math.max(1, items.length)) * Math.PI * 2;
                    n.x = Math.cos(a) * radius;
                    n.y = Math.sin(a) * radius;
                });
            };

            const coreNode = this.nodes.find((n) => n.type === "core");
            if (coreNode) {
                coreNode.x = 0;
                coreNode.y = 0;
            }

            place(groups, 180);
            place(tags, 300, 0.35);
            place(atms, 400, 0.1);
        },
        resize() {
            if (!this.$refs.canvasWrap || !this.$refs.canvas) {
                return;
            }
            const rect = this.$refs.canvasWrap.getBoundingClientRect();
            this.canvasSize = {
                width: rect.width,
                height: rect.height,
            };
            const canvas = this.$refs.canvas;
            canvas.width = rect.width * devicePixelRatio;
            canvas.height = rect.height * devicePixelRatio;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            this.draw();
        },
        point(node) {
            return {
                x: this.canvasSize.width / 2 + this.pan.x + node.x * this.scale,
                y: this.canvasSize.height / 2 + this.pan.y + node.y * this.scale,
            };
        },
        draw() {
            if (!this.$refs.canvas || !this.canvasSize.width) {
                return;
            }
            const ctx = this.$refs.canvas.getContext("2d");
            ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
            ctx.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);

            const visible = new Set(this.visibleNodes.map((n) => n.id));
            ctx.lineWidth = 1;

            this.edges.forEach(([a, b]) => {
                const na = this.nodes.find((n) => n.id === a);
                const nb = this.nodes.find((n) => n.id === b);
                if (!na || !nb) {
                    return;
                }
                if (!visible.has(a) && !visible.has(b)) {
                    return;
                }
                const pa = this.point(na);
                const pb = this.point(nb);
                const isDown = nb.type === "atm" && this.status(nb.monitor?.id) === DOWN;
                ctx.strokeStyle = isDown ? "#dc3545" : "#1d2634";
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
            });

            this.visibleNodes.forEach((node) => {
                const p = this.point(node);
                const radius = node.type === "core" ? 18 : node.type === "branch" ? 13 : node.type === "tag" ? 11 : 7;
                ctx.fillStyle = node.type === "atm" ? this.statusColor(node.monitor?.id) : colors[node.type];
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#b1b8c0";
                ctx.font = "12px sans-serif";
                ctx.fillText(node.label, p.x + radius + 4, p.y + 4);
            });
        },
        status(id) {
            return this.$root.lastHeartbeatList[id]?.status;
        },
        statusColor(id) {
            const map = {
                [UP]: "#5cdd8b",
                [DOWN]: "#dc3545",
                [PENDING]: "#f8a306",
                [MAINTENANCE]: "#1747f5",
            };
            return map[this.status(id)] || "#aaa";
        },
        statusLabel(id) {
            const map = {
                [UP]: "UP",
                [DOWN]: "DOWN",
                [PENDING]: "PENDING",
                [MAINTENANCE]: "MAINTENANCE",
            };
            return map[this.status(id)] || "UNKNOWN";
        },
        lastPing(id) {
            const ping = this.$root.lastHeartbeatList[id]?.ping;
            return ping == null ? "-" : `${ping} ms`;
        },
        hitNode(event) {
            const rect = this.$refs.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            return this.visibleNodes.find((n) => {
                const p = this.point(n);
                return Math.hypot(p.x - x, p.y - y) < 16;
            });
        },
        onPointerDown(event) {
            const node = this.hitNode(event);
            if (node) {
                this.dragging = {
                    node,
                    x: event.clientX,
                    y: event.clientY,
                };
                this.selectedNode = node;
                this.$refs.canvas.setPointerCapture(event.pointerId);
            } else {
                this.dragging = {
                    pan: true,
                    x: event.clientX,
                    y: event.clientY,
                };
            }
        },
        onPointerMove(event) {
            if (!this.dragging) {
                return;
            }
            const dx = event.clientX - this.dragging.x;
            const dy = event.clientY - this.dragging.y;
            if (this.dragging.pan) {
                this.pan.x += dx;
                this.pan.y += dy;
            } else {
                this.dragging.node.x += dx / this.scale;
                this.dragging.node.y += dy / this.scale;
            }
            this.dragging.x = event.clientX;
            this.dragging.y = event.clientY;
            this.draw();
        },
        onPointerUp() {
            this.dragging = null;
        },
        onWheel(event) {
            const factor = event.deltaY < 0 ? 1.1 : 0.9;
            this.scale = Math.max(0.25, Math.min(3, this.scale * factor));
            this.draw();
        },
        resetView() {
            this.scale = 1;
            this.pan = {
                x: 0,
                y: 0,
            };
            this.layoutNodes();
            this.draw();
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.topology-page {
    width: 98%;
}

.topology-search {
    max-width: 220px;
}

.topology-filter {
    max-width: 150px;
}

.topology-layout {
    padding: 0;
    overflow: hidden;
}

.topology-canvas-wrap {
    position: relative;
    height: calc(100vh - 160px);
    min-height: 520px;
    background: $dark-bg2;
    overflow: hidden;
}

canvas {
    display: block;
    cursor: grab;

    &:active {
        cursor: grabbing;
    }
}

.topology-detail {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 260px;
    background: $dark-bg;
    color: $dark-font-color;
}
</style>
