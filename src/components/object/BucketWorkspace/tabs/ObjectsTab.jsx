import { Download, Trash2, File, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { C, styles } from "../../../../styles/theme.js";

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
    const [searchFocused, setSearchFocused] = useState(false);
    const [hoveredRow, setHoveredRow] = useState(null);

    const safeObjects = objects ?? [];
    const filteredObjects = useMemo(() => {
        return safeObjects.filter((object) =>
            object.key.toLowerCase().includes(search.toLowerCase())
        );
    }, [objects, search]);

    return (
        <div style={styles.objectsTab}>
            <div style={styles.objectsToolbar}>
                <div
                    style={{
                        ...styles.objectsSearch,
                        ...(searchFocused
                            ? { borderColor: C.accent, boxShadow: "0 0 0 3px rgba(249,115,22,.08)" }
                            : {})
                    }}
                >
                    <Search size={16} color={C.muted} />
                    <input
                        type="text"
                        placeholder="Search objects..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        style={styles.objectsSearchInput}
                    />
                </div>
            </div>

            <div style={styles.objectTableWrapper}>
                <table style={styles.objectTable}>
                    <thead>
                        <tr style={styles.objectTableHeadRow}>
                            <th style={styles.objectTableTh}>Name</th>
                            <th style={styles.objectTableTh}>Size</th>
                            <th style={styles.objectTableTh}>Modified</th>
                            <th style={styles.objectTableTh}>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredObjects.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ ...styles.objectTableTd, ...styles.objectEmpty, borderBottom: "none" }}>
                                    No objects found.
                                </td>
                            </tr>
                        ) : (
                            filteredObjects.map((object, i) => {
                                const isLast = i === filteredObjects.length - 1;
                                const isHovered = hoveredRow === object.key;

                                return (
                                    <tr
                                        key={object.key}
                                        onMouseEnter={() => setHoveredRow(object.key)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                        style={{ background: isHovered ? "rgba(255,255,255,.035)" : "transparent", transition: "background .15s ease" }}
                                    >
                                        <td style={{ ...styles.objectTableTd, ...(isLast ? { borderBottom: "none" } : {}) }}>
                                            <div style={styles.objectName}>
                                                <File size={16} color={C.accent} />
                                                {object.key}
                                            </div>
                                        </td>

                                        <td style={{ ...styles.objectTableTd, ...(isLast ? { borderBottom: "none" } : {}), color: C.muted }}>
                                            {formatBytes(object.size)}
                                        </td>

                                        <td style={{ ...styles.objectTableTd, ...(isLast ? { borderBottom: "none" } : {}), color: C.muted }}>
                                            {new Date(object.modified).toLocaleString()}
                                        </td>

                                        <td style={{ ...styles.objectTableTd, ...(isLast ? { borderBottom: "none" } : {}) }}>
                                            <div style={styles.objectActions}>
                                                <a
                                                    href={downloadUrl(object.key)}
                                                    style={styles.objectActionBtn}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.06)")}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                >
                                                    <Download size={16} />
                                                </a>
                                                <button
                                                    style={{ ...styles.objectActionBtn, ...styles.objectActionBtnDanger }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,.12)")}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                    onClick={() => onDeleteObject(object.key)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}