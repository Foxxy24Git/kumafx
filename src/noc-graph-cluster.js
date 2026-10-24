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
            const weight = getRepelWeight(first) * getRepelWeight(second);
            const force = (kRepel * weight) / distanceSq;
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
    if (link.source.type !== "core" && link.source.type !== "tag") {
        link.source.vx += fx;
        link.source.vy += fy;
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
