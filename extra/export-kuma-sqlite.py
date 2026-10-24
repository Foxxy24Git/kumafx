import json
import sqlite3
import sys

source = sys.argv[1]
conn = sqlite3.connect(source)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

def dump_table(table):
    cursor.execute(f"SELECT * FROM `{table}`")
    rows = [dict(row) for row in cursor.fetchall()]
    return rows

data = {
    "tag": dump_table("tag"),
    "group": dump_table("group"),
    "monitor": dump_table("monitor"),
    "monitor_group": dump_table("monitor_group"),
    "monitor_tag": dump_table("monitor_tag"),
}

with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(data, f)

print(f"Dumped {len(data['monitor'])} monitors, {len(data['tag'])} tags, {len(data['group'])} groups, {len(data['monitor_group'])} monitor_groups, {len(data['monitor_tag'])} monitor_tags")
