/**
 * Analyse a bucket policy in the UI model returned by
 * GET /object/buckets/<bucket>/policy  (converted from RGW by
 * convert_aws_bucket_policy_to_ui):
 *
 *   { version, statements: [{ sid, enabled, effect, principal, actions,
 *                             resources, conditions }] }
 *
 * Returns:
 *   {
 *     state:    "none" | "private" | "custom" | "public",
 *     level:    "ok" | "warn" | "bad" | "neutral",
 *     headline: string,
 *     findings: [{ level, text }],
 *     summary:  { statements, actions[], principals[], allowsDelete, ... }
 *   }
 *
 * "public" means an enabled Allow statement grants an action to principal
 * "*" (everyone) with no IP condition. Principals such as "authenticated"
 * and "owner" are rejected by the backend converter, so they cannot appear
 * in an applied policy.
 */

const READ_ACTIONS = new Set(["GetObject", "ListBucket", "GetBucketPolicy"]);
const WRITE_ACTIONS = new Set(["PutObject", "DeleteObject", "PutBucketPolicy"]);

export function analyzePolicy(policy) {
    const statements = policy?.statements ?? [];

    if (!policy || statements.length === 0) {
        return {
            state: "none",
            level: "neutral",
            headline: "No bucket policy applied",
            findings: [],
            summary: { statements: 0, actions: [], principals: [], allowsDelete: false }
        };
    }

    const enabled = statements.filter((s) => s.enabled !== false);
    const allows = enabled.filter((s) => (s.effect || "Allow") === "Allow");

    const actions = [...new Set(enabled.flatMap((s) => s.actions || []))];
    const principals = [...new Set(enabled.map((s) => s.principal ?? "*"))];
    const allowsDelete = allows.some((s) => (s.actions || []).includes("DeleteObject"));

    const findings = [];
    let publicRead = false;
    let publicWrite = false;

    allows.forEach((s) => {
        const isEveryone = (s.principal ?? "*") === "*";
        const hasIpLimit = Boolean(s.conditions?.sourceIp);
        const acts = s.actions || [];
        const label = s.sid || "A statement";

        if (isEveryone && !hasIpLimit) {
            if (acts.some((a) => WRITE_ACTIONS.has(a))) {
                publicWrite = true;
                findings.push({
                    level: "bad",
                    text: `${label} lets anyone perform write actions (${acts.filter((a) => WRITE_ACTIONS.has(a)).join(", ")}) with no IP restriction.`
                });
            } else if (acts.some((a) => READ_ACTIONS.has(a))) {
                publicRead = true;
                findings.push({
                    level: "warn",
                    text: `${label} lets anyone read this bucket (${acts.filter((a) => READ_ACTIONS.has(a)).join(", ")}) with no IP restriction.`
                });
            }
        }

        if (acts.includes("PutBucketPolicy")) {
            findings.push({
                level: "warn",
                text: `${label} allows changing the bucket policy itself.`
            });
        }

        if (!s.conditions?.secureTransport && isEveryone) {
            findings.push({
                level: "info",
                text: `${label} does not require HTTPS (aws:SecureTransport).`
            });
        }
    });

    if (enabled.length !== statements.length) {
        findings.push({
            level: "info",
            text: `${statements.length - enabled.length} disabled statement(s) are shown in the editor but are not part of the applied policy.`
        });
    }

    let state = "custom";
    let level = "warn";
    let headline = "Custom bucket policy applied";

    if (publicWrite) {
        state = "public";
        level = "bad";
        headline = "Public write access is granted";
    } else if (publicRead) {
        state = "public";
        level = "warn";
        headline = "Public read access is granted";
    } else if (allows.length === 0) {
        state = "private";
        level = "ok";
        headline = "Policy applied, and grants no public access";
    } else {
        level = "ok";
        headline = "Custom bucket policy applied. No public access detected";
    }

    return {
        state,
        level,
        headline,
        findings,
        summary: {
            statements: statements.length,
            actions,
            principals,
            allowsDelete
        }
    };
}