import { Upload, ShieldPlus, Download, UploadCloud, RefreshCw, Save } from "lucide-react";
import { styles } from "../../../styles/theme.js";

export default function BucketToolbar({ activeTab, onUpload, onSyncVault, onEditPolicy }) {
    const renderToolbar = () => {
        switch (activeTab) {
            case "objects":
                return (
                    <>
                        <label style={{ ...styles.bucketToolbarBtn, ...styles.bucketToolbarBtnPrimary, margin: 0 }}>
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

                        <button style={styles.bucketToolbarBtn} onClick={onSyncVault}>
                            <RefreshCw size={16} />
                            Sync Vault
                        </button>
                    </>
                );

            case "policies":
                return (
                    <>
                        <button style={{ ...styles.bucketToolbarBtn, ...styles.bucketToolbarBtnPrimary }} onClick={onEditPolicy}>
                            <ShieldPlus size={16} />
                            Create Policy
                        </button>

                        <button style={styles.bucketToolbarBtn}>
                            <UploadCloud size={16} />
                            Import
                        </button>

                        <button style={styles.bucketToolbarBtn}>
                            <Download size={16} />
                            Export
                        </button>
                    </>
                );

            case "settings":
                return (
                    <button style={{ ...styles.bucketToolbarBtn, ...styles.bucketToolbarBtnPrimary }}>
                        <Save size={16} />
                        Save Settings
                    </button>
                );

            default:
                return null;
        }
    };

    return (
        <div style={styles.bucketToolbar}>
            {renderToolbar()}
        </div>
    );
}