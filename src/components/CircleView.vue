<template>
    <div class="noc-circle-wrapper" @mouseleave="hideTooltip">
        <div class="noc-circle-header">
            <div class="noc-circle-breadcrumb">
                <button
                    type="button"
                    class="noc-circle-crumb"
                    :class="{ active: zoomPath.length === 0 }"
                    @click="resetZoom"
                >
                    {{ instanceName || "Root" }}
                </button>
                <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.id">
                    <span class="noc-crumb-sep">/</span>
                    <button
                        type="button"
                        class="noc-circle-crumb"
                        :class="{ active: idx === breadcrumbs.length - 1 }"
                        @click="zoomTo(idx)"
                    >
                        {{ crumb.name }}
                    </button>
                </template>
            </div>
            <span v-if="zoomPath.length > 0" class="noc-zoom-hint">Klik pusat untuk kembali</span>
        </div>

        <div v-if="!arcs.length" class="noc-empty">Belum ada data untuk ditampilkan.</div>

        <div v-else class="noc-circle-svg-container">
            <svg
                viewBox="0 0 600 600"
                class="noc-circle"
                role="img"
                aria-label="Sunburst status radial bergaya PRTG"
            >
                <g transform="translate(300, 300)">
                    <g
                        v-for="(arc, index) in arcs"
                        :key="`${arc.layer}-${arc.id}-${index}`"
                        class="noc-arc"
                        :class="[
                            `status-${arc.status ? arc.status.toLowerCase() : 'unknown'}`,
                            { 'is-down': arc.status === 'DOWN' }
                        ]"
                        @click="onArcClick(arc)"
                        @mousemove="showTooltip($event, arc)"
                        @mouseleave="hideTooltip"
                    >
                        <path :d="arc.path" :fill="arc.color" />
                    </g>

                    <!-- Center Hole / Root -->
                    <circle
                        cx="0"
                        cy="0"
                        r="78"
                        class="noc-circle-hole"
                        :class="{ 'can-zoom-out': zoomPath.length > 0 }"
                        @click="zoomOut"
                    />
                    <text
                        x="0"
                        y="-10"
                        class="noc-circle-center"
                        @click="zoomOut"
                    >
                        {{ centerLabel }}
                    </text>
                    <text
                        x="0"
                        y="16"
                        class="noc-circle-total"
                        @click="zoomOut"
                    >
                        {{ centerNodeCount }}
                    </text>
                    <text
                        v-if="zoomPath.length > 0"
                        x="0"
                        y="34"
                        class="noc-circle-back-hint"
                        @click="zoomOut"
                    >
                        &larr; KEMBALI
                    </text>
                </g>
            </svg>
        </div>

        <!-- Floating Interactive Tooltip -->
        <div
            v-if="hoveredArc"
            class="noc-tooltip"
            :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }"
        >
            <div class="noc-tooltip-header">
                <strong>{{ hoveredArc.name }}</strong>
                <span class="noc-tooltip-badge" :style="{ backgroundColor: hoveredArc.color }">
                    {{ hoveredArc.status }}
                </span>
            </div>
            <div v-if="hoveredArc.hostname && hoveredArc.hostname !== hoveredArc.name" class="noc-tooltip-row">
                <span class="noc-tooltip-dim">Host:</span>
                <span>{{ hoveredArc.hostname }}</span>
            </div>
            <div v-if="hoveredArc.type === 'monitor' || hoveredArc.monitor" class="noc-tooltip-row">
                <span class="noc-tooltip-dim">Ping:</span>
                <span>{{ hoveredArc.ping != null ? `${hoveredArc.ping} ms` : "-" }}</span>
            </div>
            <div v-if="hoveredArc.tags && hoveredArc.tags.length" class="noc-tooltip-row">
                <span class="noc-tooltip-dim">Tags:</span>
                <span class="noc-tooltip-tags">
                    <span v-for="tag in hoveredArc.tags" :key="tag.name" class="noc-tag-pill">
                        {{ tag.name }}
                    </span>
                </span>
            </div>
            <div v-if="hoveredArc.hasChildren" class="noc-tooltip-footer">
                <small>Klik untuk zoom/drill-down</small>
            </div>
        </div>

        <!-- Legend -->
        <div class="noc-legend">
            <span><i class="noc-dot up"></i> UP</span>
            <span><i class="noc-dot down"></i> DOWN</span>
            <span><i class="noc-dot pending"></i> PENDING</span>
            <span><i class="noc-dot maintenance"></i> MAINTENANCE</span>
        </div>
        <div class="noc-legend-sub">
            <span>Tengah: Root &nbsp;·&nbsp; Dalam: Grup &nbsp;·&nbsp; Tengah: Node &nbsp;·&nbsp; Luar: Tag</span>
        </div>
    </div>
