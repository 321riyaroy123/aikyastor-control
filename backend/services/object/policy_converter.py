"""
services/object/policy_converter.py

Converts between the frontend bucket policy model and the
AWS S3 bucket policy format required by Ceph RGW.
"""

def convert_ui_policy_to_aws(bucket: str, policy: dict) -> dict:
    """
    Convert the frontend policy draft into an AWS S3 bucket policy.

    Frontend Model
    --------------
    {
        version,
        statements: [
            {
                sid,
                enabled,
                effect,
                principal,
                actions,
                resources,
                conditions
            }
        ]
    }
    """

    VALID_ACTIONS = {
        "GetObject",
        "PutObject",
        "DeleteObject",
        "ListBucket",
        "GetBucketPolicy",
        "PutBucketPolicy",
    }

    aws_policy = {
        "Version": policy.get("version", "2012-10-17"),
        "Statement": []
    }

    for index, stmt in enumerate(policy.get("statements", []), start=1):

        # --------------------------------------------------
        # Skip disabled statements
        # --------------------------------------------------
        if not stmt.get("enabled", True):
            continue

        # --------------------------------------------------
        # SID
        # --------------------------------------------------
        sid = stmt.get("sid", "").strip()

        if not sid:
            sid = f"Statement{index}"

        # --------------------------------------------------
        # Principal
        # --------------------------------------------------
        principal = stmt.get("principal", "*")

        if principal == "*":
            aws_principal = "*"

        elif principal == "authenticated":
            # Placeholder until IAM identities are supported
            aws_principal = "*"

        elif principal == "owner":
            # Placeholder until canonical user IDs are supported
            aws_principal = "*"

        else:
            aws_principal = {
                "AWS": principal
            }

        # --------------------------------------------------
        # Actions
        # --------------------------------------------------
        actions = []

        for action in stmt.get("actions", []):

            if action not in VALID_ACTIONS:
                continue

            if action.startswith("s3:"):
                actions.append(action)
            else:
                actions.append(f"s3:{action}")

        if not actions:
            continue

        # --------------------------------------------------
        # Resources
        # --------------------------------------------------
        resources = []

        for resource in stmt.get("resources", []):

            resource_type = resource.get("type")
            value = resource.get("value", "").strip()

            if resource_type == "bucket":

                resources.append(
                    f"arn:aws:s3:::{bucket}"
                )

            elif resource_type == "bucket-objects":

                resources.append(
                    f"arn:aws:s3:::{bucket}/*"
                )

            elif resource_type == "prefix":

                if value:
                    value = value.rstrip("/")

                    resources.append(
                        f"arn:aws:s3:::{bucket}/{value}/*"
                    )

            elif resource_type == "object":

                if value:
                    resources.append(
                        f"arn:aws:s3:::{bucket}/{value}"
                    )

        if not resources:
            continue

        # --------------------------------------------------
        # Conditions
        # --------------------------------------------------
        condition = {}

        ui_conditions = stmt.get("conditions", {})

        if ui_conditions.get("secureTransport"):

            condition["Bool"] = {
                "aws:SecureTransport": "true"
            }

        if ui_conditions.get("sourceIp"):

            condition["IpAddress"] = {
                "aws:SourceIp": ui_conditions["sourceIp"]
            }

        if ui_conditions.get("dateAfter"):

            condition.setdefault(
                "DateGreaterThan",
                {}
            )["aws:CurrentTime"] = ui_conditions["dateAfter"]

        if ui_conditions.get("dateBefore"):

            condition.setdefault(
                "DateLessThan",
                {}
            )["aws:CurrentTime"] = ui_conditions["dateBefore"]

        # --------------------------------------------------
        # Build Statement
        # --------------------------------------------------
        aws_statement = {
            "Sid": sid,
            "Effect": stmt.get("effect", "Allow"),
            "Principal": aws_principal,
            "Action": actions,
            "Resource": resources,
        }

        if condition:
            aws_statement["Condition"] = condition

        aws_policy["Statement"].append(aws_statement)

    return aws_policy

def convert_aws_policy_to_ui(aws_policy: dict) -> dict:
    """
    Convert an AWS S3 bucket policy into the frontend editor model.
    """

    if not aws_policy:
        return {
            "version": "2012-10-17",
            "statements": []
        }

    ui_policy = {
        "version": aws_policy.get("Version", "2012-10-17"),
        "statements": []
    }

    statements = aws_policy.get("Statement", [])

    if isinstance(statements, dict):
        statements = [statements]

    for index, statement in enumerate(statements, start=1):

        ####################################################
        # SID
        ####################################################

        sid = statement.get("Sid")

        if not sid:
            sid = f"Statement{index}"

        ####################################################
        # Principal
        ####################################################

        principal = statement.get("Principal", "*")

        if principal == "*":
            principal = "*"

        elif isinstance(principal, dict):

            if "AWS" in principal:
                principal = principal["AWS"]
            else:
                principal = "*"

        else:
            principal = "*"

        ####################################################
        # Actions
        ####################################################

        actions = statement.get("Action", [])

        if isinstance(actions, str):
            actions = [actions]

        ui_actions = []

        for action in actions:

            if action.startswith("s3:"):
                ui_actions.append(action[3:])
            else:
                ui_actions.append(action)

        ####################################################
        # Resources
        ####################################################

        resources = []

        raw_resources = statement.get("Resource", [])

        if isinstance(raw_resources, str):
            raw_resources = [raw_resources]

        for arn in raw_resources:

            if not arn.startswith("arn:aws:s3:::"):
                continue

            path = arn.replace("arn:aws:s3:::", "", 1)

            # bucket only
            if "/" not in path:

                resources.append({
                    "type": "bucket",
                    "value": ""
                })

                continue

            key = path.split("/", 1)[1]

            # bucket/*
            if key == "*":

                resources.append({
                    "type": "bucket-objects",
                    "value": ""
                })

            # prefix/*
            elif key.endswith("/*"):

                resources.append({
                    "type": "prefix",
                    "value": key[:-2]
                })

            # single object
            else:

                resources.append({
                    "type": "object",
                    "value": key
                })

        if not resources:

            resources.append({
                "type": "bucket-objects",
                "value": ""
            })

        ####################################################
        # Conditions
        ####################################################

        conditions = {
            "secureTransport": False,
            "sourceIp": "",
            "dateAfter": "",
            "dateBefore": ""
        }

        condition = statement.get("Condition", {})

        ####################################################
        # Bool
        ####################################################

        secure = (
            condition
            .get("Bool", {})
            .get("aws:SecureTransport")
        )

        conditions["secureTransport"] = (
            secure is True or
            secure == "true"
        )

        ####################################################
        # IP
        ####################################################

        conditions["sourceIp"] = (
            condition
            .get("IpAddress", {})
            .get("aws:SourceIp", "")
        )

        ####################################################
        # Dates
        ####################################################

        conditions["dateAfter"] = (
            condition
            .get("DateGreaterThan", {})
            .get("aws:CurrentTime", "")
        )

        conditions["dateBefore"] = (
            condition
            .get("DateLessThan", {})
            .get("aws:CurrentTime", "")
        )

        ####################################################
        # Build UI Statement
        ####################################################

        ui_policy["statements"].append({

            "id": sid.lower().replace(" ", "-"),

            "sid": sid,

            "description": "",

            "enabled": True,

            "principal": principal,

            "effect": statement.get(
                "Effect",
                "Allow"
            ),

            "actions": ui_actions,

            "resources": resources,

            "conditions": conditions
        })

    return ui_policy
