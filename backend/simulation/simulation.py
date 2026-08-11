"""
simulation/simulation.py - Simulation mode with mock data
Provides realistic test data when APP_MODE=simulation

Moved from: simulation.py (project root)
Responsibility: unchanged — this module is fully self-contained (no
project-internal imports), so it moved verbatim. It is imported by every
routes/*.py blueprint whenever config.IS_SIMULATION is True, and is the
single source of mock buckets/objects/images/CephFS entries/activity/
policies used across the whole simulated backend.
"""

import re
from email import policy
from typing import Dict, List, Any
from datetime import datetime, timedelta
from services.object.lifecycle_policy_manager import get_lifecycle_policy

SIMULATION_TIME = datetime.utcnow()

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
        {"key": "hero-banner.png", "size": 4200000, "modified": "2025-05-10T12:00:00Z", "uploaded": "2026-07-01T09:00:00Z"},
        {"key": "video-promo.mp4", "size": 187_000_000, "modified": "2025-05-15T09:30:00Z"},
        {"key": "icons/arrow.svg", "size": 2_100, "modified": "2025-06-01T11:00:00Z"},
    ],
    "backups-daily": [
        {"key": "db-2025-06-12.tar.gz", "size": 930_000_000, "modified": "2025-06-12T03:00:00Z", "uploaded": "2026-06-29T00:00:00Z"},
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

# Mock retention policies
MOCK_LIFECYCLE_POLICIES = [
    {
        "id": "none",
        "name": "No Policy",
        "description": "Keep forever",
        "expire_days": None,
        "builtin": True
    },
    {
        "id": "keep7",
        "name": "Keep 7 Days",
        "description": "Delete after 7 days",
        "expire_days": 7,
        "builtin": True
    },
    {
        "id": "keep30",
        "name": "Keep 30 Days",
        "description": "Delete after 30 days",
        "expire_days": 30,
        "builtin": True
    },
    {
        "id": "keep90",
        "name": "Keep 90 Days",
        "description": "Delete after 90 days",
        "expire_days": 90,
        "builtin": True
    },
    {
        "id": "keep365",
        "name": "Keep 1 Year",
        "description": "Delete after 365 days",
        "expire_days": 365,
        "builtin": True
    },
    {
        "id": "keep1h",
        "name": "Keep 1 Hour",
        "description": "Delete after 1 hour",
        "expire_hours": 1,
        "builtin": True
    },
    {
        "id": "keep1d",
        "name": "Keep 1 Day",
        "description": "Delete after 1 day",
        "expire_days": 1,
        "builtin": True
    }
]

MOCK_BUCKET_SETTINGS = {
    "media-assets": {
        "lifecycle": "none",
        "bucket_policy": None,
        "acl": "private",
        "versioning": False,
        "object_locking": False
    },

    "backups-daily": {
        "lifecycle": "keep30",
        "bucket_policy": None,
        "acl": "private",
        "versioning": True,
        "object_locking": False
    },

    "logs-archive": {
        "lifecycle": "keep90",
        "bucket_policy": None,
        "acl": "public-read",
        "versioning": False,
        "object_locking": True
    },

    "ml-datasets": {
        "lifecycle": "none",
        "bucket_policy": None,
        "acl": "private",
        "versioning": True,
        "object_locking": True
    }
}

CUSTOM_LIFECYCLE_POLICIES = []

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
    {"time": "2025-06-13 09:25:00", "action": "LIFECYCLE DELETE", "target": "logs-archive/app-2025-05.log.gz", "status": "success", "detail": "Deleted automatically. Reason: Keep 30 Days retention policy expired.", "vault": False},
]

# Mock bucket Policies
MOCK_BUCKET_POLICIES = {
    # Example:
    # "backups": {
    #     "Version": "2012-10-17",
    #     "Statement": [...]
    # }
}

