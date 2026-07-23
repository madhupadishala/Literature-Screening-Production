# ClinixAI Azure validation environment

This directory provisions the first externally reachable ClinixAI Literature
Screening environment for controlled configuration and PMID validation.

## Architecture

- Azure Container Apps for the Next.js container
- Azure Container Registry for immutable images
- Azure Database for PostgreSQL Flexible Server 16
- `vector` extension enabled for pgvector migrations
- Private VNet connectivity between Container Apps and PostgreSQL
- Private DNS for PostgreSQL
- Log Analytics for application and platform logs
- A manually triggered Container Apps migration job
- HTTPS on the Azure-provided Container Apps domain

The initial environment is deliberately a **staging/validation** environment.
It is not a client production release. High availability, longer backup
retention, disaster-recovery replication, WAF, custom-domain DNS, formal
security approval and production UAT remain separate production gates.

## Prerequisites

1. An Azure subscription where you may create chargeable resources.
2. Azure CLI with the Container Apps extension.
3. Permission to create resource groups, role assignments, Container Apps,
   ACR, networking and PostgreSQL.
4. A Groq API key.
5. A URL-safe PostgreSQL password containing only letters, numbers, `.`, `_`,
   `~` or `-`.
6. A random monitoring token of at least 32 characters.

## Validate the template

```powershell
az bicep build --file .\infra\azure\main.bicep
```

## Deploy

Run from the repository root:

```powershell
.\infra\azure\deploy-staging.ps1 `
  -SubscriptionId "<AZURE-SUBSCRIPTION-ID>"
```

The script performs two governed deployments:

1. Provision networking, PostgreSQL, ACR, logging and bootstrap Container Apps.
2. Build the immutable image in ACR and update the app and migration job.

It then starts one migration job. The migration runner uses a PostgreSQL
advisory lock and checksum verification.

## Post-deployment gates

1. Confirm the migration execution succeeded.
2. Confirm `/api/health/live` returns HTTP 200.
3. Confirm `/api/health/ready` returns HTTP 200.
4. Run authoritative E2E and release gates using the Azure URL.
5. Upload, validate and activate the approved Product Master and Literature
   Calendar.
6. Run controlled PMID validation.
7. Add a custom domain only after the environment passes these gates.

Never commit passwords, API keys, monitoring tokens, database URLs or Azure
credentials.
