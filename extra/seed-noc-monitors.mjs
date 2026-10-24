import mysql from "mysql2/promise";
import fs from "fs";

/**
 * Seed NOC simulation monitors into the active MariaDB database.
 * @returns {Promise<void>} Completes when all monitors are created.
 */
async function run() {
    const dbConfig = JSON.parse(fs.readFileSync("./data/db-config.json", "utf-8"));
    const connection = await mysql.createConnection({
        host: dbConfig.hostname,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.dbName,
    });

    console.log("Connected to MariaDB");

    // 1. Dapatkan user admin
    const [users] = await connection.execute("SELECT id FROM better_auth_user LIMIT 1");
    const userId = users[0]?.id || null;

    // 2. Pastikan Tag Provider Lengkap
    const desiredTags = [
        { name: "Telkom", color: "#DC2626" },
        { name: "ICON+", color: "#2563EB" },
        { name: "LA", color: "#0284c7" },
        { name: "Indosat", color: "#f59e0b" },
        { name: "Biznet", color: "#10b981" },
    ];

    const tagMap = new Map();
    for (const t of desiredTags) {
        const [existing] = await connection.execute("SELECT id FROM tag WHERE name = ?", [t.name]);
        if (existing.length > 0) {
            tagMap.set(t.name, existing[0].id);
        } else {
            const [insert] = await connection.execute(
                "INSERT INTO tag (name, color) VALUES (?, ?)",
                [t.name, t.color]
            );
            tagMap.set(t.name, insert.insertId);
        }
    }
    console.log("Tags ready:", Array.from(tagMap.keys()));

    // 3. 10 Grup Kota / Cabang
    const groups = [
        "PADANG", "BUKITTINGGI", "PAYAKUMBUH", "SOLOK", "PARIAMAN",
        "BATUSANGKAR", "PAINAN", "SIJUNJUNG", "DHARMASRAYA", "PASAMAN"
    ];

    const hardwarePrefixes = ["ATM-WD", "ATM-Dispenser", "ATM-Cash-Recycler", "ATM-DriveThru", "ATM-OffSite"];
    const providers = ["Telkom", "ICON+", "LA", "Indosat", "Biznet"];

    let totalCreatedMonitors = 0;

    for (let gIndex = 0; gIndex < groups.length; gIndex++) {
        const groupName = groups[gIndex];
        const groupTitle = `CABANG ${groupName}`;

        // Cek apakah group sudah ada
        let groupId;
        const [existingGroup] = await connection.execute(
            "SELECT id FROM monitor WHERE name = ? AND type = 'group'",
            [groupTitle]
        );

        if (existingGroup.length > 0) {
            groupId = existingGroup[0].id;
        } else {
            const [insertGroup] = await connection.execute(
                "INSERT INTO monitor (name, type, active, user_id) VALUES (?, 'group', 1, ?)",
                [groupTitle, userId]
            );
            groupId = insertGroup.insertId;
        }

        // Tentukan jumlah hostname per grup antara 5 sampai 7
        const count = 5 + (gIndex % 3); // 5, 6, 7 bergantian

        for (let i = 1; i <= count; i++) {
            const isBackup = i === 1;
            const prefix = hardwarePrefixes[i % hardwarePrefixes.length];
            const monitorName = `${isBackup ? "BACKUP-" : ""}${prefix}-${groupName}-${i}`;
            const ip = `10.${gIndex + 10}.1.${100 + i}`;

            // Cek apakah monitor sudah ada
            const [existingMon] = await connection.execute(
                "SELECT id FROM monitor WHERE name = ? AND parent = ?",
                [monitorName, groupId]
            );

            let monitorId;
            if (existingMon.length > 0) {
                monitorId = existingMon[0].id;
            } else {
                const [insertMon] = await connection.execute(
                    `INSERT INTO monitor (
                        name, type, active, hostname, parent, user_id, \`interval\`, retry_interval, ping_count
                    ) VALUES (?, 'ping', 1, ?, ?, ?, 60, 0, 1)`,
                    [monitorName, ip, groupId, userId]
                );
                monitorId = insertMon.insertId;
                totalCreatedMonitors++;
            }

            // Pasang Tag ke monitor
            const primaryProvider = providers[(gIndex + i) % providers.length];
            const primaryTagId = tagMap.get(primaryProvider);

            const [existTagRel] = await connection.execute(
                "SELECT id FROM monitor_tag WHERE monitor_id = ? AND tag_id = ?",
                [monitorId, primaryTagId]
            );

            if (existTagRel.length === 0) {
                await connection.execute(
                    "INSERT INTO monitor_tag (monitor_id, tag_id) VALUES (?, ?)",
                    [monitorId, primaryTagId]
                );
            }

            // Masukkan heartbeat awal agar langsung punya status UP / DOWN untuk simulasi
            const [existBeat] = await connection.execute(
                "SELECT id FROM heartbeat WHERE monitor_id = ? LIMIT 1",
                [monitorId]
            );

            if (existBeat.length === 0) {
                const isDown = (gIndex === 0 && i === 2) || (gIndex === 3 && i === 4) || (gIndex === 7 && i === 1);
                const status = isDown ? 0 : 1;
                const ping = isDown ? null : 15 + Math.floor(Math.random() * 45);
                const msg = isDown ? "Request timed out" : "Ping OK";

                await connection.execute(
                    `INSERT INTO heartbeat (
                        monitor_id, status, ping, time, msg, duration, down_count
                    ) VALUES (?, ?, ?, NOW(), ?, 0, ?)`,
                    [monitorId, status, ping, msg, isDown ? 1 : 0]
                );
            }
        }
    }

    console.log(`Seeder completed. Total monitors inserted or confirmed: ${totalCreatedMonitors}`);
    await connection.end();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
