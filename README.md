# AiKyaStor CONTROL - Refactored Architecture

A modular, production-ready Ceph storage management dashboard with comprehensive simulation mode.

## 📁 Project Structure

### Backend (Python/Flask)

```
app.py                   # Main Flask application with all API routes
config.py               # Configuration management with .env support
logger.py               # Centralized logging setup
activity.py             # Activity log tracking and management
simulation.py           # Mock data for testing

# Storage Operations
ceph_ops.py             # Cluster statistics and health operations
object_storage.py       # S3/RGW bucket and object management
block_storage.py        # RBD image and snapshot management
file_storage.py         # CephFS file browser and operations
vault_ops.py            # Vault backup and archival operations

# Configuration
.env                    # Environment variables and settings
requirements.txt        # Python dependencies
```

### Frontend (React/JavaScript)

```
api.js                  # API client with all endpoint definitions
simulationData.js       # Mock data for testing/development
utils.js                # Utility functions (formatting, calculations)
hooks.js                # Custom React hooks
AiKyaStorCONTROL.jsx   # Main React component
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
python app.py

# Run in production mode
APP_MODE=production python app.py
```

> **Note**: In production mode (`APP_MODE=production`), `CEPH_ACCESS_KEY` and
> `CEPH_SECRET_KEY` **must** be set via environment variables. The app will
> refuse to start without them — there are no built-in default credentials.

### Frontend Setup

```bash
# For React app using this backend
npm install

# Run in development mode
REACT_APP_API_URL=http://localhost:5000/api npm start

# Run in simulation mode
REACT_APP_SIMULATION=true npm start
```

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

No credentials are hardcoded anywhere in the codebase. `config.py` will raise
a `RuntimeError` at startup if `CEPH_ACCESS_KEY` / `CEPH_SECRET_KEY` are
missing while `APP_MODE != simulation`.

## 🔄 Backend Architecture

### Modular Design

Each storage subsystem is isolated in its own module:

- **ceph_ops.py**: Core cluster operations (stats, health, version)
- **object_storage.py**: S3/RGW operations (buckets, objects, users, downloads)
- **block_storage.py**: RBD operations (images, snapshots, mapping)
- **file_storage.py**: CephFS operations (browsing, uploads, permissions)
- **vault_ops.py**: Backup operations (rsync, rclone, exports, per-item vault sync)

### Simulation Mode

When `APP_MODE=simulation`:
- All Ceph commands are skipped
- Mock data from `simulation.py` is returned
- Perfect for testing without a Ceph cluster
- Activity logs are simulated
- No changes to actual storage
- Object download streaming is not available (returns `501`)

### Activity Logging

All operations are logged to in-memory activity log:
- Thread-safe with locking
- Tracks action, target, status, and details
- Supports vault-specific filtering
- Automatic trimming (keeps last 100 entries)
- Activity labels match the original implementation exactly
  (e.g. `VAULT SYNC` for per-item uploads vs. `VAULT SYNC (BUCKET)` /
  `VAULT SYNC (CephFS)` for bulk syncs), so the activity feed and icon
  mapping in `utils.js` render correctly.

## 📡 API Endpoints

### Cluster Information
- `GET /api/stats` - Cluster statistics
- `GET /api/health` - Cluster health status
- `GET /api/version` - Ceph version
- `GET /api/info` - Application info

### Activity
- `GET /api/activity` - Get activity log
- `GET /api/activity/stats` - Activity statistics

### Vault
- `GET /api/vault/status` - Vault mount status
- `POST /api/object/buckets/<bucket>/sync-vault` - Sync bucket to vault (rclone, background)
- `POST /api/block/images/<name>/export-vault` - Export RBD image to vault (background)
- `POST /api/file/sync-vault` - Sync entire CephFS mount to vault (rsync, background)

### Object Storage
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

### Block Storage
- `GET /api/block/images` - List RBD images
- `POST /api/block/images` - Create RBD image
- `DELETE /api/block/images/<name>` - Delete RBD image
  (best-effort `rbd unmap` uses a short 5s timeout before the actual delete)
- `POST /api/block/images/<name>/map` - Map RBD image
- `POST /api/block/images/<name>/unmap` - Unmap RBD image
- `GET /api/block/mapped` - List mapped images
- `POST /api/block/images/<name>/snapshot` - Create snapshot
- `GET /api/block/images/<name>/snapshots` - List snapshots

