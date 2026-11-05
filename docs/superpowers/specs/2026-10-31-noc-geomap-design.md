# Technical Specification: Geo MAP Dashboard (Leaflet + OpenStreetMap)

## 1. Executive Summary & Goals
Add a dedicated, real-time operations map dashboard ("Geo MAP") inside Uptime Kuma for monitoring ATM networks and geographically distributed devices (400+ nodes) across Indonesia and corporate networks.

The system will leverage:
1. **Single-field coordinate input** (`latitude,longitude`) per monitor/node directly in the Edit Monitor page.
2. **High-performance Leaflet map** powered by OpenStreetMap tiles.
3. **HTML5 Canvas circle markers** (`L.circleMarker`) to ensure smooth 60 FPS rendering across 400+ nodes.
4. **Marker clustering** (`leaflet.markercluster`) for automatic grouping/ungrouping on zoom out/in.
5. **Real-time heartbeat synchronization** via Uptime Kuma's existing WebSocket socket connection (`$root.lastHeartbeatList`).

---

## 2. Requirements & Constraints

### Functional Requirements
- **FR-1:** Users can input geographic coordinates in a single text field on `EditMonitor.vue` using format `lat,lng` (e.g. `-6.200000,106.816666`).
- **FR-2:** The system validates that `coordinates` is either empty or matches valid WGS84 coordinates:
  - Latitude between `-90.0` and `90.0`
  - Longitude between `-180.0` and `180.0`
- **FR-3:** New and edited monitors persist the `coordinates` column in the database (SQLite/MariaDB compatible via Knex).
- **FR-4:** The server includes `coordinates` inside `Monitor.toJSON()` so that `$root.monitorList` on the client immediately contains coordinate data without additional API requests.
- **FR-5:** A new menu item "Geo MAP" is visible in the desktop navbar (`Layout.vue`) and mobile drawer, routing to `/noc-geomap`.
- **FR-6:** The `NocGeoMap.vue` page renders an interactive full-height Leaflet map with OpenStreetMap tiles.
- **FR-7:** Only monitors having valid coordinates are rendered as markers; monitors without coordinates are omitted from the map and counted in an informational pill (e.g., "385 mapped / 15 unmapped").
- **FR-8:** Marker colors are reactive to `$root.lastHeartbeatList`:
  - 🟢 **UP (Green)**: `#8cb82b` (status = 1)
  - 🔴 **DOWN (Red)**: `#dc2626` (status = 0)
  - 🟡 **WARN/HIGH PING (Yellow)**: `#eab308` (ping > 150ms)
  - ⚪ **PAUSED/MAINTENANCE (Gray)**: `#64748b` (active = 0 or maintenance = 3)
  - 🔵 **PENDING (Blue)**: `#3b82f6` (status = 2)
- **FR-9:** Clicking a marker opens a popup showing:
  - Monitor Name & Status Badge
  - Hostname / IP address
  - Group name
  - Ping / Latency (ms) & Last Heartbeat Time
  - Direct link to Monitor Detail (`/dashboard/:id`)
- **FR-10:** Map includes filter bar: Search query (name/IP), Status filter (ALL, UP, DOWN, WARN), Group filter.

### Non-Functional Requirements & Performance Constraints
- **NFR-1 (Client Rendering):** Must handle 400–1000 nodes simultaneously without frame drops or UI freezing using Leaflet Canvas renderer (`preferCanvas: true`) and `leaflet.markercluster`.
- **NFR-2 (Bandwidth & Ping Overhead):** Zero additional pings from client. Client purely reacts to existing server heartbeat broadcasts via Socket.IO.
- **NFR-3 (Offline/Intranet Tolerance):** OSM tile layer configured with standard fallback and error handling if the monitoring server operates in an offline/restricted network.

---

## 3. Database Schema Migration

Create a new Knex migration: `db/knex_migrations/2026-10-31-0000-add-monitor-coordinates.js`

```javascript
exports.up = async (knex) => {
    await knex.schema.alterTable("monitor", (table) => {
        table.string("coordinates", 100).defaultTo(null);
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable("monitor", (table) => {
        table.dropColumn("coordinates");
    });
};
```

