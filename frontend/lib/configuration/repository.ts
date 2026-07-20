import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/database/postgres";
import type {
  ConfigurationLifecycleStatus,
  ConfigurationResourceType,
  ConfigurationValidationReport,
  ConfigurationVersionRecord,
} from "@/lib/configuration/types";
import { validateConfigurationPayload } from "@/lib/configuration/validation";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

function sha256Payload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function toVersionRecord(row: Record<string, unknown>): ConfigurationVersionRecord {
  return {
    id: String(row.id),
    configSetId: String(row.config_set_id),
    tenantId: String(row.tenant_id),
    resourceType: String(row.resource_type) as ConfigurationResourceType,
    configKey: String(row.config_key),
    displayName: String(row.display_name),
    versionNumber: Number(row.version_number),
    versionLabel: String(row.version_label),
    lifecycleStatus: String(
      row.lifecycle_status,
    ) as ConfigurationLifecycleStatus,
    effectiveFrom: row.effective_from
      ? new Date(String(row.effective_from)).toISOString()
      : null,
    effectiveTo: row.effective_to
      ? new Date(String(row.effective_to)).toISOString()
      : null,
    payload: row.payload,
    validationReport:
      (row.validation_report as ConfigurationValidationReport) || {},
    sourceFilename: row.source_filename
      ? String(row.source_filename)
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function audit(
  client: PoolClient,
  input: {
    principal: RequestPrincipal;
    configSetId?: string | null;
    configVersionId?: string | null;
    action: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    reason?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO tenant_configuration_audit (
        tenant_id,
        config_set_id,
        config_version_id,
        actor_id,
        action,
        previous_status,
        new_status,
        reason,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      input.principal.tenantId,
      input.configSetId || null,
      input.configVersionId || null,
      input.principal.userId,
      input.action,
      input.previousStatus || null,
      input.newStatus || null,
      input.reason || null,
      JSON.stringify(input.details || {}),
    ],
  );
}

export async function createConfigurationVersion(input: {
  principal: RequestPrincipal;
  resourceType: ConfigurationResourceType;
  configKey: string;
  displayName: string;
  description?: string;
  versionLabel: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  payload: unknown;
  changeReason?: string;
  upload?: {
    uploadId: string;
    sourceFilename: string;
    sourceMediaType: string;
    sourceStorageKey: string;
  };
}): Promise<ConfigurationVersionRecord> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const setResult = await client.query<{ id: string }>(
      `
        INSERT INTO tenant_configuration_sets (
          tenant_id,
          resource_type,
          config_key,
          display_name,
          description,
          owner_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, resource_type, config_key)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = COALESCE(EXCLUDED.description, tenant_configuration_sets.description),
          updated_at = now()
        RETURNING id
      `,
      [
        input.principal.tenantId,
        input.resourceType,
        input.configKey,
        input.displayName,
        input.description || null,
        input.principal.userId,
      ],
    );

    const configSetId = setResult.rows[0].id;

    await client.query(
      `
        SELECT id
        FROM tenant_configuration_sets
        WHERE id = $1
        FOR UPDATE
      `,
      [configSetId],
    );

    const nextVersion = await client.query<{ version_number: number }>(
      `
        SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
        FROM tenant_configuration_versions
        WHERE config_set_id = $1
      `,
      [configSetId],
    );

    const validationReport = validateConfigurationPayload(
      input.resourceType,
      input.payload,
    );

    const versionResult = await client.query<Record<string, unknown>>(
      `
        INSERT INTO tenant_configuration_versions (
          config_set_id,
          tenant_id,
          version_number,
          version_label,
          lifecycle_status,
          effective_from,
          effective_to,
          payload,
          content_sha256,
          upload_id,
          source_filename,
          source_media_type,
          source_storage_key,
          validation_report,
          change_reason,
          created_by
        )
        VALUES (
          $1, $2, $3, $4, 'draft', $5, $6, $7::jsonb, $8,
          $9, $10, $11, $12, $13::jsonb, $14, $15
        )
        RETURNING *
      `,
      [
        configSetId,
        input.principal.tenantId,
        nextVersion.rows[0].version_number,
        input.versionLabel,
        input.effectiveFrom || null,
        input.effectiveTo || null,
        JSON.stringify(input.payload),
        sha256Payload(input.payload),
        input.upload?.uploadId || null,
        input.upload?.sourceFilename || null,
        input.upload?.sourceMediaType || null,
        input.upload?.sourceStorageKey || null,
        JSON.stringify(validationReport),
        input.changeReason || null,
        input.principal.userId,
      ],
    );

    const row: Record<string, unknown> = {
      ...versionResult.rows[0],
      resource_type: input.resourceType,
      config_key: input.configKey,
      display_name: input.displayName,
    };

    await audit(client, {
      principal: input.principal,
      configSetId,
      configVersionId: String(row.id),
      action: "CONFIGURATION_VERSION_CREATED",
      newStatus: "draft",
      reason: input.changeReason || null,
      details: {
        resourceType: input.resourceType,
        configKey: input.configKey,
        versionLabel: input.versionLabel,
        validationReport,
      },
    });

    await client.query("COMMIT");
    return toVersionRecord(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordConfigurationUpload(input: {
  principal: RequestPrincipal;
  resourceType: ConfigurationResourceType;
  originalFilename: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}): Promise<string> {
  const result = await getPostgresPool().query<{ id: string }>(
    `
      INSERT INTO configuration_uploads (
        tenant_id,
        resource_type,
        original_filename,
        media_type,
        size_bytes,
        sha256,
        storage_key,
        uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      input.principal.tenantId,
      input.resourceType,
      input.originalFilename,
      input.mediaType,
      input.sizeBytes,
      input.sha256,
      input.storageKey,
      input.principal.userId,
    ],
  );

  return result.rows[0].id;
}

export async function updateConfigurationUploadStatus(input: {
  uploadId: string;
  status: "uploaded" | "parsed" | "validated" | "quarantined" | "failed";
  storageKey?: string;
  failureCode?: string;
  failureReason?: string;
}): Promise<void> {
  await getPostgresPool().query(
    `
      UPDATE configuration_uploads
      SET
        processing_status = $2,
        storage_key = COALESCE($3, storage_key),
        failure_code = $4,
        failure_reason = $5
      WHERE id = $1
    `,
    [
      input.uploadId,
      input.status,
      input.storageKey || null,
      input.failureCode || null,
      input.failureReason || null,
    ],
  );
}

export async function listConfigurationVersions(input: {
  principal: RequestPrincipal;
  resourceType?: ConfigurationResourceType | null;
  limit?: number;
}): Promise<ConfigurationVersionRecord[]> {
  const limit = Math.max(1, Math.min(input.limit || 100, 500));

  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      SELECT
        v.*,
        s.resource_type,
        s.config_key,
        s.display_name
      FROM tenant_configuration_versions v
      JOIN tenant_configuration_sets s ON s.id = v.config_set_id
      WHERE v.tenant_id = $1
        AND ($2::text IS NULL OR s.resource_type = $2)
      ORDER BY v.created_at DESC
      LIMIT $3
    `,
    [
      input.principal.tenantId,
      input.resourceType || null,
      limit,
    ],
  );

  return result.rows.map(toVersionRecord);
}

export async function getConfigurationVersion(input: {
  principal: RequestPrincipal;
  versionId: string;
}): Promise<ConfigurationVersionRecord | null> {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      SELECT
        v.*,
        s.resource_type,
        s.config_key,
        s.display_name
      FROM tenant_configuration_versions v
      JOIN tenant_configuration_sets s ON s.id = v.config_set_id
      WHERE v.id = $1
        AND v.tenant_id = $2
      LIMIT 1
    `,
    [input.versionId, input.principal.tenantId],
  );

  return result.rows[0] ? toVersionRecord(result.rows[0]) : null;
}

export async function transitionConfigurationVersion(input: {
  principal: RequestPrincipal;
  versionId: string;
  action: "VALIDATE" | "APPROVE" | "ACTIVATE" | "RETIRE" | "REJECT";
  reason: string;
}): Promise<ConfigurationVersionRecord> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query<Record<string, unknown>>(
      `
        SELECT
          v.*,
          s.resource_type,
          s.config_key,
          s.display_name
        FROM tenant_configuration_versions v
        JOIN tenant_configuration_sets s ON s.id = v.config_set_id
        WHERE v.id = $1
          AND v.tenant_id = $2
        FOR UPDATE
      `,
      [input.versionId, input.principal.tenantId],
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error("Configuration version was not found.");
    }

    const previousStatus = String(row.lifecycle_status);
    const validationReport = validateConfigurationPayload(
      String(row.resource_type) as ConfigurationResourceType,
      row.payload,
    );

    let newStatus: ConfigurationLifecycleStatus;
    if (input.action === "VALIDATE") {
      if (!validationReport.valid) {
        throw new Error(
          "Configuration validation failed. Correct the reported errors before approval.",
        );
      }
      newStatus = "validated";
    } else if (input.action === "APPROVE") {
      if (!["validated", "approved"].includes(previousStatus)) {
        throw new Error(
          "Only a validated configuration version can be approved.",
        );
      }
      newStatus = "approved";
    } else if (input.action === "ACTIVATE") {
      if (!["approved", "active"].includes(previousStatus)) {
        throw new Error(
          "Only an approved configuration version can be activated.",
        );
      }
      newStatus = "active";

      await client.query(
        `
          UPDATE tenant_configuration_versions
          SET
            lifecycle_status = 'superseded',
            effective_to = COALESCE(effective_to, now()),
            updated_at = now()
          WHERE config_set_id = $1
            AND lifecycle_status = 'active'
            AND id <> $2
        `,
        [row.config_set_id, input.versionId],
      );
    } else if (input.action === "RETIRE") {
      newStatus = "retired";
    } else {
      newStatus = "rejected";
    }

    const transition = await client.query<Record<string, unknown>>(
      `
        UPDATE tenant_configuration_versions
        SET
          lifecycle_status = $2,
          validation_report = $3::jsonb,
          validated_by = CASE WHEN $4 = 'VALIDATE' THEN $5 ELSE validated_by END,
          validated_at = CASE WHEN $4 = 'VALIDATE' THEN now() ELSE validated_at END,
          approved_by = CASE WHEN $4 = 'APPROVE' THEN $5 ELSE approved_by END,
          approved_at = CASE WHEN $4 = 'APPROVE' THEN now() ELSE approved_at END,
          activated_by = CASE WHEN $4 = 'ACTIVATE' THEN $5 ELSE activated_by END,
          activated_at = CASE WHEN $4 = 'ACTIVATE' THEN now() ELSE activated_at END,
          effective_from = CASE
            WHEN $4 = 'ACTIVATE' THEN COALESCE(effective_from, now())
            ELSE effective_from
          END,
          effective_to = CASE
            WHEN $4 = 'RETIRE' THEN COALESCE(effective_to, now())
            ELSE effective_to
          END,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        input.versionId,
        newStatus,
        JSON.stringify(validationReport),
        input.action,
        input.principal.userId,
      ],
    );

    await audit(client, {
      principal: input.principal,
      configSetId: String(row.config_set_id),
      configVersionId: input.versionId,
      action: `CONFIGURATION_${input.action}`,
      previousStatus,
      newStatus,
      reason: input.reason,
      details: {
        resourceType: row.resource_type,
        configKey: row.config_key,
        versionLabel: row.version_label,
        validationReport,
      },
    });

    await client.query("COMMIT");

    return toVersionRecord({
      ...transition.rows[0],
      resource_type: row.resource_type,
      config_key: row.config_key,
      display_name: row.display_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listConfigurationAudit(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const limit = Math.max(1, Math.min(input.limit || 100, 500));

  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      SELECT
        a.id,
        a.action,
        a.previous_status,
        a.new_status,
        a.reason,
        a.details,
        a.occurred_at,
        s.resource_type,
        s.config_key,
        s.display_name,
        v.version_label,
        u.email AS actor_email,
        u.display_name AS actor_name
      FROM tenant_configuration_audit a
      LEFT JOIN tenant_configuration_sets s ON s.id = a.config_set_id
      LEFT JOIN tenant_configuration_versions v ON v.id = a.config_version_id
      LEFT JOIN application_users u ON u.id = a.actor_id
      WHERE a.tenant_id = $1
      ORDER BY a.occurred_at DESC
      LIMIT $2
    `,
    [input.principal.tenantId, limit],
  );

  return result.rows;
}
