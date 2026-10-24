/**
 * Builds a cluster map for leaf nodes grouped by their assigned cluster key.
 * @param {Array<object>} nodes List of graph nodes.
 * @returns {Map<string, Array<object>>} Map of cluster members.
 */
export function buildNodesByGroup(nodes) {
    const groups = new Map();
    if (!Array.isArray(nodes)) {
        return groups;
    }
    nodes.forEach((node) => {
        if (!node?.clusterKey || ["core", "kantor", "tag"].includes(node.type)) {
            return;
        }
        const members = groups.get(node.clusterKey) || [];
        members.push(node);
        groups.set(node.clusterKey, members);
    });
    return groups;
}

/**
 * Returns dynamic repulsion weight based on node status.
 * @param {object} node Graph node.
 * @returns {number} Repulsion weight multiplier.
 */
export function getRepelWeight(node) {
    return node?.status === "down" ? 1.5 : 1;
}

/**
 * Applies Coulomb repulsion across high-level hub nodes.
 * @param {Array<object>} nodes Hub nodes.
 * @param {object} options Physics parameter options.
 * @returns {void}
 */
export function applyHubRepulsion(nodes, options = {}) {
    const kRepel = options.kRepel ?? 2400;
    const maxRepelDistSq = options.maxRepelDistSq ?? 90000;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const first = nodes[i];
            const second = nodes[j];
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const distanceSq = dx * dx + dy * dy + 150;
            if (distanceSq >= maxRepelDistSq) {
                continue;
            }
            const distance = Math.sqrt(distanceSq) || 1;
            const force = kRepel / distanceSq;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            if (first.type !== "core") {
                first.vx -= fx;
                first.vy -= fy;
            }
            if (second.type !== "core") {
                second.vx += fx;
                second.vy += fy;
            }
        }
    }
}

/**
 * Applies cluster-isolated Coulomb repulsion.
 * @param {Array<object>} nodes Cluster member nodes.
 * @param {object} options Physics parameter options.
 * @returns {void}
 */
export function applyClusterRepulsion(nodes, options = {}) {
    const kRepel = options.kRepel ?? 2400;
    const maxRepelDistSq = options.maxRepelDistSq ?? 90000;
    const minGap = options.minGap ?? 6;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const first = nodes[i];
            const second = nodes[j];
            let dx = second.x - first.x;
            let dy = second.y - first.y;
            const rawDistSq = dx * dx + dy * dy;
            if (rawDistSq < 0.01) {
                const angle = ((i * 7 + j * 13) % 100) / 100 * Math.PI * 2;
                dx = Math.cos(angle) * 0.5;
                dy = Math.sin(angle) * 0.5;
            }
            const distanceSq = rawDistSq + 150;
            if (distanceSq >= maxRepelDistSq) {
                continue;
            }
            const distance = Math.sqrt(distanceSq) || 1;
            const weight = getRepelWeight(first) * getRepelWeight(second);
            let force = (kRepel * weight) / distanceSq;
            const r1 = first.radius || 4.5;
            const r2 = second.radius || 4.5;
            const overlap = (r1 + r2 + minGap) - Math.sqrt(rawDistSq);
            if (overlap > 0) {
                force += overlap * 0.8;
            }
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            first.vx -= fx;
            first.vy -= fy;
            second.vx += fx;
            second.vy += fy;
        }
    }
}

/**
 * Collects every tag attached to non-group monitors, keyed by tag name.
 * @param {Array<object>} monitors Monitor records.
 * @returns {Map<string, string>} Tag name to tag color.
 */
export function collectHostTags(monitors) {
    const tags = new Map();
    (monitors || []).forEach((monitor) => {
        if (!monitor || String(monitor.type).toLowerCase() === "group") {
            return;
        }
        (monitor.tags || []).forEach((tag) => {
            const name = typeof tag === "string" ? tag : tag?.name;
            if (!name || tags.has(name)) {
                return;
            }
            const color = typeof tag === "string" ? monitor.tagColors?.[name] : tag.color;
            tags.set(name, color || "#14b8a6");
        });
    });
    return tags;
}

/**
 * Applies cutoff-based repulsion and collision using a spatial grid.
 * @param {Array<object>} nodes Graph nodes.
 * @param {object} options Physics parameters.
 * @returns {void}
 */
