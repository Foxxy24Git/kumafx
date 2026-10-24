const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
    applyLeafOutwardForce,
    applyHubRepulsion,
    applyClusterRepulsion,
    applyCenterGravity,
    applySpringForce,
    applyLeafClusterGravity,
    getClusterRepulsion,
    getClusterSpringStrength,
    computeRadialLayout,
    dragGroupWithChildren,
} = require("../../src/noc-graph-cluster.js");

describe("drag group with children", () => {
    it("moves children proportionally when a group is dragged", () => {
        const group = { id: "GRP_A", group: "A", x: 100, y: 100, vx: 0, vy: 0 };
        const child1 = { id: "C1", group: "A", x: 120, y: 100, vx: 0, vy: 0 };
        const child2 = { id: "C2", group: "A", x: 80, y: 100, vx: 0, vy: 0 };
        const otherChild = { id: "C3", group: "B", x: 50, y: 50, vx: 0, vy: 0 };
        const allNodes = [group, child1, child2, otherChild];

        dragGroupWithChildren(group, 150, 150, allNodes);

        assert.strictEqual(group.x, 150);
        assert.strictEqual(group.y, 150);
        assert.strictEqual(child1.x, 170);
        assert.strictEqual(child1.y, 150);
        assert.strictEqual(child2.x, 130);
        assert.strictEqual(child2.y, 150);
        assert.strictEqual(otherChild.x, 50);
        assert.strictEqual(otherChild.y, 50);
    });
});

describe("NOC graph radial layout", () => {
    it("places groups evenly around origin at given orbit radius", () => {
        const groups = ["A", "B", "C", "D"];
        const members = { A: 5, B: 3, C: 8, D: 2 };
        const result = computeRadialLayout(groups, members, { groupOrbit: 250, leafOrbit: 80 });
        assert.strictEqual(result.size, 4);
        const posA = result.get("A");
        assert.ok(posA);
        assert.ok(Math.abs(Math.hypot(posA.x, posA.y) - 250) < 1);
    });

    it("places leaf nodes in a ring around their parent group", () => {
        const groups = ["X"];
        const members = { X: 6 };
        const result = computeRadialLayout(groups, members, { groupOrbit: 200, leafOrbit: 70 });
        const pos = result.get("X");
        assert.strictEqual(pos.children.length, 6);
        pos.children.forEach(child => {
            const dist = Math.hypot(child.x - pos.x, child.y - pos.y);
            assert.ok(Math.abs(dist - 70) < 1, `child distance ${dist} should be ~70`);
        });
    });

    it("ensures no two groups share the same angle", () => {
        const groups = ["A", "B", "C"];
        const members = { A: 1, B: 1, C: 1 };
        const result = computeRadialLayout(groups, members, { groupOrbit: 200, leafOrbit: 60 });
        const angles = [];
        for (const [, pos] of result) {
            angles.push(Math.atan2(pos.y, pos.x));
        }
        for (let i = 0; i < angles.length; i++) {
            for (let j = i + 1; j < angles.length; j++) {
                assert.ok(Math.abs(angles[i] - angles[j]) > 0.1);
            }
        }
    });
});

