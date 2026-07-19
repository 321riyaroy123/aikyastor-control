import PolicyStatement from "./PolicyStatement";
import { styles } from "../../../../../styles/theme.js";

export default function PolicyBuilder({ draft, addStatement, updateStatement, removeStatement, duplicateStatement, toggleStatement }) {
    return (
        <div style={styles.workspaceCard}>
            <div style={styles.workspaceCardTitle}>
                Policy Builder
            </div>
            {draft.statements.map(statement => (
                <PolicyStatement
                    key={statement.id}
                    statement={statement}
                    onChange={(updates) => updateStatement(statement.id, updates)}
                    onDelete={() => removeStatement(statement.id)}
                    onDuplicate={() => duplicateStatement(statement.id)}
                    onToggle={() => toggleStatement(statement.id)}
                />
            ))}

            <button
                style={{ ...styles.bucketToolbarBtn, ...styles.bucketToolbarBtnPrimary }}
                onClick={addStatement}
            >
                Add Statement
            </button>
        </div>
    );
}