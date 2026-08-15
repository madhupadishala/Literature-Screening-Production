export default function ValidationDemoBanner() {
  if (process.env.NEXT_PUBLIC_VALIDATION_DEMO_MODE !== "true") return null;

  return (
    <aside
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10000,
        padding: "10px 16px",
        background: "#92400e",
        color: "#fff",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "0.04em",
      }}
    >
      VALIDATION DEMO — PUBLIC, SYNTHETIC OR DE-IDENTIFIED DATA ONLY — NOT
      FORMAL VALIDATION EVIDENCE
    </aside>
  );
}
