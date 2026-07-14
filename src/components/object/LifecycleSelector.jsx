import { styles } from "../../styles/theme";

// NEW component - the original UI has no bucket-policy assignment screen.
// This is a ready-to-use building block for the future lifecycle-policy
// feature (backend routes already exist: policy_routes.py / PolicyAPI).
// Not wired into BucketDetails or any page yet.
export default function LifecycleSelector({ policies = [], value, onChange }) {
  return (
    <select style={styles.formInput} value={value || ""} onChange={e => onChange?.(e.target.value)}>
      <option value="">— No lifecycle policy —</option>
      {policies.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}{p.expire_days ? ` (${p.expire_days}d)` : ""}
        </option>
      ))}
    </select>
  );
}
