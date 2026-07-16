import { roleLabels, type UserRole } from "@/lib/rbac/rbac-rules";

type RoleBadgeProps = {
  role: UserRole;
};

export default function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      title={role}
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid #d1d5db",
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      {roleLabels[role]}
    </span>
  );
}