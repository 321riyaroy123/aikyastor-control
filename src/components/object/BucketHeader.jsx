import Card from "../common/Card";
import Button from "../common/Button";
import StatusBadge from "../common/StatusBadge";
import { C } from "../../styles/theme";

export default function BucketHeader({ bucket, policy, onEditPolicy}) {
    if (!bucket) return null;
    const lifecycle = policy?.lifecycle;

    return (
        <Card style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <div
                        style={{
                            fontFamily: "'Space Mono', monospace",
                            fontSize: ".75rem",
                            letterSpacing: "2px",
                            color: C.accent,
                            marginBottom: "1rem",
                            textTransform: "uppercase"
                        }}
                    >
                        Bucket Overview
                    </div>
                    <table style={{ borderSpacing: "0 .45rem" }}>
                        <tbody>
                            <tr>
                                <td style={{
                                    fontFamily: "'Space Mono', monospace",
                                    textTransform: "uppercase",
                                    fontSize: ".72rem",
                                    letterSpacing: "1px",
                                    color: C.muted,
                                    width: 140
                                }}>
                                    Owner
                                </td>
                                <td>
                                    {bucket.owner || "admin"}
                                </td>
                            </tr>
                            <tr>
                                <td style={{
                                        fontFamily: "'Space Mono', monospace",
                                        textTransform: "uppercase",
                                        fontSize: ".72rem",
                                        letterSpacing: "1px",
                                        color: C.muted,
                                        width: 140
                                    }}>
                                    ACL
                                </td>
                                <td>
                                    {bucket.acl || "Private"}
                                </td>
                            </tr>
                            <tr>
                                <td style={{
                                    fontFamily: "'Space Mono', monospace",
                                    textTransform: "uppercase",
                                    fontSize: ".72rem",
                                    letterSpacing: "1px",
                                    color: C.muted,
                                    width: 140
                                }}>
                                    Lifecycle
                                </td>
                                <td>
                                    {lifecycle ? (
                                        <StatusBadge status="success">
                                            {lifecycle.name}
                                        </StatusBadge>
                                    ) : (
                                        <StatusBadge>
                                            No Policy
                                        </StatusBadge>
                                    )}
                                </td>
                            </tr>
                            <tr>
                                <td style={{
                                    fontFamily: "'Space Mono', monospace",
                                    textTransform: "uppercase",
                                    fontSize: ".72rem",
                                    letterSpacing: "1px",
                                    color: C.muted,
                                    width: 140
                                }}>
                                    Description
                                </td>
                                <td>
                                    {lifecycle ? lifecycle.description : "Objects are kept forever."}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <Button variant="primary" onClick={onEditPolicy}>
                    Edit Lifecycle Policy
                </Button>
            </div>
        </Card>
    );
}