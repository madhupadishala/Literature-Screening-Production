import { NextResponse } from "next/server";

import { knowledgeGovernanceService } from "@/lib/knowledge/governance/knowledge-governance-service";
import type {
  CreateGovernanceRecordInput,
  GovernanceActionInput,
} from "@/lib/knowledge/governance/knowledge-governance-types";

export async function GET() {
  return NextResponse.json({
    status: knowledgeGovernanceService.getStatus(),
    records: knowledgeGovernanceService.listRecords(),
    auditEvents: knowledgeGovernanceService.listAuditEvents(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateGovernanceRecordInput;

  if (!body.knowledgeDocumentId || !body.version) {
    return NextResponse.json(
      {
        error: "knowledgeDocumentId and version are required.",
      },
      {
        status: 400,
      },
    );
  }

  const record = knowledgeGovernanceService.createRecord(body);

  return NextResponse.json(
    {
      record,
    },
    {
      status: 201,
    },
  );
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as GovernanceActionInput;

  if (!body.governanceRecordId || !body.action || !body.actor) {
    return NextResponse.json(
      {
        error:
          "governanceRecordId, action and actor are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = knowledgeGovernanceService.applyAction(body);

  return NextResponse.json(result);
}