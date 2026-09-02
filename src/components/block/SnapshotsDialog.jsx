import { useEffect, useState, useCallback } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";
import { BlockAPI } from "../../api/blockStorage";

export default function SnapshotsDialog({
  imageName,
  onClose,
  toast
}) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);

  const downloadSnapshot = (snapshotName) => {
    const url = BlockAPI.downloadSnapshotUrl(
        imageName,
        snapshotName
    );

    window.location.href = url;
    };

  const loadSnapshots = useCallback(async () => {
    if (!imageName) return;

    setLoading(true);

    try {
      const result = await BlockAPI.snapshots(imageName);
      setSnapshots(result.snapshots || []);
    } catch (err) {
      console.error(err);
      toast(
        err.message || "Failed to load snapshots",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [imageName, toast]);

  useEffect(() => {
    if (imageName) {
      loadSnapshots();
    } else {
      setSnapshots([]);
    }
  }, [imageName, loadSnapshots]);

  return (
    <Modal
      open={!!imageName}
      onClose={onClose}
      title={`// SNAPSHOTS: ${imageName || ""}`}
    >
      <div
        style={{
          marginBottom: "1rem",
          fontSize: ".75rem",
          color: C.muted,
          fontFamily: "'Space Mono',monospace"
        }}
      >
        {loading
          ? "Loading snapshots..."
          : `${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""}`
        }
      </div>

      {loading ? (

        <div
          style={{
            padding: "1rem 0",
            color: C.muted,
            fontFamily: "'Space Mono',monospace",
            fontSize: ".8rem"
          }}
        >
          Loading...
        </div>

      ) : snapshots.length === 0 ? (

        <div
          style={{
            padding: "1rem 0",
            color: C.muted,
            fontFamily: "'Space Mono',monospace",
            fontSize: ".8rem"
          }}
        >
          No snapshots found for this image.
        </div>

      ) : (

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: ".6rem"
          }}
        >
          {snapshots.map((snap) => (

            <div
              key={snap.id}
              style={{
                padding: ".8rem",
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.surface2
              }}
            >

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem"
                }}
              >

                <div>
                  <div
                    style={{
                      fontFamily: "'Space Mono',monospace",
                      fontSize: ".8rem",
                      color: C.text
                    }}
                  >
                    📸 {snap.name}
                  </div>

                  <div
                    style={{
                      marginTop: ".4rem",
                      display: "flex",
                      gap: ".75rem",
                      flexWrap: "wrap",
                      fontSize: ".7rem",
                      color: C.muted
                    }}
                  >
                    <span>ID: {snap.id}</span>

                    <span>
                      Size: {formatBytes(snap.size)}
                    </span>

                    <span>
                      {snap.protected === "true"
                        ? "Protected"
                        : "Not protected"
                      }
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: ".35rem",
                      fontSize: ".7rem",
                      color: C.muted
                    }}
                  >
                    {snap.timestamp}
                  </div>

                </div>

                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => downloadSnapshot(snap.name)}
                    >
                    ↓ Download
                </Button>

              </div>

            </div>

          ))}
        </div>

      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: ".75rem",
          marginTop: "1.5rem"
        }}
      >

        <Button
          variant="ghost"
          size="sm"
          onClick={loadSnapshots}
        >
          ↻ Refresh
        </Button>

        <Button
          variant="ghost"
          onClick={onClose}
        >
          Close
        </Button>

      </div>
    </Modal>
  );
}