import { styles } from "../../styles/theme";

export default function Button({ variant = "ghost", size, onClick, children, style, disabled, as: Tag = "button", href, download }) {
  const variantStyle = styles[`btn${variant.charAt(0).toUpperCase() + variant.slice(1)}`] || {};
  const sizeStyle = size === "sm" ? styles.btnSm : {};
  const props = { onClick, disabled, style: { ...styles.btn, ...variantStyle, ...sizeStyle, ...style, opacity: disabled ? .5 : 1 } };
  if (Tag === "a") return <a href={href} download={download} {...props}>{children}</a>;
  return <button {...props}>{children}</button>;
}