</template>

<script>
import { buildPrtgHierarchy, layoutPrtgSunburst } from "../noc-dashboard";

export default {
    name: "CircleView",
    props: {
        /** Collection of monitors */
        monitorList: {
            type: Object,
            default: () => ({}),
        },
        /** Latest heartbeat map */
        lastHeartbeatList: {
            type: Object,
            default: () => ({}),
        },
        /** Instance name for the root node */
        instanceName: {
            type: String,
            default: "All Monitors",
        },
    },
    emits: ["select-monitor"],
    data() {
        return {
            zoomPath: [],
            hoveredArc: null,
            tooltipPos: { x: 0, y: 0 },
        };
    },
    computed: {
        /**
         * Root hierarchy computed from reactive monitor and heartbeat data
         * @returns {object} Root tree node
         */
        fullHierarchy() {
            return buildPrtgHierarchy(this.monitorList, this.lastHeartbeatList, this.instanceName);
        },
        /**
         * Active focused hierarchy node based on zoomPath
         * @returns {object} Current focused subtree root
         */
        currentHierarchyRoot() {
            let current = this.fullHierarchy;
            for (const stepId of this.zoomPath) {
                const found = current.children?.find(child => String(child.id) === String(stepId));
                if (found) {
                    current = found;
                } else {
                    break;
                }
            }
            return current;
        },
        /**
         * Breadcrumbs list for current zoom level
         * @returns {Array<object>} Breadcrumb entries
         */
        breadcrumbs() {
            const crumbs = [];
            let current = this.fullHierarchy;
            for (const stepId of this.zoomPath) {
                const found = current.children?.find(child => String(child.id) === String(stepId));
                if (found) {
                    crumbs.push({ id: found.id, name: found.name });
                    current = found;
                }
            }
            return crumbs;
        },
        /**
         * Layout arc entries generated by D3 partition
         * @returns {Array<object>} Arc layouts
         */
        arcs() {
            return layoutPrtgSunburst(this.currentHierarchyRoot, 600, 600);
        },
        /**
         * Text label displayed in the center hole
         * @returns {string} Truncated label
         */
        centerLabel() {
            const name = this.currentHierarchyRoot?.name || "NETWORK";
            return name.length > 14 ? `${name.slice(0, 12)}…` : name.toUpperCase();
        },
        /**
         * Count label displayed in the center hole
         * @returns {string} Node count text
         */
        centerNodeCount() {
            const count = this.countMonitors(this.currentHierarchyRoot);
            return `${count} ${count === 1 ? "node" : "nodes"}`;
        },
    },
    methods: {
        /**
         * Recursively count individual monitors in subtree
         * @param {object} node Target tree node
         * @returns {number} Total monitor count
         */
        countMonitors(node) {
            if (!node) {
                return 0;
            }
            if (node.type === "monitor") {
                return 1;
            }
            if (!node.children || !node.children.length) {
                return 0;
            }
            return node.children.reduce((sum, child) => sum + this.countMonitors(child), 0);
        },
        /**
         * Handle clicking an arc for drill-down or selection
         * @param {object} arc Arc descriptor clicked
         * @returns {void}
         */
        onArcClick(arc) {
            if (arc.hasChildren) {
                this.zoomPath.push(arc.id);
            }
            if (arc.type === "monitor" || arc.monitor) {
                this.$emit("select-monitor", arc.monitor || arc);
            }
        },
        /**
         * Zoom out one level or reset to root
         * @returns {void}
         */
        zoomOut() {
            if (this.zoomPath.length > 0) {
                this.zoomPath.pop();
            }
        },
        /**
         * Reset zoom directly to root
         * @returns {void}
         */
        resetZoom() {
            this.zoomPath = [];
        },
        /**
         * Jump to specific breadcrumb level
         * @param {number} index Breadcrumb index
         * @returns {void}
         */
        zoomTo(index) {
            this.zoomPath = this.zoomPath.slice(0, index + 1);
        },
        /**
         * Show floating tooltip for hovered arc
         * @param {MouseEvent} event Mouse move event
         * @param {object} arc Hovered arc
         * @returns {void}
         */
        showTooltip(event, arc) {
            this.hoveredArc = arc;
            const containerRect = this.$el.getBoundingClientRect();
            this.tooltipPos = {
                x: event.clientX - containerRect.left + 14,
                y: event.clientY - containerRect.top + 14,
            };
        },
        /**
         * Hide floating tooltip
         * @returns {void}
         */
        hideTooltip() {
            this.hoveredArc = null;
        },
    },
};
</script>