---

## 4. Backend Implementation

### 4.1 Server Socket Handlers (`server/server.js`)
- **`editMonitor` event:**
  ```javascript
  bean.coordinates = monitor.coordinates ? String(monitor.coordinates).trim() : null;
  ```
- **`add` event:** Handled automatically via `bean.import(monitor)` after stripping non-DB properties, with sanitization:
  ```javascript
  if (monitor.coordinates) {
      monitor.coordinates = String(monitor.coordinates).trim();
  }
  ```

### 4.2 Monitor Model (`server/model/monitor.js`)
- Update `toJSON()` to include coordinates:
  ```javascript
  coordinates: this.coordinates || null,
  ```
- Update `validate()` to enforce coordinate format if provided:
  ```javascript
  if (this.coordinates) {
      const parts = this.coordinates.split(",");
      if (parts.length !== 2) {
          throw new Error("Coordinates must be in format 'latitude,longitude'");
      }
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          throw new Error("Invalid coordinate values: latitude must be between -90 and 90, longitude between -180 and 180");
      }
  }
  ```

---

## 5. Frontend Implementation

### 5.1 Dependencies
Install Leaflet and Leaflet MarkerCluster via npm:
- `leaflet`
- `leaflet.markercluster`

### 5.2 Edit Monitor Form (`src/pages/EditMonitor.vue`)
- In `<div class="col-md-6">` General section, right after `description`:
  ```vue
  <!-- Coordinates -->
  <div class="my-3">
      <label for="coordinates" class="form-label">{{ $t("Coordinates") || "Coordinates" }}</label>
      <input
          id="coordinates"
          v-model="monitor.coordinates"
          type="text"
          class="form-control"
          placeholder="-6.200000, 106.816666"
      />
      <div class="form-text">Format: latitude,longitude (contoh: -6.200000, 106.816666 untuk titik peta)</div>
  </div>
  ```
- In `isInputValid()` method:
  Validate regex `/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/` when non-empty, and check numerical bounds (-90 <= lat <= 90, -180 <= lng <= 180).

### 5.3 Navigation & Router
- **`src/router.js`:**
  Register `/noc-geomap` pointing to `NocGeoMap.vue` within the main authenticated Layout routes.
- **`src/layouts/Layout.vue`:**
  Add navigation pill in desktop header and mobile menu:
  ```vue
  <li v-if="$root.loggedIn" class="nav-item me-2">
      <router-link to="/noc-geomap" class="nav-link">
          <font-awesome-icon icon="map-marked-alt" />
          Geo MAP
      </router-link>
  </li>
  ```

### 5.4 Geo MAP Component (`src/pages/NocGeoMap.vue`)
- **Map Initialization:**
  - Center: Indonesia default `[-2.5489, 118.0149]`, zoom level 5.
  - Tile layer: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`.
  - Renderer: `L.canvas()` for maximum rendering speed.
  - Cluster group: `L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 16 })`.
- **Reactive Marker Layer:**
  - Watch `$root.lastHeartbeatList` with debounce/requestAnimationFrame.
  - Update marker color and popup details without tearing down and recreating the map DOM.
- **Search & Quick Zoom:**
  - Search box to instantly focus and zoom on a specific ATM/node.

---

## 6. Verification & Testing Plan
1. **Migration Test:** Run `npm run start-server` or Knex migration runner to verify column `coordinates` is added without table degradation.
2. **Form Validation Test:** Test invalid coordinate inputs (`abc`, `100,200`, `95,10`) and valid inputs (`-6.2, 106.8`).
3. **Save & Reload Test:** Edit a monitor, save coordinates, refresh page, verify coordinates persist in form and in `$root.monitorList`.
4. **Geo MAP Rendering Test:** Verify markers render at accurate coordinates on OpenStreetMap.
5. **Real-time Status Change Test:** Simulate or trigger down/up status, verify marker color transitions (Green <-> Red) instantly without map reload.
