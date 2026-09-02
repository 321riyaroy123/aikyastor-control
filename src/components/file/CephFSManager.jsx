import { useEffect, useState } from "react";
import Button from "../common/Button";
import { FileAPI } from "../../api/fileStorage";
import { C, styles } from "../../styles/theme";

const DEFAULT_FORM = {
  filesystem: "",
  user: "",
  monitors: "",
  mount_point: "",
};

export default function CephFSManager({ toast, onMounted, onUnmounted }) {
  const [status, setStatus] = useState(null);
  const [filesystems, setFilesystems] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    try {
      const data = await FileAPI.cephfsStatus();

      setStatus(data);

      setForm((current) => ({
        filesystem: data.filesystem || current.filesystem || "",
        user: data.user || current.user || "",
        monitors: data.monitors || current.monitors || "",
        mount_point:
          data.mount_point || current.mount_point || "",
      }));

      return data;
    } catch (err) {
      toast(
        err.message || "Unable to get CephFS status",
        "error"
      );
      return null;
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [statusData, filesystemData] = await Promise.all([
          refreshStatus(),
          FileAPI.cephfsFilesystems(),
        ]);

        if (filesystemData?.success) {
          setFilesystems(filesystemData.filesystems || []);
        }

        return statusData;
      } catch (err) {
        toast(
          err.message || "Unable to load CephFS configuration",
          "error"
        );
      }
    };

    load();
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const testConnection = async () => {
    setBusy(true);

    try {
      const result = await FileAPI.testCephFS(form);

      if (!result.success) {
        throw new Error(
          result.error || "CephFS connection test failed"
        );
      }

      toast("CephFS connection successful", "success");
      await refreshStatus();
    } catch (err) {
      toast(
        err.message || "CephFS connection test failed",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const mount = async () => {
    if (!form.filesystem) {
      toast("Select a CephFS filesystem", "error");
      return;
    }

    if (!form.user) {
      toast("Enter a CephX user", "error");
      return;
    }

    if (!form.monitors) {
      toast("Enter at least one monitor address", "error");
      return;
    }

    if (!form.mount_point) {
      toast("Enter a mount point", "error");
      return;
    }

    if (!form.mount_point.startsWith("/")) {
      toast("Mount point must be an absolute path", "error");
      return;
    }

    setBusy(true);

    try {
      const result = await FileAPI.mountCephFS(form);
      if (!result.success) {
        throw new Error(
          result.error || "CephFS mount failed"
        );
      }

      toast(
        result.message || "CephFS mounted successfully",
        "success"
      );

      const newStatus = await refreshStatus();

      if (newStatus?.mounted && onMounted) {
        onMounted();
      }
    } catch (err) {
      toast(
        err.message || "CephFS mount failed",
        "error"
      );
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
        throw new Error(
          result.error || "CephFS unmount failed"
        );
      }

      toast(
        result.message || "CephFS unmounted successfully",
        "success"
      );

      await refreshStatus();

      if (onUnmounted) {
        onUnmounted();
      }
    } catch (err) {
      toast(
        err.message || "CephFS unmount failed",
        "error"
      );
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
          fontFamily: "'Space Mono',monospace",
          fontSize: ".9rem",
          color: C.text,
          marginBottom: "1rem",
        }}
      >
        CephFS Configuration
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              color: C.muted,
              fontSize: ".72rem",
              marginBottom: ".4rem",
              fontFamily: "'Space Mono',monospace",
            }}
          >
            Filesystem
          </label>

          <select
            style={styles.formInput}
            value={form.filesystem}
            onChange={(e) =>
              updateField("filesystem", e.target.value)
            }
            disabled={busy || status.mounted}
          >
            <option value="">
              Select filesystem
            </option>

            {filesystems.map((filesystem) => (
              <option
                key={filesystem}
                value={filesystem}
              >
                {filesystem}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{
              display: "block",
              color: C.muted,
              fontSize: ".72rem",
              marginBottom: ".4rem",
              fontFamily: "'Space Mono',monospace",
            }}
          >
            Ceph User
          </label>

          <input
            style={styles.formInput}
            value={form.user}
            onChange={(e) =>
              updateField("user", e.target.value)
            }
            placeholder="admin"
            disabled={busy || status.mounted}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              color: C.muted,
              fontSize: ".72rem",
              marginBottom: ".4rem",
              fontFamily: "'Space Mono',monospace",
            }}
          >
            Monitor Addresses
          </label>

          <input
            style={styles.formInput}
            value={form.monitors}
            onChange={(e) =>
              updateField("monitors", e.target.value)
            }
            placeholder="192.168.56.111:6789"
            disabled={busy || status.mounted}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              color: C.muted,
              fontSize: ".72rem",
              marginBottom: ".4rem",
              fontFamily: "'Space Mono',monospace",
            }}
          >
            Mount Point
          </label>

          <input
            style={styles.formInput}
            value={form.mount_point}
            onChange={(e) =>
              updateField("mount_point", e.target.value)
            }
            placeholder="/mnt/cephfs"
            disabled={busy || status.mounted}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
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
          {status.mounted
            ? "● MOUNTED"
            : "● NOT MOUNTED"}
        </span>

        <div
          style={{
            display: "flex",
            gap: ".5rem",
            flexWrap: "wrap",
          }}
        >
          {!status.mounted && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={testConnection}
                disabled={busy}
              >
                Test Connection
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={mount}
                disabled={busy}
              >
                Mount CephFS
              </Button>
            </>
          )}

          {status.mounted && (
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