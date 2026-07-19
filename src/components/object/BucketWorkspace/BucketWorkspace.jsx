import { useState } from "react";

import BucketHeader from "./BucketSummaryHeader";
import BucketBreadcrumb from "./BucketBreadcrumb";
import BucketTabs from "./BucketTabs";
import BucketToolbar from "./BucketToolbar";

import ObjectsTab from "./tabs/ObjectsTab";
import PoliciesTab from "./tabs/PoliciesTab";
import LifecycleTab from "./tabs/LifecycleTab";
import SettingsTab from "./tabs/SettingsTab";

import { styles } from "../../../styles/theme.js";

export default function BucketWorkspace({ bucket, objects, toast, onBack, onUpload, onDeleteObject, onSyncVault, downloadUrl, bucketPolicy, policies, onPoliciesChange, onSaveLifecycle, onEditPolicy }) {
    const [activeTab, setActiveTab] = useState("objects");

    const TAB_COMPONENTS = {
        objects: (
            <ObjectsTab
                bucket={bucket}
                objects={objects}
                onDeleteObject={onDeleteObject}
                downloadUrl={downloadUrl}
            />
        ),
        policies: (
            <PoliciesTab bucket={bucket} toast={toast} />
        ),
        lifecycle: (
            <LifecycleTab
                bucket={bucket}
                bucketPolicy={bucketPolicy}
                policies={policies}
                onPoliciesChange={onPoliciesChange}
                onSaveLifecycle={onSaveLifecycle}
            />
        ),
        settings: (
            <SettingsTab bucket={bucket} />
        )
    };

    return (
        <div style={styles.bucketWorkspace}>
            <BucketHeader bucket={bucket} objects={objects} bucketPolicy={bucketPolicy} onBack={onBack} />
            <BucketTabs activeTab={activeTab} onChange={setActiveTab} />

            <div style={styles.bucketPanel}>
                <BucketToolbar activeTab={activeTab} onUpload={onUpload} onSyncVault={onSyncVault} onEditPolicy={onEditPolicy} />
                <div style={styles.bucketWorkspaceContent}>
                    {TAB_COMPONENTS[activeTab]}
                </div>
            </div>
        </div>
    );
}