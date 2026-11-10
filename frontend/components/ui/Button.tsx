import type { ButtonHTMLAttributes } from "react";
import s from "./primitives.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  loading?: boolean;
  finalized?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  finalized = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading || finalized}
      aria-busy={loading || undefined}
      className={[s.button, variant === "secondary" ? s.secondary : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? "Loading…" : children}
    </button>
  );
}
export default Button;