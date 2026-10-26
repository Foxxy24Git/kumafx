const { describe, it } = require("node:test");
const assert = require("node:assert");

(async () => {
    const {
        normalizeMonitors,
        getDescendantMonitorIds,
        getMonitorStatus,
        getCardCount,
        buildSunburstData,
        buildTreemapData,
        describeArc,
        layoutSunburst,
        layoutTreemap,
    } = await import("../../src/noc-dashboard.js");

    describe("NOC dashboard normalization & status helpers", () => {
        const rawMonitors = {
            1: { id: 1, name: "Group Utama", type: "group", parent: null },
            2: { id: 2, name: "Subgroup ATM", type: "group", parent: 1 },
            10: { id: 10, name: "ATM-01", type: "ping", hostname: "10.0.0.1", parent: 2, tags: [{ name: "Telkom", color: "#f00" }] },
            11: { id: 11, name: "ATM-02", type: "ping", hostname: "10.0.0.2", parent: 2, tags: [] },
            3: { id: 3, name: "Group Kantor", type: "group", parent: null },
            20: { id: 20, name: "Kantor-01", type: "http", url: "https://kantor.internal", parent: 3, tags: [{ name: "Indosat" }] },
        };

        const heartbeats = {
            10: { status: 1, ping: 25 },
            11: { status: 0, ping: 0, time: "2026-10-27 10:00:00", msg: "Timeout" },
        };

        it("normalizes monitor hierarchy and extracts groups with recursive descendants", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);
            assert.strictEqual(normalized.groups.length, 3);
            assert.strictEqual(normalized.monitors.length, 3);

            const group1Children = getDescendantMonitorIds([1], normalized.groupsById);
            assert.deepStrictEqual(group1Children.sort(), [10, 11]);

            const bothChildren = getDescendantMonitorIds([1, 2], normalized.groupsById);
            assert.deepStrictEqual(bothChildren.sort(), [10, 11]);
        });

        it("evaluates status strictly into UP or DOWN and treats missing heartbeat as UP", () => {
            assert.strictEqual(getMonitorStatus({ id: 10 }, heartbeats), "UP");
            assert.strictEqual(getMonitorStatus({ id: 11 }, heartbeats), "DOWN");
            assert.strictEqual(getMonitorStatus({ id: 20 }, heartbeats), "UP");
        });

        it("computes card count based on unlimited selected groups without duplicate count", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);

            const upCard = { title: "up ATM", statusType: "UP", groupIds: [1, 2] };
            assert.strictEqual(getCardCount(upCard, normalized), 1);

            const downCard = { title: "down ATM", statusType: "DOWN", groupIds: [2] };
            assert.strictEqual(getCardCount(downCard, normalized), 1);
        });

        it("builds 3-layer sunburst tree with cascaded worst status and No Tag fallback", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);
            const sunburst = buildSunburstData(normalized);

            const subAtm = sunburst.find(g => g.id === 2);
            assert.ok(subAtm);
            assert.strictEqual(subAtm.status, "DOWN");

            const atm02 = subAtm.children.find(m => m.id === 11);
            assert.ok(atm02);
            assert.strictEqual(atm02.children[0].name, "No Tag");
        });

        it("builds treemap tree with weighted child sizes based on monitor and tag count", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);
            const treemap = buildTreemapData(normalized);

            const groupNode = treemap.find(g => g.id === 2);
            assert.ok(groupNode);
            assert.strictEqual(groupNode.children.length, 2);
            assert.ok(groupNode.children.every(c => c.weight >= 1));
        });

        it("generates deterministic polar sunburst arc layouts across all 3 layers", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);
            const sunburst = buildSunburstData(normalized);
            const arcs = layoutSunburst(sunburst, 600, 600);

            assert.ok(arcs.length >= 5);
            const layers = new Set(arcs.map(a => a.layer));
            assert.deepStrictEqual(Array.from(layers).sort(), [1, 2, 3]);

            for (const arc of arcs) {
                assert.ok(arc.path.startsWith("M "), "Arc path should be valid SVG command");
                assert.ok(arc.outerRadius > arc.innerRadius);
                assert.ok(arc.endAngle >= arc.startAngle);
            }
        });

        it("lays out multicore treemap bounded by dimensions with varied child cell areas", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);
            const treemap = buildTreemapData(normalized);
            const groups = layoutTreemap(treemap, 800, 500);

            assert.ok(groups.length >= 2);
            for (const grp of groups) {
                assert.ok(grp.x >= 0 && grp.x + grp.width <= 800 + 0.1);
                assert.ok(grp.y >= 0 && grp.y + grp.height <= 500 + 0.1);
                for (const child of grp.children) {
                    assert.ok(child.width > 0 && child.height > 0);
                    assert.ok(child.x >= grp.x - 0.1 && child.x + child.width <= grp.x + grp.width + 0.1);
                    assert.ok(child.y >= grp.y - 0.1 && child.y + child.height <= grp.y + grp.height + 0.1);
                }
            }
        });

        it("normalizes shared NOC config payload safely to 5 cards with validated group IDs", () => {
            const { normalizeConfig } = require("../../server/socket-handlers/noc-dashboard-socket-handler.js");
            const malformed = {
                cards: [
                    { title: "Custom UP", statusType: "INVALID", groupIds: ["1", 2, "abc", 2] },
                ],
            };
            const res = normalizeConfig(malformed);
            assert.strictEqual(res.cards.length, 5);
            assert.strictEqual(res.cards[0].title, "Custom UP");
            assert.strictEqual(res.cards[0].statusType, "UP");
            assert.deepStrictEqual(res.cards[0].groupIds, [1, 2]);
            assert.strictEqual(res.cards[1].id, "card-2");
            assert.strictEqual(res.cards[1].statusType, "DOWN");
        });
    });
})();
