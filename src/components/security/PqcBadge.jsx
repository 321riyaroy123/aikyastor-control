import StatusBadge from "../common/StatusBadge";
import { pqcVerdict } from "./pqcVerdict";

/**
 * PqcBadge - compact verdict for the RGW HTTPS key exchange.
 * `status` is the backend `status` string; `group` the negotiated group.
 */
export default function PqcBadge({ status, group, simulated = false }) {
  const verdict = pqcVerdict(status);
  const text = status === "pqc_verified" && group ? group : verdict.label;

  return (
    <StatusBadge color={verdict.color}>
      {text}{simulated ? " · SIM" : ""}
    </StatusBadge>
  );
}
