from backend.api import ScreeningApi

api = ScreeningApi()

result = api.run(
    tenant_id="demo-tenant",
    article_path="evidence_store/demo-tenant/PMID_38912721/canonical_article.json",
    hits_output_path="evidence_store/demo-tenant/PMID_38912721/hits_output.json",
)

print(result)