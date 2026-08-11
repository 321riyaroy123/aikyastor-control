import { C, styles } from "../../styles/theme";

// NEW component - not present in the original AiKyaStorCONTROL.jsx (there was
// no search/filter input anywhere in the app). Added per the target
// architecture as a ready-to-use building block for future bucket/object/
// image filtering. Not wired into any page, so current behavior is unchanged.
export default function SearchBar({ value, onChange, placeholder = "Search..." }) {
  return (
    <input
      style={{ ...styles.formInput, maxWidth: 260 }}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange?.(e.target.value)}
    />
  );
}
