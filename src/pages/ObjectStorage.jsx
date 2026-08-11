import { useState, useEffect } from "react";

import { ObjectAPI } from "../api/objectStorage";
import { PolicyAPI, LifecycleAPI } from "../api/policies";

import { useObjects } from "../hooks/useObjects";

import BucketTable from "../components/object/BucketTable";
import BucketDialog from "../components/object/BucketDialog";
import BucketWorkspace from "../components/object/BucketWorkspace/BucketWorkspace";
import VaultPopup from "../components/vault/VaultPopup";

export default function ObjectStoragePage({
    toast,
    buckets,
    reloadBuckets
}) {
    const {
        objects,
        currentBucket,
        openBucket,
        closeBucket,
        refreshObjects
    } = useObjects(toast);

    const [users, setUsers] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [vaultPopup, setVaultPopup] = useState(null);

    // Lifecycle policy definitions
    const [policies, setPolicies] = useState([]);

    // Lifecycle currently assigned to the selected bucket
    const [bucketLifecycle, setBucketLifecycle] = useState(null);

    /*
     * Load RGW lifecycle configuration for a bucket.
     *
     * This is deliberately separate from BucketPolicyAPI.
     * Bucket access policies and lifecycle policies are two
     * different S3 mechanisms.
     */
    async function loadBucketLifecycle(name) {
        try {
            const result = await LifecycleAPI.get(name);

            console.log(
                `Loaded lifecycle for '${name}':`,
                result
            );

            setBucketLifecycle(result);
        } catch (err) {
            console.error(
                `Failed to load lifecycle for '${name}':`,
                err
            );

            setBucketLifecycle(null);
        }
    }

    /*
     * Load RGW lifecycle policy definitions.
     */
    useEffect(() => {
        loadPolicies();
    }, []);

    async function loadPolicies() {
        try {
            const result = await PolicyAPI.list();

            setPolicies(
                result.policies || []
            );
        } catch (err) {
            console.error(
                "Failed to load lifecycle policies:",
                err
            );
        }
    }

    /*
     * Load object-storage users.
     */
    useEffect(() => {
        ObjectAPI.users()
            .then(result => {
                setUsers(result.users || []);
            })
            .catch(err => {
                console.error(
                    "Failed to load users:",
                    err
                );
            });
    }, []);

    /*
     * Create bucket.
     */
    const createBucket = async (payload) => {
        try {
            const result = await ObjectAPI.createBucket(payload);

            toast(
                result.message ||
                `Bucket '${payload.bucket}' created successfully`,
                "success"
            );

            await reloadBuckets();
        } catch (err) {
            toast(
                err.message,
                "error"
            );
        }
    };

    /*
     * Open bucket.
     *
     * Load lifecycle AFTER the bucket has been selected.
     */
    const handleOpenBucket = async (bucket) => {
        await openBucket(bucket);

        await loadBucketLifecycle(
            bucket.name
        );
    };

    /*
     * Apply lifecycle policy to current bucket.
     */
    const updateLifecycle = async (policyId) => {
        if (!currentBucket?.name) {
            toast(
                "No bucket is currently selected.",
                "error"
            );
            return;
        }

        try {
            const result = await LifecycleAPI.put(
                currentBucket.name,
                policyId
            );

            toast(
                result.message ||
                "Lifecycle policy applied successfully.",
                "success"
            );

            /*
             * IMPORTANT:
             *
             * Do not trust the PUT response as the permanent
             * frontend state.
             *
             * Re-read the configuration from RGW so the UI
             * reflects what Ceph actually accepted.
             */
            await loadBucketLifecycle(
                currentBucket.name
            );

        } catch (err) {
            console.error(
                "Failed to apply lifecycle policy:",
                err
            );

            toast(
                err.message ||
                "Failed to apply lifecycle policy.",
                "error"
            );
        }
    };

    /*
     * Delete bucket.
     */
    const deleteBucket = async (name) => {
        if (
            !confirm(
                `Delete bucket "${name}"? This will remove all objects.`
            )
        ) {
            return;
        }

        try {
            const result =
                await ObjectAPI.deleteBucket(name);

            toast(
                result.message ||
                `Bucket '${name}' deleted`,
                "success"
            );

            if (currentBucket?.name === name) {
                closeBucket();
                setBucketLifecycle(null);
            }

            await reloadBuckets();

        } catch (err) {
            toast(
                err.message,
                "error"
            );
        }
    };

    /*
     * Upload object.
     */
    const handleUpload = (file) => {
        setVaultPopup({
            file,

            cb: async (toVault) => {
                setVaultPopup(null);

                try {
                    const result =
                        await ObjectAPI.uploadObject(
                            currentBucket.name,
                            file,
                            toVault
                        );

                    toast(
                        result.message,
                        toVault
                            ? "vault"
                            : "success",
                        5000
                    );

                    await refreshObjects();

                } catch (err) {
                    toast(
                        err.message,
                        "error"
                    );
                }
            }
        });
    };

    /*
     * Delete object.
     */
    const deleteObject = async (key) => {
        if (!confirm(`Delete "${key}"?`)) {
            return;
        }

        try {
            const result =
                await ObjectAPI.deleteObject(
                    currentBucket.name,
                    key
                );

            toast(
                result.message ||
                `'${key}' deleted from '${currentBucket.name}'`,
                "success"
            );

            await refreshObjects();

        } catch (err) {
            toast(
                err.message,
                "error"
            );
        }
    };

    /*
     * Sync bucket to vault.
     */
    const syncBucketVault = async () => {
        try {
            const result =
                await ObjectAPI.syncBucketVault(
                    currentBucket.name
                );

            toast(
                result.message ||
                `Vault sync started for bucket '${currentBucket.name}' in background`,
                "vault",
                6000
            );

        } catch (err) {
            toast(
                err.message,
                "error"
            );
        }
    };

    return (
        <div>
            {vaultPopup && (
                <VaultPopup
                    file={vaultPopup.file}
                    onDecide={vaultPopup.cb}
                    onClose={() =>
                        setVaultPopup(null)
                    }
                />
            )}

            {!currentBucket ? (
                <BucketTable
                    buckets={buckets}

                    onOpen={handleOpenBucket}

                    onDelete={deleteBucket}

                    onCreateClick={() =>
                        setShowCreate(true)
                    }
                />
            ) : (
                <BucketWorkspace
                    bucket={currentBucket}

                    objects={objects}

                    toast={toast}

                    onBack={() => {
                        closeBucket();
                        setBucketLifecycle(null);
                    }}

                    onUpload={handleUpload}

                    onDeleteObject={deleteObject}

                    onSyncVault={syncBucketVault}

                    downloadUrl={(key) =>
                        ObjectAPI.downloadObjectUrl(
                            currentBucket.name,
                            key
                        )
                    }

                    bucketLifecycle={
                        bucketLifecycle
                    }

                    policies={policies}

                    onPoliciesChange={
                        setPolicies
                    }

                    onSaveLifecycle={
                        updateLifecycle
                    }
                />
            )}

            <BucketDialog
                open={showCreate}

                onClose={() =>
                    setShowCreate(false)
                }

                onCreate={createBucket}

                users={users}

                existingBuckets={buckets}

                policies={policies}

                onPoliciesChange={
                    setPolicies
                }
            />
        </div>
    );
}