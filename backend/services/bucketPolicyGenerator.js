/**
bucketPolicyGenerator.js
============================================================================

 * Converts the visual BUCKET ACCESS policy model into an AWS S3-compatible
   Bucket Policy document.

 * Renamed from policyGenerator.js — this only concerns bucket ACCESS
 * policies (who can do what), not lifecycle/retention policies.
 * ============================================================================
*/

function generateResources(resources, bucketName) {
    if (!resources || resources.length === 0) {
        return [
            `arn:aws:s3:::${bucketName}/*`
        ];
    }

    return resources.map(resource => {
        switch (resource.type) {
            case "bucket":
                return `arn:aws:s3:::${bucketName}`;

            case "bucket-objects":
                return `arn:aws:s3:::${bucketName}/*`;

            case "prefix":
                return `arn:aws:s3:::${bucketName}/${resource.value}/*`;

            case "object":
                return `arn:aws:s3:::${bucketName}/${resource.value}`;

            default:
                return `arn:aws:s3:::${bucketName}/*`;
        }
    });
}

function generateConditions(conditions) {
    const output = {};

    if (conditions.secureTransport) {
        output.Bool = {
            "aws:SecureTransport": "true"
        };
    }

    if (conditions.sourceIp.trim()) {
        output.IpAddress = {
            "aws:SourceIp": conditions.sourceIp.trim()
        };
    }
    return output;
}

export function generateBucketPolicyStatement(statement, bucketName) {
    if (!statement.enabled) {
        return null;
    }

    return {
        Sid: statement.sid,
        Effect: statement.effect,
        Principal:
            statement.principal === "*"
                ? "*"
                : {
                    AWS: statement.principal
                },
        Action: statement.actions.map(
            action => `s3:${action}`
        ),
        Resource: generateResources(
            statement.resources,
            bucketName
        ),
        ...(Object.keys(generateConditions(statement.conditions)).length > 0 && {
            Condition: generateConditions(statement.conditions)
        })
    };
}

export function generateBucketPolicy(draft, bucketName) {
    return {
        Version: draft.version,
        Statement:
            draft.statements
                .map(statement =>
                    generateBucketPolicyStatement(
                        statement,
                        bucketName
                    )
                )
                .filter(Boolean)
    };
}

export function summarizeBucketPolicy(policy) {
    const summary = {
        statements: policy.Statement.length,
        publicAccess: false,
        allowsDelete: false,
        principals: new Set(),
        actions: new Set()
    };

    policy.Statement.forEach(statement => {
        if (statement.Principal === "*") {
            summary.publicAccess = true;
        }

        if (
            statement.Action.includes(
                "s3:DeleteObject"
            )
        ) {
            summary.allowsDelete = true;
        }

        summary.principals.add(
            JSON.stringify(
                statement.Principal
            )
        );

        statement.Action.forEach(action =>
            summary.actions.add(action)
        );
    });

    return {
        ...summary,
        principals:
            [...summary.principals],
        actions:
            [...summary.actions]
    };
}