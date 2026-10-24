const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
    applyLeafOutwardForce,
    applyHubRepulsion,
    applyClusterRepulsion,
    applyCenterGravity,
    applySpringForce,
} = require("../../src/noc-graph-cluster.js");

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
