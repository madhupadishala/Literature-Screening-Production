import Link from "next/link";
import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import { Card } from "@/components/ui/Card";
import styles from "./dashboard.module.css";

const WORKFLOW = [
  {
    label: "Hits",
    href: "/hits",
    description: "Review retrieved literature, duplicates, product matches and AI relevance suggestions.",
  },
  {
    label: "Screening",
    href: "/screening",
    description: "Perform human literature relevance and patient-safety screening decisions.",
  },
  {
    label: "Medical Review",
    href: "/review",
    description: "Complete medical review, listedness/expectedness and causality assessment.",
  },
] as const;

export default function LiteratureDashboardPage() {
  return (
    <ApplicationShell module="LITERATURE">
      <OperationalScreenHeader
        eyebrow="Literature Screening · Dashboard"
        title="Literature Screening Dashboard"
        description="Operational entry point for the literature safety workflow and user workload."
        status="Controlled workspace"
      />
      <nav className={styles.workflowGrid} aria-label="Literature workflow">
        {WORKFLOW.map((item) => (
          <Card key={item.href}>
            <Link href={item.href} className={styles.workflowLink}>
              <span className={styles.kicker}>PV workflow</span>
              <strong className={styles.heading}>{item.label}</strong>
              <p className={styles.description}>{item.description}</p>
            </Link>
          </Card>
        ))}
      </nav>
      <Card className={styles.assessment} aria-label="Shared safety assessment">
        <span className={styles.kicker}>Shared safety assessment</span>
        <strong className={styles.heading}>Seriousness · Listedness / Expectedness · Causality</strong>
        <p className={styles.description}>
          These assessments use the common governed safety-assessment layer and are surfaced
          contextually in Screening, Medical Review, Intake and Case Processing.
        </p>
      </Card>
    </ApplicationShell>
  );
}