export function applyLocalForces(nodes, options = {}) {
    const count = nodes.length;
    if (count < 2) {
        return;
    }
    const cutoff = options.cutoff ?? 160;
    const cutoffSq = cutoff * cutoff;
    const minGap = options.minGap ?? 6;
    const kRepel = options.kRepel ?? 2200;
    const pinned = options.pinned;
    const cellX = new Int32Array(count);
    const cellY = new Int32Array(count);
    const weight = new Float64Array(count);
    const grid = new Map();
    for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const cx = Math.floor(node.x / cutoff);
        const cy = Math.floor(node.y / cutoff);
        cellX[i] = cx;
        cellY[i] = cy;
        weight[i] = node.status === "down" ? 1.5 : 1;
        const key = cx * 65536 + cy;
        const bucket = grid.get(key);
        if (bucket) {
            bucket.push(i);
        } else {
            grid.set(key, [ i ]);
        }
    }
    for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const nodeRadius = node.radius || 5;
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            for (let offsetY = -1; offsetY <= 1; offsetY++) {
                const bucket = grid.get((cellX[i] + offsetX) * 65536 + cellY[i] + offsetY);
                if (!bucket) {
                    continue;
                }
                for (let b = 0; b < bucket.length; b++) {
                    const j = bucket[b];
                    if (j <= i) {
                        continue;
                    }
                    const other = nodes[j];
                    let dx = other.x - node.x;
                    let dy = other.y - node.y;
                    let distanceSq = dx * dx + dy * dy;
                    if (distanceSq > cutoffSq) {
                        continue;
                    }
                    if (distanceSq < 0.0001) {
                        dx = 0.5;
                        dy = 0;
                        distanceSq = 0.25;
                    }
                    const distance = Math.sqrt(distanceSq);
                    const minimumDistance = nodeRadius + (other.radius || 5) + minGap;
                    const overlap = minimumDistance - distance;
                    const force = kRepel / (distanceSq + 120) + (overlap > 0 ? overlap * 0.8 : 0);
                    const ux = dx / distance;
                    const uy = dy / distance;
                    const fx = ux * force;
                    const fy = uy * force;
                    if (node !== pinned && !node.fixed) {
                        node.vx -= fx * weight[i];
                        node.vy -= fy * weight[i];
                        if (overlap > 0) {
                            node.x -= ux * overlap * 0.5;
                            node.y -= uy * overlap * 0.5;
                        }
                    }
                    if (other !== pinned && !other.fixed) {
                        other.vx += fx * weight[j];
                        other.vy += fy * weight[j];
                        if (overlap > 0) {
                            other.x += ux * overlap * 0.5;
                            other.y += uy * overlap * 0.5;
                        }
                    }
                }
            }
        }
    }
}

/**
 * Pushes apart overlapping nodes across the active graph.
 * @param {Array<object>} nodes Graph nodes.
 * @param {object} options Collision parameters.
 * @returns {void}
 */
export function applyCollisionForce(nodes, options = {}) {
    const minGap = options.minGap ?? 6;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const first = nodes[i];
            const second = nodes[j];
            let dx = second.x - first.x;
            let dy = second.y - first.y;
            const distance = Math.hypot(dx, dy) || 0.001;
            const minDist = (first.radius || 5) + (second.radius || 5) + minGap;
            if (distance < minDist) {
                if (distance < 0.01) {
                    const angle = ((i * 17 + j * 31) % 100) / 100 * Math.PI * 2;
                    dx = Math.cos(angle) * 0.5;
                    dy = Math.sin(angle) * 0.5;
                }
                const overlap = (minDist - distance);
                const push = overlap * 0.5;
                const fx = (dx / distance) * push;
                const fy = (dy / distance) * push;
                if (first.type !== "core") {
                    first.x -= fx * 0.5;
                    first.y -= fy * 0.5;
                    first.vx -= fx * 0.4;
                    first.vy -= fy * 0.4;
                }
                if (second.type !== "core") {
                    second.x += fx * 0.5;
                    second.y += fy * 0.5;
                    second.vx += fx * 0.4;
                    second.vy += fy * 0.4;
                }
            }
        }
    }
}

/**
 * Applies a blossom force that guides cluster nodes to bloom evenly around their parent.
 * @param {object} node Leaf graph node.
 * @param {object} parent Parent hub node.
 * @param {object} options Blossom physics parameter options.
 * @returns {void}
 */
export function applyClusterBlossomForce(node, parent, options = {}) {
    if (!node || !parent || ["core", "tag", "kantor"].includes(node.type)) {
        return;
    }

    const dx = node.x - parent.x;
    const dy = node.y - parent.y;
    const distance = Math.hypot(dx, dy) || 1;
    const targetRadius = options.targetRadius ?? options.linkDistance ?? 80;
    const radialError = targetRadius - distance;
    const strength = options.strength ?? 0.018;
    const radialForce = radialError * strength;

    node.vx += (dx / distance) * radialForce;
    node.vy += (dy / distance) * radialForce;
}

