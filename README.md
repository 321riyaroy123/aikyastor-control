# AiKyaStor CONTROL - Refactored Architecture

A modular, production-ready Ceph storage management dashboard with comprehensive simulation mode.

> **v2.0 note**: This version completes a full structural refactor of both
> backend and frontend. No API contract, endpoint, or UI behavior changed —
> only how the code is organized. See [What Changed in v2.0](#-what-changed-in-v20)
> for the full diff against the previous single-layer structure.

## 📁 Project Structure

### Backend (Python/Flask)

```
backend/
    app.py                        # Slim Flask entrypoint — registers all blueprints

    config/
        config.py                 # Configuration management with .env support

    core/
        logger.py                 # Centralized logging setup
        activity.py                # Activity log tracking and management

    routes/                       # Flask Blueprints — one per storage domain
        cluster_routes.py          # /api/stats, /api/health, /api/version, /api/activity
        object_routes.py           # /api/object/*
        block_routes.py            # /api/block/*
        file_routes.py             # /api/file/*
        vault_routes.py            # /api/*/sync-vault, /api/*/export-vault
        policy_routes.py           # /api/policies*, bucket policy assignment
        simulation_routes.py       # /api/simulation/time

    services/                     # Business logic — routes never talk to Ceph directly
        cluster/
            ceph_ops.py             # Cluster stats/health/version
        object/
            object_storage.py       # S3/RGW bucket & object management
            policy_manager.py       # Retention/lifecycle policy storage
        block/
            block_storage.py        # RBD image, snapshot, mapping management
        file/
            file_storage.py         # CephFS browsing, uploads, permissions
        vault/
            vault_ops.py            # rsync/rclone/rbd-export backup operations

    simulation/
        simulation.py              # Mock data for testing without a Ceph cluster

data/
    policies.json                 # Custom lifecycle policies (JSON store)

logs/
    aikya-stor.log                # Rotating log file (10MB, 5 backups)

.env                             # Environment variables and settings
requirements.txt                 # Python dependencies
```

### Frontend (React/JavaScript)

```
src/
    App.jsx                       # Root shell — header, sidebar nav, section routing, toasts
    main.jsx                      # React entrypoint
    simulationData.js             # Mock data for testing/development

    api/                          # ALL backend requests go through here — no raw fetch() in components
        client.js                   # Shared request dispatcher + offline simulation engine
        cluster.js                  # Cluster stats/health/activity
        objectStorage.js            # Buckets, objects, bucket policy
        blockStorage.js             # RBD images, mapping, snapshots
        fileStorage.js              # CephFS browse/upload/download
        vault.js                    # Vault status
        policies.js                 # Lifecycle policy CRUD (new — see below)
        simulation.js                # Backend simulation-clock control (new — see below)

    pages/                        # One page per nav section — owns data loading & handlers
        Dashboard.jsx
        ObjectStorage.jsx
        BlockStorage.jsx
        FileStorage.jsx
        Vault.jsx
        Activity.jsx                # New — not yet wired into nav, see below

    components/
        common/                     # Design-system primitives, used everywhere
            Button.jsx Modal.jsx Table.jsx Card.jsx StatusBadge.jsx SearchBar.jsx
        object/
            BucketTable.jsx BucketDialog.jsx BucketDetails.jsx
            ObjectTable.jsx LifecycleSelector.jsx
        block/
            ImageTable.jsx CreateImageDialog.jsx SnapshotDialog.jsx
        file/
            FileExplorer.jsx
        vault/
            VaultPopup.jsx VaultStatus.jsx
        activity/
            ActivityPanel.jsx

    hooks/                        # Reusable React logic, extracted out of components
        useToasts.js useActivity.js useBuckets.js useObjects.js useCommon.js

    styles/
        theme.js                   # Shared color tokens + style objects

    utils/
        formatters.js constants.js validators.js
```

## 🚀 Quick Start

### Backend Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Create/edit .env file
cp .env .env.local
# Edit .env.local with your configuration

# Run in simulation mode (default)
python backend/app.py

# Run in production mode
APP_MODE=production python backend/app.py
```

> **Note**: In production mode (`APP_MODE=production`), `CEPH_ACCESS_KEY` and
> `CEPH_SECRET_KEY` **must** be set via environment variables. The app will
> refuse to start without them — there are no built-in default credentials.

### Frontend Setup

```bash
# Install dependencies
npm install

# Run in development mode, pointed at a real backend
VITE_API_URL=http://localhost:5000/api VITE_APP_MODE=production npm run dev

# Run in simulation mode (offline, no backend needed)
VITE_APP_MODE=simulation npm run dev
```

> The frontend switched build tools from Create React App env vars
> (`REACT_APP_*`) to **Vite** (`VITE_*`) as part of this refactor — see
> [What Changed](#-what-changed-in-v20).

## ⚙️ Configuration

### Environment Variables (.env)

```env
# Application Mode
APP_MODE=simulation                    # simulation | production

# Flask Configuration
FLASK_DEBUG=false
FLASK_HOST=0.0.0.0
FLASK_PORT=5000

# Ceph RGW Configuration
CEPH_RGW_ENDPOINT=http://192.168.29.252:80
CEPH_ACCESS_KEY=your_access_key        # required outside simulation mode
CEPH_SECRET_KEY=your_secret_key        # required outside simulation mode
CEPH_REGION=us-east-1

# Ceph Storage Configuration
CEPHFS_MOUNT=/mnt/cephfs
RBD_POOL=rbd
CEPH_CONF=/etc/ceph/ceph.conf

# Vault Configuration
VAULT_PATH=/vault

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=standard

# Command Execution
CMD_TIMEOUT=30
```

No credentials are hardcoded anywhere in the codebase. `config/config.py`
will raise a `RuntimeError` at startup if `CEPH_ACCESS_KEY` /
`CEPH_SECRET_KEY` are missing while `APP_MODE != simulation`.

## 🔄 Backend Architecture

### Layered Design

The backend is now split into three layers instead of one flat set of files:

- **`routes/`** — Flask Blueprints. Each one validates input, calls a
  service function, and returns JSON. No Ceph/S3/RBD logic lives here.
- **`services/`** — all business logic, grouped by storage domain
  (`cluster`, `object`, `block`, `file`, `vault`). This is where
  `subprocess`/`boto3`/filesystem calls actually happen.
- **`core/`** — cross-cutting concerns shared by every route/service
  (logging, activity tracking).

This mirrors the original module boundaries (`ceph_ops.py`,
`object_storage.py`, `block_storage.py`, `file_storage.py`, `vault_ops.py`,
`policy_manager.py`) — they were **moved, not rewritten** — plus a new
`routes/` layer that used to be 700+ lines inline in one `app.py`.

### Simulation Mode

When `APP_MODE=simulation`:
- All Ceph commands are skipped
- Mock data from `simulation/simulation.py` is returned
- Perfect for testing without a Ceph cluster
- Activity logs are simulated
- No changes to actual storage
- Object download streaming is not available (returns `501`)

### Activity Logging

All operations are logged to in-memory activity log (`core/activity.py`):
- Thread-safe with locking
- Tracks action, target, status, and details
- Supports vault-specific filtering
- Automatic trimming (keeps last 100 entries)
- Activity labels match the original implementation exactly
  (e.g. `VAULT SYNC` for per-item uploads vs. `VAULT SYNC (BUCKET)` /
  `VAULT SYNC (CephFS)` for bulk syncs), so the activity feed and icon
  mapping in `utils/constants.js` render correctly.

## 📡 API Endpoints

All endpoint paths and response shapes are **unchanged** from the previous
version — only their implementation moved into blueprints. See each
blueprint file for its exact route set.

### Cluster Information — `routes/cluster_routes.py`
- `GET /api/stats` - Cluster statistics
- `GET /api/health` - Cluster health status
- `GET /api/version` - Ceph version
- `GET /api/info` - Application info
- `GET /api/activity` - Get activity log
- `GET /api/activity/stats` - Activity statistics

### Vault — `routes/vault_routes.py`
- `GET /api/vault/status` - Vault mount status
- `POST /api/object/buckets/<bucket>/sync-vault` - Sync bucket to vault (rclone, background)
- `POST /api/block/images/<name>/export-vault` - Export RBD image to vault (background)
- `POST /api/file/sync-vault` - Sync entire CephFS mount to vault (rsync, background)

### Object Storage — `routes/object_routes.py`
- `GET /api/object/buckets` - List buckets
- `POST /api/object/buckets` - Create bucket
  - Body: `{ bucket, owner, acl, versioning, object_locking }`
  - Returns `409` if the bucket already exists, `400` if `bucket` is empty
  - Sets ACL, enables versioning, and links the owner via `radosgw-admin`
    as non-fatal post-creation steps
- `DELETE /api/object/buckets/<bucket>` - Delete bucket (removes all contained objects first)
- `GET /api/object/buckets/<bucket>/objects` - List objects in bucket
- `POST /api/object/buckets/<bucket>/upload` - Upload an object
  - Form fields: `file`, `vault` (`"true"` to also copy the object to
    `/vault/object/<bucket>/<key>` in the background)
- `GET /api/object/buckets/<bucket>/objects/<key>` - Download an object
  (streamed back to the client as an attachment)
- `DELETE /api/object/buckets/<bucket>/objects/<key>` - Delete an object
- `GET /api/object/users` - List RGW users

### Policies — `routes/policy_routes.py`
- `GET /api/policies` - List built-in + custom retention policies
- `POST /api/policies` - Create a custom policy
- `DELETE /api/policies/<policy_id>` - Delete a custom policy
- `GET /api/policies/<policy_id>/usage` - Usage stats for a policy
- `POST /api/policies/run` - Run the lifecycle engine (simulation mode)
- `GET/POST /api/object/buckets/<bucket>/policy` - Get/assign a bucket's lifecycle policy

### Block Storage — `routes/block_routes.py`
- `GET /api/block/images` - List RBD images
- `POST /api/block/images` - Create RBD image
- `DELETE /api/block/images/<name>` - Delete RBD image
  (best-effort `rbd unmap` uses a short 5s timeout before the actual delete)
- `POST /api/block/images/<name>/map` - Map RBD image
- `POST /api/block/images/<name>/unmap` - Unmap RBD image
- `GET /api/block/mapped` - List mapped images
- `POST /api/block/images/<name>/snapshot` - Create snapshot
- `GET /api/block/images/<name>/snapshots` - List snapshots

### File Storage — `routes/file_routes.py`
- `GET /api/file/browse` - Browse CephFS directory
- `POST /api/file/upload` - Upload file
  - Form fields: `path`, `file`, `vault` (`"true"` to also rsync the file
    to `/vault/file/<path or 'root'>/` in the background)
- `GET /api/file/download` - Download file
- `DELETE /api/file/delete` - Delete file
- `POST /api/file/mkdir` - Create directory
- `GET /api/file/stats` - Directory statistics

### Simulation — `routes/simulation_routes.py`
- `GET /api/simulation/time` - Get the mock simulation clock
- `POST /api/simulation/time` - Advance the mock simulation clock (simulation mode only)

## 🆕 What Changed in v2.0

This release is a **pure restructuring** — every endpoint, response shape,
UI behavior, and simulation-mode behavior is identical to the previous
version. Nothing was rewritten from scratch; existing logic was moved
file-by-file into a layered structure.

### Backend: flat files → layered blueprints

| Before | After |
|---|---|
| `app.py` (one file, ~40 routes inline) | `backend/app.py` (slim entrypoint) + 7 files in `routes/` |
| `object_storage.py`, `block_storage.py`, `file_storage.py`, `ceph_ops.py`, `vault_ops.py`, `policy_manager.py` at project root | Same files, moved into `services/<domain>/` |
| `logger.py`, `activity.py` at project root | Moved into `core/` |
| `config.py` at project root | Moved into `config/config.py` |
| `simulation.py` at project root | Moved into `simulation/` |

- Routes now **only** validate input, call a service function, and return
  JSON — all `subprocess`/`boto3`/filesystem logic lives in `services/`.
- All 42 `(method, path)` route pairs were verified 1:1 against the
  original `app.py` — nothing added, nothing missing.
- **Fixed bug**: the original `app.py`'s `@app.errorhandler` blocks for
  404/500 were accidentally wrapped inside a stray `'''...'''` string,
  making them dead code that never actually registered. They're now real,
  active error handlers in `backend/app.py`.

### Frontend: one 700-line component → pages, components, hooks, API layer

| Before | After |
|---|---|
| `AiKyaStorCONTROL.jsx` (single file: state, styles, and every screen) | `App.jsx` (shell only) + `pages/*.jsx` (one per screen) + `components/**/*.jsx` (reusable pieces) |
| `api.js` (all endpoints + the simulation mock engine in one file) | `api/client.js` (shared dispatcher + mock engine) + one file per domain (`cluster.js`, `objectStorage.js`, `blockStorage.js`, `fileStorage.js`, `vault.js`) |
| `hooks.js` + duplicated `useToasts` also defined inline in `AiKyaStorCONTROL.jsx` | Deduplicated into `hooks/useToasts.js`; the rest of `hooks.js` moved to `hooks/useCommon.js`; new domain hooks `useActivity.js`, `useBuckets.js`, `useObjects.js` extracted from the inline state that used to live in `AiKyaStorCONTROL.jsx` |
| `utils.js` (formatting + everything else in one file) + inline `fmt`/`pct` duplicated in `AiKyaStorCONTROL.jsx` | Deduplicated and split into `utils/formatters.js`, `utils/constants.js`, `utils/validators.js` |
| Color tokens (`C`) and `styles` object defined inline at the top of `AiKyaStorCONTROL.jsx` | Extracted to `styles/theme.js`, imported everywhere instead of redefined |
| No dedicated `Th`/`Td`/table-wrapper component — redefined independently and identically in 4 different places | Consolidated into `components/common/Table.jsx` |

- React components **no longer call `fetch()` directly or know endpoint
  URLs** — every request goes through `api/client.js`.
- Environment variables switched from CRA-style `REACT_APP_*` to
  Vite-style `VITE_*` (`VITE_API_URL`, `VITE_APP_MODE`), matching the
  project's actual `vite.config.js` build tooling.

### New, currently-unwired additions

These exist to support planned features without requiring another
restructuring later. They introduce **zero behavior change** today because
nothing in the UI calls them yet:

- `components/object/LifecycleSelector.jsx` + `api/policies.js` — frontend
  plumbing for the bucket lifecycle-policy backend routes, which already
  existed but had no UI.
- `api/simulation.js` — frontend plumbing for the backend's mock
  simulation clock (`/api/simulation/time`).
- `components/common/SearchBar.jsx` — a generic filter input, not yet
  attached to any bucket/object/image list.
- `pages/Activity.jsx` — a standalone full-page activity view; the app's
  nav still only shows the activity feed embedded in Dashboard and Vault.

> **Note:** `api/policies.js` and `api/simulation.js` call real backend
> routes but are **not** covered by `api/client.js`'s offline simulation
> mock — they only work when the frontend is running against a live Flask
> backend (`VITE_APP_MODE=production`), not in fully offline
> `VITE_APP_MODE=simulation` mode.

### Removed / superseded files

The following flat files are fully replaced and should not be used going
forward: `app.py`, `object_storage.py`, `block_storage.py`,
`file_storage.py`, `ceph_ops.py`, `vault_ops.py`, `policy_manager.py`,
`logger.py`, `activity.py`, `config.py`, `simulation.py` (all superseded
by `backend/`), and `api.js`, `hooks.js`, `utils.js`,
`AiKyaStorCONTROL.jsx` (all superseded by `src/`).

## 🎯 Key Features

### ✅ Preserved Functionality
- All endpoints match the paths and response shapes used by the frontend
  `api/` layer and the original single-file backend
- Object downloads stream the file directly (no presigned URLs), matching
  the original `<a href download>` behavior in the frontend
- Bucket creation/deletion semantics (ACL, versioning, owner linking,
  cascading object delete, `409` on duplicate) match the original
- Vault-sync activity log labels and destination paths match the original
- Simulation mode's mock data, delays, and activity logging behave
  identically to before

### ✅ Structural Improvements (this release)
- **Layered backend**: routes → services → core, instead of one flat
  module per domain with logic inline in `app.py`
- **Component-based frontend**: pages own data/state, components are
  purely presentational, hooks hold reusable logic, `api/` is the only
  layer that touches the network
- **No duplicated logic**: the two copies of `useToasts`, the four copies
  of `Th`/`Td`, and the duplicated `fmt`/`pct` helpers are now single
  source of truth
- **Extensible without another rewrite**: adding NFS, snapshots-as-a-tab,
  or a bucket-policy UI now means adding a new `routes/`, `services/`,
  `api/`, and `pages/` file each — not touching a 40-route `app.py` or a
  700-line component

### ✅ Carried-over Improvements (from the previous refactor)
- **Configuration management**: `.env` file support, no hardcoded secrets
- **Simulation mode**: Test without Ceph cluster
- **Logging**: Centralized logging to console and file
- **Error handling**: Consistent error responses (and now, actually active — see bugfix above)
- **Security**: Path traversal prevention in file ops
- **Thread safety**: Activity logging with locks
- **Vault flag end-to-end**: Upload-time "also save to Vault" toggle wired
  from form → API → background sync (per-object for S3, per-file for CephFS)
- **Accurate vault status**: `/api/vault/status` checks `/proc/mounts`
  rather than treating any existing directory as "mounted"

## 🧪 Testing in Simulation Mode

### Start backend in simulation mode
```bash
# Default is simulation
python backend/app.py
```

### Make API calls
```bash
# Get cluster stats (returns mock data)
curl http://localhost:5000/api/stats

# Create bucket (simulated)
curl -X POST http://localhost:5000/api/object/buckets \
  -H "Content-Type: application/json" \
  -d '{"bucket":"test-bucket"}'

# Check activity log
curl http://localhost:5000/api/activity
```

### Run the frontend fully offline
```bash
VITE_APP_MODE=simulation npm run dev
```
No backend required — `src/api/client.js` serves every request from
`src/simulationData.js` in-memory.

## 🔐 Security Considerations

- Path traversal prevention in file operations
- No hardcoded credentials — environment variables required for
  `CEPH_ACCESS_KEY` / `CEPH_SECRET_KEY` outside simulation mode
- Logging of all operations
- Thread-safe activity tracking
- Error messages don't expose sensitive info

## 📊 Logging

Logs are written to:
- **Console**: Real-time output during development
- **File**: `logs/aikya-stor.log` (rotating, 10MB max)

Configure via `.env`:
```env
LOG_LEVEL=INFO              # DEBUG, INFO, WARNING, ERROR
LOG_FORMAT=standard         # standard or minimal
```

## 📝 Development Guidelines

### Adding a new backend endpoint

1. Add the business logic to the right file in `services/<domain>/`
2. Add a route to the matching blueprint in `routes/`:
```python
@bp.route("/api/new-endpoint", methods=["POST"])
def new_endpoint():
    if config.IS_SIMULATION:
        return jsonify({"message": "Simulated response"})

    try:
        result = new_operation()
        return jsonify(result)
    except Exception as e:
        logger.exception("error")
        return jsonify({"error": str(e)}), 500
```
3. Add a matching function to the relevant file in `src/api/`
4. Add a `simRequest` branch in `src/api/client.js` (and mock data in
   `simulation/simulation.py` / `src/simulationData.js`) if it should work
   in simulation mode

### Adding a new frontend screen

1. Add any new API calls to the relevant `src/api/<domain>.js` file
2. Build presentational pieces in `src/components/<domain>/`
3. Wire them together with data/state in a new `src/pages/<Name>.jsx`
4. Add a nav entry in `App.jsx`'s `navItems`

### Adding New Configuration

1. Add to `.env` file
2. Read in `backend/config/config.py`:
```python
NEW_CONFIG = os.getenv("NEW_CONFIG", "default_value")
```
3. Import in relevant service module:
```python
from config.config import NEW_CONFIG
```

## 🐛 Troubleshooting

### Module not found errors
- Run the backend from the project root: `python backend/app.py`
- Make sure you're not still running the old flat `app.py` — it's superseded

### Configuration not loading
- Check `.env` file exists in the project root (same level as `backend/`)
- Verify environment variables with:
  `python -c "from backend.config import config; print(config.get_app_mode())"`

### Startup fails with "CEPH_ACCESS_KEY and CEPH_SECRET_KEY must be set"
- This is expected in production mode without credentials configured
- Set `CEPH_ACCESS_KEY` and `CEPH_SECRET_KEY` in `.env`, or run with
  `APP_MODE=simulation` for local development/testing

### Ceph commands failing in production
- Ensure `CEPH_CONF` points to correct config file
- Check credentials: `CEPH_ACCESS_KEY`, `CEPH_SECRET_KEY`
- Verify endpoints are accessible
- Check logs: `tail -f logs/aikya-stor.log`

### Vault shows "mounted: false" unexpectedly
- `/api/vault/status` now checks `/proc/mounts` for a real mountpoint at
  `VAULT_PATH` rather than just checking if the directory exists — make
  sure the vault filesystem is actually mounted there

### Frontend shows "no handler for GET /policies" or similar in simulation mode
- `api/policies.js` and `api/simulation.js` are not yet covered by the
  offline `simRequest` mock in `api/client.js` — run against a real backend
  (`VITE_APP_MODE=production`) to use these, or add mock branches yourself

## 📚 Further Reading

- [Flask Documentation](https://flask.palletsprojects.com/)
- [Ceph Documentation](https://docs.ceph.com/)
- [boto3 Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)
- [React Hooks Documentation](https://react.dev/reference/react/hooks)
- [Vite Documentation](https://vitejs.dev/)

## 📄 License

Same as original project

---

**Version**: 2.0.0 (Layered backend + component-based frontend, full structural refactor)
**Previous version**: 1.1.0 (Modular flat files, frontend/backend contract aligned)