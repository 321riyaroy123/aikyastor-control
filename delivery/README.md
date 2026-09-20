# AiKyaStor CONTROL — Dashboard Redesign — Full Delivery (Phases 1-7)

This is the complete set of files for the redesigned Dashboard/Overview
page, mirrored into the real repo's folder structure. Files are marked
below as either **MODIFIED**/**NEW** (changed in this project) or
**UNCHANGED** (your real file, included here only so the whole feature
is browsable in one place — verified byte-identical to what you
originally uploaded).

## File structure

```
backend/
  routes/
    cluster_routes.py ................ MODIFIED (Phases 1, 5, 7)
  services/
    cluster/
      metrics_service.py ............. MODIFIED (Phases 1, 5, 7 — new module)

src/
  api/
    cluster.js ...................... UNCHANGED
  hooks/
    useDashboardMetrics.js .......... UNCHANGED
  pages/
    Dashboard.jsx .................... MODIFIED (every phase)
  components/
    dashboard/
      ClusterHealthBanner.jsx ....... UNCHANGED (Phase 1)
      ClusterKPIs.jsx ................ UNCHANGED (Phase 2 — receives new
                                        numPools prop value as of Phase 7,
                                        but the component file itself was
                                        never edited)
      ServicesPanel.jsx .............. UNCHANGED (Phase 3)
      OSDUtilization.jsx ............. UNCHANGED (Phase 4)
      PoolOverview.jsx ............... NEW (Phase 5)
      AttentionRequired.jsx .......... NEW (Phase 6)
      PerformanceCharts.jsx .......... NEW (Phase 7)
      Sparkline.jsx .................. NEW (Phase 7 — dependency-free
                                        inline SVG chart primitive used
                                        by PerformanceCharts.jsx)
```

Every file above was verified byte-identical against its real source
(either my own working copy or your original upload) before packaging —
nothing here was regenerated from memory.

## Not included

- `backend/services/cluster/ceph_ops.py` — never modified across any
  phase, not included since there's nothing to change.
- `backend/app.py` — **you need to make one manual edit here** (see
  "Outstanding manual step" below). Not included because the real,
  current version of this file was never re-uploaded in this project;
  editing it from memory/assumption would risk clobbering changes you've
  made elsewhere in it.
- `src/components/activity/ActivityPanel.jsx` — never provided as a real
  file at any point; a test-only stub was used for local verification and
  was never part of any deliverable.
- `src/api/client.js` — real file needs no changes for any of Phases
  1-7; not included.
- Common/shared files (`theme.js`, `formatters.js`, `Card.jsx`,
  `StatCard.jsx`, `StatusBadge.jsx`, `Table.jsx`) — never modified, so
  not included; every new component's usage of `C.*`, `formatBytes()`,
  `Card`, `StatusBadge`, `Th`/`TableWrap` was cross-checked against real
  usage in the unchanged files above rather than guessed.

## Outstanding manual step (required for Phase 7 to actually show data)

`get_cluster_io_history()`'s ring buffer is filled by a background
sampler thread that must be started once at app startup. Add this near
wherever the existing lifecycle scheduler (or equivalent) is started in
`app.py`:

```python
from services.cluster.metrics_service import start_io_history_sampler
start_io_history_sampler()
```

Without this, `/api/dashboard`'s `io` block still works (instantaneous
reading), but `io_history.points` stays permanently empty and the
Performance charts will show "No data yet."

## Phase-by-phase summary

| Phase | Section(s) | What it added | Backend change | Frontend change |
|---|---|---|---|---|
| 1 | Cluster Health Banner | Overall health status, top issue, expandable issue list | `get_health_summary()` | `ClusterHealthBanner.jsx` |
| 2 | Top KPI cards | Capacity, OSD/MON/MGR counts, Pools placeholder | `get_capacity_summary()`, partial `get_cluster_services()` | `ClusterKPIs.jsx` |
| 3 | Cluster Services panel | MON/MGR/OSD/MDS/RGW status table | `get_cluster_services()` (RGW), `get_mds_status()` | `ServicesPanel.jsx` |
| 4 | OSD Utilization | Per-OSD utilization bars, sorted worst-first | `get_osd_utilization()` | `OSDUtilization.jsx` |
| 5 | Pool Overview | Per-pool usage + real replication/redundancy status | `get_pool_stats()` rewritten (merges `ceph df detail` + `ceph osd pool ls detail`) | `PoolOverview.jsx` |
| 6 | Attention Required | Issues grouped by severity + guidance text | none (reuses Phase 1's `health` data) | `AttentionRequired.jsx` |
| 7 | Performance charts | Read/write throughput + ops sparkline charts | `get_cluster_io()` wired, `get_cluster_io_history()` (new ring buffer + background sampler) | `PerformanceCharts.jsx`, `Sparkline.jsx`; `numPools` gap in `ClusterKPIs.jsx` closed via new prop value |

All 7 phases from the original plan are complete. `/api/dashboard` now
returns: `health`, `capacity`, `services`, `mds`, `osds`, `pools`, `io`,
`io_history`.

**Not implemented, no scaffold exists:** Prometheus integration (no
Prometheus instance exists for this cluster — confirmed directly, not
assumed) and the `activity` block mentioned in early docstrings (the
existing `/api/activity` endpoint in `cluster_routes.py` already serves
this separately and was never folded into `/api/dashboard`).

**Simulation mode is intentionally NOT implemented for `/api/dashboard`**
across all 7 phases — an explicit decision from the start of this
project, not an oversight. The endpoint returns 501 in simulation mode.

## Testing caveat (carried across Phases 5-7)

No Babel/react-test-renderer toolchain was available in the container
used across these sessions. Every new/modified `.jsx` file was verified
by:
- Balanced braces/parens/brackets
- JSX open/close tag pairing (including manual verification of any tag
  the automated regex check couldn't match, e.g. multiline opening tags)
- Direct prop-usage diffing against real, confirmed-working sibling
  components to verify exact API contracts (`Card`, `StatusBadge`,
  `Th`/`TableWrap`, `formatBytes`, every `C.*` theme token used)
- For `Sparkline.jsx` specifically: the coordinate/path-generation math
  was extracted and run standalone in real Node.js against edge cases
  (flat series, single point, empty series, data gaps) to confirm no
  NaN/Infinity/crashes
- For the Phase 7 ring buffer: the buffer/lock logic was extracted and
  run standalone under simulated concurrent read/write load to confirm
  no corruption and correct bounding

None of this substitutes for the project's real Babel/react-test-renderer
suite. Recommend running that against all four new components
(`PoolOverview.jsx`, `AttentionRequired.jsx`, `PerformanceCharts.jsx`,
`Sparkline.jsx`) before merging.
