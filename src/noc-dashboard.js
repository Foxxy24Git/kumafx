import * as d3 from "d3";

/**
 * Convert object-map or array data to an array
 * @param {object|Array} source Source collection
 * @returns {Array} Collection values
 */
function asArray(source) {
    return Array.isArray(source) ? source : Object.values(source || {});
}

/**
 * Derive status from the latest heartbeat (UP, WARN, DOWN, PAUSED)
 * @param {object} monitor Monitor record
 * @param {object} heartbeatList Heartbeat map
 * @returns {string} UP, WARN, DOWN, or PAUSED
 */
function getDetailedMonitorStatus(monitor, heartbeatList) {
    if (monitor.active === false || monitor.active === 0) {
        return "PAUSED";
    }
    const beat = heartbeatList?.[monitor.id];
    if (!beat) {
        return "UP";
    }
    if (beat.status === 0) {
        return "DOWN";
    }
    if (typeof beat.ping === "number" && beat.ping > 150) {
        return "WARN";
    }
    return "UP";
}

/**
 * Derive two-state status from the latest heartbeat
 * @param {object} monitor Monitor record
 * @param {object} heartbeatList Heartbeat map
 * @returns {string} UP or DOWN
 */
function getMonitorStatus(monitor, heartbeatList) {
    const beat = heartbeatList?.[monitor.id];
    return beat && beat.status === 0 ? "DOWN" : "UP";
}

/**
 * Normalize raw monitor map into monitors/groups with recursive hierarchy
 * @param {object} monitorList Raw $root.monitorList map
 * @param {object} heartbeatList Raw $root.lastHeartbeatList map
 * @returns {object} Normalized { monitors, groups, groupsById }
 */
/**
 * Normalize raw Kuma monitors and heartbeats to uniform ATM monitor objects
 * @param {object|Array} monitorList Raw monitor collection
 * @param {object} heartbeatList Raw heartbeat map
 * @returns {Array<object>} Uniform monitor models
 */
function normalizeKumaMonitors(monitorList, heartbeatList = {}) {
    const source = asArray(monitorList);
    const groups = new Map(source.filter(m => m.type === "group").map(group => [String(group.id), group.name || "Ungrouped"]));
    return source.filter(m => m.type !== "group").map(monitor => {
        const beat = heartbeatList?.[monitor.id] || heartbeatList?.[String(monitor.id)];
        let status = "PENDING";
        if (monitor.active === false || monitor.active === 0) {
            status = "PAUSED";
        } else if (beat) {
            status = beat.status === 0 ? "DOWN" : beat.status === 2 ? "PENDING" : beat.status === 3 ? "PAUSED" : typeof beat.ping === "number" && beat.ping > 150 ? "WARNING" : "UP";
        }
        return {
            id: monitor.id,
            name: monitor.name || String(monitor.id),
            hostname: monitor.hostname || monitor.host || monitor.ip || monitor.url || monitor.name || String(monitor.id),
            ip: monitor.ip || monitor.host,
            group: groups.get(String(monitor.parent)) || "Ungrouped",
            groupId: monitor.parent ?? null,
            status,
            ping: beat?.ping,
            uptime: beat?.uptime,
            lastHeartbeat: beat?.time,
            errorMessage: beat?.msg || beat?.message,
            kumaUrl: monitor.kumaUrl || monitor.url,
            tags: monitor.tags || [],
        };
    });
}

/**
 * Filter uniform monitor list by group ID, status, and query string
 * @param {Array<object>} monitors Monitor collection
 * @param {object} options Filter criteria
 * @param {string|number|null} options.groupId Target group ID
 * @param {string} options.status Desired monitor status filter
 * @param {string} options.query Search string against name, hostname, IP, or group
 * @returns {Array<object>} Filtered collection
 */
function filterMonitors(monitors, { groupId = null, status = "ALL", query = "" } = {}) {
    const normalizedQuery = String(query).trim().toLowerCase();
    return monitors.filter(monitor =>
        (groupId === null || String(monitor.groupId) === String(groupId)) &&
        (status === "ALL" || monitor.status === status) &&
        (!normalizedQuery || [monitor.name, monitor.hostname, monitor.ip, monitor.group].some(value => String(value || "").toLowerCase().includes(normalizedQuery)))
    );
}

