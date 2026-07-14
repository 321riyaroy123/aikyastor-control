import { useState, useEffect } from "react";
import { ObjectAPI } from "../api/objectStorage";
import { BlockAPI } from "../api/blockStorage";
import { FileAPI } from "../api/fileStorage";
import VaultStatus from "../components/vault/VaultStatus";
import ActivityPanel from "../components/activity/ActivityPanel";
import { C } from "../styles/theme";

// Extracted/wired from the VaultSection component in AiKyaStorCONTROL.jsx.
export default function VaultPage({ vault, buckets, images, activity, toast, onRefreshVault, onRefreshActivity }) {
  const [selBucket, setSelBucket] = useState(buckets[0]?.name || "");
  const [selImage, setSelImage] = useState(images[0]?.name || "");

  useEffect(() => { if (!selBucket && buckets[0]) setSelBucket(buckets[0].name); }, [buckets, selBucket]);
  useEffect(() => { if (!selImage && images[0]) setSelImage(images[0].name); }, [images, selImage]);

  const refreshSoon = () => setTimeout(() => { onRefreshActivity?.(); onRefreshVault?.(); }, 3000);

  const syncBucket = async () => {
    if (!selBucket) { toast("Select a bucket", "error"); return; }
    try {
      const result = await ObjectAPI.syncBucketVault(selBucket);
      toast(result.message || `Vault sync started for bucket '${selBucket}' in background`, "vault", 6000);
      refreshSoon();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const exportImage = async () => {
    if (!selImage) { toast("Select an image", "error"); return; }
    try {
      const result = await BlockAPI.exportVault(selImage);
      toast(result.message || `RBD export of '${selImage}' started in background`, "vault", 6000);
      refreshSoon();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const syncCephFS = async () => {
    toast("Starting CephFS → Vault rsync (background)...", "vault", 6000);
    try {
      const result = await FileAPI.syncVault();
      toast(result.message || "CephFS → Vault sync started in background", "vault", 6000);
      refreshSoon();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1rem", color: C.text, display: "flex", alignItems: "center", gap: ".75rem" }}>
          🔒 Vault Backup <span style={{ fontSize: ".65rem", padding: ".2rem .6rem", borderRadius: 3, background: "rgba(249,115,22,.15)", color: C.accent, border: "1px solid rgba(249,115,22,.3)" }}>/vault</span>
        </div>
      </div>

      <VaultStatus
        vault={vault}
        buckets={buckets}
        images={images}
        selBucket={selBucket}
        setSelBucket={setSelBucket}
        selImage={selImage}
        setSelImage={setSelImage}
        onSyncBucket={syncBucket}
        onExportImage={exportImage}
        onSyncCephFS={syncCephFS}
      />

      <ActivityPanel activity={activity} vaultOnly />
    </div>
  );
}
