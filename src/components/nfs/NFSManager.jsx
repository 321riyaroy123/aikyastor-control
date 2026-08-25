import { useCallback, useEffect, useState } from "react";
import { NFSAPI } from "../../api/nfs";
import { C, styles } from "../../styles/theme";
import { ObjectAPI } from "../../api/objectStorage";

export default function NFSManager({ toast }) {
  const [cluster, setCluster] = useState(null);
  const [endpoint, setEndpoint] = useState(null);
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExport, setSelectedExport] = useState(null);
  const [buckets, setBuckets] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newExport, setNewExport] = useState({ bucket: "", pseudoPath: "", });
  const [newCluster, setNewCluster] = useState({ clusterId: "", host: "", });
  const [showCreateCluster, setShowCreateCluster] = useState(false);
  const [creatingCluster, setCreatingCluster] = useState(false);

  const loadNFS = useCallback(async () => {
    setLoading(true);

    try {
      const clusterResult = await NFSAPI.listClusters();
      const clusters = clusterResult.clusters || [];

      if (!clusters.length) {
        setCluster(null);
        setEndpoint(null);
        setExports([]);
        return;
      }

      const activeCluster = clusters[0];
      setCluster(activeCluster);

      const [infoResult, exportsResult, bucketResult] = await Promise.all([
        NFSAPI.clusterInfo(activeCluster),
        NFSAPI.listExports(activeCluster),
        ObjectAPI.buckets(),
      ]);

      const info = infoResult[activeCluster];
      const backend = info?.backend?.[0];

      setEndpoint(
        backend
          ? {
              hostname: backend.hostname,
              ip: backend.ip,
              port: backend.port,
            }
          : null
      );

      setExports(exportsResult.exports || []);
      setBuckets(bucketResult.buckets || []);
    } catch (err) {
      toast(err.message, "error");
      setCluster(null);
      setEndpoint(null);
      setExports([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadNFS();
  }, [loadNFS]);

  const viewExport = async (pseudoPath) => {
    try {
      const result = await NFSAPI.exportInfo(cluster, pseudoPath);
      setSelectedExport(result);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const createCluster = async () => {
    if (!newCluster.clusterId.trim()) {
        toast("Enter an NFS cluster ID", "error");
        return;
    }

    if (!newCluster.host.trim()) {
        toast("Enter a Ceph host", "error");
        return;
    }

    try {
        setCreatingCluster(true);

        await NFSAPI.createCluster(
        newCluster.clusterId.trim(),
        newCluster.host.trim()
        );

        toast(
        `NFS cluster '${newCluster.clusterId.trim()}' created successfully`,
        "success"
        );

        setShowCreateCluster(false);

        setNewCluster({
        clusterId: "",
        host: "",
        });

        await loadNFS();
    } catch (err) {
        toast(err.message, "error");
    } finally {
        setCreatingCluster(false);
    }
    };

  const createExport = async () => {
    if (!newExport.bucket) {
      toast("Select an RGW bucket", "error");
      return;
    }

    if (!newExport.pseudoPath) {
      toast("Enter an NFS path", "error");
      return;
    }

    try {
      setCreating(true);

      await NFSAPI.createExport(
        cluster,
        newExport.pseudoPath,
        newExport.bucket
      );

      toast(
        `NFS export '${newExport.pseudoPath}' created successfully`,
        "success"
      );

      setShowCreate(false);

      setNewExport({
        bucket: "",
        pseudoPath: "",
      });

      await loadNFS();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const copyMountCommand = async () => {
    if (!endpoint || !selectedExport) return;

    const command =
      `sudo mount -t nfs -o nfsvers=4 ` +
      `${endpoint.ip}:${selectedExport.pseudo} ` +
      `/mnt/${selectedExport.path}`;

    try {
      await navigator.clipboard.writeText(command);
      toast("Mount command copied to clipboard", "success");
    } catch (err) {
      toast("Unable to copy mount command", "error");
    }
  };

  const deleteExport = async (pseudoPath) => {
    if (
      !confirm(
        `Remove NFS export "${pseudoPath}"?\n\nThe underlying RGW bucket will NOT be deleted.`
      )
    ) {
      return;
    }

    try {
      await NFSAPI.deleteExport(cluster, pseudoPath);

      toast("NFS export deleted successfully", "success");
      setSelectedExport(null);
      await loadNFS();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (loading) {
    return (
      <div style={styles.bucketWorkspaceContent}>
        <div style={{ color: C.muted }}>
          Loading NFS configuration...
        </div>
      </div>
    );
  }

  if (!cluster) {
    return (
        <div style={styles.bucketWorkspaceContent}>
        <div
            style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            marginBottom: "1.5rem",
            }}
        >
            <div>
            <h2 style={styles.pageHeaderTitle}>NFS</h2>
            <p style={styles.pageHeaderSubtitle}>
                Network access to RGW object-storage buckets through NFS.
            </p>
            </div>

            <button
            type="button"
            style={{
                ...styles.btn,
                ...styles.btnPrimary,
            }}
            onClick={() => setShowCreateCluster(true)}
            >
            + Create NFS Cluster
            </button>
        </div>

        <div style={styles.workspaceCard}>
            <div style={styles.workspaceCardTitle}>
            NFS Infrastructure
            </div>

            <div
            style={{
                color: C.muted,
                fontSize: ".85rem",
                lineHeight: 1.6,
            }}
            >
            No NFS cluster is currently configured.
            <br />
            Create an NFS cluster to expose RGW object-storage
            buckets through NFS.
            </div>
        </div>

        {showCreateCluster && (
            <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.65)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={() => setShowCreateCluster(false)}
            >
            <div
                style={{
                ...styles.workspaceCard,
                width: "min(520px, 90vw)",
                boxShadow: "0 20px 60px rgba(0,0,0,.4)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1.25rem",
                }}
                >
                <div style={styles.workspaceCardTitle}>
                    Create NFS Cluster
                </div>

                <button
                    type="button"
                    style={{
                    ...styles.btn,
                    ...styles.btnGhost,
                    ...styles.btnSm,
                    }}
                    onClick={() => setShowCreateCluster(false)}
                >
                    Close
                </button>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                <label
                    style={{
                    display: "block",
                    marginBottom: ".4rem",
                    color: C.text,
                    fontSize: ".8rem",
                    fontWeight: 700,
                    }}
                >
                    Cluster ID
                </label>

                <input
                    type="text"
                    value={newCluster.clusterId}
                    onChange={(e) =>
                    setNewCluster((prev) => ({
                        ...prev,
                        clusterId: e.target.value,
                    }))
                    }
                    placeholder="aikyastor-nfs"
                    style={styles.formInput}
                    disabled={creatingCluster}
                />
                </div>

                <div style={{ marginBottom: "1.25rem" }}>
                <label
                    style={{
                    display: "block",
                    marginBottom: ".4rem",
                    color: C.text,
                    fontSize: ".8rem",
                    fontWeight: 700,
                    }}
                >
                    Ceph Host
                </label>

                <input
                    type="text"
                    value={newCluster.host}
                    onChange={(e) =>
                    setNewCluster((prev) => ({
                        ...prev,
                        host: e.target.value,
                    }))
                    }
                    placeholder="localhost.localdomain"
                    style={styles.formInput}
                    disabled={creatingCluster}
                />
                </div>

                <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: ".6rem",
                }}
                >
                <button
                    type="button"
                    style={{
                    ...styles.btn,
                    ...styles.btnGhost,
                    }}
                    onClick={() => setShowCreateCluster(false)}
                    disabled={creatingCluster}
                >
                    Cancel
                </button>

                <button
                    type="button"
                    style={{
                    ...styles.btn,
                    ...styles.btnPrimary,
                    }}
                    onClick={createCluster}
                    disabled={creatingCluster}
                >
                    {creatingCluster
                    ? "Creating..."
                    : "Create NFS Cluster"}
                </button>
                </div>
            </div>
            </div>
        )}
        </div>
    );
    }

  return (
    <div style={styles.bucketWorkspaceContent}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h2 style={styles.pageHeaderTitle}>NFS</h2>
          <p style={styles.pageHeaderSubtitle}>
            Network access to RGW object-storage buckets through NFS.
          </p>
        </div>

        <button
          type="button"
          style={{ ...styles.btn, ...styles.btnGhost }}
          onClick={loadNFS}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Information cards */}
      <div style={styles.bucketInfoGrid}>
        <div style={styles.bucketInfoCard}>
          <div>
            <span style={styles.bucketInfoLabel}>
              NFS Cluster
            </span>

            <span style={styles.bucketInfoValue}>
              {cluster}
            </span>
          </div>
        </div>

        <div style={styles.bucketInfoCard}>
          <div>
            <span style={styles.bucketInfoLabel}>
              Endpoint
            </span>

            <span style={styles.bucketInfoValue}>
              {endpoint
                ? `${endpoint.ip}:${endpoint.port}`
                : "Unavailable"}
            </span>
          </div>
        </div>

        <div style={styles.bucketInfoCard}>
          <div>
            <span style={styles.bucketInfoLabel}>
              Exports
            </span>

            <span style={styles.bucketInfoValue}>
              {exports.length}
            </span>
          </div>
        </div>

        <div style={styles.bucketInfoCard}>
          <div>
            <span style={styles.bucketInfoLabel}>
              Protocol
            </span>

            <span style={styles.bucketInfoValue}>
              NFSv4
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: "1.5rem" }} />

      {/* Export panel */}
      <div style={styles.bucketPanel}>
        <div style={styles.bucketToolbar}>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontFamily: "'Space Mono',monospace",
                fontSize: ".8rem",
                fontWeight: 700,
                color: C.text,
              }}
            >
              NFS EXPORTS
            </span>
          </div>

          <button
            type="button"
            style={{
              ...styles.btn,
              ...styles.btnPrimary,
            }}
            onClick={() => setShowCreate(true)}
          >
            + Create Export
          </button>
        </div>

        <div style={styles.bucketWorkspaceContent}>
          {!exports.length ? (
            <div style={styles.objectEmpty}>
              No NFS exports configured.
            </div>
          ) : (
            <div style={styles.objectTableWrapper}>
              <table style={styles.objectTable}>
                <thead>
                  <tr style={styles.objectTableHeadRow}>
                    <th style={styles.objectTableTh}>
                      NFS Path
                    </th>

                    <th style={styles.objectTableTh}>
                      Backend
                    </th>

                    <th style={styles.objectTableTh}>
                      Protocol
                    </th>

                    <th style={styles.objectTableTh}>
                      Access
                    </th>

                    <th style={styles.objectTableTh}>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {exports.map((pseudoPath) => (
                    <tr key={pseudoPath}>
                      <td style={styles.objectTableTd}>
                        <span style={styles.objectName}>
                          <span style={{ color: C.accent }}>
                            /
                          </span>
                          {pseudoPath.replace(/^\/+/, "")}
                        </span>
                      </td>

                      <td style={styles.objectTableTd}>
                        RGW
                      </td>

                      <td style={styles.objectTableTd}>
                        <span
                          style={{
                            ...styles.bucketBadge,
                            ...styles.bucketBadgeInfo,
                          }}
                        >
                          NFSv4
                        </span>
                      </td>

                      <td style={styles.objectTableTd}>
                        <span
                          style={{
                            ...styles.bucketBadge,
                            ...styles.bucketBadgeSuccess,
                          }}
                        >
                          RW
                        </span>
                      </td>

                      <td style={styles.objectTableTd}>
                        <div style={styles.objectActions}>
                          <button
                            type="button"
                            style={{
                              ...styles.btn,
                              ...styles.btnBlue,
                              ...styles.btnSm,
                            }}
                            onClick={() =>
                              viewExport(pseudoPath)
                            }
                          >
                            Details
                          </button>

                          <button
                            type="button"
                            style={{
                              ...styles.btn,
                              ...styles.btnDanger,
                              ...styles.btnSm,
                            }}
                            onClick={() =>
                              deleteExport(pseudoPath)
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Export details */}
      {selectedExport && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={styles.workspaceCard}>
            <div style={styles.workspaceCardTitle}>
              Export Details
            </div>

            <div style={styles.policySummaryGrid}>
              {selectedExport.pseudo && (
                <div style={styles.policySummaryRow}>
                  <span style={styles.policySummaryLabel}>
                    NFS Path
                  </span>
                  <span style={styles.policySummaryValue}>
                    {selectedExport.pseudo}
                  </span>
                </div>
              )}

              {selectedExport.path && (
                <div style={styles.policySummaryRow}>
                  <span style={styles.policySummaryLabel}>
                    Bucket
                  </span>
                  <span style={styles.policySummaryValue}>
                    {selectedExport.path}
                  </span>
                </div>
              )}

              {selectedExport.access_type && (
                <div style={styles.policySummaryRow}>
                  <span style={styles.policySummaryLabel}>
                    Access
                  </span>
                  <span style={styles.policySummaryValue}>
                    {selectedExport.access_type}
                  </span>
                </div>
              )}

              <div style={styles.policySummaryRow}>
                <span style={styles.policySummaryLabel}>
                  Protocol
                </span>
                <span style={styles.policySummaryValue}>
                  NFSv{selectedExport.protocols?.[0] || 4}
                </span>
              </div>

              <div style={styles.policySummaryRow}>
                <span style={styles.policySummaryLabel}>
                  Transport
                </span>
                <span style={styles.policySummaryValue}>
                  {selectedExport.transports?.join(", ") || "TCP"}
                </span>
              </div>
            </div>

            <div style={{ marginTop: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: ".75rem",
                  marginBottom: ".5rem",
                }}
              >
                <div style={styles.policySectionLabel}>
                  Mount Command
                </div>

                <button
                  type="button"
                  style={{
                    ...styles.btn,
                    ...styles.btnGhost,
                    ...styles.btnSm,
                  }}
                  onClick={copyMountCommand}
                  disabled={!endpoint}
                >
                  Copy
                </button>
              </div>

              {endpoint && selectedExport ? (
                <pre style={styles.policyJson}>
                  {`sudo mount -t nfs -o nfsvers=4 ${endpoint.ip}:${selectedExport.pseudo} /mnt/${selectedExport.path}`}
                </pre>
              ) : (
                <div style={{ color: C.muted, fontSize: ".85rem" }}>
                  Endpoint information not available
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            style={{
              ...styles.workspaceCard,
              width: "min(520px, 90vw)",
              boxShadow: "0 20px 60px rgba(0,0,0,.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.workspaceCardTitle}>
              Create NFS Export
            </div>

            <div
              style={{
                color: C.muted,
                fontSize: ".82rem",
                marginBottom: "1.25rem",
              }}
            >
              Expose an existing RGW bucket through NFS.
            </div>

            {/* Bucket */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: ".72rem",
                  fontWeight: 700,
                  marginBottom: ".45rem",
                  color: C.text,
                }}
              >
                RGW BUCKET
              </label>

              <select
                value={newExport.bucket}
                onChange={(e) => {
                  const bucket = e.target.value;

                  setNewExport({
                    bucket,
                    pseudoPath: bucket ? `/${bucket}` : "",
                  });
                }}
                style={{
                  width: "100%",
                  padding: ".65rem .75rem",
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  color: C.text,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <option value="">Select bucket...</option>

                {buckets.map((bucket) => (
                  <option
                    key={bucket.name}
                    value={bucket.name}
                  >
                    {bucket.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pseudo path */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: ".72rem",
                  fontWeight: 700,
                  marginBottom: ".45rem",
                  color: C.text,
                }}
              >
                NFS PATH
              </label>

              <input
                type="text"
                value={newExport.pseudoPath}
                onChange={(e) =>
                  setNewExport((current) => ({
                    ...current,
                    pseudoPath: e.target.value,
                  }))
                }
                placeholder="/meow"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: ".65rem .75rem",
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  color: C.text,
                  fontFamily: "'Space Mono', monospace",
                }}
              />

              <div
                style={{
                  marginTop: ".4rem",
                  color: C.muted,
                  fontSize: ".72rem",
                }}
              >
                This is the path users will mount through NFS.
              </div>
            </div>

            {/* Access */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: ".72rem",
                  fontWeight: 700,
                  marginBottom: ".45rem",
                  color: C.text,
                }}
              >
                ACCESS
              </label>

              <div
                style={{
                  padding: ".65rem .75rem",
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  color: C.text,
                }}
              >
                Read / Write
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: ".6rem",
              }}
            >
              <button
                type="button"
                style={{
                  ...styles.btn,
                  ...styles.btnGhost,
                }}
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </button>

              <button
                type="button"
                style={{
                  ...styles.btn,
                  ...styles.btnPrimary,
                }}
                onClick={createExport}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create Export"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}