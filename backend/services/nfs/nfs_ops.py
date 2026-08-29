"""
Ceph NFS service helpers.

This module manages Ceph NFS clusters and RGW-backed NFS exports:
creating clusters, listing cluster metadata, creating exports for RGW
buckets, inspecting export details, and removing exports without
touching the underlying bucket.
"""

import json
from typing import Dict, Any

from core.logger import logger
from core.activity import log_activity
from services.cluster.ceph_ops import run_ceph_cmd

def create_nfs_cluster(cluster_id: str, host: str) -> Dict[str, Any]:
    """
    Create and deploy a Ceph NFS cluster on the specified host.

    Args:
        cluster_id: Ceph NFS cluster/service ID.
        host: Ceph host where NFS-Ganesha should run.

    Returns:
        Result dictionary describing the operation.
    """
    try:
        cluster_id = cluster_id.strip()
        host = host.strip()

        if not cluster_id:
            return {"error": "NFS cluster ID is required"}

        if not host:
            return {"error": "NFS host is required"}

        cmd = (
            f"ceph nfs cluster create "
            f"{cluster_id} {host}"
        )

        stdout, stderr, code = run_ceph_cmd(cmd)

        if code != 0:
            return {
                "error": stderr or stdout or "Failed to create NFS cluster"
            }

        log_activity(
            "CREATE NFS CLUSTER",
            cluster_id,
            "success",
            f"NFS cluster deployed on {host}"
        )

        return {
            "message": f"NFS cluster '{cluster_id}' created successfully",
            "cluster": cluster_id,
            "host": host,
        }

    except Exception as e:
        logger.exception(
            f"create_nfs_cluster error for {cluster_id}"
        )

        log_activity(
            "CREATE NFS CLUSTER",
            cluster_id,
            "error",
            str(e)
        )

        return {"error": str(e)}

def list_nfs_clusters() -> Dict[str, Any]:
    """List all Ceph-managed NFS clusters."""
    try:
        stdout, stderr, code = run_ceph_cmd(
            "ceph nfs cluster ls --format json"
        )

        if code != 0:
            return {"error": stderr or "Failed to list NFS clusters"}

        clusters = json.loads(stdout) if stdout else []

        return {
            "clusters": clusters
        }

    except Exception as e:
        logger.exception("list_nfs_clusters error")
        return {"error": str(e)}


def get_nfs_cluster_info(cluster_id: str) -> Dict[str, Any]:
    """Get endpoint information for an NFS cluster."""
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"ceph nfs cluster info {cluster_id} --format json"
        )

        if code != 0:
            return {"error": stderr or "Failed to get NFS cluster info"}

        data = json.loads(stdout) if stdout else {}

        return data

    except Exception as e:
        logger.exception(
            f"get_nfs_cluster_info error for {cluster_id}"
        )
        return {"error": str(e)}


def list_nfs_exports(cluster_id: str) -> Dict[str, Any]:
    """List all exports belonging to an NFS cluster."""
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"ceph nfs export ls {cluster_id}"
        )

        if code != 0:
            return {"error": stderr or "Failed to list NFS exports"}

        exports = json.loads(stdout) if stdout else []

        return {
            "cluster": cluster_id,
            "exports": exports
        }

    except Exception as e:
        logger.exception(
            f"list_nfs_exports error for {cluster_id}"
        )
        return {"error": str(e)}


def get_nfs_export(
    cluster_id: str,
    pseudo_path: str
) -> Dict[str, Any]:
    """Get detailed information about an NFS export."""
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"ceph nfs export info "
            f"{cluster_id} "
            f"{pseudo_path} "
            f"--format json"
        )

        if code != 0:
            return {"error": stderr or "Failed to get NFS export info"}

        if not stdout:
            return {"error": "NFS export info returned no data"}

        try:
            data = json.loads(stdout)
        except json.JSONDecodeError as e:
            logger.error(
                f"get_nfs_export: failed to parse JSON for "
                f"{cluster_id}:{pseudo_path}. Raw output: {stdout!r}"
            )
            return {"error": f"Invalid JSON from Ceph: {e}"}

        return data

    except Exception as e:
        logger.exception(
            f"get_nfs_export error for "
            f"{cluster_id}:{pseudo_path}"
        )
        return {"error": str(e)}


def create_rgw_export(
    cluster_id: str,
    pseudo_path: str,
    bucket: str
) -> Dict[str, Any]:
    """
    Export an RGW bucket through NFS.

    Example:
        cluster_id = aikyastor-nfs
        pseudo_path = /meow
        bucket = meow
    """

    try:
        if not pseudo_path.startswith("/"):
            pseudo_path = "/" + pseudo_path

        command = (
            "ceph nfs export create rgw "
            f"--cluster-id={cluster_id} "
            f"--pseudo-path={pseudo_path} "
            f"--bucket={bucket}"
        )

        stdout, stderr, code = run_ceph_cmd(command)

        if code != 0:
            log_activity(
                "CREATE NFS EXPORT",
                bucket,
                "error",
                stderr
            )

            return {
                "error": stderr or "Failed to create NFS export"
            }

        result = json.loads(stdout) if stdout else {}

        log_activity(
            "CREATE NFS EXPORT",
            bucket,
            "success",
            f"NFS path: {pseudo_path}"
        )

        return result

    except Exception as e:
        logger.exception(
            f"create_rgw_export error for {bucket}"
        )

        log_activity(
            "CREATE NFS EXPORT",
            bucket,
            "error",
            str(e)
        )

        return {"error": str(e)}


def delete_nfs_export(
    cluster_id: str,
    pseudo_path: str
) -> Dict[str, Any]:
    """Delete an NFS export."""

    try:
        stdout, stderr, code = run_ceph_cmd(
            f"ceph nfs export rm "
            f"{cluster_id} "
            f"{pseudo_path}"
        )

        if code != 0:
            log_activity(
                "DELETE NFS EXPORT",
                pseudo_path,
                "error",
                stderr
            )

            return {
                "error": stderr or "Failed to delete NFS export"
            }

        log_activity(
            "DELETE NFS EXPORT",
            pseudo_path,
            "success",
            f"Cluster: {cluster_id}"
        )

        return {
            "message": (
                f"NFS export '{pseudo_path}' "
                f"deleted successfully"
            )
        }

    except Exception as e:
        logger.exception(
            f"delete_nfs_export error for "
            f"{cluster_id}:{pseudo_path}"
        )

        log_activity(
            "DELETE NFS EXPORT",
            pseudo_path,
            "error",
            str(e)
        )

        return {"error": str(e)}
