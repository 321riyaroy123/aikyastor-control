import { ChevronRight, Database } from "lucide-react";

export default function BucketBreadcrumb({ bucket, activeTab }) {
    const tabNames = {
        objects: "Objects",
        policies: "Policies",
        lifecycle: "Lifecycle",
        settings: "Settings"
    };

    return (
        <div className="bucket-breadcrumb">
            <div className="breadcrumb-item">
                <Database size={15} />
                <span>Object Storage</span>
            </div>

            <ChevronRight size={14} className="breadcrumb-separator" />
            <div className="breadcrumb-item">
                <span>{bucket.name}</span>
            </div>

            <ChevronRight size={14} className="breadcrumb-separator" />
            <div className="breadcrumb-item active">
                <span>{tabNames[activeTab]}</span>
            </div>
        </div>
    );
}