"""
simulation.py - Simulation mode with mock data
Provides realistic test data when APP_MODE=simulation
"""

from typing import Dict, List, Any

# Mock cluster statistics
MOCK_STATS = {
    "total_bytes": 4_000_000_000_000,
    "total_used_raw": 1_340_000_000_000,
    "total_avail": 2_660_000_000_000,
}

# Mock health status
MOCK_HEALTH = {
    "status": "HEALTH_OK",
    "checks": {}
}

# Mock vault status
MOCK_VAULT = {
    "mounted": True,
    "path": "/vault",
    "total": 2_000_000_000_000,
    "used": 480_000_000_000,
    "free": 1_520_000_000_000,
}

# Mock S3 buckets
MOCK_BUCKETS = [
    {"name": "media-assets", "created": "2024-11-01T10:00:00Z"},
    {"name": "backups-daily", "created": "2024-12-15T08:30:00Z"},
    {"name": "logs-archive", "created": "2025-01-20T14:00:00Z"},
    {"name": "ml-datasets", "created": "2025-03-05T09:15:00Z"},
]

# Mock bucket objects
MOCK_OBJECTS = {
    "media-assets": [
        {"key": "hero-banner.png", "size": 4_200_000, "modified": "2025-05-10T12:00:00Z"},
        {"key": "video-promo.mp4", "size": 187_000_000, "modified": "2025-05-15T09:30:00Z"},
        {"key": "icons/arrow.svg", "size": 2_100, "modified": "2025-06-01T11:00:00Z"},
    ],
    "backups-daily": [
        {"key": "db-2025-06-12.tar.gz", "size": 930_000_000, "modified": "2025-06-12T03:00:00Z"},
        {"key": "db-2025-06-11.tar.gz", "size": 918_000_000, "modified": "2025-06-11T03:00:00Z"},
    ],
    "logs-archive": [
        {"key": "app-2025-05.log.gz", "size": 45_000_000, "modified": "2025-06-01T00:00:00Z"},
    ],
    "ml-datasets": [
        {"key": "training-v3.parquet", "size": 2_100_000_000, "modified": "2025-04-20T16:00:00Z"},
        {"key": "validation.parquet", "size": 210_000_000, "modified": "2025-04-20T16:05:00Z"},
    ],
}

# Mock RGW users
MOCK_RGW_USERS = ["admin", "app-user", "backup-svc", "ml-worker"]

# Mock RBD images
MOCK_RBD_IMAGES = [
    {"name": "vm-root-disk", "size": 107_374_182_400, "format": 2, "features": ["layering", "exclusive-lock"]},
    {"name": "db-volume", "size": 53_687_091_200, "format": 2, "features": ["layering"]},
    {"name": "scratch-disk", "size": 10_737_418_240, "format": 2, "features": []},
]

# Mock mapped RBD images
MOCK_MAPPED = [
    {"device": "/dev/rbd0", "pool": "rbd", "name": "vm-root-disk"},
]

# Mock CephFS directory structure
MOCK_CEPHFS = {
    "": [
        {"name": "data", "type": "dir", "size": 0, "modified": "1749000000"},
        {"name": "home", "type": "dir", "size": 0, "modified": "1748900000"},
        {"name": "shared", "type": "dir", "size": 0, "modified": "1749100000"},
        {"name": "README.md", "type": "file", "size": 1240, "modified": "1748800000"},
    ],
    "data": [
        {"name": "exports", "type": "dir", "size": 0, "modified": "1749000000"},
        {"name": "pipeline-output.csv", "type": "file", "size": 5_800_000, "modified": "1749010000"},
        {"name": "config.yaml", "type": "file", "size": 3200, "modified": "1748950000"},
    ],
    "home": [
        {"name": "alice", "type": "dir", "size": 0, "modified": "1748900000"},
        {"name": "bob", "type": "dir", "size": 0, "modified": "1748860000"},
    ],
    "shared": [
        {"name": "models", "type": "dir", "size": 0, "modified": "1749100000"},
        {"name": "scripts", "type": "dir", "size": 0, "modified": "1749050000"},
    ],
    "data/exports": [
        {"name": "report-q2.pdf", "type": "file", "size": 2_300_000, "modified": "1749050000"},
    ],
}

