import PolicyStatement from "./PolicyStatement";

export default function PolicyBuilder({ draft, addStatement, updateStatement, removeStatement, duplicateStatement, toggleStatement }){
    return(
        <div className="workspace-card">
            <div className="workspace-card-title">
                Policy Builder
            </div>
            {
                draft.statements.map(statement=>(
                    <PolicyStatement
                        key={statement.id}
                        statement={statement}
                        onChange={(updates)=>
                            updateStatement(
                                statement.id,
                                updates
                            )
                        }
                        onDelete={()=>
                            removeStatement(
                                statement.id
                            )
                        }
                        onDuplicate={()=>
                            duplicateStatement(
                                statement.id
                            )
                        }
                        onToggle={()=>
                            toggleStatement(
                                statement.id
                            )
                        }
                    />
                ))
            }

            <button
                className="bucket-toolbar-btn primary"
                onClick={addStatement}
            >
                Add Statement
            </button>
        </div>
    );
}