/**
 * Keeps a leaf node outside its parent relative to the graph origin.
 * @param {object} node Leaf graph node.
 * @param {object} parent Parent hub node.
 * @param {object} options Physics parameter options.
 * @returns {void}
 */
export function applyLeafOutwardForce(node, parent, options = {}) {
    if (!node || !parent || ["core", "tag", "kantor"].includes(node.type)) {
        return;
    }

    const parentRadius = Math.hypot(parent.x, parent.y);
    const nodeRadius = Math.hypot(node.x, node.y);
    const minimumRadius = parentRadius + (options.linkDistance ?? 80) * 0.65;
    if (nodeRadius >= minimumRadius) {
        return;
    }

    const parentDirection = parentRadius || 1;
    const force = (minimumRadius - nodeRadius) * (options.strength ?? 0.035);
    node.vx += (parent.x / parentDirection) * force;
    node.vy += (parent.y / parentDirection) * force;
}

/**
 * Pushes offline nodes outward from their parent cluster.
 * @param {object} node Down node.
 * @param {object} parent Parent hub node.
 * @param {object} options Physics parameter options.
 * @returns {void}
 */
export function applyOfflineOutwardForce(node, parent, options = {}) {
    if (!node || node.status !== "down" || !parent) {
        return;
    }
    const dx = node.x - parent.x;
    const dy = node.y - parent.y;
    const distance = Math.hypot(dx, dy) || 1;
    const force = (options.linkDistance ?? 80) * 0.2 * (options.kSpring ?? 0.035);
    node.vx += (dx / distance) * force;
    node.vy += (dy / distance) * force;
}

/**
 * Pulls a provider tag node toward its hosts without moving the hosts.
 * @param {object} link Tag-to-host edge.
 * @param {object} options Physics parameter options.
 * @returns {void}
 */
export function applyTagAttraction(link, options = {}) {
    if (!link || !link.isTagLink) {
        return;
    }
    const dx = link.target.x - link.source.x;
    const dy = link.target.y - link.source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const memberCount = link.memberCount || 0;
    const scale = memberCount > 1 ? 1 / memberCount : 1;
    const force = (distance - (link.targetDist ?? options.targetDist ?? 80)) * (options.kSpring ?? 0.035) * scale;
    link.source.vx += (dx / distance) * force;
    link.source.vy += (dy / distance) * force;
}

/**
 * Applies Hooke's spring attraction along an edge.
 * @param {object} link Graph edge.
 * @param {object} options Physics parameter options.
 * @returns {void}
 */
export function applySpringForce(link, options = {}) {
    if (!link || link.isTagLink || link.isTagCoreLink) {
        return;
    }
    const dx = link.target.x - link.source.x;
    const dy = link.target.y - link.source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const force = (distance - (link.targetDist ?? options.targetDist ?? 80)) * (options.kSpring ?? 0.035);
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    const memberCount = link.memberCount || 0;
    if (link.source.type !== "core" && link.source.type !== "tag") {
        const sourceScale = memberCount > 1 ? 1 / memberCount : 1;
        link.source.vx += fx * sourceScale;
        link.source.vy += fy * sourceScale;
    }
    if (link.target.type !== "core" && link.target.type !== "tag") {
        link.target.vx -= fx;
        link.target.vy -= fy;
    }
}

/**
 * Pulls movable nodes toward the center origin.
 * @param {Array<object>} nodes Graph nodes.
 * @param {number} strength Gravity strength.
 * @returns {void}
 */
export function applyCenterGravity(nodes, strength = 0.003) {
    nodes.forEach((node) => {
        if (node.type === "core" || node.type === "tag") {
            return;
        }
        node.vx -= node.x * strength;
        node.vy -= node.y * strength;
    });
}

/**
 * Collects nodes that changed operational status between cycles.
 * @param {Array<object>} nodes Graph nodes.
 * @returns {Array<object>} Changed nodes.
 */
export function collectStatusChangedNodes(nodes) {
    if (!Array.isArray(nodes)) {
        return [];
    }
    return nodes.filter((node) => {
        return node?.previousStatus != null && node.previousStatus !== node.status;
    });
}

/**
 * Decides whether a status transition requires micro reheat.
 * @param {Array<object>} nodes Changed nodes.
 * @returns {boolean} True if micro reheat is needed.
 */
export function shouldTriggerMicroReheat(nodes) {
    return Array.isArray(nodes) && nodes.some((node) => {
        return node.status === "down" || node.previousStatus === "down";
    });
}