/**
 * Normalize raw monitor map into monitors/groups with recursive hierarchy
 * @param {object} monitorList Raw $root.monitorList map
 * @param {object} heartbeatList Raw $root.lastHeartbeatList map
 * @returns {object} Normalized { monitors, groups, groupsById }
 */
function normalizeMonitors(monitorList, heartbeatList = {}) {
    const source = Object.fromEntries(asArray(monitorList).map(m => [String(m.id), m]));
    const all = asArray(source);
    const groups = all.filter(m => m.type === "group").map(group => ({
        id: group.id,
        name: group.name || "Unnamed Group",
        parent: group.parent ?? null,
        children: [],
    }));
    const groupsById = Object.fromEntries(groups.map(group => [String(group.id), group]));
    const monitors = all.filter(m => m.type !== "group").map(m => ({
        ...m,
        id: m.id,
        groupId: m.parent ?? null,
        group: groupsById[String(m.parent)]?.name || "Lainnya",
        tags: (m.tags || []).map(tag => ({ name: tag.name || "No Tag", color: tag.color })),
        status: getMonitorStatus(m, heartbeatList),
        detailedStatus: getDetailedMonitorStatus(m, heartbeatList),
        heartbeat: heartbeatList?.[m.id] || null,
    }));

    for (const group of groups) {
        group.children = all.filter(m => m.parent === group.id).map(m => m.id);
    }

    return { monitors, groups, groupsById };
}

/**
 * Collect all monitor IDs under specified groups recursively
 * @param {Array<number>} groupIds Selected group IDs
 * @param {object} groupsById Normalized groups map
 * @returns {Array<number>} Unique descendant monitor IDs
 */
function getDescendantMonitorIds(groupIds, groupsById) {
    const selected = new Set();
    const visitedGroups = new Set();
    const visit = groupId => {
        const group = groupsById[String(groupId)];
        if (!group || visitedGroups.has(String(groupId))) {
            return;
        }
        visitedGroups.add(String(groupId));
        for (const childId of group.children) {
            if (groupsById[String(childId)]) {
                visit(childId);
            } else {
                selected.add(childId);
            }
        }
    };
    groupIds.forEach(visit);
    return Array.from(selected);
}

/**
 * Calculate count for a KPI card
 * @param {object} card Card configuration
 * @param {object} normalizedData Normalized monitors and groups
 * @returns {number} Count matching status
 */
function getCardCount(card, normalizedData) {
    const ids = getDescendantMonitorIds(card.groupIds || [], normalizedData.groupsById);
    const selected = new Set(ids.map(String));
    return normalizedData.monitors.filter(m => selected.has(String(m.id)) && m.status === card.statusType).length;
}

/**
 * Aggregate child statuses using worst-status precedence
 * @param {Array<object>} monitors Child monitor records
 * @returns {string} UP or DOWN
 */
function getWorstStatus(monitors) {
    return monitors.some(m => m.status === "DOWN") ? "DOWN" : "UP";
}

/**
 * Build three-layer group, monitor, and tag hierarchy
 * @param {object} normalizedData Normalized monitors and groups
 * @returns {Array<object>} Group roots with children
 */
function buildSunburstData(normalizedData) {
    const byGroup = new Map();
    for (const monitor of normalizedData.monitors) {
        const group = normalizedData.groupsById[String(monitor.groupId)];
        if (!group) {
            continue;
        }
        if (!byGroup.has(group.id)) {
            byGroup.set(group.id, { id: group.id, name: group.name, children: [] });
        }
        const node = byGroup.get(group.id);
        node.children.push({
            ...monitor,
            children: (monitor.tags.length ? monitor.tags : [{ name: "No Tag" }]).map(tag => ({
                id: `${monitor.id}:${tag.name}`,
                name: tag.name,
                color: tag.color,
                status: monitor.status,
            })),
        });
    }
    return Array.from(byGroup.values()).map(group => ({
        ...group,
        status: getWorstStatus(group.children),
    }));
}

/**
 * Derive deterministic, stable weight for a monitor to produce asymmetric tiles ala PRTG
 * @param {string|number} id Monitor identifier
 * @param {number} tagCount Number of tags attached
 * @returns {number} Numeric weight between 8 and 28
 */
