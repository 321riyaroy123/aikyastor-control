import { useEffect, useState } from "react";
import { BucketPolicyAPI } from "../api/bucketPolicies";

const EMPTY_POLICY = {
    version: "2012-10-17",
    statements: [
        createStatement()
    ]
};

function createStatement(number = 1) {
    return {
        id: crypto.randomUUID(),
        sid: `Statement${number}`,
        description: "",
        enabled: true,
        principal: "*",
        effect: "Allow",
        actions: [],
        resources: [
            {
                type: "bucket-objects",
                value: ""
            }
        ],
        conditions: {
            secureTransport: false,
            sourceIp: "",
            dateAfter: "",
            dateBefore: ""
        }
    };
}

function updateStatement(id, updates){
    setPolicyDraft(current=>({
        ...current,
        statements: current.statements.map(statement=>
            statement.id===id
                ? {
                    ...statement,
                    ...updates
                }
                : statement
        )
    }));
}

function duplicateStatement(id) {
    setPolicyDraft(current => {
        const statement = current.statements.find(
            s => s.id === id
        );

        if (!statement) {
            return current;
        }

        return {
            ...current,
            statements: [
                ...current.statements,
                {
                    ...statement,
                    id: crypto.randomUUID(),
                    sid: `Statement${current.statements.length + 1}`
                }
            ]
        };
    });
}

function toggleStatement(id) {
    updateStatement(
        id,
        {
            enabled: !policyDraft.statements.find(
                s => s.id === id
            ).enabled
        }
    );
}

function addStatement(){
    setPolicyDraft(current=>({
        ...current,
        statements:[
            ...current.statements,
            createStatement(current.statements.length + 1)
        ]
    }));
}

function removeStatement(id){
    setPolicyDraft(current=>{
        if(current.statement.length === 1){
            return current;
        }
        return {
            ...current,
            statements:
                current.statements.filter(
                    s=>s.id!==id
                )
        };
    });
}

export default function useBucketPolicy(bucket, toast) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [policyDraft, setPolicyDraft] = useState(EMPTY_POLICY);

    useEffect(() => {
        if (!bucket) return;
        loadPolicy();
    }, [bucket]);

    function updateStatement(id, updates) {
        setPolicyDraft(current => ({
            ...current,
            statements: current.statements.map(statement =>
                statement.id === id ? { ...statement, ...updates } : statement
            )
        }));
    }

    function duplicateStatement(id) {
        setPolicyDraft(current => {
            const statement = current.statements.find(s => s.id === id);
            if (!statement) return current;
            return {
                ...current,
                statements: [...current.statements, { ...statement, id: crypto.randomUUID(), sid: `Statement${current.statements.length + 1}` }]
            };
        });
    }

    function toggleStatement(id) {
        const target = policyDraft.statements.find(s => s.id === id);
        if (target) updateStatement(id, { enabled: !target.enabled });
    }

    function addStatement() {
        setPolicyDraft(current => ({
            ...current,
            statements: [...current.statements, createStatement(current.statements.length + 1)]
        }));
    }

    function removeStatement(id) {
        setPolicyDraft(current => {
            if (current.statements.length === 1) return current; // fixed typo
            return { ...current, statements: current.statements.filter(s => s.id !== id) };
        });
    }

    async function loadPolicy() {
        setLoading(true);

        try {
            const result = await BucketPolicyAPI.get(bucket.name);
            if (result.policy) {
                setPolicyDraft(result.policy);
            }
            else {
                setPolicyDraft(EMPTY_POLICY);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function applyPolicy() {
        setSaving(true);

        try {
            const result = await BucketPolicyAPI.put(
                bucket.name,
                policyDraft
            );

            toast?.(
                result.message,
                "success"
            );
        } catch (err) {
            toast?.(
                err.message,
                "error"
            );
        } finally {
            setSaving(false);
        }
    }

    async function deletePolicy() {
        setSaving(true);
        try {
            const result = await BucketPolicyAPI.remove(
                bucket.name
            );

            toast?.(
                result.message,
                "success"
            );

            setPolicyDraft(EMPTY_POLICY);
            setSelectedTemplate(null);
        } catch (err) {
            toast?.(
                err.message,
                "error"
            );
        } finally {
            setSaving(false);
        }
    }

    function templateToStatement(template) {
        const base = createStatement(1);
        switch (template.id) {
            case "private":
                return { ...base, principal: "owner", actions: [] };
            case "public-read":
                return { ...base, principal: "*", actions: ["GetObject"] };
            case "read-only":
                return { ...base, principal: "authenticated", actions: ["GetObject", "ListBucket"] };
            default:
                return base;
        }
    }

    function applyTemplate(template) {
        setSelectedTemplate(template);
        setPolicyDraft({ version: "2012-10-17", statements: [templateToStatement(template)] });
    }

    return {
        loading,
        saving,
        selectedTemplate,
        policyDraft,
        setPolicyDraft,
        applyPolicy,
        deletePolicy,
        applyTemplate,
        loadPolicy,
        updateStatement,
        addStatement,
        removeStatement,
        duplicateStatement,
        toggleStatement,
    };
}