import { FolderOpen, Shield, Clock3, Settings } from "lucide-react";

const tabs = [
    {
        id: "objects",
        label: "Objects"
    },
    {
        id: "policies",
        label: "Policies"
    },
    {
        id: "lifecycle",
        label: "Lifecycle"
    },
    {
        id: "settings",
        label: "Settings"
    }
];

export default function BucketTabs({ activeTab, onChange }) {
    return (
        <div className="bucket-tabs">
            {tabs.map((tab) => {
                const Icon = tab.icon;

                return (
                    <button key={tab.id} className={`bucket-tab ${ activeTab === tab.id ? "active" : "" }`} onClick={() => onChange(tab.id)}>
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}