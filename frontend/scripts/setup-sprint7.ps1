$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = "C:\Users\Hp\Literature-Screening-Production"
$frontendRoot = Join-Path $projectRoot "frontend"
$appEnvFile = Join-Path $frontendRoot ".env.local"

if (-not (Test-Path -LiteralPath $frontendRoot -PathType Container)) {
    throw "Frontend folder not found: $frontendRoot"
}

if (-not (Test-Path -LiteralPath $appEnvFile -PathType Leaf)) {
    New-Item -ItemType File -Path $appEnvFile -Force | Out-Null
}

function Read-EnvironmentFile([string]$Path) {
    $values = [ordered]@{}
    foreach ($line in Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }

        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $values[$parts[0].Trim()] = $parts[1]
        }
    }
    return $values
}

function Write-EnvironmentFile([string]$Path, $Values) {
    $lines = foreach ($key in ($Values.Keys | Sort-Object)) {
        "$key=$($Values[$key])"
    }

    [System.IO.File]::WriteAllLines(
        $Path,
        $lines,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

$appValues = Read-EnvironmentFile $appEnvFile

if (-not $appValues.Contains("DATABASE_URL")) {
    throw "DATABASE_URL is missing from $appEnvFile. Complete the Sprint 6 PostgreSQL setup first."
}

$configurationUploadRoot = Join-Path $projectRoot "data\configuration-uploads"
$evidenceStoreRoot = Join-Path $projectRoot "evidence_store"

$appValues["CONFIG_UPLOAD_ROOT"] = $configurationUploadRoot
$appValues["EVIDENCE_STORE_ROOT"] = $evidenceStoreRoot
$appValues["CONFIG_UPLOAD_MAX_BYTES"] = "25000000"
$appValues["LITERATURE_CONNECTOR_TIMEOUT_MS"] = "30000"
$appValues["LITERATURE_CONNECTOR_USER_AGENT"] = "ClinixAI-Literature-Intelligence/1.0"
$appValues["NCBI_TOOL"] = "ClinixAI"
$appValues["CROSSREF_MAILTO"] = "support@theclinixai.com"

if (-not $appValues.Contains("ALLOW_DEMO_PRINCIPAL")) {
    $appValues["ALLOW_DEMO_PRINCIPAL"] = "true"
}
if (-not $appValues.Contains("DEFAULT_TENANT_KEY")) {
    $appValues["DEFAULT_TENANT_KEY"] = "demo-tenant"
}
if (-not $appValues.Contains("DEFAULT_TENANT_NAME")) {
    $appValues["DEFAULT_TENANT_NAME"] = "ClinixAI Investor Demonstration"
}
if (-not $appValues.Contains("DEFAULT_USER_EMAIL")) {
    $appValues["DEFAULT_USER_EMAIL"] = "product.admin@theclinixai.local"
}
if (-not $appValues.Contains("DEFAULT_USER_DISPLAY_NAME")) {
    $appValues["DEFAULT_USER_DISPLAY_NAME"] = "Product Administrator"
}
if (-not $appValues.Contains("DEFAULT_ROLE_KEY")) {
    $appValues["DEFAULT_ROLE_KEY"] = "CLINIXAI_SUPER_ADMIN"
}

Write-EnvironmentFile $appEnvFile $appValues

New-Item -ItemType Directory -Path $configurationUploadRoot -Force | Out-Null
New-Item -ItemType Directory -Path $evidenceStoreRoot -Force | Out-Null

Push-Location $frontendRoot
try {
    Write-Host ""
    Write-Host "Installing Sprint 7 document and spreadsheet parsers..." -ForegroundColor Cyan

    & npm install --save-exact exceljs@4.4.0 mammoth@1.10.0 unpdf@1.6.2
    if ($LASTEXITCODE -ne 0) {
        throw "Sprint 7 dependency installation failed."
    }

    Write-Host ""
    Write-Host "Applying governed database migrations through 004..." -ForegroundColor Cyan

    & node --env-file=$appEnvFile .\scripts\run-database-migrations.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Database migration runner failed."
    }

    Write-Host ""
    Write-Host "Seeding the controlled demonstration principal and open connectors..." -ForegroundColor Cyan

    & node --env-file=$appEnvFile .\scripts\seed-sprint7-demo.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Sprint 7 seed failed."
    }

    Write-Host ""
    Write-Host "Verifying Sprint 7 database, RBAC, and connector foundation..." -ForegroundColor Cyan

    & node --env-file=$appEnvFile .\scripts\verify-sprint7.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Sprint 7 verification failed."
    }

    Write-Host ""
    Write-Host "Running the production Next.js build..." -ForegroundColor Cyan

    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed."
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "SPRINT 7 BUILD AND FOUNDATION PASSED" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Ad Hoc Search: installed"
Write-Host "Tenant Configuration Console: installed"
Write-Host "RBAC: enforced at API and UI capability level"
Write-Host "Migration 004: applied"
Write-Host "Open connectors: PubMed, Europe PMC, Crossref"
Write-Host "No Intake workspace: confirmed"
Write-Host ""
Write-Host "Start the product:"
Write-Host "cd $frontendRoot"
Write-Host "npm run start"
Write-Host ""
Write-Host "Open:"
Write-Host "http://localhost:3000/literature-search"
Write-Host "http://localhost:3000/admin/configuration"
