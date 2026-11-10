import type { ReactNode, HTMLAttributes } from "react";
import s from "./primitives.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

export function Badge({ children, tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span {...props} className={[s.badge, tone === "neutral" ? "" : s[tone], className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

export function StatusBadge({ children, className, ...props }: BadgeProps) {
  return (
    <Badge {...props} tone="info" className={className}>
      {children}
    </Badge>
  );
}

export default Badge;