describe("NOC graph cluster balancing", () => {
    it("separates overlapping nodes within the same cluster", () => {
        const first = { id: "a", type: "ATM", x: 100, y: 0, vx: 0, vy: 0, radius: 4.5 };
        const second = { id: "b", type: "KANTOR", x: 100, y: 0, vx: 0, vy: 0, radius: 8 };
        applyClusterRepulsion([first, second], { kRepel: 200, minGap: 6 });
        assert.ok(Number.isFinite(first.vx) && Number.isFinite(second.vx));
        assert.ok(Math.hypot(first.vx - second.vx, first.vy - second.vy) > 0);
    });

    it("pushes near-colliding nodes apart even when Coulomb repulsion is weak", () => {
        const first = { id: "a", type: "ATM", x: 0, y: 0, vx: 0, vy: 0, radius: 4.5 };
        const second = { id: "b", type: "ATM", x: 4, y: 0, vx: 0, vy: 0, radius: 4.5 };
        applyClusterRepulsion([first, second], { kRepel: 100, minGap: 6 });
        assert.ok(first.vx < -0.4 && second.vx > 0.4);
    });

    it("normalizes leaf spring feedback to its parent without weakening the leaf attraction", () => {
        const parent = { type: "kantor", x: 120, y: 0, vx: 0, vy: 0 };
        const leaf = { type: "ATM", x: 220, y: 0, vx: 0, vy: 0 };
        applySpringForce({ source: parent, target: leaf, targetDist: 80, memberCount: 20 }, { kSpring: 0.05 });
        assert.ok(Math.abs(parent.vx - 0.05) < 1e-10);
        assert.ok(Math.abs(leaf.vx + 1) < 1e-10);
    });

    it("keeps the full core-to-parent spring", () => {
        const core = { type: "core", x: 0, y: 0, vx: 0, vy: 0 };
        const parent = { type: "kantor", x: 200, y: 0, vx: 0, vy: 0 };
        applySpringForce({ source: core, target: parent, targetDist: 120 }, { kSpring: 0.05 });
        assert.ok(Math.abs(parent.vx + 4) < 1e-10);
    });

    it("reduces repulsion for large clusters but preserves small clusters", () => {
        assert.strictEqual(getClusterRepulsion(2, 2400), 2400);
        assert.ok(getClusterRepulsion(30, 2400) < 2400);
        assert.ok(getClusterRepulsion(30, 2400) > 0);
    });

    it("strengthens parent spring for large clusters but preserves small clusters", () => {
        assert.strictEqual(getClusterSpringStrength(2, 0.045), 0.045);
        assert.ok(getClusterSpringStrength(30, 0.045) > 0.045);
        assert.ok(getClusterSpringStrength(30, 0.045) < 0.1);
    });

    it("pulls leaves gently toward the core without moving hubs", () => {
        const leaf = { type: "ATM", x: 200, y: -100, vx: 0, vy: 0 };
        const hub = { type: "kantor", x: 200, y: -100, vx: 0, vy: 0 };
        applyLeafClusterGravity([leaf, hub], 0.0005);
        assert.ok(leaf.vx < 0 && leaf.vx > -0.2);
        assert.ok(leaf.vy > 0 && leaf.vy < 0.1);
        assert.strictEqual(hub.vx, 0);
    });
});

