import { Download, Trash2, File, Search } from "lucide-react";
import { useMemo, useState } from "react";

function formatBytes(bytes = 0) {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function ObjectsTab({ bucket, objects, onDeleteObject, downloadUrl }) {
    const [search, setSearch] = useState("");
    const filteredObjects = useMemo(() => {
        return objects.filter((object) =>
            object.key.toLowerCase().includes(search.toLowerCase())
        );
    }, [objects, search]);

    return (
        <div className="objects-tab">
            <div className="objects-toolbar">
                <div className="objects-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search objects..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="object-table-wrapper">
                <table className="object-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Size</th>
                            <th>Modified</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredObjects.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="object-empty">
                                    No objects found.
                                </td>
                            </tr>
                        ) : (
                            filteredObjects.map((object) => (
                                <tr key={object.key}>
                                    <td>
                                        <div className="object-name">
                                            <File size={16} />
                                            {object.key}
                                        </div>
                                    </td>

                                    <td>
                                        {formatBytes(object.size)}
                                    </td>

                                    <td>
                                        {new Date(
                                            object.modified
                                        ).toLocaleString()}
                                    </td>

                                    <td>
                                        <div className="object-actions">
                                            <a href={downloadUrl(object.key)} className="object-action-btn">
                                                <Download size={16} />
                                            </a>
                                            <button
                                                className="object-action-btn danger"
                                                onClick={() => onDeleteObject(object.key)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}