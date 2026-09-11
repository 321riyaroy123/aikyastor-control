import { useState, useCallback, useEffect } from "react";
import { BlockAPI } from "../api/blockStorage";
import Button from "../components/common/Button";
import ImageTable from "../components/block/ImageTable";
import CreatePoolDialog from "../components/block/CreatePoolDialog";
import CreateImageDialog from "../components/block/CreateImageDialog";
import SnapshotDialog from "../components/block/SnapshotDialog";
import SnapshotsDialog from "../components/block/SnapshotsDialog";
import { C, styles } from "../styles/theme";

// Extracted/wired from the BlockStorage component in AiKyaStorCONTROL.jsx.
export default function BlockStoragePage({ toast }) {
  const [images, setImages] = useState([]);
  const [mapped, setMapped] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSnap, setShowSnap] = useState(null);
  const [showSnapshots, setShowSnapshots] = useState(null);
  const [pools, setPools] = useState([]);
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [creatingPool, setCreatingPool] = useState(false);
  const [selectedPool, setSelectedPool] = useState("");

  const loadPools = useCallback(async () => {
    try {
      const result = await BlockAPI.pools();
      const availablePools = result.pools || [];

      setPools(availablePools);

      setSelectedPool((current) => {
        if (current && availablePools.includes(current)) {
          return current;
        }

        // Prefer the configured/default RBD pool.
        if (availablePools.includes("rbd")) {
          return "rbd";
        }

        return availablePools[0] || "";
      });

    } catch (err) {
      console.error("Failed to load RBD pools:", err);
    }
  }, []);

  const loadImages = useCallback(async (pool) => {
    if (!pool) {
      setImages([]);
      return;
    }

    try {
      const result = await BlockAPI.images(pool);

      setImages(result.images || []);

    } catch (err) {
      console.error("Failed to load RBD images:", err);

      toast(
        err.message || "Failed to load RBD images",
        "error"
      );
    }
  }, [toast]);

  const loadMapped = useCallback(async () => {
    try {
      const result = await BlockAPI.mapped();
      setMapped(result.mapped || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadMapped(); loadPools(); }, [loadMapped, loadPools]);

  useEffect(() => {
    loadImages(selectedPool);
  }, [selectedPool, loadImages]);

  const createPool = async () => {
    const name = newPoolName.trim();

    if (!name) {
      toast("Please enter an RBD pool name", "error");
      return;
    }

    setCreatingPool(true);

    try {
      const result = await BlockAPI.createPool(name);

      toast(
        result.message || `RBD pool '${name}' created`,
        "success"
      );

      setNewPoolName("");
      setShowCreatePool(false);

      await loadPools();

    } catch (err) {
      toast(err.message || "Failed to create RBD pool", "error");
    } finally {
      setCreatingPool(false);
    }
  };

  const exportVault = async (name) => {
    toast(`Exporting "${name}" → Vault (background)...`, "vault", 6000);
    try {
      const result = await BlockAPI.exportVault(name, selectedPool);
      toast(result.message || `RBD export of '${name}' to Vault started in background`, "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const createImage = async (name, size, doVault) => {
    try {
      const result = await BlockAPI.createImage(name, size, selectedPool);
      toast(result.message || `Image '${name}' (${size}MB) created`, "success");
      setShowCreate(false);
      await loadImages(selectedPool);
      if (doVault) await exportVault(name);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteImage = async (name) => {
    if (!confirm(`Delete image "${name}"?`)) return;
    try {
      const result = await BlockAPI.deleteImage(name, selectedPool);
      toast(result.message || `Image '${name}' deleted`, "success");
      await loadImages(selectedPool);
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const mapImage = async (name) => {
    try {
      const result = await BlockAPI.mapImage(name, selectedPool);
      toast(result.message || `'${name}' mapped`, "success");
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const unmapImage = async (name, device = null) => {
    try {
      const target = device || name;
      const result = await BlockAPI.unmapImage(target, selectedPool);

      toast(
        result.message || `'${name}' unmapped`,
        "success"
      );

      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const createSnapshot = async (name, snapName) => {
    try {
      const result = await BlockAPI.createSnapshot(name, snapName, selectedPool);
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
          <span style={{ fontSize: ".65rem", color: C.muted }}></span></div>
          <label style={{ display: "flex", alignItems: "center", gap: ".75rem", fontFamily: "'Space Mono',monospace", fontSize: ".7rem", color: C.muted }}>
            RBD Pool
            <select
              style={{ ...styles.formInput, width: "auto", minWidth: "180px" }}
              value={selectedPool}
              onChange={(e) => setSelectedPool(e.target.value)}
            >
              <option value="">Select RBD pool</option>
              {pools.map((pool) => <option key={pool} value={pool}>{pool}</option>)}
            </select>
          </label>
            <Button variant="secondary" size="sm" onClick={() => setShowCreatePool(true)}>+ New RBD Pool</Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ New Image</Button>
      </div>

      <ImageTable
        images={images}
        mapped={mapped}
        selectedPool={selectedPool}
        onMap={mapImage}
        onUnmap={unmapImage}
        onSnapshot={setShowSnap}
        onSnapshots={setShowSnapshots}
        onExportVault={exportVault}
        onDelete={deleteImage}
      />

      <CreatePoolDialog open={showCreatePool} onClose={() => { if (!creatingPool) { setShowCreatePool(false); setNewPoolName(""); } }} poolName={newPoolName} setPoolName={setNewPoolName} onCreate={createPool} creating={creatingPool} toast={toast} />
      <CreateImageDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={createImage} toast={toast} />
      <SnapshotDialog imageName={showSnap} onClose={() => setShowSnap(null)} onCreate={createSnapshot} toast={toast} />
      <SnapshotsDialog imageName={showSnapshots} pool={selectedPool} onClose={() => setShowSnapshots(null)} toast={toast} />
    </div>
  );
}
