# AiKyaStor CONTROL

AiKyaStor CONTROL is a Ceph operations dashboard with a Flask backend and a React/Vite frontend. It manages object, block, and file storage from one UI, and also includes lifecycle policies, bucket policies, RGW replication workflows, NFS exports for RGW buckets, vault backup actions, and a read-only HashiCorp Vault health view for SSE-S3 encryption.

The project supports two runtime modes:

- `simulation`: returns mock data and lets you exercise the UI without a Ceph cluster
- `production`: executes real Ceph, S3/RGW, filesystem, and Vault API operations

## What It Covers

- Cluster overview, health, version, and activity feed
- Object storage buckets, objects, uploads/downloads, bucket policies, lifecycle assignments, and bucket encryption settings
- RGW replication status, secondary-zone configuration, and provisioning helpers
- Block storage image creation, mapping, snapshots, and vault export
- CephFS browsing, upload/download, directory management, and vault sync
- NFS cluster creation plus NFS exports backed by RGW buckets
- Vault backup mount status for file/object/block backup workflows
- Encryption Vault status for the HashiCorp Vault transit backend used by RGW SSE-S3

## Architecture

### Backend

`backend/app.py` starts Flask and registers blueprints from `backend/routes/`.

- `routes/`: HTTP layer for cluster, object, block, file, vault, lifecycle, replication, simulation, and NFS endpoints
- `services/`: domain logic for Ceph CLI, RGW/S3, RBD, CephFS, Vault backup operations, HashiCorp Vault health checks, replication, and NFS
- `core/`: shared logging and in-memory activity tracking
- `config/`: environment-driven configuration
- `simulation/`: mock data and simulation-time helpers

### Frontend

`src/App.jsx` provides the shell, navigation, status bars, and page routing.

- `pages/`: top-level views for dashboard, object, block, file/NFS, vault backup, and encryption vault
- `components/`: UI for bucket workspaces, replication, NFS, file explorer, vault panels, tables, dialogs, and shared controls
- `api/`: frontend API wrappers for every backend domain
- `hooks/`: reusable state and polling helpers
- `styles/` and `utils/`: shared theme, formatting, constants, and validation helpers

## Project Layout

```text
backend/
  app.py
  config/
  core/
  data/
  routes/
  services/
  simulation/

src/
  api/
  components/
  hooks/
  pages/
  styles/
  utils/

data/
  bucket_settings.json
  policies.json
```

## Setup

### Backend

```bash
pip install -r requirements.txt
python backend/app.py
```

Useful environment variables:

```env
APP_MODE=simulation
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
FLASK_THREADED=true

CEPH_RGW_ENDPOINT=http://127.0.0.1:80
CEPH_RGW_ENDPOINT_SECURE=https://127.0.0.1:443
CEPH_ACCESS_KEY=
CEPH_SECRET_KEY=
CEPH_REGION=us-east-1

CEPHFS_MOUNT=/mnt/cephfs
RBD_POOL=rbd
CEPH_CONF=/etc/ceph/ceph.conf

VAULT_PATH=/vault
HASHICORP_VAULT_ADDR=http://127.0.0.1:8200
HASHICORP_VAULT_TOKEN=

REPLICATION_SECONDARY_HOST=
REPLICATION_SECONDARY_USER=
REPLICATION_SSH_CONNECT_TIMEOUT=5
REPLICATION_SSH_TIMEOUT=20
REPLICATION_SSH_SNAPSHOT_TIMEOUT=45
REPLICATION_CIRCUIT_BREAKER_COOLDOWN=30

CMD_TIMEOUT=30
LOG_LEVEL=INFO
LOG_FORMAT=standard
```

Notes:

- In non-simulation mode, `CEPH_ACCESS_KEY` and `CEPH_SECRET_KEY` are required.
- In non-simulation mode, `HASHICORP_VAULT_TOKEN` is also required for the Encryption Vault health endpoints.
- `VAULT_PATH` and `HASHICORP_VAULT_*` refer to different systems: the first is the backup mount, the second is the HashiCorp Vault API used for SSE-S3 health checks.