describe("NOC graph leaf radial layout", () => {
    it("pushes a leaf outward when it sits between the core and its parent", () => {
        const parent = { type: "kantor", x: 100, y: 0 };
        const leaf = { type: "ATM", x: 40, y: 0, vx: 0, vy: 0 };

        applyLeafOutwardForce(leaf, parent, { linkDistance: 80 });

        assert.ok(leaf.vx > 0, `leaf should be pushed away from the core, got vx=${leaf.vx}`);
        assert.strictEqual(leaf.vy, 0);
    });

    it("does not push a leaf that already sits outside the parent radius", () => {
        const parent = { type: "kantor", x: 100, y: 0 };
        const leaf = { type: "ATM", x: 240, y: 0, vx: 0, vy: 0 };

        applyLeafOutwardForce(leaf, parent, { linkDistance: 80 });

        assert.strictEqual(leaf.vx, 0);
        assert.strictEqual(leaf.vy, 0);
    });

    it("never leaves a leaf closer to the core than its parent after settling", () => {
        const parent = { type: "kantor", x: 120, y: 60 };
        const leaf = { type: "ATM", x: 30, y: 10, vx: 0, vy: 0 };

        for (let frame = 0; frame < 400; frame++) {
            applyLeafOutwardForce(leaf, parent, { linkDistance: 80 });
            leaf.vx *= 0.86;
            leaf.vy *= 0.86;
            leaf.x += leaf.vx;
            leaf.y += leaf.vy;
        }

        const parentRadius = Math.hypot(parent.x, parent.y);
        const leafRadius = Math.hypot(leaf.x, leaf.y);
        assert.ok(
            leafRadius >= parentRadius,
            `leaf radius ${leafRadius} must not be smaller than parent radius ${parentRadius}`
        );
    });

    it("ignores core, tag, and kantor nodes", () => {
        const parent = { type: "kantor", x: 100, y: 0 };

        for (const type of ["core", "tag", "kantor"]) {
            const node = { type, x: 20, y: 0, vx: 0, vy: 0 };
            applyLeafOutwardForce(node, parent, { linkDistance: 80 });
            assert.strictEqual(node.vx, 0, `${type} node should not be pushed`);
        }
    });

    it("keeps leaf nodes outside their branch in the complete physics loop", () => {
        const core = { id: "core", type: "core", x: 0, y: 0, vx: 0, vy: 0 };
        const parent = { id: "branch", type: "kantor", x: 140, y: 0, vx: 0, vy: 0 };
        const first = { id: "one", type: "ATM", x: 50, y: 15, vx: 0, vy: 0 };
        const second = { id: "two", type: "ATM", x: 55, y: -15, vx: 0, vy: 0 };
        const nodes = [core, parent, first, second];
        const links = [
            { source: core, target: parent, targetDist: 120 },
            { source: parent, target: first, targetDist: 80 },
            { source: parent, target: second, targetDist: 80 },
        ];

        for (let frame = 0; frame < 1000; frame++) {
            applyHubRepulsion([core, parent], { kRepel: 3200 });
            applyClusterRepulsion([first, second], { kRepel: 2400 });
            applyLeafOutwardForce(first, parent, { linkDistance: 80, strength: 0.04 });
            applyLeafOutwardForce(second, parent, { linkDistance: 80, strength: 0.04 });
            applyCenterGravity([core, parent], 0.003);
            links.forEach((link) => applySpringForce(link, { kSpring: 0.035 }));

            for (const node of nodes) {
                if (node.type === "core") {
                    node.x = 0;
                    node.y = 0;
                    node.vx = 0;
                    node.vy = 0;
                    continue;
                }
                node.vx *= 0.86;
                node.vy *= 0.86;
                node.x += node.vx;
                node.y += node.vy;
            }
        }

        const parentRadius = Math.hypot(parent.x, parent.y);
        assert.ok(Math.hypot(first.x, first.y) >= parentRadius);
        assert.ok(Math.hypot(second.x, second.y) >= parentRadius);
    });

    it("generates 10 dummy groups with 5 to 7 ping hostnames each connected to tags", async () => {
        // Test simulation contract
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
            const nodeCount = 5 + (gIndex % 3); // 5 to 7
            for (let i = 1; i <= nodeCount; i++) {
                const id = idCounter++;
                const isBackup = i === 1;
                const ip = `10.${gIndex + 1}.1.${100 + i}`;
                const tagObjects = [{ name: provider, color: "#14b8a6" }];
                if (provider !== "Telkom") {
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

        const groupMonitors = Object.values(monitors).filter(m => m.type === "group");
        assert.strictEqual(groupMonitors.length, 10, "Must have exactly 10 groups");

        groupMonitors.forEach(grp => {
            const children = Object.values(monitors).filter(m => m.parent === grp.id);
            assert.ok(children.length >= 5 && children.length <= 7, `Group ${grp.name} must have 5-7 hostnames`);
            children.forEach(child => {
                assert.strictEqual(child.type, "ping", "Child monitor must have method ping");
                assert.ok(child.hostname.startsWith("10."), "Child must have dummy IP");
                assert.ok(child.tags.length >= 1, "Child must be connected to tags");
            });
        });
    });
});
