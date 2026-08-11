"""
services/object/lifecycle_converter.py

Conversion between AiKyaStor lifecycle policies and
AWS S3 / Ceph RGW lifecycle configuration.

AiKyaStor policy:

{
    "id": "keep30",
    "name": "Keep 30 Days",
    "expire_days": 30
}

Ceph RGW / S3:

{
    "Rules": [
        {
            "ID": "keep30",
            "Status": "Enabled",
            "Filter": {
                "Prefix": ""
            },
            "Expiration": {
                "Days": 30
            }
        }
    ]
}
"""


def policy_to_lifecycle_configuration(policy: dict) -> dict:
    """
    Convert one AiKyaStor retention policy into an
    S3-compatible lifecycle configuration.

    Raises:
        ValueError: if the policy cannot be represented
                    as a native S3 lifecycle rule.
    """

    if not policy:
        raise ValueError("Lifecycle policy is required.")

    policy_id = policy.get("id")

    if not policy_id:
        raise ValueError("Lifecycle policy ID is required.")

    # "none" is handled by deleting the lifecycle
    # configuration rather than creating an empty rule.
    if policy_id == "none":
        return {
            "Rules": []
        }

    expire_days = policy.get("expire_days")

    if expire_days is None:
        if policy.get("expire_hours") is not None:
            raise ValueError(
                "Hour-based lifecycle policies are not supported "
                "by the native production lifecycle configuration. "
                "Use a policy defined in days."
            )

        raise ValueError(
            f"Lifecycle policy '{policy_id}' has no expiration period."
        )

    try:
        expire_days = int(expire_days)
    except (TypeError, ValueError):
        raise ValueError(
            f"Invalid expiration period for lifecycle policy '{policy_id}'."
        )

    if expire_days <= 0:
        raise ValueError(
            "Lifecycle expiration must be greater than zero days."
        )

    return {
        "Rules": [
            {
                "ID": str(policy_id),
                "Status": "Enabled",
                "Filter": {
                    "Prefix": ""
                },
                "Expiration": {
                    "Days": expire_days
                }
            }
        ]
    }


def lifecycle_configuration_to_policy(
    configuration: dict,
    policies: list
):
    """
    Convert a native S3 lifecycle configuration back into
    an AiKyaStor policy representation.

    The first matching expiration rule is mapped to the
    corresponding AiKyaStor policy.

    Returns None when no lifecycle configuration exists.
    """

    if not configuration:
        return None

    rules = configuration.get("Rules", [])

    if not rules:
        return None

    # Find the first enabled expiration rule.
    for rule in rules:
        if rule.get("Status") != "Enabled":
            continue

        policy_id = rule.get("ID")

        # First try to match the native rule ID to one of
        # AiKyaStor's known policies.
        for policy in policies:
            if policy.get("id") == policy_id:
                return policy.copy()

        # If it is not one of our named policies, expose
        # the native configuration instead of losing data.
        expiration = rule.get("Expiration", {})

        if expiration.get("Days") is not None:
            days = expiration["Days"]

            return {
                "id": policy_id or "custom-rgw-rule",
                "name": policy_id or "Custom RGW Lifecycle Rule",
                "description": f"Delete objects after {days} days",
                "expire_days": days,
                "builtin": False,
                "native": True
            }

    return None