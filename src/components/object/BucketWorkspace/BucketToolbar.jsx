import { Upload, ShieldPlus, Download, UploadCloud, RefreshCw, Save } from "lucide-react";

export default function BucketToolbar({ activeTab, onUpload, onSyncVault, onEditPolicy }) {
    const renderToolbar = () => {
        switch (activeTab) {
            case "objects":
                return (
                    <>
                        <label className="bucket-toolbar-btn primary">
                            <Upload size={16} />
                            Upload Object
                            <input
                                type="file"
                                hidden
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) { onUpload(file); }
                                    e.target.value = "";
                                }}
                            />
                        </label>

                        <button className="bucket-toolbar-btn" onClick={onSyncVault}>
                            <RefreshCw size={16} />
                            Sync Vault
                        </button>
                    </>
                );

            case "policies":
                return (
                    <>
                        <button className="bucket-toolbar-btn primary">
                            <ShieldPlus size={16} />
                            Create Policy
                        </button>

                        <button className="bucket-toolbar-btn">
                            <UploadCloud size={16} />
                            Import
                        </button>

                        <button className="bucket-toolbar-btn">
                            <Download size={16} />
                            Export
                        </button>
                    </>
                );

            case "settings":
                return (
                    <button className="bucket-toolbar-btn primary">
                        <Save size={16} />
                        Save Settings
                    </button>
                );

            default:
                return null;
        }
    };

    return (
        <div className="bucket-toolbar">
            {renderToolbar()}
        </div>
    );

}