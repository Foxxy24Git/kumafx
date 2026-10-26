const { Settings } = require("../settings");
const { checkLogin } = require("../util-server");

const DEFAULT_CARDS = ["UP", "DOWN", "UP", "DOWN", "UP"].map((statusType, index) => ({
    id: `card-${index + 1}`,
    title: "",
    statusType,
    groupIds: [],
}));

/**
 * Normalize and sanitize NOC dashboard configuration payload
 * @param {object} config Raw config object
 * @returns {object} Validated config with 5 cards
 */
function normalizeConfig(config) {
    const cards = Array.isArray(config?.cards) ? config.cards : [];
    return {
        cards: DEFAULT_CARDS.map((defaultCard, index) => {
            const card = cards[index] || {};
            return {
                id: defaultCard.id,
                title: typeof card.title === "string" ? card.title.slice(0, 100) : defaultCard.title,
                statusType: card.statusType === "DOWN" ? "DOWN" : card.statusType === "UP" ? "UP" : defaultCard.statusType,
                groupIds: Array.isArray(card.groupIds)
                    ? Array.from(new Set(card.groupIds.filter(id => Number.isInteger(id) || (typeof id === "string" && /^\d+$/.test(id))).map(Number)))
                    : [],
            };
        }),
    };
}

module.exports.nocDashboardSocketHandler = (socket, io) => {
    socket.on("getNocDashboardConfig", async callback => {
        try {
            checkLogin(socket);
            const config = normalizeConfig(await Settings.get("nocDashboardConfig"));
            callback({ ok: true, data: config });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("saveNocDashboardConfig", async (config, callback) => {
        try {
            checkLogin(socket);
            const normalized = normalizeConfig(config);
            await Settings.set("nocDashboardConfig", normalized);
            callback({ ok: true, data: normalized });
            if (io) {
                socket.broadcast.emit("nocDashboardConfigUpdated", normalized);
            }
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });
};

module.exports.normalizeConfig = normalizeConfig;