function getNodeWeight(id, tagCount = 0) {
    const raw = String(id ?? "0");
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const normalized = ((hash >>> 0) % 100000) / 100000;
    const base = 8 + normalized * 16;
    return base + Math.min(4, Number(tagCount) || 0);
}

/**
 * Build group -> hostname hierarchy weighted for treemap sizing
 * @param {object} normalizedData Normalized monitors and groups
 * @returns {Array<object>} Group roots with weighted children
 */
const PRtgStatusRank = { UP: 0, PENDING: 1, MAINTENANCE: 2, DOWN: 3 };

/**
 * Build root, group, monitor, and tag hierarchy from live data.
 * @param {object|Array} monitorList Monitor collection.
 * @param {object} heartbeatList Latest heartbeat map.
 * @param {string} rootName Root display name.
 * @returns {object} Hierarchy root.
 */
function buildPrtgHierarchy(monitorList, heartbeatList = {}, rootName = "All Monitors") {
    const source = asArray(monitorList);
    const groups = new Map(source.filter(m => m.type === "group").map(group => [String(group.id), { ...group, monitors: [] }]));
    const ungroupedMonitors = [];

    for (const monitor of source) {
        if (monitor.type === "group") {
            continue;
        }
        const beat = heartbeatList?.[monitor.id] || heartbeatList?.[String(monitor.id)];
        let statusNum = 2;
        if (beat && typeof beat.status === "number") {
            statusNum = beat.status;
        }
        const status = ["DOWN", "UP", "PENDING", "MAINTENANCE"][statusNum] || "PENDING";
        const ping = beat?.ping != null ? beat.ping : null;
        const tags = (monitor.tags || []).map(t => ({ name: t.name, color: t.color }));

        const monitorNode = {
            id: monitor.id,
            name: monitor.hostname || monitor.name || String(monitor.id),
            hostname: monitor.hostname || monitor.host || monitor.url || monitor.ip || monitor.name || String(monitor.id),
            type: "monitor",
            status,
            statusNum,
            ping,
            tags,
            monitor,
            children: tags.map(tag => ({
                id: `${monitor.id}:tag:${tag.name}`,
                name: tag.name,
                color: tag.color,
                type: "tag",
                status,
                statusNum,
                ping,
                monitor,
                tags: [],
                children: [],
            })),
        };

        const targetGroup = groups.get(String(monitor.parent));
        if (targetGroup) {
            targetGroup.monitors.push(monitorNode);
        } else {
            ungroupedMonitors.push(monitorNode);
        }
    }

    const buildGroupNode = (group) => {
        const subGroupItems = source.filter(item => item.type === "group" && String(item.parent) === String(group.id));
        const childGroups = subGroupItems.map(item => buildGroupNode(groups.get(String(item.id))));
        const childMonitors = group.monitors;
        const allChildren = [...childGroups, ...childMonitors];

        let worstStatus = "UP";
        let worstRank = 0;
        for (const child of allChildren) {
            const rank = PRtgStatusRank[child.status] || 0;
            if (rank > worstRank) {
                worstRank = rank;
                worstStatus = child.status;
            }
        }

        return {
            id: group.id,
            name: group.name || "Unnamed Group",
            type: "group",
            status: worstStatus,
            children: allChildren,
        };
    };

    const topGroups = source.filter(m => m.type === "group" && (m.parent == null || m.parent === undefined || !groups.has(String(m.parent))));
    const rootChildren = topGroups.map(g => buildGroupNode(groups.get(String(g.id))));
    if (ungroupedMonitors.length > 0) {
        rootChildren.push(...ungroupedMonitors);
    }

    let rootStatus = "UP";
    let rootRank = 0;
    for (const child of rootChildren) {
        const rank = PRtgStatusRank[child.status] || 0;
        if (rank > rootRank) {
            rootRank = rank;
            rootStatus = child.status;
        }
    }

    return {
        id: "root",
        name: rootName,
        type: "root",
        status: rootStatus,
        children: rootChildren,
    };
}

/**
 * Compute the inside hostname label position for a DOWN monitor arc.
 * @param {object} arc Rendered arc entry from layoutPrtgSunburst.
 * @returns {object|null} Label geometry or null if not applicable.
 */