### File Storage
- `GET /api/file/browse` - Browse CephFS directory
- `POST /api/file/upload` - Upload file
  - Form fields: `path`, `file`, `vault` (`"true"` to also rsync the file
    to `/vault/file/<path or 'root'>/` in the background)
- `GET /api/file/download` - Download file
- `DELETE /api/file/delete` - Delete file
- `POST /api/file/mkdir` - Create directory
- `GET /api/file/stats` - Directory statistics

## 🎯 Key Features

### ✅ Preserved Functionality
- All endpoints match the paths and response shapes used by `api.js` and
  the original single-file backend
- Object downloads stream the file directly (no presigned URLs), matching
  the original `<a href download>` behavior in the frontend
- Bucket creation/deletion semantics (ACL, versioning, owner linking,
  cascading object delete, `409` on duplicate) match the original
- Vault-sync activity log labels and destination paths match the original

### ✅ New Improvements
- **Modular code**: Each subsystem in separate files
- **Configuration management**: `.env` file support, no hardcoded secrets
- **Simulation mode**: Test without Ceph cluster
- **Logging**: Centralized logging to console and file
- **Error handling**: Consistent error responses
- **Security**: Path traversal prevention in file ops
- **Thread safety**: Activity logging with locks
- **Vault flag end-to-end**: Upload-time "also save to Vault" toggle is
  now wired from the frontend form, through the API, into a background
  sync (per-object for S3, per-file for CephFS)
- **Accurate vault status**: `/api/vault/status` checks `/proc/mounts`
  rather than treating any existing directory as "mounted"

### ✅ Frontend Enhancements
- **API client**: Centralized API calls, paths aligned 1:1 with backend routes
- **Simulation data**: Mock data for testing, including vault-flag handling
- **Utility functions**: Reusable formatting and calculations
- **Custom hooks**: Reusable React logic
- **Better organization**: Separated concerns

## 🧪 Testing in Simulation Mode

### Start backend in simulation mode
```bash
# Default is simulation
python app.py
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

## 🔄 Migration from Old Code

1. **Old `app.py`**: Split into modular files
2. **Configuration**: Moved to `config.py` with `.env` support, hardcoded
   credentials removed
3. **Activity logging**: Dedicated `activity.py` module
4. **Simulation**: Dedicated `simulation.py` module
5. **Frontend**: Extracted utilities into separate modules, rebuilt as a
   React app (`AiKyaStorCONTROL.jsx`) on top of the same backend contract
6. **Vault sync routes**: Renamed to `/api/object/buckets/<bucket>/sync-vault`,
   `/api/block/images/<name>/export-vault`, and `/api/file/sync-vault` to
   match the frontend API client (previously `/api/vault/sync-bucket/<bucket>`,
   `/api/vault/export-rbd/<name>`, `/api/vault/sync-cephfs`)
7. **Object routes**: Added missing `upload`/`download`/`delete` endpoints
   for individual objects under `/api/object/buckets/<bucket>/objects/...`

**All functionality preserved relative to the original single-file backend
— the API contract now also matches the React frontend exactly.**

## 📝 Development Guidelines

### Adding New Endpoints

1. Create operation in appropriate module (e.g., `object_storage.py`)
2. Add route to `app.py` with simulation check:
```python
@app.route("/api/new-endpoint", methods=["POST"])
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

3. Add to `api.js` in frontend (and a matching handler in `simRequest` for
   simulation mode)
4. Add mock data to `simulation.py` / `simulationData.js` if needed

### Adding New Configuration

1. Add to `.env` file
2. Read in `config.py`:
```python
NEW_CONFIG = os.getenv("NEW_CONFIG", "default_value")
```

3. Import in relevant module:
```python
from config import NEW_CONFIG
```

## 🐛 Troubleshooting

### Module not found errors
- Ensure all `.py` files are in same directory as `app.py`
- Run from project root: `python app.py`

### Configuration not loading
- Check `.env` file exists in same directory as `app.py`
- Verify environment variables with: `python -c "import config; print(config.get_app_mode())"`

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

## 📚 Further Reading

- [Flask Documentation](https://flask.palletsprojects.com/)
- [Ceph Documentation](https://docs.ceph.com/)
- [boto3 Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)
- [React Hooks Documentation](https://react.dev/reference/react/hooks)

## 📄 License

Same as original project

---

**Version**: 1.1.0 (Refactored, frontend/backend contract aligned)
**Updated**: 2026-06-15