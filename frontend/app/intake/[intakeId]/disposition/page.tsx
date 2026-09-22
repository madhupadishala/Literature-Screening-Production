import DispositionClient from "./disposition-client";

export default async function DispositionPage({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { intakeId } = await params;
  return <DispositionClient intakeId={intakeId} />;
}
