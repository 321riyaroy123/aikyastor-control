import { useState, useCallback, useEffect } from "react";
import { BlockAPI } from "../api/blockStorage";
import Button from "../components/common/Button";
import ImageTable from "../components/block/ImageTable";
import CreateImageDialog from "../components/block/CreateImageDialog";
import SnapshotDialog from "../components/block/SnapshotDialog";
import { C } from "../styles/theme";

// Extracted/wired from the BlockStorage component in AiKyaStorCONTROL.jsx.
export default function BlockStoragePage({ toast, images, reloadImages }) {
  const [mapped, setMapped] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSnap, setShowSnap] = useState(null);

  const loadMapped = useCallback(async () => {
    try {
      const result = await BlockAPI.mapped();
      setMapped(result.mapped || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadMapped(); }, [loadMapped]);

  const exportVault = async (name) => {
    toast(`Exporting "${name}" → Vault (background)...`, "vault", 6000);
    try {
      const result = await BlockAPI.exportVault(name);
      toast(result.message || `RBD export of '${name}' to Vault started in background`, "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const createImage = async (name, size, doVault) => {
    try {
      const result = await BlockAPI.createImage(name, size);
      toast(result.message || `Image '${name}' (${size}MB) created`, "success");
      setShowCreate(false);
      await reloadImages();
      if (doVault) await exportVault(name);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteImage = async (name) => {
    if (!confirm(`Delete image "${name}"?`)) return;
    try {
      const result = await BlockAPI.deleteImage(name);
      toast(result.message || `Image '${name}' deleted`, "success");
      await reloadImages();
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const mapImage = async (name) => {
    try {
      const result = await BlockAPI.mapImage(name);
      toast(result.message || `'${name}' mapped`, "success");
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const unmapImage = async (name) => {
    try {
      const result = await BlockAPI.unmapImage(name);
      toast(result.message || `'${name}' unmapped`, "success");
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const createSnapshot = async (name, snapName) => {
    try {
      const result = await BlockAPI.createSnapshot(name, snapName);
      toast(result.message || `Snapshot '${snapName}' created for '${name}'`, "success");
      setShowSnap(null);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1rem", color: C.text, display: "flex", alignItems: "center", gap: ".75rem" }}>
          ▣ Block Storage <span style={{ fontSize: ".65rem", padding: ".2rem .6rem", borderRadius: 3, background: "rgba(249,115,22,.15)", color: C.accent, border: "1px solid rgba(249,115,22,.3)" }}>RBD</span>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ New Image</Button>
      </div>

      <ImageTable
        images={images}
        mapped={mapped}
        onMap={mapImage}
        onUnmap={unmapImage}
        onSnapshot={setShowSnap}
        onExportVault={exportVault}
        onDelete={deleteImage}
      />

      <CreateImageDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={createImage} toast={toast} />
      <SnapshotDialog imageName={showSnap} onClose={() => setShowSnap(null)} onCreate={createSnapshot} toast={toast} />
    </div>
  );
}