### Frontend

```bash
npm install
npm run dev
```

Common frontend env vars:

```bash
VITE_API_URL=http://localhost:5000/api
VITE_APP_MODE=production
```

To run the frontend fully offline with mock responses:

```bash
VITE_APP_MODE=simulation npm run dev
```

## API Surface

### Cluster

- `GET /api/stats`
- `GET /api/health`
- `GET /api/version`
- `GET /api/info`
- `GET /api/activity`
- `GET /api/activity/stats`

### Object Storage

- `GET /api/object/buckets`
- `POST /api/object/buckets`
- `DELETE /api/object/buckets/<bucket>`
- `GET /api/object/buckets/<bucket>/objects`
- `POST /api/object/buckets/<bucket>/upload`
- `GET /api/object/buckets/<bucket>/objects/<key>`
- `DELETE /api/object/buckets/<bucket>/objects/<key>`
- `GET /api/object/users`
- `POST /api/object/buckets/<bucket>/sync-vault`
- `GET|PUT|DELETE /api/object/buckets/<bucket>/policy`
- `GET|PUT|DELETE /api/object/buckets/<bucket>/encryption`
- `GET|PUT|DELETE /api/object/buckets/<bucket>/lifecycle`

### Lifecycle Policies

- `GET /api/policies`
- `POST /api/policies`
- `DELETE /api/policies/<policy_id>`
- `GET /api/policies/<policy_id>/usage`
- `POST /api/policies/run`

### Replication

- `GET /api/replication/status`
- `GET /api/replication/buckets`
- `POST /api/replication/configure`
- `POST /api/replication/provision`
- `POST /api/replication/breaker/reset`

### Block Storage

- `GET /api/block/images`
- `POST /api/block/images`
- `DELETE /api/block/images/<name>`
- `POST /api/block/images/<name>/map`
- `POST /api/block/images/<name>/unmap`
- `GET /api/block/mapped`
- `POST /api/block/images/<name>/snapshot`
- `GET /api/block/images/<name>/snapshots`
- `POST /api/block/images/<name>/export-vault`

### File Storage and NFS

- `GET /api/file/browse`
- `POST /api/file/upload`
- `GET /api/file/download`
- `DELETE /api/file/delete`
- `POST /api/file/mkdir`
- `GET /api/file/stats`
- `POST /api/file/sync-vault`
- `POST /api/nfs/clusters`
- `GET /api/nfs/clusters`
- `GET /api/nfs/clusters/<cluster_id>`
- `GET /api/nfs/clusters/<cluster_id>/exports`
- `GET /api/nfs/clusters/<cluster_id>/exports/<pseudo_path>`
- `POST /api/nfs/exports`
- `DELETE /api/nfs/clusters/<cluster_id>/exports/<pseudo_path>`

### Vault

- `GET /api/vault/status`
- `GET /api/vault/hashicorp/status`
- `GET /api/vault/hashicorp/health`
- `GET /api/vault/hashicorp/transit`
- `GET /api/vault/hashicorp/token`

### Simulation

- `GET /api/simulation/time`
- `POST /api/simulation/time`

## Data Files

- `backend/data/lifecycle_policies.json`: persisted custom lifecycle policy definitions
- `backend/data/lifecycle.json`: persisted bucket lifecycle assignments
- `data/policies.json` and `data/bucket_settings.json`: repo data files present at the project root, but not part of the current backend persistence path

## Development Notes

- The backend is organized by storage domain; route files should stay thin and delegate to services.
- The frontend already has dedicated API modules. New UI work should call `src/api/*` instead of using raw `fetch()` in components.
- Simulation mode is a first-class path. If you add a new user-facing workflow, update both the real backend path and the mock/simulation behavior when appropriate.

## License

Same as the original project.