def get_simulation_time():
    return SIMULATION_TIME

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
    buckets = []

    for bucket in MOCK_BUCKETS:
        name = bucket["name"]
        settings = MOCK_BUCKET_SETTINGS.get(name, {})

        buckets.append({
            **bucket,
            "acl": settings.get("acl", "private"),
            "versioning": settings.get("versioning", False),
            "object_locking": settings.get("object_locking", False)
        })

    return buckets

def create_mock_bucket(
    bucket_name,
    owner="admin",
    acl="private",
    versioning=False,
    object_locking=False,
    lifecycle="none"
):
    MOCK_BUCKETS.append({
        "name": bucket_name,
        "created": datetime.utcnow().isoformat() + "Z",
        "owner": owner
    })

    MOCK_BUCKET_SETTINGS[bucket_name] = {
        "lifecycle": lifecycle,
        "bucket_policy": None,
        "acl": acl,
        "versioning": versioning,
        "object_locking": object_locking
    }

    MOCK_OBJECTS[bucket_name] = []
    MOCK_BUCKET_POLICIES[bucket_name] = None

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

def get_bucket_lifecycle(bucket):
    settings = MOCK_BUCKET_SETTINGS.get(
        bucket,
        {
            "lifecycle": "none",
            "bucket_policy": None
        }
    )

    lifecycle = get_lifecycle_policy(settings["lifecycle"])

    return {
        "bucket": bucket,
        "lifecycle": lifecycle,
        "bucket_policy": settings["bucket_policy"]
    }

def assign_bucket_lifecycle(bucket, policy_id):
    if bucket not in MOCK_BUCKET_SETTINGS:
        return {"error": "Bucket not found"}

    old_policy_id = MOCK_BUCKET_SETTINGS[bucket]["lifecycle"]

    MOCK_BUCKET_SETTINGS[bucket]["lifecycle"] = policy_id

    old_policy = get_lifecycle_policy(old_policy_id)
    new_policy = get_lifecycle_policy(policy_id)

    add_mock_activity_entry({
        "time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "action": "UPDATE LIFECYCLE",
        "target": bucket,
        "status": "success",
        "detail": (
            f"Changed lifecycle from "
            f"'{old_policy['name'] if old_policy else 'None'}' "
            f"to "
            f"'{new_policy['name'] if new_policy else 'None'}'"
        ),
        "vault": False
    })

    return {
        "message": "Lifecycle updated successfully",
        "bucket": bucket,
        "lifecycle": new_policy
    }

def advance_simulation_time(hours=0, days=0):
    global SIMULATION_TIME

    SIMULATION_TIME += timedelta(
        hours=hours,
        days=days
    )

    result = run_lifecycle_engine()

    return {
        "simulation_time": SIMULATION_TIME.isoformat() + "Z",
        **result
    }

def run_lifecycle_engine():
    now = SIMULATION_TIME
    deleted = []

    for bucket, settings in MOCK_BUCKET_SETTINGS.items():
        policy_id = settings["lifecycle"]
        if policy_id == "none":
            continue

        lifecycle_policy = get_lifecycle_policy(policy_id)
        if not lifecycle_policy:
            continue

        if "expire_hours" in lifecycle_policy:
            retention = timedelta(hours=lifecycle_policy["expire_hours"])
        elif "expire_days" in lifecycle_policy:
            retention = timedelta(days=lifecycle_policy["expire_days"])
        else:
            continue

        keep = []

        for obj in MOCK_OBJECTS.get(bucket, []):
            timestamp = obj.get("uploaded")
            if timestamp is None:
                keep.append(obj)
                continue

            uploaded = datetime.fromisoformat(
                timestamp.replace("Z", "")
            )

            if uploaded + retention <= now:
                deleted.append({
                    "simulation-time": now.strftime("%Y-%m-%d %H:%M:%S"),
                    "bucket": bucket,
                    "object": obj["key"],
                    "policy": lifecycle_policy["name"],
                    "reason": (
                        f"Expired after "
                        f"{lifecycle_policy['name']} retention policy."
                    )
                })

                add_mock_activity_entry({
                    "time": now.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "LIFECYCLE DELETE",
                    "target": f"{bucket}/{obj['key']}",
                    "status": "success",
                    "detail": (
                        f"Deleted automatically. "
                        f"Reason: {lifecycle_policy['name']} retention policy expired."
                    ),
                    "vault": False
                })

            else:
                keep.append(obj)

        MOCK_OBJECTS[bucket] = keep

    return {
        "count": len(deleted),
        "deleted": deleted
    }

