import { req } from "./client";

export const NFSAPI = {
  /**
   * List all Ceph NFS clusters.
   */
  listClusters() {
    return req("/nfs/clusters");
  },

  /**
   * Get endpoint information for an NFS cluster.
   */
  clusterInfo(clusterId) {
    return req(
      `/nfs/clusters/${encodeURIComponent(clusterId)}`
    );
  },

  /**
   * List exports belonging to an NFS cluster.
   */
  listExports(clusterId) {
    return req(
      `/nfs/clusters/${encodeURIComponent(clusterId)}/exports`
    );
  },

  /**
   * Get details about a specific NFS export.
   */
  exportInfo(clusterId, pseudoPath) {
    return req(
      `/nfs/clusters/${encodeURIComponent(clusterId)}/exports/${encodeURIComponent(
        pseudoPath.replace(/^\/+/, "")
      )}`
    );
  },

  /**
   * Expose an RGW bucket through NFS.
   */
  createExport(clusterId, pseudoPath, bucket) {
    return req("/nfs/exports", {
      method: "POST",
      body: JSON.stringify({
        cluster_id: clusterId,
        pseudo_path: pseudoPath,
        bucket,
      }),
    });
  },

  /**
   * Remove an NFS export.
   *
   * This does NOT delete the underlying RGW bucket.
   */
  deleteExport(clusterId, pseudoPath) {
    return req(
      `/nfs/clusters/${encodeURIComponent(clusterId)}/exports/${encodeURIComponent(
        pseudoPath.replace(/^\/+/, "")
      )}`,
      {
        method: "DELETE",
      }
    );
  },
};