# Mock activity log
MOCK_ACTIVITY = [
    {"time": "2025-06-13 10:42:11", "action": "UPLOAD", "target": "media-assets/hero-banner.png", "status": "success", "detail": "Saved to Ceph Object Storage", "vault": False},
    {"time": "2025-06-13 10:40:05", "action": "VAULT SYNC", "target": "backups-daily/db-2025-06-12.tar.gz", "status": "success", "detail": "Copied to /vault/object/backups-daily/", "vault": True},
    {"time": "2025-06-13 10:38:22", "action": "CREATE BUCKET", "target": "ml-datasets", "status": "success", "detail": "Owner:ml-worker ACL:private Versioning:true ObjLock:false", "vault": False},
    {"time": "2025-06-13 10:35:00", "action": "MAP IMAGE", "target": "vm-root-disk", "status": "success", "detail": "Device: /dev/rbd0", "vault": False},
    {"time": "2025-06-13 10:30:48", "action": "VAULT EXPORT (RBD)", "target": "db-volume", "status": "success", "detail": "Exported to /vault/block/db-volume.img", "vault": True},
    {"time": "2025-06-13 09:55:12", "action": "UPLOAD (CephFS)", "target": "/data/pipeline-output.csv", "status": "success", "detail": "Saved to CephFS", "vault": False},
    {"time": "2025-06-13 09:40:00", "action": "DELETE OBJECT", "target": "logs-archive/old-2024.log.gz", "status": "success", "detail": "", "vault": False},
    {"time": "2025-06-13 09:15:33", "action": "SNAPSHOT", "target": "vm-root-disk@snap-v2", "status": "success", "detail": "", "vault": False},
    {"time": "2025-06-13 08:00:00", "action": "VAULT SYNC (CephFS)", "target": "entire mount", "status": "info", "detail": "rsync started...", "vault": True},
]

def get_mock_stats() -> Dict[str, Any]:
    """Get mock cluster statistics"""
    return MOCK_STATS.copy()

def get_mock_health() -> Dict[str, Any]:
    """Get mock health status"""
    return MOCK_HEALTH.copy()

def get_mock_vault() -> Dict[str, Any]:
    """Get mock vault status"""
    return MOCK_VAULT.copy()

def get_mock_buckets() -> List[Dict[str, Any]]:
    """Get mock bucket list"""
    return [b.copy() for b in MOCK_BUCKETS]

def get_mock_objects(bucket: str) -> List[Dict[str, Any]]:
    """Get mock objects for a bucket"""
    return [obj.copy() for obj in MOCK_OBJECTS.get(bucket, [])]

def get_mock_rgw_users() -> List[str]:
    """Get mock RGW user list"""
    return MOCK_RGW_USERS.copy()

def get_mock_rbd_images() -> List[Dict[str, Any]]:
    """Get mock RBD image list"""
    return [img.copy() for img in MOCK_RBD_IMAGES]

def get_mock_mapped_images() -> List[Dict[str, Any]]:
    """Get mock mapped images"""
    return [img.copy() for img in MOCK_MAPPED]

def get_mock_cephfs_directory(path: str) -> List[Dict[str, Any]]:
    """Get mock CephFS directory contents"""
    return [entry.copy() for entry in MOCK_CEPHFS.get(path, [])]

def get_mock_activity() -> List[Dict[str, Any]]:
    """Get mock activity log"""
    return [entry.copy() for entry in MOCK_ACTIVITY]

def add_mock_activity_entry(entry: Dict[str, Any]) -> None:
    """Add an entry to mock activity log"""
    MOCK_ACTIVITY.insert(0, entry)
    if len(MOCK_ACTIVITY) > 100:
        MOCK_ACTIVITY.pop()