# ── Lifecycle Policy Simulation (retention policy definitions) ─────────────
def get_lifecycle_policies() -> List[Dict[str, Any]]:
    """Get all mock lifecycle policies (builtin + custom)"""
    return [p.copy() for p in MOCK_LIFECYCLE_POLICIES] + [p.copy() for p in CUSTOM_LIFECYCLE_POLICIES]

# ── Bucket ACCESS Policy Simulation (AWS S3-style) ──────────────────────────
def get_mock_bucket_policy(bucket: str):
    """
    Return the simulated bucket policy.
    """
    return MOCK_BUCKET_POLICIES.get(bucket)

def set_mock_bucket_policy(bucket: str, policy: dict):
    """
    Attach or replace a simulated bucket policy.
    """

    MOCK_BUCKET_POLICIES[bucket] = policy

    return {
        "bucket": bucket,
        "policy": policy
    }

def delete_mock_bucket_policy(bucket: str):
    """
    Remove a simulated bucket policy.
    """
    MOCK_BUCKET_POLICIES.pop(bucket, None)

    return {
        "bucket": bucket
    }

import re

def normalize_name(name):
    return re.sub(r"\s+", " ", name.strip().lower())

# ── back to Lifecycle Policy Simulation ─────────────────────────────────────
def create_lifecycle_policy(name, expire_days=None, expire_hours=None):
    name = normalize_name(name)
    if not name:
        return {"error": "Policy name is required."}
    all_policies = get_lifecycle_policies()
    if any(normalize_name(p["name"]) == name for p in all_policies):
        return {"error": f"Policy '{name}' already exists."}
    if expire_days is None and expire_hours is None:
        return {"error": "Retention period is required."}
    if expire_days is not None and expire_days <= 0:
        return {"error": "Retention period must be greater than zero."}
    if expire_hours is not None and expire_hours <= 0:
        return {"error": "Retention period must be greater than zero."}

    policy_id = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    policy = {"id": policy_id, "name": name, "builtin": False}
    if expire_days is not None:
        policy["expire_days"] = expire_days
        policy["description"] = f"Delete after {expire_days} days"
    else:
        policy["expire_hours"] = expire_hours
        policy["description"] = f"Delete after {expire_hours} hours"

    CUSTOM_LIFECYCLE_POLICIES.append(policy)
    return {"message": f"Policy '{name}' created", "policy": policy}

def get_lifecycle_policy_usage(policy_id):
    buckets = [b for b, cfg in MOCK_BUCKET_SETTINGS.items() if cfg.get("lifecycle") == policy_id]
    return {"policy": policy_id, "buckets": buckets, "count": len(buckets)}

def delete_lifecycle_policy(policy_id):
    usage = get_lifecycle_policy_usage(policy_id)
    if usage["count"] > 0:
        return {"error": "Policy is currently assigned.", "usage": usage}
    global CUSTOM_LIFECYCLE_POLICIES
    if not any(p["id"] == policy_id for p in CUSTOM_LIFECYCLE_POLICIES):
        return {"error": "Policy not found"}
    CUSTOM_LIFECYCLE_POLICIES = [p for p in CUSTOM_LIFECYCLE_POLICIES if p["id"] != policy_id]
    return {"message": f"Policy '{policy_id}' deleted"}
    