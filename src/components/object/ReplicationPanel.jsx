import { C } from "../../styles/theme";
import Button from "../common/Button";
import { useState } from "react";

function StatusBadge({ status }) {
  const normalized = (status || "unknown").toLowerCase();

  const config = {
    caught_up: {
      label: "Caught Up",
      color: "#22c55e",
      background: "rgba(34,197,94,.12)",
      border: "rgba(34,197,94,.3)",
    },
    active: {
      label: "Active",
      color: "#22c55e",
      background: "rgba(34,197,94,.12)",
      border: "rgba(34,197,94,.3)",
    },
    replicating: {
      label: "Replicating",
      color: C.accent,
      background: "rgba(249,115,22,.12)",
      border: "rgba(249,115,22,.3)",
    },
    replicated: {
      label: "Replicated",
      color: "#22c55e",
      background: "rgba(34,197,94,.12)",
      border: "rgba(34,197,94,.3)",
    },
    mismatch: {
      label: "Object Mismatch",
      color: "#eab308",
      background: "rgba(234,179,8,.12)",
      border: "rgba(234,179,8,.3)",
    },
    missing_secondary: {
      label: "Missing on Secondary",
      color: "#ef4444",
      background: "rgba(239,68,68,.12)",
      border: "rgba(239,68,68,.3)",
    },
    unverified: {
      label: "Unverified",
      color: C.muted,
      background: "rgba(148,163,184,.12)",
      border: "rgba(148,163,184,.3)",
    },
    syncing: {
      label: "Syncing",
      color: "#eab308",
      background: "rgba(234,179,8,.12)",
      border: "rgba(234,179,8,.3)",
    },
    no_sync: {
      label: "Not Applicable",
      color: C.muted,
      background: "rgba(148,163,184,.12)",
      border: "rgba(148,163,184,.3)",
    },
    error: {
      label: "Error",
      color: "#ef4444",
      background: "rgba(239,68,68,.12)",
      border: "rgba(239,68,68,.3)",
    },
    unknown: {
      label: "Unknown",
      color: C.muted,
      background: "rgba(148,163,184,.12)",
      border: "rgba(148,163,184,.3)",
    },
  };

  const style = config[normalized] || config.unknown;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: ".35rem",
        padding: ".25rem .6rem",
        borderRadius: 4,
        fontSize: ".68rem",
        fontFamily: "'Space Mono', monospace",
        color: style.color,
        background: style.background,
        border: `1px solid ${style.border}`,
      }}
    >
      <span>●</span>
      {style.label}
    </span>
  );
}

