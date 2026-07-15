import { useState } from "react";

import BucketHeader from "./BucketHeader";
import BucketBreadcrumb from "./BucketBreadcrumb";
import BucketTabs from "./BucketTabs";
import BucketToolbar from "./BucketToolbar";

import ObjectsTab from "./tabs/ObjectsTab";
import PoliciesTab from "./tabs/PoliciesTab";
import LifecycleTab from "./tabs/LifecycleTab";
import SettingsTab from "./tabs/SettingsTab";

import "./BucketWorkspace.css";

export default function BucketWorkspace({ bucket, objects, onBack, onUpload, onDeleteObject, onSyncVault, downloadUrl, bucketPolicy, policies, onPoliciesChange, onSaveLifecycle, onEditPolicy }) {
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
        <div className="bucket-workspace">
            <BucketBreadcrumb bucket={bucket} activeTab={activeTab} />
            <BucketHeader bucket={bucket} objects={objects} bucketPolicy={bucketPolicy} onBack={onBack} />
            <BucketTabs activeTab={activeTab} onChange={setActiveTab} />

            <div className="bucket-panel">
                <BucketToolbar activeTab={activeTab} onUpload={onUpload} onSyncVault={onSyncVault} onEditPolicy={onEditPolicy} />
                <div className="bucket-workspace-content">
                    {TAB_COMPONENTS[activeTab]}
                </div>
            </div>
        </div>
    );
}