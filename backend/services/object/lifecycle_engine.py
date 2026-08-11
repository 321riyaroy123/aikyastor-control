"""
lifecycle_engine.py

Production lifecycle engine.

Runs retention policies against real Ceph RGW buckets by:

1. Reading bucket lifecycle assignments from bucket_settings.json
2. Reading policy definitions from policy_manager.py
3. Listing objects in each bucket
4. Deleting expired objects
5. Logging every deletion to Activity

This mirrors the simulation lifecycle engine.
"""

from datetime import datetime, timedelta, timezone

from core.logger import logger
from core.activity import log_activity

from services.object.bucket_settings import get_all_bucket_settings
from services.object.lifecycle_policy_manager import get_lifecycle_policy
from services.object.object_storage import get_s3_client, delete_object_permanently

def run_lifecycle_engine():
    """
    Execute lifecycle policies against all buckets.

    Returns:
        {
            "count": int,
            "deleted": [
                {
                    "bucket": "...",
                    "object": "...",
                    "policy": "...",
                    "reason": "..."
                }
            ]
        }
    """
    s3 = get_s3_client()
    deleted = []
    now = datetime.now(timezone.utc)
    settings = get_all_bucket_settings()

    for bucket, config in settings.items():
        policy_id = config.get("lifecycle", "none")
        if policy_id == "none":
            continue

        lifecycle_policy = get_lifecycle_policy(policy_id)

        if lifecycle_policy is None:
            logger.warning(
                f"Unknown lifecycle policy '{policy_id}' "
                f"assigned to bucket '{bucket}'."
            )
            continue

        retention = None

        if lifecycle_policy.get("expire_days") is not None:
            retention = timedelta(
                days=lifecycle_policy["expire_days"]
            )
        elif lifecycle_policy.get("expire_hours") is not None:
            retention = timedelta(
                hours=lifecycle_policy["expire_hours"]
            )

        if retention is None:
            continue

        try:
            response = s3.list_objects_v2(
                Bucket=bucket
            )
        except Exception as e:
            logger.warning(
                f"Unable to list bucket '{bucket}': {e}"
            )
            continue

        objects = response.get("Contents", [])
        for obj in objects:
            last_modified = obj["LastModified"]
            expiry = last_modified + retention

            if expiry > now:
                continue
            try:
                delete_object_permanently(bucket, obj["Key"])
                reason = (
                    f"Expired after "
                    f"{lifecycle_policy['name']} retention policy."
                )
                log_activity(
                    "LIFECYCLE DELETE",
                    f"{bucket}/{obj['Key']}",
                    "success",
                    reason
                )
                deleted.append(
                    {
                        "bucket": bucket,
                        "object": obj["Key"],
                        "policy": lifecycle_policy["name"],
                        "reason": reason
                    }
                )
            except Exception as e:
                logger.warning(
                    f"Failed deleting "
                    f"{bucket}/{obj['Key']}: {e}"
                )

    return {
        "count": len(deleted),
        "deleted": deleted
    }
