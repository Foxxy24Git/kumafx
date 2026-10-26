# NOC Dashboard Design Specification

## Goal

Add a shared, authenticated NOC Dashboard menu beside Network Graph. The dashboard presents five configurable KPI cards, a three-layer SVG sunburst, a group/hostname SVG treemap, and a responsive grid of all down monitors using live Uptime Kuma monitor and heartbeat state.

## Scope and Decisions

- The five card configurations are global and shared by all logged-in users.
- Every card supports a custom title, `UP` or `DOWN` status type, and an unlimited multi-select list of groups.
- Selecting a parent group includes all descendant groups and monitors recursively. Duplicate monitor IDs are counted once.
- Status handling is limited to `UP` and `DOWN`; any latest heartbeat whose status is not `DOWN` is treated as `UP`.
- Card colors are automatic from status type: green for `UP`, red for `DOWN`.
- Circle layer 1 is group, layer 2 is hostname/node, and layer 3 is tag. Group status is the worst child status. Missing tags display as `No Tag`.
- Multi Core uses a group outer box and hostname child boxes. Child box area is weighted by child-monitor/tag count with a minimum readable size.
- Circle and Multi Core clicks open a detail popup and do not navigate away.
- Down cards flow left-to-right and wrap to the next row. Each shows hostname, group, IP/host, and tags.
- No new visualization dependency is required; SVG and Vue are used directly.

## Data Model and Flow

The frontend uses the existing reactive sources `$root.monitorList` and `$root.lastHeartbeatList`. A shared setting stores the five cards through the existing settings/socket mechanism:

```js
{
  cards: [
    { id: "card-1", title: "UP ATM", statusType: "UP", groupIds: [] },
    { id: "card-2", title: "DOWN ATM", statusType: "DOWN", groupIds: [] },
    { id: "card-3", title: "", statusType: "UP", groupIds: [] },
    { id: "card-4", title: "", statusType: "DOWN", groupIds: [] },
    { id: "card-5", title: "", statusType: "UP", groupIds: [] }
  ]
}
```

All authenticated users can read and save this setting. The server validates the payload shape, limits it to five cards, and persists it using the existing `setting` table abstraction. A successful save is broadcast or refreshed so other open dashboard sessions see the shared configuration.

The dashboard computes a normalized monitor tree from monitor `parent` relationships. Group descendants are traversed recursively, and selected groups are resolved to a deduplicated set of monitor IDs. Latest heartbeat data supplies status, ping, and event time. Missing heartbeat is treated as `UP` under the agreed two-state model.

## UI Components

`NocDashboard.vue` owns configuration loading/saving, normalized monitor data, live computed metrics, popup state, and dashboard layout. Focused child components or local render helpers should separate:

- `NocKpiCards`: five cards and configuration modal trigger.
- `NocSunburst`: SVG arc layers and click targets.
- `NocTreemap`: SVG group/hostname rectangles and click targets.
- `NocDownGrid`: responsive down-monitor cards.
- `NocMonitorPopup`: reusable monitor detail dialog.

The implementation may keep these in existing project conventions if separate files add unnecessary overhead, but geometry calculations should remain isolated and unit-testable.

## SVG Visualization Rules

Sunburst uses polar geometry with three concentric bands. Group arcs divide the full circle by descendant leaf weight; hostname arcs divide their parent group arc; tag arcs divide their hostname arc, with one `No Tag` child when tags are absent. Each arc has status-derived fill, accessible title/label metadata, hover state, and click payload identifying the monitor or group.

Treemap uses a deterministic squarified layout. Group rectangles are laid out within the visualization bounds; hostname rectangles inside each group receive weights based on one base unit plus child monitor/tag counts. A minimum visual size is applied only during layout and does not alter reported counts. Text is clipped or shortened where necessary, while popup details retain full values.

## Configuration Interaction

Clicking any KPI card opens its editor. The editor supports title input, UP/DOWN selection, and a group checklist with recursive group names. Save validates the title and card index, sends the shared setting through the socket, and closes on success. Cancel leaves the current configuration unchanged. Errors remain visible in the modal and do not overwrite the last valid configuration.

## Error and Realtime Handling

The dashboard reuses the existing authenticated socket/session. It reacts to monitor-list topology changes and heartbeat updates through Vue computed state/watchers, with lightweight throttling if needed for large installations. If the socket disconnects, the current data remains visible and the UI indicates stale state using existing connection information. Invalid or missing saved configuration falls back to five safe default cards.

## Routing and Navigation

Add an authenticated `/noc-dashboard` route and a `NOC Dashboard` navigation link beside `Network Graph` in `src/layouts/Layout.vue`. The page remains within the normal application layout and does not change existing Graph View behavior.

## Testing

Add unit tests for recursive group membership and deduplication, status aggregation, sunburst arc boundaries, and treemap weights/layout bounds. Add component or end-to-end coverage for opening/saving card configuration, shared config rendering, popup opening, and down-grid contents. Run the project lint commands and frontend build before completion.
