import { useState, useEffect } from "react";
import { ObjectAPI } from "../api/objectStorage";
import { PolicyAPI } from "../api/policies";
import { useObjects } from "../hooks/useObjects";
import BucketTable from "../components/object/BucketTable";
import BucketDialog from "../components/object/BucketDialog";
import BucketWorkspace from "../components/object/BucketWorkspace/BucketWorkspace";
import LifecycleDialog from "../components/object/LifecycleDialog";
import VaultPopup from "../components/vault/VaultPopup";

// Extracted/wired from the ObjectStorage component in AiKyaStorCONTROL.jsx.
// Data-loading + mutation handlers live here; presentation is split across
// components/object/* and components/vault/VaultPopup.
export default function ObjectStoragePage({ toast, buckets, reloadBuckets }) {
  const { objects, currentBucket, openBucket, closeBucket, refreshObjects } = useObjects(toast);
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [vaultPopup, setVaultPopup] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [bucketPolicy, setBucketPolicy] = useState(null);
  const [showLifecycle, setShowLifecycle] = useState(false);

  useEffect(() => {
    ObjectAPI.users().then(d => setUsers(d.users || [])).catch(() => {});
  }, []);

  const createBucket = async (payload) => {
    const result = await ObjectAPI.createBucket(payload);
    toast(result.message || `Bucket '${payload.bucket}' created successfully`, "success");
    await reloadBuckets();
  };

  async function loadBucketPolicy(name){
    try{
        const result = await PolicyAPI.getBucketPolicy(name);
        setBucketPolicy(result);
    } catch(err){
        console.error(err);
    }
  }

  const deleteBucket = async (name) => {
    if (!confirm(`Delete bucket "${name}"? This will remove all objects.`)) return;
    try {
      const result = await ObjectAPI.deleteBucket(name);
      toast(result.message || `Bucket '${name}' deleted`, "success");
      if (currentBucket?.name === name) closeBucket();
      await reloadBuckets();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleUpload = (file) => {
    setVaultPopup({ file, cb: async (toVault) => {
      setVaultPopup(null);
      try {
        const result = await ObjectAPI.uploadObject(currentBucket.name, file, toVault);
        toast(result.message, toVault ? "vault" : "success", 5000);
        await refreshObjects();
      } catch (err) {
        toast(err.message, "error");
      }
    }});
  };

  const deleteObject = async (key) => {
    if (!confirm(`Delete "${key}"?`)) return;
    try {
      const result = await ObjectAPI.deleteObject(currentBucket.name, key);
      toast(result.message || `'${key}' deleted from '${currentBucket.name}'`, "success");
      await refreshObjects();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const syncBucketVault = async () => {
    try {
      const result = await ObjectAPI.syncBucketVault(currentBucket.name);
      toast(result.message || `Vault sync started for bucket '${currentBucket.name}' in background`, "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  useEffect(() => {
      loadPolicies();
  }, []);

  async function loadPolicies() {
      try {
          const res = await PolicyAPI.list();
          setPolicies(res.policies || []);
      } catch (err) {
          console.error(err);
      }
  }

  const updateLifecycle = async (policyId) => {
      try {
          const result = await PolicyAPI.updateBucketPolicy(
              currentBucket.name,
              policyId
          );
          setBucketPolicy({ bucket: currentBucket.name, lifecycle: result.lifecycle });
          toast(result.message, "success");
          setShowLifecycle(false);
      } catch (err) {
          toast(err.message, "error");
      }
  };

  return (
    <div>
      {vaultPopup && <VaultPopup file={vaultPopup.file} onDecide={vaultPopup.cb} onClose={() => setVaultPopup(null)} />}

      {!currentBucket ? (
        <BucketTable buckets={buckets} onOpen={async (bucket) => { await openBucket(bucket); await loadBucketPolicy(bucket.name); }} onDelete={deleteBucket} onCreateClick={() => setShowCreate(true)} />
      ) : (
        <BucketWorkspace
          bucket={currentBucket}
          objects={objects}
          onBack={closeBucket}
          onUpload={handleUpload}
          onDeleteObject={deleteObject}
          onSyncVault={syncBucketVault}
          downloadUrl={(key) =>
              ObjectAPI.downloadObjectUrl(currentBucket.name, key)
          }
          bucketPolicy={bucketPolicy}
          policies={policies}
          onPoliciesChange={setPolicies}
          onSaveLifecycle={updateLifecycle}
          onEditPolicy={() => setShowLifecycle(true)}
        />
      )}

      <BucketDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createBucket}
        users={users}
        existingBuckets={buckets}
        policies={policies}
        onPoliciesChange={setPolicies}
      />

      <LifecycleDialog
        open={showLifecycle}
        bucket={currentBucket}
        current={bucketPolicy}
        policies={policies}
        onSave={updateLifecycle}
        onClose={() => setShowLifecycle(false)}
        onPoliciesChange={setPolicies}
      />
    </div>
  );
}
