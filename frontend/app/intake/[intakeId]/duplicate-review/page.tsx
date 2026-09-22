import DuplicateReviewClient from "./duplicate-review-client";

export default async function DuplicateReviewPage({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { intakeId } = await params;
  return <DuplicateReviewClient intakeId={intakeId} />;
}
