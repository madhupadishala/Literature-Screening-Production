import TriageClient from "./triage-client";

export default async function TriagePage({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { intakeId } = await params;
  return <TriageClient intakeId={intakeId} />;
}
