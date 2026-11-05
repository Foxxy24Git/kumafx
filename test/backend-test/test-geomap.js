import test from "node:test";
import assert from "node:assert/strict";
import { getMapThemeConfig, getStatusColor } from "../../src/util-geomap.js";

test("getMapThemeConfig returns correct configuration for cyberDark and standard", () => {
    const cyber = getMapThemeConfig("cyberDark");
    assert.equal(cyber.key, "cyberDark");
    assert.match(cyber.url, /openstreetmap\.org/);
    assert.equal(cyber.maxZoom, 19);

    const standard = getMapThemeConfig("standard");
    assert.equal(standard.key, "standard");
    assert.match(standard.url, /openstreetmap\.org/);

    const fallback = getMapThemeConfig("unknown-key");
    assert.equal(fallback.key, "standard");
});

test("getStatusColor returns high-contrast neon palette in cyber dark mode", () => {
    assert.equal(getStatusColor("UP", false), "#8cb82b");
    assert.equal(getStatusColor("UP", true), "#00ff88");

    assert.equal(getStatusColor("DOWN", false), "#dc2626");
    assert.equal(getStatusColor("DOWN", true), "#ff0055");

    assert.equal(getStatusColor("WARN", false), "#eab308");
    assert.equal(getStatusColor("WARN", true), "#ffb703");
});
