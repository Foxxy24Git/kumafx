import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractDownNodes } from "../../src/noc-graph-cluster.js";

describe("extractDownNodes", () => {
    it("returns down nodes with mapped name, ip, tag, and id", () => {
        const nodes = [
            {
                id: 1,
                label: "KC JAKARTA",
                hostname: "192.168.1.10",
                tag: "KANTOR CABANG",
                status: "down",
            },
            {
                id: 2,
                label: "ATM SUDIRMAN",
                hostname: "10.0.0.5",
                tag: "ATM",
                status: "up",
            },
            {
                id: 3,
                name: "BACKUP LINK",
                ip: "172.16.0.2",
                tags: ["FAILOVER"],
                status: "down",
            },
        ];

        const result = extractDownNodes(nodes);

        assert.equal(result.length, 2);
        assert.deepEqual(result[0], {
            id: 1,
            name: "KC JAKARTA",
            ip: "192.168.1.10",
            tag: "KANTOR CABANG",
        });
        assert.deepEqual(result[1], {
            id: 3,
            name: "BACKUP LINK",
            ip: "172.16.0.2",
            tag: "FAILOVER",
        });
    });

    it("handles fallback properties for name, ip, and tag", () => {
        const nodes = [
            {
                id: "node-x",
                status: "down",
            },
        ];

        const result = extractDownNodes(nodes);

        assert.equal(result.length, 1);
        assert.deepEqual(result[0], {
            id: "node-x",
            name: "Unknown Node",
            ip: "-",
            tag: "Tanpa tag",
        });
    });

    it("returns empty array when input is empty or invalid", () => {
        assert.deepEqual(extractDownNodes([]), []);
        assert.deepEqual(extractDownNodes(null), []);
        assert.deepEqual(extractDownNodes(undefined), []);
    });
});