function ZoneCard({ zone }) {
  if (!zone) return null;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          fontSize: ".65rem",
          fontFamily: "'Space Mono', monospace",
          color: C.muted,
          marginBottom: ".7rem",
          letterSpacing: ".08em",
        }}
      >
        {zone.role?.toUpperCase()}
      </div>

      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: ".9rem",
          color: C.text,
          marginBottom: ".45rem",
          wordBreak: "break-word",
        }}
      >
        {zone.name}
      </div>

      <div
        style={{
          fontSize: ".72rem",
          color: C.muted,
          marginBottom: ".8rem",
        }}
      >
        {zone.endpoints?.join(", ") || "No endpoint configured"}
      </div>

      <StatusBadge status={zone.status} />
    </div>
  );
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(
    Math.log(bytes) / Math.log(1024)
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 1
  )} ${units[index]}`;
}

export default function ReplicationPanel({
  status,
  buckets = [],
  loading = false,
  configuring = false,
  provisioning = false,
  onBack,
  onRefresh,
  onConfigure,
  onProvision,
}) {

  const [editing, setEditing] = useState(false);
  const [endpoint, setEndpoint] = useState(
    status?.secondary?.endpoints?.[0] || ""
   );
  const [readOnly, setReadOnly] = useState(false);
  const [showProvisioningForm, setShowProvisioningForm] = useState(false);
  const [secondaryHost, setSecondaryHost] = useState("");
  const [secondaryUser, setSecondaryUser] = useState("");
  const [secondaryZone, setSecondaryZone] = useState(
    status?.secondary?.name || "aikyastor-secondary"
  );
  const [secondaryEndpoint, setSecondaryEndpoint] = useState(
    status?.secondary?.endpoints?.[0] ||
    "http://192.168.56.111:7480"
  );
  const [secondaryPort, setSecondaryPort] = useState(7480);
  const [provisionReadOnly, setProvisionReadOnly] = useState(false);

  if (!status) {
      return (
          <div
              style={{
                  padding: "2rem",
                  color: C.muted,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: ".8rem",
              }}
          >
              Loading replication configuration...
          </div>
      );
  }

  if (!status?.enabled) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
          >
            ← Object Storage
          </Button>
        </div>

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "1.5rem",
            color: "#ef4444",
            fontSize: ".8rem",
          }}
        >
          Replication status is unavailable.
          {status?.error && (
            <div
              style={{
                marginTop: ".5rem",
                color: C.muted,
              }}
            >
              {status.error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const metadataStatus =
    status.sync?.metadata?.status || "unknown";

  const dataStatus =
    status.sync?.data?.status || "unknown";

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: ".75rem",
        }}
      >
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
          >
            ← Object Storage
          </Button>

          <div
            style={{
              marginTop: ".8rem",
              fontFamily: "'Space Mono', monospace",
              fontSize: "1rem",
              color: C.text,
            }}
          >
            ⇄ Replication
          </div>
        </div>

        <div
            style={{
                display: "flex",
                gap: ".5rem",
            }}
            >
              <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowProvisioningForm(true)}
                  disabled={provisioning || configuring}
              >
                  {provisioning
                      ? "Provisioning..."
                      : "Provision Secondary"}
              </Button>

                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setEditing(true)}
                    disabled={configuring}
                >
                    Configure Replication
                </Button>


            <Button
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                disabled={configuring}
            >
                ↻ Refresh
            </Button>
            </div>
      </div>

      {/* Realm */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: ".75rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: ".65rem",
              color: C.muted,
              fontFamily: "'Space Mono', monospace",
              marginBottom: ".35rem",
            }}
          >
            RGW REALM
          </div>

          <div
            style={{
              color: C.text,
              fontFamily: "'Space Mono', monospace",
              fontSize: ".9rem",
            }}
          >
            {status.realm?.name}
          </div>
        </div>

        <StatusBadge status="active" />
      </div>

      {editing && (
        <div
            style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "1.25rem",
            marginBottom: "1.5rem",
            }}
        >
            <div
            style={{
                fontSize: ".7rem",
                fontFamily: "'Space Mono', monospace",
                color: C.muted,
                letterSpacing: ".08em",
                marginBottom: "1rem",
            }}
            >
            REPLICATION CONFIGURATION
            </div>

            <div
            style={{
                display: "grid",
                gap: "1rem",
            }}
            >
            <div>
                <label
                style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.muted,
                    marginBottom: ".4rem",
                }}
                >
                SECONDARY ZONE
                </label>

                <input
                value={status.secondary?.name || ""}
                disabled
                style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                }}
                />
            </div>

            <div>
                <label
                style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.muted,
                    marginBottom: ".4rem",
                }}
                >
                SECONDARY ENDPOINT
                </label>

                <input
                value={endpoint}
                onChange={(e) =>
                    setEndpoint(e.target.value)
                }
                placeholder="http://192.168.56.111:7480"
                style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                }}
                />
            </div>

            <label
                style={{
                display: "flex",
                alignItems: "center",
                gap: ".6rem",
                fontSize: ".75rem",
                color: C.text,
                }}
            >
                <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) =>
                    setReadOnly(e.target.checked)
                }
                />

                Read-only secondary
            </label>

            <div
                style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: ".5rem",
                }}
            >
                <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={configuring}
                >
                Cancel
                </Button>

                <Button
                  size="sm"
                  onClick={() =>
                      onConfigure({
                          secondary_zone: status.secondary?.name,
                          secondary_endpoint: endpoint,
                          read_only: readOnly,
                      })
                  }
                  disabled={configuring || !endpoint.trim()}
              >
                  {configuring ? "Applying..." : "Apply Configuration"}
              </Button>
            </div>
            </div>
        </div>
        )}

      {/* Topology */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            fontSize: ".7rem",
            fontFamily: "'Space Mono', monospace",
            color: C.muted,
            letterSpacing: ".08em",
            marginBottom: ".75rem",
          }}
        >
          MULTISITE TOPOLOGY
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <ZoneCard zone={status.primary} />

          <div
            style={{
              color: C.accent,
              fontSize: "1.25rem",
              flexShrink: 0,
            }}
          >
            →
          </div>

          <ZoneCard zone={status.secondary} />
        </div>
      </div>

      {/* Synchronization */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            fontSize: ".7rem",
            fontFamily: "'Space Mono', monospace",
            color: C.muted,
            letterSpacing: ".08em",
            marginBottom: ".75rem",
          }}
        >
          SYNCHRONIZATION
        </div>

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: C.text,
                fontSize: ".8rem",
              }}
            >
              Metadata Sync
            </span>

            <StatusBadge status={metadataStatus} />
          </div>

          <div
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: C.text,
                fontSize: ".8rem",
              }}
            >
              Data Sync
            </span>

            <StatusBadge status={dataStatus} />
          </div>
        </div>
      </div>

      {/* Buckets */}
      <div>
        <div
          style={{
            fontSize: ".7rem",
            fontFamily: "'Space Mono', monospace",
            color: C.muted,
            letterSpacing: ".08em",
            marginBottom: ".75rem",
          }}
        >
          REPLICATION VERIFICATION
        </div>

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(180px, 1.5fr) 150px 150px 140px",
              gap: "1rem",
              padding: ".75rem 1.25rem",
              background: C.surface2,
              borderBottom: `1px solid ${C.border}`,
              fontFamily: "'Space Mono', monospace",
              fontSize: ".65rem",
              color: C.muted,
            }}
          >
            <div>BUCKET</div>
            <div>PRIMARY</div>
            <div>SECONDARY</div>
            <div>STATUS</div>
          </div>

          {loading ? (
                <div
                    style={{
                        padding: "1.5rem",
                        textAlign: "center",
                        color: C.muted,
                        fontSize: ".8rem",
                    }}
                >
                    Refreshing bucket replication data...
                </div>
            ) : buckets.length === 0 ? (
                <div
                    style={{
                        padding: "1.5rem",
                        textAlign: "center",
                        color: C.muted,
                        fontSize: ".8rem",
                    }}
                >
                    No replication data loaded.
                    <div
                        style={{
                            marginTop: ".5rem",
                            fontSize: ".72rem",
                        }}
                    >
                        Click Refresh to compare primary and secondary buckets.
                    </div>
                </div>
            ) : (
            buckets.map((bucket, index) => (
              <div
                key={bucket.name}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(180px, 1.5fr) 150px 150px 140px",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1rem 1.25rem",
                  borderBottom:
                    index < buckets.length - 1
                      ? `1px solid ${C.border}`
                      : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    color: C.text,
                    fontSize: ".78rem",
                    wordBreak: "break-word",
                  }}
                >
                  {bucket.name}
                </div>

                <div
                  style={{
                    color: C.muted,
                    fontSize: ".75rem",
                  }}
                >
                  <div>{bucket.objects ?? 0} objects</div>
                  <div>{formatBytes(bucket.size)}</div>
                </div>

                <div
                  style={{
                    color: C.muted,
                    fontSize: ".75rem",
                  }}
                >
                  <div>{bucket.secondary_objects ?? 0} objects</div>
                  <div>{formatBytes(bucket.secondary_size ?? 0)}</div>
                </div>

                <div>
                  <StatusBadge status={bucket.status} />
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            marginTop: ".6rem",
            color: C.muted,
            fontSize: ".68rem",
            lineHeight: 1.5,
          }}
        >
          Replicated means the bucket exists on the secondary and its
          object count matches the primary.
        </div>
      </div>

          {showProvisioningForm && (
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: ".7rem",
                fontFamily: "'Space Mono', monospace",
                color: C.muted,
                letterSpacing: ".08em",
                marginBottom: "1rem",
              }}
            >
              PROVISION SECONDARY RGW
            </div>

            <div
              style={{
                fontSize: ".75rem",
                color: C.muted,
                marginBottom: "1rem",
                lineHeight: 1.5,
              }}
            >
              Configure a remote Ceph cluster as the secondary RGW
              zone for this replication realm.
            </div>

            <div
              style={{
                display: "grid",
                gap: "1rem",
              }}
            >
              {/* Secondary host */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.muted,
                    marginBottom: ".4rem",
                  }}
                >
                  SECONDARY HOST
                </label>

                <input
                  value={secondaryHost}
                  onChange={(e) => setSecondaryHost(e.target.value)}
                  placeholder="192.168.56.111"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>

              {/* SSH user */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.muted,
                    marginBottom: ".4rem",
                  }}
                >
                  SSH USER
                </label>

                <input
                  value={secondaryUser}
                  onChange={(e) => setSecondaryUser(e.target.value)}
                  placeholder="riya"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>

              {/* Secondary zone */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.muted,
                    marginBottom: ".4rem",
                  }}
                >
                  SECONDARY ZONE
                </label>

                <input
                  value={secondaryZone}
                  onChange={(e) => setSecondaryZone(e.target.value)}
                  placeholder="aikyastor-secondary"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>

              {/* Endpoint */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.muted,
                    marginBottom: ".4rem",
                  }}
                >
                  RGW ENDPOINT
                </label>

                <input
                  value={secondaryEndpoint}
                  onChange={(e) => setSecondaryEndpoint(e.target.value)}
                  placeholder="http://192.168.56.111:7480"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>

              {/* Port */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".7rem",
                    color: C.formInput,
                    marginBottom: ".4rem",
                  }}
                >
                  RGW PORT
                </label>

                <input
                  type="number"
                  value={secondaryPort}
                  onChange={(e) =>
                    setSecondaryPort(Number(e.target.value))
                  }
                  min={1}
                  max={65535}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: ".65rem",
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 5,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>

              {/* Read-only */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".6rem",
                  fontSize: ".75rem",
                  color: C.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={provisionReadOnly}
                  onChange={(e) =>
                    setProvisionReadOnly(e.target.checked)
                  }
                />

                Configure secondary as read-only
              </label>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: ".5rem",
                }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowProvisioningForm(false)}
                  disabled={provisioning}
                >
                  Cancel
                </Button>

                <Button
                  size="sm"
                  onClick={() =>
                    onProvision({
                      secondary_host: secondaryHost.trim(),
                      secondary_user: secondaryUser.trim(),
                      secondary_zone: secondaryZone.trim(),
                      secondary_endpoint: secondaryEndpoint.trim(),
                      secondary_port: secondaryPort,
                      read_only: provisionReadOnly,
                    })
                  }
                  disabled={
                    provisioning ||
                    !secondaryHost.trim() ||
                    !secondaryUser.trim() ||
                    !secondaryZone.trim() ||
                    !secondaryEndpoint.trim()
                  }
                >
                  {provisioning
                    ? "Provisioning..."
                    : "Start Provisioning"}
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