function getInsideDownNodeLabel(arc) {
    if (!arc || arc.status !== "DOWN" || arc.type !== "monitor") {
        return null;
    }

    const monitor = arc.monitor || arc;
    const hostname = monitor.hostname || monitor.host || monitor.name || String(monitor.id);
    const angle = (arc.startAngle + arc.endAngle) / 2 - Math.PI / 2;
    const r = (arc.innerRadius + arc.outerRadius) / 2;
    const maxCharacters = Math.floor(((arc.endAngle - arc.startAngle) * r - 8) / 6);
    if (maxCharacters < 2) {
        return null;
    }
    const text = hostname.length > maxCharacters ? `${hostname.slice(0, maxCharacters - 1)}…` : hostname;
    let rotation = angle * 180 / Math.PI + 90;
    if (rotation > 90 && rotation < 270) {
        rotation += 180;
    }

    return {
        id: arc.id,
        text,
        x: Math.sin(angle) * r,
        y: -Math.cos(angle) * r,
        r,
        rotation,
        monitor: arc.monitor || arc,
    };
}

/**
 * Compute legacy outside callout geometry for a DOWN monitor arc.
 * @param {object} arc Rendered arc entry from layoutPrtgSunburst.
 * @returns {object|null} Callout geometry or null if not applicable.
 */
function getDownNodeLabel(arc) {
    if (!arc || arc.status !== "DOWN" || arc.type !== "monitor") {
        return null;
    }

    const monitor = arc.monitor || arc;
    const hostname = monitor.hostname || monitor.host || monitor.name || String(monitor.id);
    const ip = monitor.ip || (monitor.host && monitor.host !== hostname ? monitor.host : null);
    const angle = (arc.startAngle + arc.endAngle) / 2 - Math.PI / 2;
    const lineStartRadius = arc.outerRadius;
    const lineEndRadius = lineStartRadius + 30;
    const lineStartX = Math.cos(angle) * lineStartRadius;
    const lineStartY = Math.sin(angle) * lineStartRadius;
    const lineEndX = Math.cos(angle) * lineEndRadius;
    const lineEndY = Math.sin(angle) * lineEndRadius;
    const side = Math.cos(angle) >= 0 ? "right" : "left";

    return {
        id: arc.id,
        hostname,
        ip,
        lineStartX,
        lineStartY,
        lineEndX,
        lineEndY,
        textX: lineEndX + (side === "right" ? 8 : -8),
        textY: lineEndY,
        anchor: side === "right" ? "start" : "end",
        monitor: arc.monitor || arc,
    };
}

/**
 * Generate D3 radial arcs for the current hierarchy level.
 * @param {object} data Hierarchy root.
 * @param {number} width SVG width.
 * @param {number} height SVG height.
 * @returns {Array<object>} Renderable arcs.
 */
function layoutPrtgSunburst(data, width = 600, height = 600) {
    if (!data || !data.children || !data.children.length) {
        return [];
    }
    const maxRadius = Math.min(width, height) * 0.44;
    const centerHoleRadius = 78;

    const root = d3.hierarchy(data)
        .sum(node => {
            const isDown = node.status === "DOWN";
            const downWeight = isDown ? 36 : 1;
            if (node.type === "tag") {
                return (1 / (node.monitor?.tags?.length || 1)) * downWeight;
            }
            if (node.type === "monitor") {
                return (node.children && node.children.length ? 0 : 1) * downWeight;
            }
            return 0;
        })
        .sort((a, b) => (b.value || 0) - (a.value || 0));

    if (!root.value) {
        return [];
    }

    const partition = d3.partition().size([2 * Math.PI, maxRadius]);
    partition(root);

    const maxDepth = Math.max(1, root.height);
    const nominalThickness = (maxRadius - centerHoleRadius - 20) / maxDepth;

    const STATUS_COLORS = {
        DOWN: "#dc2626",
        UP: "#8cb82b",
        PENDING: "#3b82f6",
        MAINTENANCE: "#64748b",
    };

    return root.descendants()
        .filter(node => node.depth > 0)
        .map(node => {
            const isDown = node.data.status === "DOWN";
            let innerRadius = centerHoleRadius + (node.depth - 1) * nominalThickness;
            let outerRadius = innerRadius + nominalThickness - 2;

            const jitter = ((getNodeWeight(node.data.id || node.data.name, node.data.tags?.length || 0) - 18) / 18) * 6;
            outerRadius += jitter;

            if (isDown) {
                if (node.data.type === "monitor" || node.depth >= 3) {
                    outerRadius += 90;
                } else if (node.data.type === "tag") {
                    innerRadius += 8;
                    outerRadius += 35;
                }
            }

            outerRadius = Math.min(outerRadius, maxRadius + 24);

            const arcGen = d3.arc()
                .startAngle(node.x0 - Math.PI / 2)
                .endAngle(node.x1 - Math.PI / 2)
                .padAngle(Math.min((node.x1 - node.x0) / 4, 0.008))
                .padRadius(maxRadius / 2)
                .innerRadius(innerRadius)
                .outerRadius(outerRadius);

            const color = isDown ? STATUS_COLORS.DOWN : (STATUS_COLORS[node.data.status] || STATUS_COLORS.UP);

            return {
                ...node.data,
                depth: node.depth,
                layer: node.depth,
                startAngle: node.x0,
                endAngle: node.x1,
                innerRadius,
                outerRadius,
                color,
                path: arcGen(),
                hasChildren: Boolean(node.children && node.children.length),
            };
        });
}

