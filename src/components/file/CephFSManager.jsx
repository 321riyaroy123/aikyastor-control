import { useEffect, useState } from "react";
import Button from "../common/Button";
import { FileAPI } from "../../api/fileStorage";
import { C, styles } from "../../styles/theme";

export default function CephFSManager({ toast, onMounted, onUnmounted }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    try {
      const data = await FileAPI.cephfsStatus();
      setStatus(data);
      return data;
    } catch (err) {
      toast(err.message || "Unable to get CephFS status", "error");
      return null;
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const testConnection = async () => {
    setBusy(true);

    try {
      const result = await FileAPI.testCephFS();

      if (!result.success) {
        throw new Error(result.error || "CephFS connection test failed");
      }

      toast("CephFS connection successful", "success");
      await refreshStatus();
    } catch (err) {
      toast(err.message || "CephFS connection test failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const mount = async () => {
    setBusy(true);

    try {
      const result = await FileAPI.mountCephFS();

      if (!result.success) {
        throw new Error(result.error || "CephFS mount failed");
      }

      toast(result.message || "CephFS mounted successfully", "success");

      const newStatus = await refreshStatus();

      if (newStatus?.mounted && onMounted) {
        onMounted();
      }
    } catch (err) {
      toast(err.message || "CephFS mount failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const unmount = async () => {
    if (
      !window.confirm(
        "Unmount CephFS? File Storage will become unavailable until it is mounted again."
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const result = await FileAPI.unmountCephFS();

      if (!result.success) {
        throw new Error(result.error || "CephFS unmount failed");
      }

      toast(result.message || "CephFS unmounted successfully", "success");

      await refreshStatus();

      if (onUnmounted) {
        onUnmounted();
      }
    } catch (err) {
      toast(err.message || "CephFS unmount failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div
        style={{
          ...styles.bucketPanel,
          marginBottom: "1rem",
          padding: "1rem",
          color: C.muted,
          fontFamily: "'Space Mono',monospace",
          fontSize: ".8rem",
        }}
      >
        Checking CephFS status...
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.bucketPanel,
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Space Mono',monospace",
              fontSize: ".9rem",
              color: C.text,
              marginBottom: ".45rem",
            }}
          >
            CephFS Configuration
          </div>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              color: C.muted,
              fontSize: ".75rem",
              fontFamily: "'Space Mono',monospace",
            }}
          >
            <span>
              Filesystem:{" "}
              <strong style={{ color: C.text }}>
                {status.filesystem}
              </strong>
            </span>

            <span>
              Mount:{" "}
              <strong style={{ color: C.text }}>
                {status.mount_point}
              </strong>
            </span>

            <span>
              User:{" "}
              <strong style={{ color: C.text }}>
                {status.user}
              </strong>
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: ".5rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "'Space Mono',monospace",
              fontSize: ".72rem",
              padding: ".3rem .6rem",
              borderRadius: 4,
              background: status.mounted
                ? "rgba(34,197,94,.12)"
                : "rgba(249,115,22,.12)",
              color: status.mounted ? C.green : C.accent,
              border: `1px solid ${
                status.mounted
                  ? "rgba(34,197,94,.3)"
                  : "rgba(249,115,22,.3)"
              }`,
            }}
          >
            {status.mounted ? "● MOUNTED" : "● NOT MOUNTED"}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={testConnection}
            disabled={busy}
          >
            Test Connection
          </Button>

          {!status.mounted ? (
            <Button
              variant="primary"
              size="sm"
              onClick={mount}
              disabled={busy}
            >
              Mount CephFS
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={unmount}
              disabled={busy}
            >
              Unmount
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}