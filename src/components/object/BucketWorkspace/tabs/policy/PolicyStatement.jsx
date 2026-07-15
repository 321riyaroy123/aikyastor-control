const ACTIONS = [
    "GetObject",
    "PutObject",
    "DeleteObject",
    "ListBucket",
    "GetBucketPolicy",
    "PutBucketPolicy"
];

const RESOURCE_TYPES = [
    {
        id: "bucket",
        label: "Bucket"
    },
    {
        id: "bucket-objects",
        label: "All Objects"
    },
    {
        id: "prefix",
        label: "Object Prefix"
    },
    {
        id: "object",
        label: "Specific Object"
    }
];

export default function PolicyStatement({ statement, onChange, onDuplicate, onDelete, onToggle }){
    function toggleAction(action){
        const exists = statement.actions.includes(action);

        onChange({
            actions: exists
                ? statement.actions.filter(
                    a=>a!==action
                )
                : [
                    ...statement.actions,
                    action
                ]
        });
    }

    return(
        <div className="policy-statement">
            {/* Header */}
            <div className="policy-statement-header">
                <div>
                    <h3>
                        {statement.sid}
                    </h3>
                    <small>
                        {statement.description || "No description"}
                    </small>
                </div>

                <div className="policy-statement-actions">
                    <button onClick={onToggle} className="icon-btn">
                        {
                            statement.enabled
                                ? <Eye size={16}/>
                                : <EyeOff size={16}/>
                        }
                    </button>

                    <button onClick={onDuplicate} className="icon-btn">
                        <Copy size={16}/>
                    </button>

                    <button onClick={onDelete} className="icon-btn danger">
                        <Trash2 size={16}/>
                    </button>
                </div>
            </div>

            {/* Description */}
            <div className="policy-section">
                <label>
                    Description
                </label>

                <input
                    value={statement.description}
                    onChange={(e)=>
                        onChange({
                            description:e.target.value
                        })
                    }
                />
            </div>

            {/* Principal */}
            <div className="policy-section">
                <label>
                    Principal
                </label>

                <select
                    value={statement.principal}
                    onChange={(e)=>
                        onChange({
                            principal:e.target.value
                        })
                    }
                >
                    <option value="*">
                        Everyone
                    </option>

                    <option value="authenticated">
                        Authenticated Users
                    </option>

                    <option value="owner">
                        Bucket Owner
                    </option>
                </select>
            </div>

            {/* Effect */}
            <div className="policy-section">
                <label>
                    Effect
                </label>

                <select
                    value={statement.effect}
                    onChange={(e)=>
                        onChange({
                            effect:e.target.value
                        })
                    }
                >
                    <option> Allow </option>
                    <option> Deny</option>
                </select>
            </div>

            {/* Actions */}
            <div className="policy-section">
                <label>
                    Actions
                </label>

                <div className="policy-actions-grid">
                    {
                        ACTIONS.map(action=>(
                            <label
                                key={action}
                                className="policy-checkbox"
                            >
                                <input
                                    type="checkbox"
                                    checked={statement.actions.includes(action)}
                                    onChange={()=>
                                        toggleAction(action)
                                    }
                                />
                                {action}
                            </label>
                        ))
                    }
                </div>
            </div>

            {/* Resources */}
            <div className="policy-section">
                <label>
                    Resources
                </label>
                {
                    statement.resources.map((resource, index) => (
                        <div
                            key={index}
                            className="policy-resource-card"
                        >
                            <select
                                value={resource.type}
                                onChange={(e)=>{
                                    const resources=[
                                        ...statement.resources
                                    ];
                                    resources[index]={
                                        ...resources[index],
                                        type:e.target.value
                                    };
                                    onChange({
                                        resources
                                    });
                                }}
                            >
                                {
                                    RESOURCE_TYPES.map(type=>(
                                        <option
                                            key={type.id}
                                            value={type.id}
                                        >
                                            {type.label}
                                        </option>
                                    ))
                                }
                            </select>

                            {
                                resource.type==="prefix" && (
                                    <input
                                        type="text"
                                        placeholder="images/"
                                        value={resource.value}
                                        onChange={(e)=>{
                                            const resources=[
                                                ...statement.resources
                                            ];

                                            resources[index]={
                                                ...resources[index],
                                                value:e.target.value
                                            };

                                            onChange({
                                                resources
                                            });
                                        }}
                                    />
                                )
                            }
                            {
                                resource.type==="object" && (
                                    <input
                                        type="text"
                                        placeholder="report.pdf"
                                        value={resource.value}
                                        onChange={(e)=>{
                                            const resources=[
                                                ...statement.resources
                                            ];
                                            resources[index]={
                                                ...resources[index],
                                                value:e.target.value
                                            };
                                            onChange({
                                                resources
                                            });
                                        }}
                                    />
                                )
                            }
                        </div>
                    ))
                }

                <button
                    className="bucket-toolbar-btn"
                    onClick={()=>{
                        onChange({
                            resources:[
                                ...statement.resources,
                                {
                                    type:"bucket-objects",
                                    value:""
                                }
                            ]
                        });
                    }}
                >
                    + Add Resource
                </button>
            </div>
            
            {/* Conditions */}
            <div className="policy-section">
                <label>
                    Conditions
                </label>
                <div className="policy-condition-card">
                    {/* HTTPS */}
                    <label className="policy-checkbox">
                        <input
                            type="checkbox"
                            checked={statement.conditions.secureTransport}
                            onChange={(e)=>
                                onChange({
                                    conditions:{
                                        ...statement.conditions,
                                        secureTransport:e.target.checked
                                    }
                                })
                            }
                        />
                        Require HTTPS (Secure Transport)
                    </label>

                    {/* Source IP */}
                    <div className="policy-condition-field">
                        <label>
                            Source IP
                        </label>
                        <input
                            type="text"
                            placeholder="192.168.1.0/24"
                            value={statement.conditions.sourceIp}
                            onChange={(e)=>
                                onChange({
                                    conditions:{
                                        ...statement.conditions,
                                        sourceIp:e.target.value
                                    }
                                })
                            }
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}