/**
 * Applies a tiny random impulse to awaken stabilized physics.
 * @param {object} node Target node.
 * @param {number} intensity Force magnitude.
 * @returns {object} The updated node.
 */
export function applyMicroReheatImpulse(node, intensity = 2) {
    if (!node || node.type === "core" || node.type === "tag") {
        return node;
    }
    const randomForce = () => {
        const force = (Math.random() - 0.5) * intensity;
        return Math.abs(force) < 0.001 ? intensity * 0.25 : force;
    };
    node.vx = (node.vx || 0) + randomForce();
    node.vy = (node.vy || 0) + randomForce();
    return node;
}

/**
 * Builds directed dependency links from monitor parent relationships.
 * @param {Array<object>} monitors Monitor records.
 * @param {Array<object>} nodes Graph nodes.
 * @param {number} targetDist Default spring distance.
 * @returns {Array<object>} Dependency links.
 */
export function buildDependencyLinks(monitors, nodes, targetDist = 80) {
    const nodeByMonitorId = new Map(nodes.map(node => [node.monitorId ?? node.id, node]));
    return monitors.reduce((links, monitor) => {
        const source = nodeByMonitorId.get(monitor.parent);
        const target = nodeByMonitorId.get(monitor.id);
        if (source && target && source !== target) {
            links.push({ source, target, targetDist, isDependency: true });
        }
        return links;
    }, []);
}

/**
 * Builds core, dependency, and provider-tag links for the topology graph.
 * @param {Array<object>} monitors Monitor records.
 * @param {Array<object>} nodes Graph nodes.
 * @param {number} targetDist Default spring distance.
 * @returns {Array<object>} Topology links.
 */
export function buildTopologyLinks(monitors, nodes, targetDist = 80) {
    const links = buildDependencyLinks(monitors, nodes, targetDist);
    const core = nodes.find(node => String(node.type).toLowerCase() === "core");
    const nodeByMonitorId = new Map(nodes.map(node => [node.monitorId ?? node.id, node]));
    const groups = monitors.filter(monitor => String(monitor.type).toLowerCase() === "group");
    const tagNodes = new Map(nodes
        .filter(node => String(node.type).toLowerCase() === "tag")
        .map(node => [node.label, node]));

    if (core) {
        groups.forEach(group => {
            const target = nodeByMonitorId.get(group.id);
            if (target) {
                links.push({ source: core, target, targetDist, isCoreLink: true });
            }
        });
    }

    monitors.forEach(monitor => {
        const target = nodeByMonitorId.get(monitor.id);
        if (!target || String(monitor.type).toLowerCase() === "group") {
            return;
        }
        (monitor.tags || []).forEach(tag => {
            const tagName = typeof tag === "string" ? tag : tag.name;
            const source = tagNodes.get(tagName);
            if (source) {
                links.push({ source, target, targetDist, isTagLink: true });
            }
        });
    });

    return links;
}

/**
 * Moves a group and its children by the drag delta, either rigidly or with fluid physics momentum.
 * @param {object} group Group node being dragged.
 * @param {number} x New group x coordinate.
 * @param {number} y New group y coordinate.
 * @param {Array<object>} nodes All graph nodes.
 * @param {object} options Movement options.
 * @param {boolean} options.fluid Whether children follow via physics flow rather than rigid lock.
 * @returns {void}
 */
export function dragGroupWithChildren(group, x, y, nodes, options = {}) {
    const dx = x - group.x;
    const dy = y - group.y;
    group.x = x;
    group.y = y;
    if (group.anchorX !== undefined) {
        group.anchorX += dx;
        group.anchorY += dy;
    }
    group.vx = 0;
    group.vy = 0;
    const isFluid = options.fluid === true;
    nodes.forEach((node) => {
        if (node !== group && node.group === group.group && node.type !== "tag") {
            if (node.anchorX !== undefined) {
                node.anchorX += dx;
                node.anchorY += dy;
            }
            if (isFluid) {
                node.vx = (node.vx || 0) + dx * 0.35;
                node.vy = (node.vy || 0) + dy * 0.35;
            } else {
                node.x += dx;
                node.y += dy;
                node.vx = 0;
                node.vy = 0;
            }
        }
    });
}

/**
 * Applies a small impulse to movable nodes to wake the physics simulation.
 * @param {Array<object>} nodes Graph nodes.
 * @param {number} intensity Force magnitude.
 * @returns {void}
 */
export function reheatSimulationNodes(nodes, intensity = 2) {
    nodes.forEach((node) => {
        if (!node || node.type === "core" || node.type === "tag") {
            return;
        }
        const randomForce = () => (Math.random() - 0.5) * intensity;
        node.vx = (node.vx || 0) + randomForce();
        node.vy = (node.vy || 0) + randomForce();
    });
}

