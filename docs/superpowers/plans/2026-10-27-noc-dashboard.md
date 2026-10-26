# NOC Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared authenticated NOC Dashboard with configurable status cards, SVG sunburst, SVG treemap, and live down-monitor grid.

**Architecture:** Reuse `$root.monitorList` and `$root.lastHeartbeatList` for all live data. Store the shared five-card configuration through a dedicated authenticated socket handler backed by the existing `Settings` abstraction. Keep normalization and geometry helpers pure and testable, with Vue components responsible for rendering and interaction.

**Tech Stack:** Vue 3, native SVG, JavaScript, Socket.IO, RedBean settings, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-27-noc-dashboard-design.md`

## Global Constraints

- Five card configurations are global and shared by all logged-in users.
- Each card supports a custom title, `UP` or `DOWN`, and unlimited multi-select groups.
- Parent-group selection includes all recursive descendants, with monitor IDs deduplicated.
- Only UP/DOWN are displayed; non-DOWN heartbeat states are treated as UP.
- Use native SVG and do not add a visualization dependency.
- Circle and Multi Core clicks open a popup and do not navigate.
- Missing tags display as `No Tag`.
- Do not add comments unless required by existing conventions.

## Review Focus

- Recursive parent selection must include nested descendants without double-counting monitors — covered by Task 1 normalization tests.
- Missing heartbeat and non-DOWN statuses must produce UP consistently — covered by Task 1 status tests.
- Empty groups and untagged monitors must render safely — covered by Tasks 1 and 4 tests.
- Shared config save failures must preserve the last valid UI state — covered by Task 3 socket/UI tests.
- Treemap minimum sizing must not cause rectangles to escape bounds — covered by Task 2 geometry tests.

---

### Task 1: NOC Data Normalization and Status Helpers

**Files:**
- Create: `src/noc-dashboard.js`
- Test: `test/backend-test/test-noc-dashboard.js`

**Interfaces:**
- Produces `normalizeMonitors(monitorList, heartbeatList)` returning `{ monitors, groups, groupsById }`.
- Produces `getDescendantMonitorIds(groupIds, groupsById)` returning a deduplicated array of monitor IDs.
- Produces `getMonitorStatus(monitor, heartbeatList)` returning `"UP"` or `"DOWN"`.
- Produces `getCardCount(card, normalizedData)` returning the selected status count.
- Produces `buildSunburstData(normalizedData)` and `buildTreemapData(normalizedData)`.

- [ ] **Step 1: Write failing tests** for nested groups, duplicate selection, missing heartbeat, DOWN status, card count, No Tag, and group worst-status aggregation.
- [ ] **Step 2: Run `node --test test/backend-test/test-noc-dashboard.js`** and confirm the new tests fail because the helper module is absent.
- [ ] **Step 3: Implement normalization** using monitor `parent`, preserving hostname/IP/type/tags and recursively resolving descendants.
- [ ] **Step 4: Implement status/count/tree builders** with deterministic ordering and status aggregation.
- [ ] **Step 5: Run the focused test command** and confirm all tests pass.

### Task 2: SVG Geometry Helpers

**Files:**
- Modify: `src/noc-dashboard.js`
- Test: `test/backend-test/test-noc-dashboard.js`

**Interfaces:**
- Produces `describeArc(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle)` returning SVG path data.
- Produces `layoutSunburst(data, width, height)` returning arc records with bounds and source IDs.
- Produces `layoutTreemap(data, width, height)` returning bounded group and hostname rectangles.

- [ ] **Step 1: Add failing geometry tests** for full-angle coverage, non-negative radii, deterministic ordering, bounded treemap rectangles, and weighted child areas.
- [ ] **Step 2: Run the focused test command** and confirm geometry assertions fail.
- [ ] **Step 3: Implement polar arc paths** with correct large-arc and inner-hole handling.
- [ ] **Step 4: Implement deterministic squarified-style treemap layout** using weights `1 + childMonitorCount + tagCount`, preserving minimum readable dimensions where space permits.
- [ ] **Step 5: Run the focused test command** and confirm all geometry tests pass.

### Task 3: Shared NOC Configuration Socket API

**Files:**
- Create: `server/socket-handlers/noc-dashboard-socket-handler.js`
- Modify: `server/server.js:176-196` and socket-handler registration location
- Test: `test/backend-test/test-noc-dashboard.js` or the repository’s socket handler test location

**Interfaces:**
- Socket event `getNocDashboardConfig(callback)` returns `{ ok: true, data: { cards } }`.
- Socket event `saveNocDashboardConfig(config, callback)` returns `{ ok: true, data: { cards } }` or `{ ok: false, msg }`.
- Stored setting key: `nocDashboardConfig`.

- [ ] **Step 1: Write failing handler tests** for authenticated read, valid five-card save, malformed payload rejection, and default fallback.
- [ ] **Step 2: Run the focused backend test command** and confirm failures.
- [ ] **Step 3: Implement payload normalization/validation** limiting five cards, accepting only UP/DOWN, string titles, and numeric group IDs.
- [ ] **Step 4: Register the handler in `server/server.js`** using the existing handler registration convention and persist with `Settings.get`/`Settings.set`.
- [ ] **Step 5: Run focused backend tests** and confirm pass.

### Task 4: NOC Dashboard Page and SVG Components

**Files:**
- Create: `src/pages/NocDashboard.vue`
- Create: `src/components/NocKpiCards.vue`
- Create: `src/components/NocSunburst.vue`
- Create: `src/components/NocTreemap.vue`
- Create: `src/components/NocDownGrid.vue`
- Create: `src/components/NocMonitorPopup.vue`
- Test: `test/e2e/noc-dashboard.spec.js` or the repository’s existing e2e location

**Interfaces:**
- `NocKpiCards` props: `cards`, `counts`, `groups`; emits `save-card`.
- `NocSunburst` props: `arcs`; emits `select` with group/monitor record.
- `NocTreemap` props: `rectangles`; emits `select` with group/monitor record.
- `NocDownGrid` prop: `monitors`.
- `NocMonitorPopup` prop: `monitor`; emits `close`.

- [ ] **Step 1: Add e2e/component assertions** for five cards, card editor fields, multi-group checklist, popup opening, No Tag label, and down-card fields.
- [ ] **Step 2: Implement `NocDashboard.vue`**: load shared config on mount, derive normalized data from root monitor/heartbeat state, refresh computed visualizations, and preserve prior config on save error.
- [ ] **Step 3: Implement KPI card editor** with title, UP/DOWN selector, unlimited group checklist, automatic status colors, and save/cancel behavior.
- [ ] **Step 4: Implement native SVG sunburst** with arc labels/title metadata and click events.
- [ ] **Step 5: Implement native SVG treemap** with group/hostname rectangles, clipped labels, tag text, and click events.
- [ ] **Step 6: Implement down grid and detail popup** showing hostname, group, IP/host, tags, status, ping, type, and event time.
- [ ] **Step 7: Run the relevant e2e/component test command** and fix failures.

### Task 5: Route and Navigation Integration

**Files:**
- Modify: `src/router.js`
- Modify: `src/layouts/Layout.vue`
- Test: `test/e2e/noc-dashboard.spec.js`

- [ ] **Step 1: Add a failing route/navigation assertion** for `/noc-dashboard` and the navbar label beside Network Graph.
- [ ] **Step 2: Import/register `NocDashboard.vue`** and add the authenticated route.
- [ ] **Step 3: Add the authenticated `NOC Dashboard` navigation link** beside the existing Network Graph link.
- [ ] **Step 4: Run the focused e2e test** and confirm navigation works.

### Task 6: Verification and Quality Checks

**Files:**
- Modify: only files required by lint/build fixes

- [ ] **Step 1: Run `node --run lint:js`.**
- [ ] **Step 2: Run `node --run lint:style`.**
- [ ] **Step 3: Run `node --run build`.**
- [ ] **Step 4: Run `node --run test-backend -- test/backend-test/test-noc-dashboard.js` or the repository-equivalent focused test command.**
- [ ] **Step 5: Run the relevant e2e test command.**
- [ ] **Step 6: Inspect `git diff` and `git status --short`; ensure only intended files are changed and no credentials are present.**
