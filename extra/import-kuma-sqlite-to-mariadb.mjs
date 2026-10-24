import fs from "node:fs";
import mysql from "mysql2/promise";

const jsonPath = process.argv[2] || "/var/folders/17/p4v924zj3s92262yw2qp0jlw0000gn/T/opencode/kuma-inspect/kuma-export.json";
const config = JSON.parse(fs.readFileSync("./data/db-config.json", "utf8"));
const source = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

/**
 * Get rows for a table from exported SQLite json
 * @param {string} table table name
 * @returns {Array} table rows
 */
function rows(table) {
    return source[table];
}

/**
 * Normalize undefined values to null for MySQL driver
 * @param {*} value input value
 * @returns {*} normalized value
 */
function normalizeValue(value) {
    return value === undefined ? null : value;
}

/**
 * Main migration execution function
 * @returns {Promise<void>} completes when imported
 */
async function run() {
    const db = await mysql.createConnection({
        host: config.hostname,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.dbName,
        supportBigNumbers: true,
    });

    const [[admin]] = await db.query("SELECT id FROM better_auth_user ORDER BY id LIMIT 1");
    if (!admin) {
        throw new Error("No MariaDB admin user found");
    }

    const sourceTags = rows("tag");
    const sourceGroups = rows("group");
    const sourceMonitors = rows("monitor");
    const sourceMonitorGroups = rows("monitor_group");
    const sourceMonitorTags = rows("monitor_tag");

    await db.beginTransaction();
    try {
        await db.query("SET FOREIGN_KEY_CHECKS = 0");
        await db.query("DELETE FROM monitor_tag");
        await db.query("DELETE FROM monitor_group");
        await db.query("DELETE FROM monitor");
        await db.query("DELETE FROM `group`");
        await db.query("DELETE FROM tag");

        for (const tag of sourceTags) {
            await db.query("INSERT INTO tag (id, name, color, created_date) VALUES (?, ?, ?, ?)", [
                tag.id, tag.name, tag.color, normalizeValue(tag.created_date),
            ]);
        }

        for (const group of sourceGroups) {
            await db.query("INSERT INTO `group` (id, name, created_date, public, active, weight, status_page_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [
                group.id, group.name, normalizeValue(group.created_date), group.public, group.active, group.weight, normalizeValue(group.status_page_id),
            ]);
        }

        const [cols] = await db.query("SHOW COLUMNS FROM monitor");
        const targetColumns = cols.map((c) => c.Field).filter((column) => column !== "id" && column !== "user_id");
        const placeholders = targetColumns.map(() => "?").join(", ");
        const insertMonitorSql = `INSERT INTO monitor (id, ${targetColumns.map((column) => `\`${column}\``).join(", ")}, user_id) VALUES (?, ${placeholders}, ?)`;
        for (const monitor of sourceMonitors) {
            const values = targetColumns.map((column) => normalizeValue(monitor[column]));
            await db.query(insertMonitorSql, [monitor.id, ...values, admin.id]);
        }

        for (const relation of sourceMonitorGroups) {
            await db.query("INSERT INTO monitor_group (id, monitor_id, group_id, weight, send_url, custom_url) VALUES (?, ?, ?, ?, ?, ?)", [
                relation.id, relation.monitor_id, relation.group_id, relation.weight, relation.send_url, normalizeValue(relation.custom_url),
            ]);
        }

        for (const relation of sourceMonitorTags) {
            await db.query("INSERT INTO monitor_tag (id, monitor_id, tag_id, value) VALUES (?, ?, ?, ?)", [
                relation.id, relation.monitor_id, relation.tag_id, normalizeValue(relation.value),
            ]);
        }

        await db.query("SET FOREIGN_KEY_CHECKS = 1");
        await db.commit();
        const [[monitorCount]] = await db.query("SELECT COUNT(*) AS count FROM monitor");
        const [[groupCount]] = await db.query("SELECT COUNT(*) AS count FROM `group`");
        const [[tagCount]] = await db.query("SELECT COUNT(*) AS count FROM tag");
        const [[tagRelationCount]] = await db.query("SELECT COUNT(*) AS count FROM monitor_tag");
        const [[groupRelationCount]] = await db.query("SELECT COUNT(*) AS count FROM monitor_group");
        console.log(JSON.stringify({
            monitorCount: monitorCount.count,
            groupCount: groupCount.count,
            tagCount: tagCount.count,
            tagRelationCount: tagRelationCount.count,
            groupRelationCount: groupRelationCount.count,
            heartbeatImported: 0,
        }, null, 2));
    } catch (error) {
        await db.rollback();
        await db.query("SET FOREIGN_KEY_CHECKS = 1");
        throw error;
    } finally {
        await db.end();
    }
}

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