<style scoped lang="scss">
.noc-circle-wrapper {
    position: relative;
    width: 100%;
}

.noc-circle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 11px;
}

.noc-circle-breadcrumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
}

.noc-circle-crumb {
    background: transparent;
    border: none;
    color: #9badba;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 11px;
    border-radius: 4px;
    transition: color 0.15s, background-color 0.15s;

    &:hover {
        color: #e9f1f5;
        background: rgba(255, 255, 255, 0.08);
    }

    &.active {
        color: #38bdf8;
        font-weight: 700;
    }
}

.noc-crumb-sep {
    color: #475569;
}

.noc-zoom-hint {
    color: #64748b;
    font-size: 10px;
}

.noc-circle-svg-container {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
}

.noc-circle {
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
    overflow: visible;
}

.noc-arc {
    cursor: pointer;
    transition: opacity 0.15s;

    path {
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s;
    }

    &:hover path {
        opacity: 0.88;
        filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.5));
    }

    &.is-down path {
        filter: drop-shadow(0 0 4px rgba(220, 38, 38, 0.6));
    }
}

.noc-circle-hole {
    fill: #142029;
    transition: fill 0.2s;

    &.can-zoom-out {
        cursor: pointer;

        &:hover {
            fill: #1a2c38;
        }
    }
}

.noc-circle-center,
.noc-circle-total,
.noc-circle-back-hint {
    text-anchor: middle;
    user-select: none;
    pointer-events: none;
}

.noc-circle-center {
    fill: #9badba;
    font-weight: 800;
    letter-spacing: 1.5px;
    font-size: 12px;
}

.noc-circle-total {
    fill: #e9f1f5;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0;
}

.noc-circle-back-hint {
    fill: #38bdf8;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1px;
}

.noc-tooltip {
    position: absolute;
    z-index: 100;
    pointer-events: none;
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    min-width: 180px;
    max-width: 280px;
    color: #e2e8f0;
    font-size: 12px;
    backdrop-filter: blur(8px);
}

.noc-tooltip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    strong {
        color: #f8fafc;
        font-size: 13px;
        word-break: break-all;
    }
}

.noc-tooltip-badge {
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 700;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.noc-tooltip-row {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    align-items: baseline;
}

.noc-tooltip-dim {
    color: #94a3b8;
    font-size: 11px;
    min-width: 36px;
}

.noc-tooltip-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.noc-tag-pill {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
}

.noc-tooltip-footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #64748b;
    font-size: 10px;
    text-align: center;
}

.noc-legend {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    justify-content: center;
    color: #91a5b3;
    font-size: 11px;
    margin-top: 14px;

    span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }
}

.noc-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &.up { background: #8cb82b; }
    &.down { background: #dc2626; }
    &.pending { background: #3b82f6; }
    &.maintenance { background: #64748b; }
}

.noc-legend-sub {
    text-align: center;
    color: #64748b;
    font-size: 10px;
    margin-top: 6px;
}

.noc-empty {
    text-align: center;
    color: #64748b;
    padding: 30px;
    font-size: 13px;
}
</style>
