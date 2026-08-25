import { useState, useCallback, useEffect } from "react";
import { FileAPI } from "../api/fileStorage";
import { C, styles } from "../styles/theme";
import FileExplorer from "../components/file/FileExplorer";
import VaultPopup from "../components/vault/VaultPopup";
import NFSManager from "../components/nfs/NFSManager";

// Extracted/wired from the FileStorage component in AiKyaStorCONTROL.jsx.
export default function FileStoragePage({ toast }) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState([]);
  const [vaultPopup, setVaultPopup] = useState(null);
  const [storageMode, setStorageMode] = useState("cephfs");

  const browse = useCallback(async (p) => {
    setPath(p);
    try {
      const result = await FileAPI.browse(p);
      setEntries(result.entries || []);
    } catch (err) {
      toast(err.message, "error");
      setEntries([]);
    }
  }, [toast]);

  useEffect(() => { browse(""); }, [browse]);

  const handleUpload = (file) => {
    setVaultPopup({ file, cb: async (toVault) => {
      setVaultPopup(null);
      try {
        const result = await FileAPI.upload(path, file, toVault);
        toast(result.message, toVault ? "vault" : "success", 5000);
        await browse(path);
      } catch (err) {
        toast(err.message, "error");
      }
    }});
  };

  const deleteEntry = async (name) => {
    const fullPath = (path ? path + "/" : "") + name;
    if (!confirm(`Delete "${fullPath}"?`)) return;
    try {
      const result = await FileAPI.delete(fullPath);
      toast(result.message || `'${fullPath}' deleted from CephFS`, "success");
      await browse(path);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const mkdir = async (newDir) => {
    const fullPath = (path ? path + "/" : "") + newDir;
    try {
      const result = await FileAPI.mkdir(fullPath);
      toast(result.message || `Directory '${fullPath}' created`, "success");
      await browse(path);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const syncVault = async () => {
    toast("Starting CephFS → Vault rsync (background)...", "vault", 6000);
    try {
      const result = await FileAPI.syncVault();
      toast(result.message || "CephFS → Vault sync started in background", "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div>
      {vaultPopup && (
        <VaultPopup
          file={vaultPopup.file}
          onDecide={vaultPopup.cb}
          onClose={() => setVaultPopup(null)}
        />
      )}

      <div style={styles.bucketPanel}>
      <div style={styles.bucketTabs}>
        <button
          type="button"
          style={{
            ...styles.bucketTab,
            ...(storageMode === "cephfs" ? styles.bucketTabActive : {}),
          }}
          onClick={() => setStorageMode("cephfs")}
        >
          CephFS
        </button>

        <button
          type="button"
          style={{
            ...styles.bucketTab,
            ...(storageMode === "nfs" ? styles.bucketTabActive : {}),
          }}
          onClick={() => setStorageMode("nfs")}
        >
          NFS
        </button>
      </div>

      {storageMode === "cephfs" ? (
        <FileExplorer
          path={path}
          entries={entries}
          onBrowse={browse}
          onUpload={handleUpload}
          onDelete={deleteEntry}
          onMkdir={mkdir}
          onSyncVault={syncVault}
          downloadUrl={FileAPI.downloadUrl}
        />
      ) : (
        <NFSManager toast={toast} />
      )}
    </div>
    </div>
  );
}
