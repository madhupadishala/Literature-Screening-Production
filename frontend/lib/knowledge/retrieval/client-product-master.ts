import "server-only";
import { getPostgresPool } from "@/lib/database/postgres";

interface ApprovedProductRow {
  id: string;
  trade_name: string;
  aliases: string[];
  active_ingredients: string[];
  source_document_key: string;
}

/** Only records approved for this specific tenant AND client workspace qualify.
 * An empty match is UNKNOWN, never evidence of non-company ownership.
 */
export async function findApprovedClientProducts(input: {
  tenantId: string;
  workspaceId: string;
  sourceText: string;
}): Promise<Array<Record<string, unknown>>> {
  if (!input.tenantId || !input.workspaceId || !input.sourceText.trim()) {
    throw new Error("AG01 product query must be fully scoped");
  }
  const {rows} = await getPostgresPool().query<ApprovedProductRow>(
    `SELECT id::text, trade_name, aliases, active_ingredients, source_document_key
       FROM nexus_client_product_master
      WHERE tenant_id = $1 AND workspace_id = $2
        AND governance_status = 'approved'
        AND production_eligible IS TRUE
        AND effective_from <= CURRENT_DATE
        AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
      ORDER BY product_key
      LIMIT 501`,
    [input.tenantId, input.workspaceId],
  );
  if (rows.length > 500) throw new Error("AG01 Product Master record limit exceeded");
  const text = input.sourceText.normalize("NFKC").toLocaleLowerCase("en");
  function present(value: string): boolean {
    const term = value.normalize("NFKC").trim().toLocaleLowerCase("en");
    if (!term || term.length > 150) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^\\p{L}\\p{N}])" + escaped + "(?=$|[^\\p{L}\\p{N}])", "u").test(text);
  }
  return rows.filter(row => {
    const terms = [row.trade_name, ...(Array.isArray(row.aliases) ? row.aliases : [])];
    return terms.some(t => typeof t === "string" && present(t));
  }).map(row => ({
    product_id: row.id,
    trade_name: row.trade_name,
    aliases: row.aliases,
    active_ingredients: row.active_ingredients,
    source_document_key: row.source_document_key,
  }));
}
