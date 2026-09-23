import "server-only";

import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { assertIntakeLifecycleReviewsApproved } from "@/lib/safety/intake/intake-lifecycle-review-service";
import {
  finalizeIntakeDisposition,
  getDispositionWorkspace,
  type DispositionWorkspace,
} from "./disposition-service";
import type { IntakeDispositionRequest } from "./disposition-types";

export async function getReviewedDispositionWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<DispositionWorkspace> {
  await assertIntakeLifecycleReviewsApproved(input);
  return getDispositionWorkspace(input);
}

export async function finalizeReviewedIntakeDisposition(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  request: IntakeDispositionRequest;
}): Promise<DispositionWorkspace> {
  await assertIntakeLifecycleReviewsApproved({
    principal: input.principal,
    intakeRecordId: input.intakeRecordId,
  });
  return finalizeIntakeDisposition(input);
}
