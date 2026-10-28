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
        layoutSunburst,
        layoutTreemap,
        normalizeKumaMonitors,
        filterMonitors,
        getNodeWeight,
        buildPrtgHierarchy,
        layoutPrtgSunburst,
        getDownNodeLabel,
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

        it("builds the PRTG hierarchy with nested groups and all four heartbeat statuses", () => {
            const monitors = {
                ...rawMonitors,
                4: { id: 4, name: "Nested", type: "group", parent: 1 },
                30: { id: 30, name: "Nested ATM", type: "ping", parent: 4, tags: [] },
            };
            const hierarchy = buildPrtgHierarchy(monitors, {
                10: { status: 1, ping: 25 },
                11: { status: 0, ping: 0 },
                20: { status: 2, ping: 50 },
                30: { status: 3, ping: null },
            }, "NOC");
            assert.strictEqual(hierarchy.name, "NOC");
            assert.ok(hierarchy.children.some(group => group.name === "Group Utama"));
            const nested = hierarchy.children[0].children.find(group => group.name === "Nested");
            assert.strictEqual(nested.children[0].status, "MAINTENANCE");
            assert.strictEqual(hierarchy.children.find(group => group.name === "Group Kantor").children[0].status, "PENDING");
        });

        it("makes down nodes protrude and preserves node and tag detail in radial layout", () => {
            const monitors = { ...rawMonitors, 11: { ...rawMonitors[11], tags: [{ name: "Telkom" }] } };
            const hierarchy = buildPrtgHierarchy(monitors, heartbeats, "NOC");
            const arcs = layoutPrtgSunburst(hierarchy, 600, 600);
            const down = arcs.find(arc => arc.name === "10.0.0.2");
            const up = arcs.find(arc => arc.name === "10.0.0.1");
            assert.ok(down.outerRadius > up.outerRadius);
            assert.ok(arcs.some(arc => arc.name === "Telkom" && arc.status === "DOWN"));
            assert.ok(arcs.some(arc => arc.name === "Subgroup ATM" && arc.status === "DOWN"));
        });

        it("automatically expands only down monitor arcs and keeps each within the SVG canvas", () => {
            const monitors = {
                1: { id: 1, name: "North", type: "group" },
                2: { id: 2, name: "ATM Down", type: "ping", hostname: "atm.local", ip: "10.0.0.2", parent: 1, tags: [] },
                3: { id: 3, name: "ATM Up", type: "ping", hostname: "atm-up.local", parent: 1, tags: [] },
            };
            const downArcs = layoutPrtgSunburst(buildPrtgHierarchy(monitors, { 2: { status: 0 }, 3: { status: 1 } }), 600, 600);
            const upArcs = layoutPrtgSunburst(buildPrtgHierarchy(monitors, { 2: { status: 1 }, 3: { status: 1 } }), 600, 600);
            const expanded = downArcs.find(arc => arc.type === "monitor" && arc.id === 2);
            const collapsed = upArcs.find(arc => arc.type === "monitor" && arc.id === 2);

            assert.ok(expanded.outerRadius - collapsed.outerRadius >= 40);
            assert.ok(expanded.outerRadius <= 290);
            assert.strictEqual(downArcs.find(arc => arc.id === 3).outerRadius, upArcs.find(arc => arc.id === 3).outerRadius);
        });

        it("positions a DOWN monitor hostname and IP callout outside the arc on both sides", () => {
            const monitor = { id: 2, name: "ATM Down", hostname: "atm.local", ip: "10.0.0.2" };
            const right = getDownNodeLabel({ type: "monitor", status: "DOWN", monitor, startAngle: 0, endAngle: 0.2, outerRadius: 255 });
            const left = getDownNodeLabel({ type: "monitor", status: "DOWN", monitor, startAngle: Math.PI, endAngle: Math.PI + 0.2, outerRadius: 255 });

            assert.strictEqual(right.hostname, "atm.local");
            assert.strictEqual(right.ip, "10.0.0.2");
            assert.strictEqual(right.anchor, "start");
            assert.ok(right.lineEndX > right.lineStartX);
            assert.strictEqual(left.anchor, "end");
            assert.ok(left.lineEndX < left.lineStartX);
            assert.strictEqual(getDownNodeLabel({ type: "monitor", status: "UP", monitor }), null);
            assert.strictEqual(getDownNodeLabel({ type: "group", status: "DOWN", monitor }), null);
        });

        it("uses hostname as the label fallback when IP is unavailable", () => {
            const label = getDownNodeLabel({ type: "monitor", status: "DOWN", monitor: { name: "ATM 3", hostname: "atm-3.local" }, startAngle: 1, endAngle: 1.1, outerRadius: 255 });
            assert.strictEqual(label.hostname, "atm-3.local");
            assert.strictEqual(label.ip, null);
        });

        it("fits all groups inside the bounded container height without vertical overflow", () => {
            const normalized = normalizeMonitors(rawMonitors, heartbeats);
            const treemap = buildTreemapData(normalized);
            const groups = layoutTreemap(treemap, 800, 600);

            assert.ok(groups.length >= 2);
            assert.ok(groups.every(group => group.x >= 0 && group.x + group.width <= 800 + 0.1));
            assert.ok(groups.every(group => group.y >= 0 && group.y + group.height <= 600 + 0.1));
            for (const group of groups) {
                for (const child of group.children) {
                    assert.ok(child.width > 0 && child.height > 0);
                    assert.ok(child.x >= 0 && child.x + child.width <= group.width + 0.1);
                    assert.ok(child.y >= 0 && child.y + child.height <= group.height + 0.1);
                }
            }
        });

        it("starts group children at y = 0 relative to mosaic container without header gap clipping", () => {
            const raw12 = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, { id: i + 1, name: `ATM-${i + 1}`, type: "ping", parent: 50, tags: [] }]));
            raw12[50] = { id: 50, name: "Darmasraya", type: "group" };
            const tree12 = buildTreemapData(normalizeMonitors(raw12, {}));
            const g12 = layoutTreemap(tree12, 175, 185)[0];

            assert.strictEqual(g12.children.length, 12);
            const minY = Math.min(...g12.children.map(c => c.y));
            assert.ok(minY < 5, `Expected top child y < 5, got ${minY}`);
            const maxY = Math.max(...g12.children.map(c => c.y + c.height));
            assert.ok(maxY <= g12.height - 28, `Expected all children bottom <= mosaic height ${g12.height - 28}, got ${maxY}`);
        });

        it("assigns stable unique weights per monitor id across repeated calls", () => {
            const w1 = getNodeWeight(101);
            const w2 = getNodeWeight(102);
            assert.strictEqual(w1, getNodeWeight(101));
            assert.notStrictEqual(w1, w2);
            assert.ok(w1 >= 8 && w1 <= 24);
        });

        it("assigns non-uniform sizes to all nodes even without tags for 16 and 24 node groups", () => {
            const raw16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i + 1, { id: i + 1, name: `ATM-${i + 1}`, type: "ping", parent: 100, tags: [] }]));
            raw16[100] = { id: 100, name: "Batusangkar", type: "group" };
            const tree16 = buildTreemapData(normalizeMonitors(raw16, {}));
            const g16 = layoutTreemap(tree16, 325, 480)[0];
            const areas16 = new Set(g16.children.map(c => Math.round(c.width * c.height)));
            assert.strictEqual(new Set(tree16[0].children.map(c => c.weight)).size, 16);
            assert.ok(areas16.size >= 8, `Expected >=8 distinct node areas for 16-node group without tags, got ${areas16.size}`);

            const raw24 = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, { id: i + 1, name: `ATM-${i + 1}`, type: "ping", parent: 200, tags: [] }]));
            raw24[200] = { id: 200, name: "Payakumbuh", type: "group" };
            const tree24 = buildTreemapData(normalizeMonitors(raw24, {}));
            const g24 = layoutTreemap(tree24, 325, 480)[0];
            const areas24 = new Set(g24.children.map(c => Math.round(c.width * c.height)));
            assert.ok(areas24.size >= 12, `Expected >=12 distinct node areas for 24-node group without tags, got ${areas24.size}`);
        });

        it("creates varied aspect ratios for identical weight nodes like PRTG squarify", () => {
            const nodes = Array.from({ length: 15 }, (_, id) => ({ id, weight: 1 }));
            const groups = layoutTreemap([{ id: 1, name: "Group", children: nodes }], 800, 600);
            const children = groups[0].children;
            const aspectRatios = new Set(children.map(child => (child.width / child.height).toFixed(2)));
            assert.ok(aspectRatios.size > 2, `Expected >2 aspect ratios, got ${aspectRatios.size}`);
        });

        it("keeps equal-weight node rectangles readable without thin strips", () => {
            const nodes = Array.from({ length: 24 }, (_, id) => ({ id, weight: 1 }));
            const children = layoutTreemap([{ id: 1, name: "Group", children: nodes }], 800, 600)[0].children;
            const validDimensions = children.every(child => child.width > 5 && child.height > 5);
            const validRatios = children.every(child => Math.max(child.width / child.height, child.height / child.width) < 5);
            assert.strictEqual(validDimensions, true, "Nodes should maintain minimum width and height");
            assert.strictEqual(validRatios, true, "Nodes should avoid extreme aspect ratio strips");
        });

        it("produces varied widths and heights among mosaic cells based on weights", () => {
            const nodes = [
                { id: 1, weight: 1 },
                { id: 2, weight: 3 },
                { id: 3, weight: 1 },
                { id: 4, weight: 4 },
                { id: 5, weight: 2 },
            ];
            const groups = layoutTreemap([{ id: 1, name: "Group", children: nodes }], 800, 600);
            const children = groups[0].children;
            const widths = new Set(children.map(child => Math.round(child.width)));
            const heights = new Set(children.map(child => Math.round(child.height)));
            assert.ok(widths.size > 1, "Cells should have varied widths");
            assert.ok(heights.size > 1, "Cells should have varied heights");
        });

        it("maps live Kuma records to safe ATM statuses and fallback fields", () => {
            const source = {
                1: { id: 1, name: "Region", type: "group" },
                2: { id: 2, name: "ATM A", type: "ping", hostname: "10.0.0.1", parent: 1, active: 1 },
                3: { id: 3, name: "ATM B", type: "ping", active: 0 },
                4: { id: 4, name: "ATM C", type: "ping" },
                5: { id: 5, name: "ATM D", type: "ping" },
                6: { id: 6, name: "ATM E", type: "ping" },
            };
            const beats = {
                2: { status: 1, ping: 180, time: "2026-10-28 10:00:00" },
                3: { status: 0 },
                4: { status: 0, msg: "Timeout" },
                5: { status: 2 },
                6: { status: 1, ping: 30 },
            };
            const nodes = normalizeKumaMonitors(source, beats);
            assert.strictEqual(nodes.length, 5);
            assert.deepStrictEqual(nodes.map(m => m.status), ["WARNING", "PAUSED", "DOWN", "PENDING", "UP"]);
            assert.strictEqual(nodes[0].group, "Region");
            assert.strictEqual(nodes[0].hostname, "10.0.0.1");
            assert.strictEqual(nodes[0].lastHeartbeat, "2026-10-28 10:00:00");
            assert.strictEqual(nodes[2].hostname, "ATM C");
            assert.strictEqual(nodes[2].group, "Ungrouped");
            assert.strictEqual(nodes[2].errorMessage, "Timeout");
            assert.strictEqual(normalizeKumaMonitors({ 7: { id: 7, name: "Fresh", type: "ping" } }, {})[0].status, "PENDING");
        });

        it("renders ungrouped monitors in the treemap", () => {
            const monitors = normalizeKumaMonitors({ 9: { id: 9, name: "No group ATM", type: "ping" } });
            const groups = buildTreemapData({ monitors, groupsById: {} });
            assert.strictEqual(groups.length, 1);
            assert.strictEqual(groups[0].name, "Ungrouped");
            assert.strictEqual(groups[0].children[0].id, 9);
        });

        it("filters 420 nodes by group, status, name and IP without truncation", () => {
            const source = Object.fromEntries(Array.from({ length: 420 }, (_, index) => [index + 100, {
                id: index + 100, name: `ATM ${index}`, hostname: `10.0.1.${index}`, type: "ping", parent: index < 210 ? 1 : 2,
            }]));
            source[1] = { id: 1, type: "group", name: "North" };
            source[2] = { id: 2, type: "group", name: "South" };
            const beats = Object.fromEntries(Array.from({ length: 420 }, (_, index) => [index + 100, { status: index === 215 ? 0 : 1, ping: 12 }]));
            const nodes = normalizeKumaMonitors(source, beats);
            assert.strictEqual(nodes.length, 420);
            assert.strictEqual(filterMonitors(nodes, { groupId: 2 }).length, 210);
            assert.deepStrictEqual(filterMonitors(nodes, { groupId: 2, status: "DOWN", query: "10.0.1.215" }).map(m => m.name), ["ATM 215"]);
            const groups = layoutTreemap(buildTreemapData({ monitors: nodes, groupsById: { 1: source[1], 2: source[2] } }), 800, 1000);
            assert.strictEqual(groups.reduce((sum, group) => sum + group.children.length, 0), 420);
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
