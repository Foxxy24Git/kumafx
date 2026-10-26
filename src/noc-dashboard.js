/**
 * Convert object-map or array data to an array
 * @param {object|Array} source Source collection
 * @returns {Array} Collection values
 */
function asArray(source) {
    return Array.isArray(source) ? source : Object.values(source || {});
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
 * Build group -> hostname hierarchy weighted for treemap sizing
 * @param {object} normalizedData Normalized monitors and groups
 * @returns {Array<object>} Group roots with weighted children
 */
function buildTreemapData(normalizedData) {
    const groups = new Map();
    for (const monitor of normalizedData.monitors) {
        const group = normalizedData.groupsById[String(monitor.groupId)];
        if (!group) {
            continue;
        }
        if (!groups.has(group.id)) {
            groups.set(group.id, { id: group.id, name: group.name, children: [] });
        }
        groups.get(group.id).children.push({
            ...monitor,
            weight: 1 + monitor.tags.length,
            tagNames: monitor.tags.length ? monitor.tags.map(t => t.name) : ["No Tag"],
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
 * Lay out weighted items along the larger available axis
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
    const safeItems = items.map(item => ({ item, weight: Math.max(1, item[weightKey] || 1) }));
    const total = safeItems.reduce((sum, entry) => sum + entry.weight, 0);
    const sorted = safeItems.sort((a, b) => b.weight - a.weight);
    const cells = [];
    let offset = 0;
    for (const entry of sorted) {
        const ratio = entry.weight / total;
        if (width >= height) {
            const cellWidth = width * ratio;
            cells.push({ ...entry.item, x: x + offset, y, width: cellWidth, height });
            offset += cellWidth;
        } else {
            const cellHeight = height * ratio;
            cells.push({ ...entry.item, x, y: y + offset, width, height: cellHeight });
            offset += cellHeight;
        }
    }
    return cells;
}

/**
 * Layout group containers and their weighted hostname rectangles
 * @param {Array<object>} groups Group roots with weighted children
 * @param {number} width SVG canvas width
 * @param {number} height SVG canvas height
 * @returns {Array<object>} Positioned group rectangles
 */
function layoutTreemap(groups, width, height) {
    const prepared = groups.map(group => ({
        ...group,
        weight: group.children.reduce((sum, child) => sum + child.weight, 0),
    }));
    return layoutCells(prepared, 0, 0, width, height, "weight").map(group => {
        const headerHeight = Math.min(26, group.height * 0.22);
        return {
            ...group,
            children: layoutCells(group.children, group.x, group.y + headerHeight, group.width, group.height - headerHeight, "weight"),
        };
    });
}

module.exports = {
    normalizeMonitors,
    getDescendantMonitorIds,
    getMonitorStatus,
    getCardCount,
    buildSunburstData,
    buildTreemapData,
    describeArc,
    layoutSunburst,
    layoutTreemap,
};