/**
 * Computes radial layout coordinates for group hubs and their leaf children.
 * Groups are distributed in concentric rings around the origin based on size.
 * @param {Array<string>} groups List of group names.
 * @param {object} members Map of group names to their member count.
 * @param {object} options Layout configuration options.
 * @returns {Map<string, object>} Position map for groups and children.
 */
export function computeRadialLayout(groups, members, options = {}) {
    const groupOrbit = options.groupOrbit ?? 250;
    const leafOrbit = options.leafOrbit ?? 80;
    const sorted = [...groups].sort((a, b) => (members[b] || 0) - (members[a] || 0));
    const large = sorted.filter(group => (members[group] || 0) > 25);
    const medium = sorted.filter(group => (members[group] || 0) > 8 && (members[group] || 0) <= 25);
    const small = sorted.filter(group => (members[group] || 0) <= 8);
    const rings = groups.length <= 4
        ? [{ entries: sorted, radius: groupOrbit }]
        : [
            { entries: small.slice(0, 10), radius: groupOrbit * 0.8 },
            { entries: [...small.slice(10), ...medium].slice(0, 18), radius: groupOrbit * 1.5 },
            { entries: [...small.slice(10), ...medium].slice(18), radius: groupOrbit * 2.1 },
            { entries: large, radius: groupOrbit * 2.3 },
        ];
    const positions = new Map();
    rings.forEach(({ entries, radius }, ringIndex) => {
        entries.forEach((group, index) => {
            const angle = (index / entries.length) * Math.PI * 2 + (ringIndex % 2) * Math.PI / Math.max(entries.length, 1);
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const count = members[group] || 0;
            const children = [];
            for (let i = 0; i < count; i++) {
                const layer = count <= 22 ? 0 : count <= 58 ? (i < 22 ? 0 : 1) : (i < 22 ? 0 : i < 58 ? 1 : 2);
                const layerStart = layer === 0 ? 0 : layer === 1 ? 22 : 58;
                const layerCount = layer === 0 ? Math.min(count, 22) : layer === 1 ? Math.min(Math.max(count - 22, 0), 36) : count - 58;
                const layerIndex = i - layerStart;
                const layerOffset = layer % 2 ? Math.PI / Math.max(layerCount, 1) : 0;
                const childAngle = angle + layerOffset + layerIndex * Math.PI * 2 / Math.max(layerCount, 1);
                const childRadius = (count <= 22 ? leafOrbit : leafOrbit * 0.9) + layer * 34;
                children.push({ x: x + Math.cos(childAngle) * childRadius, y: y + Math.sin(childAngle) * childRadius });
            }
            positions.set(group, { x, y, children });
        });
    });
    return positions;
}

/**
 * Returns scaled Coulomb repulsion constant based on cluster member count.
 * Large clusters get weaker per-pair repulsion so they do not explode outward.
 * Clusters with <= 6 members are left untouched.
 * @param {number} memberCount Number of members in the cluster.
 * @param {number} baseRepulsion Base repulsion constant.
 * @returns {number} Adjusted repulsion constant.
 */
export function getClusterRepulsion(memberCount, baseRepulsion) {
    if (memberCount <= 6) {
        return baseRepulsion;
    }
    const scale = 6 / Math.sqrt(memberCount * 6);
    return Math.max(baseRepulsion * scale, baseRepulsion * 0.15);
}

/**
 * Returns adaptive spring strength based on cluster member count.
 * Large clusters get stronger springs to pull leaves back toward their parent.
 * Clusters with <= 6 members are left untouched.
 * @param {number} memberCount Number of members in the cluster.
 * @param {number} baseStrength Base spring constant.
 * @returns {number} Adjusted spring constant.
 */
export function getClusterSpringStrength(memberCount, baseStrength) {
    if (memberCount <= 6) {
        return baseStrength;
    }
    const scale = 1 + Math.log2(memberCount / 6) * 0.35;
    return Math.min(baseStrength * scale, 0.09);
}

/**
 * Applies a gentle center gravity to leaf nodes only (not core, tag, kantor).
 * This prevents large clusters from drifting too far from the origin.
 * @param {Array<object>} nodes All graph nodes.
 * @param {number} strength Gravity strength (should be very small, e.g. 0.0005).
 * @returns {void}
 */
export function applyLeafClusterGravity(nodes, strength = 0.0005) {
    nodes.forEach((node) => {
        if (node.type === "core" || node.type === "tag" || node.type === "kantor") {
            return;
        }
        node.vx -= node.x * strength;
        node.vy -= node.y * strength;
    });
}
