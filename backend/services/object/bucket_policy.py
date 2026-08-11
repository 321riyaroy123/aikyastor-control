"""
services/object/bucket_policy.py

AWS S3 Compatible Bucket Policy Operations

Responsibilities
----------------
Manage AWS S3-compatible bucket policies for Ceph RGW.

Unlike lifecycle policies, bucket policies control WHO can access a bucket
and WHAT actions they are allowed to perform.

Functions
---------
- get_bucket_policy()
- put_bucket_policy()
- delete_bucket_policy()

Future
------
- validate_bucket_policy()
- summarize_bucket_policy()

Used By
-------
routes/object_routes.py
"""

import json

from botocore.exceptions import ClientError

from core.logger import logger
from core.activity import log_activity

from services.object.object_storage import get_s3_client
from services.object.bucket_policy_converter import convert_ui_bucket_policy_to_aws, convert_aws_bucket_policy_to_ui

def get_bucket_policy(bucket: str):
    """
    Retrieve the AWS S3 bucket policy attached to a bucket.
    """

    try:
        s3 = get_s3_client()
        response = s3.get_bucket_policy(Bucket=bucket)
        aws_policy = json.loads(response["Policy"])

        return {
            "bucket": bucket,
            "policy": convert_aws_bucket_policy_to_ui(aws_policy)
        }

    except ClientError as e:
        code = e.response["Error"]["Code"]

        # This is NOT an error.
        # It simply means the bucket has no policy yet.
        if code in ("NoSuchBucketPolicy",
            "NoSuchPolicy"
        ):

            return {
                "bucket": bucket,
                "policy": None
            }

        logger.exception(
            f"Failed to retrieve bucket policy for '{bucket}'"
        )

        return {
            "error": e.response["Error"]["Message"]
        }

    except Exception as e:

        logger.exception(
            f"Unexpected error retrieving bucket policy for '{bucket}'"
        )

        return {
            "error": str(e)
        }
    
def put_bucket_policy(bucket: str, policy: dict):
    """
    Attach or replace an AWS S3 compatible bucket policy.
    """

    try:
        s3 = get_s3_client()

        # Upload policy to RGW
        aws_policy = convert_ui_bucket_policy_to_aws(bucket, policy)

        logger.info(
            "Applying AWS bucket policy:\n%s",
            json.dumps(aws_policy, indent=2)
        )


        policy_json = json.dumps(aws_policy)

        logger.info("Policy type: %s", type(policy_json))
        logger.info("Policy repr: %r", policy_json)
        logger.info("Policy bytes: %s", policy_json.encode("utf-8"))

        s3.put_bucket_policy(
            Bucket=bucket,
            Policy=policy_json,
        )

        log_activity(
            "BUCKET POLICY",
            bucket,
            "success",
            "Bucket policy applied successfully"
        )

        return {
            "message": f"Bucket policy applied to '{bucket}'.",
            "bucket": bucket,
            "policy": policy,
            "aws_policy": aws_policy
        }

    except ClientError as e:
        logger.exception(
            f"Failed to apply bucket policy for '{bucket}'"
        )

        return {
            "error": e.response["Error"]["Message"]
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error applying bucket policy for '{bucket}'"
        )

        return {
            "error": str(e)
        }
    
def delete_bucket_policy(bucket: str):
    """
    Remove the bucket policy from a bucket.
    """

    try:
        s3 = get_s3_client()

        s3.delete_bucket_policy(
            Bucket=bucket
        )

        log_activity(
            "DELETE BUCKET POLICY",
            bucket,
            "success",
            "Bucket policy removed"
        )

        return {
            "message": f"Bucket policy removed from '{bucket}'.",
            "bucket": bucket
        }

    except ClientError as e:
        code = e.response["Error"]["Code"]

        # Treat "no policy" as a valid state.
        if code in ("NoSuchBucketPolicy", "NoSuchPolicy"):
            return {
                "message": f"Bucket '{bucket}' has no policy assigned.",
                "bucket": bucket
            }

        logger.exception(
            f"Failed to delete bucket policy for '{bucket}'"
        )

        return {
            "error": e.response["Error"]["Message"]
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error deleting bucket policy for '{bucket}'"
        )

        return {
            "error": str(e)
        }
