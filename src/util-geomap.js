export const MAP_THEMES = {
    standard: {
        key: "standard",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
    },
    cyberDark: {
        key: "cyberDark",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
    },
};

const STANDARD_COLORS = {
    UP: "#8cb82b",
    DOWN: "#dc2626",
    WARN: "#eab308",
    PAUSED: "#64748b",
    PENDING: "#3b82f6",
};

const CYBER_DARK_COLORS = {
    UP: "#00ff88",
    DOWN: "#ff0055",
    WARN: "#ffb703",
    PAUSED: "#64748b",
    PENDING: "#00b4ff",
};

/**
 * Get tile layer configuration for the given map theme
 * @param {string} theme Theme key ("standard" or "cyberDark")
 * @returns {object} Tile layer config { key, url, attribution, maxZoom }
 */
export function getMapThemeConfig(theme) {
    return MAP_THEMES[theme] || MAP_THEMES.standard;
}

/**
 * Get the marker color for a monitor status, adapted to the active theme
 * @param {string} status Monitor status (UP, DOWN, WARN, PAUSED, PENDING)
 * @param {boolean} cyberDark Whether Cyber Dark theme is active
 * @returns {string} Hex color code
 */
export function getStatusColor(status, cyberDark) {
    const palette = cyberDark ? CYBER_DARK_COLORS : STANDARD_COLORS;
    return palette[status] || palette.PENDING;
}
