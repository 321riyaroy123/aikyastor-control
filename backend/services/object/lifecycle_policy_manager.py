"""
services/object/lifecycle_policy_manager.py
Lifecycle (retention) policy management

Renamed from services/object/policy_manager.py to make explicit this only
concerns LIFECYCLE (retention/expiration) policies, as distinct from bucket
ACCESS policies (services/object/bucket_policy.py /
services/object/bucket_policy_converter.py).

Responsibility: unchanged — built-in + custom lifecycle policy definitions,
backed by a JSON file (now backend/data/lifecycle_policies.json). Used by
lifecycle_policy_routes.py via get_all_lifecycle_policies().
"""

import re
import json
import os
from typing import List, Dict
from services.object.bucket_settings import get_all_bucket_settings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIFECYCLE_POLICY_FILE = os.path.join(BASE_DIR, "..", "..", "data", "lifecycle_policies.json")

BUILTIN_LIFECYCLE_POLICIES = [
    {
        "id": "none",
        "name": "No Policy",
        "description": "Keep data forever",
        "expire_days": None,
        "builtin": True,
    },
    {
        "id": "keep7",
        "name": "Keep 7 Days",
        "description": "Delete objects after 7 days",
        "expire_days": 7,
        "builtin": True,
    },
    {
        "id": "keep30",
        "name": "Keep 30 Days",
        "description": "Delete objects after 30 days",
        "expire_days": 30,
        "builtin": True,
    },
    {
        "id": "keep90",
        "name": "Keep 90 Days",
        "description": "Delete objects after 90 days",
        "expire_days": 90,
        "builtin": True,
    },
    {
        "id": "keep365",
        "name": "Keep 1 Year",
        "description": "Delete objects after 365 days",
        "expire_days": 365,
        "builtin": True,
    },
]

def _ensure_lifecycle_policy_file():
    os.makedirs(os.path.dirname(LIFECYCLE_POLICY_FILE), exist_ok=True)

    if not os.path.exists(LIFECYCLE_POLICY_FILE):
        with open(LIFECYCLE_POLICY_FILE, "w") as f:
            json.dump([], f, indent=2)

def get_custom_lifecycle_policies() -> List[Dict]:
    _ensure_lifecycle_policy_file()

    with open(LIFECYCLE_POLICY_FILE, "r") as f:
        return json.load(f)

def save_custom_lifecycle_policies(policies: List[Dict]):
    with open(LIFECYCLE_POLICY_FILE, "w") as f:
        json.dump(policies, f, indent=2)

def get_all_lifecycle_policies() -> List[Dict]:
    return BUILTIN_LIFECYCLE_POLICIES + get_custom_lifecycle_policies()

def get_lifecycle_policy_usage(policy_id):
    settings = get_all_bucket_settings()

    buckets = []

    for bucket, cfg in settings.items():
        if cfg["lifecycle"] == policy_id:
            buckets.append(bucket)

    return {
        "policy": policy_id,
        "buckets": buckets,
        "count": len(buckets)
    }

def delete_lifecycle_policy(policy_id):
    usage = get_lifecycle_policy_usage(policy_id)

    if usage["count"] > 0:
        return {
            "error": "Policy is currently assigned.",
            "usage": usage
        }

    policies = get_custom_lifecycle_policies()

    if not any(p["id"] == policy_id for p in policies):
        return {"error": "Policy not found"}

    policies = [
        p for p in policies
        if p["id"] != policy_id
    ]

    save_custom_lifecycle_policies(policies)

    return {
        "message": f"Policy '{policy_id}' deleted"
    }

def get_lifecycle_policy(policy_id):
    for p in get_all_lifecycle_policies():
        if p["id"] == policy_id:
            return p

    return None

def normalize_name(name):
    return re.sub(r"\s+", " ", name.strip().lower())

def create_lifecycle_policy(name, expire_days=None):
    name = normalize_name(name)

    if not name:
        return {
            "error": "Policy name is required."
        }

    if expire_days is None:
        return {
            "error": (
                "Retention period is required "
                "and must be specified in days."
            )
        }

    try:
        expire_days = int(expire_days)
    except (TypeError, ValueError):
        return {
            "error": "Retention period must be a valid number of days."
        }

    if expire_days <= 0:
        return {
            "error": "Retention period must be greater than zero."
        }

    all_policies = get_all_lifecycle_policies()

    if any(
        normalize_name(p["name"]) == name
        for p in all_policies
    ):
        return {
            "error": f"Policy '{name}' already exists."
        }

    policy_id = re.sub(
        r"[^a-z0-9]+",
        "-",
        name
    ).strip("-")

    if any(
        p["id"] == policy_id
        for p in all_policies
    ):
        return {
            "error": f"Policy '{name}' already exists."
        }

    policy = {
        "id": policy_id,
        "name": name,
        "builtin": False,
        "expire_days": expire_days,
        "description": (
            f"Delete after {expire_days} days"
        )
    }

    policies = get_custom_lifecycle_policies()
    policies.append(policy)

    save_custom_lifecycle_policies(policies)

    return {
        "message": f"Policy '{name}' created",
        "policy": policy
    }