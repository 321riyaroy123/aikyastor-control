"""
ceph_ops.py - Ceph cluster operations
Handles stats, health checks, and cluster queries
"""

import json
import subprocess
import os
from typing import Dict, Any, Tuple
from logger import logger
from config import CMD_TIMEOUT, CEPH_CONF
from activity import log_activity

def run_ceph_cmd(cmd: str, timeout: int = CMD_TIMEOUT) -> Tuple[str, str, int]:
    """
    Execute a ceph command
    
    Args:
        cmd: Command to execute
        timeout: Command timeout in seconds
        
    Returns:
        Tuple of (stdout, stderr, return_code)
    """
    env = os.environ.copy()
    env["CEPH_CONF"] = CEPH_CONF
    
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            env=env,
            timeout=timeout
        )
        logger.info(f"CMD: {cmd[:80]} | RC: {result.returncode}")
        if result.stderr:
            logger.warning(f"STDERR: {result.stderr[:200]}")
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except subprocess.TimeoutExpired:
        logger.error(f"CMD TIMEOUT: {cmd}")
        return "", "Command timed out", 1
    except Exception as e:
        logger.error(f"CMD ERROR: {str(e)}")
        return "", str(e), 1

def get_cluster_stats() -> Dict[str, Any]:
    """
    Get cluster statistics from 'ceph df'
    
    Returns:
        Dictionary with storage stats
    """
    try:
        stdout, stderr, code = run_ceph_cmd("ceph df --format json")
        if code != 0 or not stdout:
            logger.error(f"ceph df failed: {stderr}")
            return {
                "total_bytes": 0,
                "total_used_raw": 0,
                "total_avail": 0,
                "error": stderr
            }
        
        data = json.loads(stdout)
        stats = data.get("stats", {})
        return {
            "total_bytes": stats.get("total_bytes", 0),
            "total_used_raw": stats.get("total_used_raw_bytes", 0),
            "total_avail": stats.get("total_avail_bytes", 0),
        }
    except Exception as e:
        logger.exception("get_cluster_stats error")
        return {"error": str(e)}

def get_cluster_health() -> Dict[str, Any]:
    """
    Get cluster health status from 'ceph health'
    
    Returns:
        Dictionary with health status and checks
    """
    try:
        stdout, stderr, code = run_ceph_cmd("ceph health --format json")
        if code != 0 or not stdout:
            return {"status": "UNKNOWN", "checks": {}}
        
        data = json.loads(stdout)
        return {
            "status": data.get("status", "UNKNOWN"),
            "checks": data.get("checks", {})
        }
    except Exception as e:
        logger.exception("get_cluster_health error")
        return {"status": "UNKNOWN", "error": str(e)}

def get_ceph_version() -> str:
    """
    Get Ceph version
    
    Returns:
        Version string
    """
    try:
        stdout, stderr, code = run_ceph_cmd("ceph --version")
        return stdout if code == 0 else "unknown"
    except Exception as e:
        logger.error(f"Failed to get ceph version: {str(e)}")
        return "unknown"
