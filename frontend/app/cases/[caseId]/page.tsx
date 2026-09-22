import CaseWorkspaceClient from "./case-workspace-client";

export default async function CasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <CaseWorkspaceClient caseId={caseId} />;
}