/**
 * Build group and monitor hierarchy with weights for treemap layout.
 * @param {object} normalizedData Normalized data.
 * @returns {Array<object>} Treemap group collection.
 */
function buildTreemapData(normalizedData) {
    const groups = new Map();
    for (const monitor of normalizedData.monitors) {
        const group = normalizedData.groupsById[String(monitor.groupId)] || { id: "ungrouped", name: "Ungrouped" };
        if (!groups.has(group.id)) {
            groups.set(group.id, { id: group.id, name: group.name, children: [] });
        }
        groups.get(group.id).children.push({
            ...monitor,
            weight: getNodeWeight(monitor.id, monitor.tags?.length || 0),
            tagNames: monitor.tags?.length ? monitor.tags.map(t => t.name) : ["No Tag"],
        });
    }
    return Array.from(groups.values());
}

/**
 * Construct SVG arc path string
 * @param {number} centerX Center X
 * @param {number} centerY Center Y
 * @param {number} innerRadius Inner ring radius
 * @param {number} outerRadius Outer ring radius
 * @param {number} startAngle Starting angle in radians
 * @param {number} endAngle Ending angle in radians
 * @returns {string} SVG path command
 */
function describeArc(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
    const point = (radius, angle) => [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)];
    const [outerStartX, outerStartY] = point(outerRadius, startAngle);
    const [outerEndX, outerEndY] = point(outerRadius, endAngle);
    const [innerStartX, innerStartY] = point(innerRadius, endAngle);
    const [innerEndX, innerEndY] = point(innerRadius, startAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${outerStartX} ${outerStartY} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEndX} ${outerEndY} L ${innerStartX} ${innerStartY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerEndX} ${innerEndY} Z`;
}

/**
 * Compute polar sunburst coordinates and SVG paths for 3 layers
 * @param {Array<object>} groups Group roots
 * @param {number} width SVG canvas width
 * @param {number} height SVG canvas height
 * @returns {Array<object>} Positioned arc entries
 */
function layoutSunburst(groups, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.15;
    const ringWidth = Math.min(width, height) * 0.1;
    const totalWeight = groups.reduce((sum, group) => sum + group.children.reduce((childSum, child) => childSum + child.children.length, 0), 0);
    if (totalWeight <= 0) {
        return [];
    }
    const arcs = [];
    let cursor = -Math.PI / 2;
    const addArc = (source, layer, startAngle, endAngle) => {
        const innerRadius = baseRadius + (layer - 1) * ringWidth;
        const outerRadius = innerRadius + ringWidth - 2;
        arcs.push({
            ...source,
            layer,
            startAngle,
            endAngle,
            innerRadius,
            outerRadius,
            path: describeArc(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle),
        });
    };
    for (const group of groups) {
        const groupWeight = group.children.reduce((sum, child) => sum + child.children.length, 0);
        const groupEnd = cursor + (2 * Math.PI * groupWeight) / totalWeight;
        addArc(group, 1, cursor, groupEnd);
        let childCursor = cursor;
        for (const child of group.children) {
            const childEnd = childCursor + (2 * Math.PI * child.children.length) / totalWeight;
            addArc(child, 2, childCursor, childEnd);
            let tagCursor = childCursor;
            for (const tag of child.children) {
                const tagEnd = tagCursor + (childEnd - childCursor) / child.children.length;
                addArc({ ...tag, monitorId: child.id, monitor: child }, 3, tagCursor, tagEnd);
                tagCursor = tagEnd;
            }
            childCursor = childEnd;
        }
        cursor = groupEnd;
    }
    return arcs;
}

/**
 * Lay out weighted items as a responsive 2D mosaic
 * @param {Array<object>} items Items to lay out
 * @param {number} x Origin X
 * @param {number} y Origin Y
 * @param {number} width Available width
 * @param {number} height Available height
 * @param {string} weightKey Weight property
 * @returns {Array<object>} Positioned rectangles
 */
function layoutCells(items, x, y, width, height, weightKey) {
    if (!items.length || width <= 0 || height <= 0) {
        return [];
    }
    const sorted = items.map(item => ({ item, weight: Math.max(1, item[weightKey] || 1) })).sort((a, b) => b.weight - a.weight);
    const cells = [];
    const layout = (entries, originX, originY, availableWidth, availableHeight) => {
        if (!entries.length) {
            return;
        }
        if (entries.length === 1) {
            cells.push({
                ...entries[0].item,
                x: originX + 2,
                y: originY + 2,
                width: Math.max(0, availableWidth - 4),
                height: Math.max(0, availableHeight - 4),
            });
            return;
        }
        const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        let splitIndex = 1;
        let splitWeight = entries[0].weight;
        while (splitIndex < entries.length - 1 && splitWeight < total / 2) {
            splitWeight += entries[splitIndex].weight;
            splitIndex++;
        }
        const first = entries.slice(0, splitIndex);
        const second = entries.slice(splitIndex);
        const firstRatio = first.reduce((sum, entry) => sum + entry.weight, 0) / total;
        const horizontal = availableWidth >= availableHeight;
        if (horizontal) {
            const firstWidth = availableWidth * firstRatio;
            layout(first, originX, originY, firstWidth, availableHeight);
            layout(second, originX + firstWidth, originY, availableWidth - firstWidth, availableHeight);
        } else {
            const firstHeight = availableHeight * firstRatio;
            layout(first, originX, originY, availableWidth, firstHeight);
            layout(second, originX, originY + firstHeight, availableWidth, availableHeight - firstHeight);
        }
    };
    layout(sorted, x, y, width, height);
    return cells;
}

/**
 * Layout group containers side by side and wrap into rows, each containing a squarified node mosaic
 * @param {Array<object>} groups Group roots with weighted children
 * @param {number} width Available container width
 * @param {number} height Available container height
 * @returns {Array<object>} Positioned group rectangles
 */
function layoutTreemap(groups, width, height = 640) {
    if (!groups.length || width <= 0 || height <= 0) {
        return [];
    }
    const prepared = groups.map(group => ({
        ...group,
        weight: group.children.reduce((sum, child) => sum + (child.weight || 1), 0),
    }));
    return layoutCells(prepared, 0, 0, width, height, "weight").map(group => {
        const headerHeight = 28;
        const contentHeight = Math.max(1, group.height - headerHeight);
        const contentWidth = Math.max(1, group.width - 10);
        const children = layoutCells(
            group.children,
            0,
            0,
            contentWidth,
            contentHeight,
            "weight"
        );

        return {
            ...group,
            contentWidth,
            contentHeight,
            children,
        };
    });
}

export {
    getNodeWeight,
    normalizeKumaMonitors,
    filterMonitors,
    normalizeMonitors,
    getDescendantMonitorIds,
    getMonitorStatus,
    getCardCount,
    buildSunburstData,
    buildTreemapData,
    describeArc,
    layoutSunburst,
    layoutTreemap,
    buildPrtgHierarchy,
    layoutPrtgSunburst,
    getDownNodeLabel,
    getInsideDownNodeLabel,
};
