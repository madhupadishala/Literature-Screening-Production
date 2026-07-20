$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = "C:\Users\Hp\Literature-Screening-Production"
$frontendRoot = Join-Path $projectRoot "frontend"
$composeFile = Join-Path $projectRoot "docker-compose.sprint6-postgres.yml"
$dockerEnvFile = Join-Path $projectRoot ".env.sprint6-postgres.local"
$appEnvFile = Join-Path $frontendRoot ".env.local"

if (-not (Test-Path -LiteralPath $frontendRoot -PathType Container)) {
    throw "Frontend folder not found: $frontendRoot"
}

if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
    throw "Docker Compose file not found: $composeFile"
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    throw "Docker Desktop is required for this local PostgreSQL foundation. Install and start Docker Desktop, then rerun this script."
}

& docker version *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker is installed but the Docker engine is not running. Start Docker Desktop and rerun this script."
}

function New-SecureHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Read-EnvironmentFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
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

function Write-EnvironmentFile([string]$Path, [hashtable]$Values) {
    $lines = foreach ($key in ($Values.Keys | Sort-Object)) {
        "$key=$($Values[$key])"
    }
    [System.IO.File]::WriteAllLines($Path, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

$dockerValues = Read-EnvironmentFile $dockerEnvFile
if (-not $dockerValues.ContainsKey("CLINIXAI_DB_NAME")) {
    $dockerValues["CLINIXAI_DB_NAME"] = "clinixai_literature"
}
if (-not $dockerValues.ContainsKey("CLINIXAI_DB_USER")) {
    $dockerValues["CLINIXAI_DB_USER"] = "clinixai_app"
}
if (-not $dockerValues.ContainsKey("CLINIXAI_DB_PASSWORD")) {
    $dockerValues["CLINIXAI_DB_PASSWORD"] = New-SecureHex 24
}
if (-not $dockerValues.ContainsKey("CLINIXAI_DB_PORT")) {
    $dockerValues["CLINIXAI_DB_PORT"] = "5432"
}
Write-EnvironmentFile $dockerEnvFile $dockerValues

Write-Host "Starting PostgreSQL with pgvector..."
& docker compose --env-file $dockerEnvFile -f $composeFile up -d
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed to start PostgreSQL."
}

$containerName = "clinixai-sprint6-postgres"
$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    & docker exec $containerName pg_isready -U $dockerValues["CLINIXAI_DB_USER"] -d $dockerValues["CLINIXAI_DB_NAME"] *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    & docker logs $containerName --tail 100
    throw "PostgreSQL did not become ready within 60 seconds."
}

$encodedUser = [Uri]::EscapeDataString([string]$dockerValues["CLINIXAI_DB_USER"])
$encodedPassword = [Uri]::EscapeDataString([string]$dockerValues["CLINIXAI_DB_PASSWORD"])
$databaseName = [Uri]::EscapeDataString([string]$dockerValues["CLINIXAI_DB_NAME"])
$databasePort = [string]$dockerValues["CLINIXAI_DB_PORT"]
$databaseUrl = "postgresql://${encodedUser}:${encodedPassword}@localhost:${databasePort}/${databaseName}"

$appValues = Read-EnvironmentFile $appEnvFile
$appValues["DATABASE_URL"] = $databaseUrl
$appValues["DATABASE_PROVIDER"] = "postgresql"
$appValues["DATABASE_SSL_MODE"] = "disable"
$appValues["DATABASE_POOL_MIN"] = "0"
$appValues["DATABASE_POOL_MAX"] = "10"
$appValues["DATABASE_STATEMENT_TIMEOUT_MS"] = "15000"
$appValues["DATABASE_QUERY_TIMEOUT_MS"] = "20000"
$appValues.Remove("DATABASE_HEALTH_URL")
$appValues.Remove("DB_MIGRATIONS_APPLIED")
Write-EnvironmentFile $appEnvFile $appValues

Push-Location $frontendRoot
try {
    Write-Host "Installing PostgreSQL runtime dependencies..."
    & npm install pg
    if ($LASTEXITCODE -ne 0) {
        throw "npm install pg failed."
    }

    & npm install --save-dev @types/pg
    if ($LASTEXITCODE -ne 0) {
        throw "npm install --save-dev @types/pg failed."
    }

    Write-Host "Applying governed migrations 001, 002 and 003..."
    & node --env-file=$appEnvFile .\scripts\run-database-migrations.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Database migration runner failed."
    }

    Write-Host "Verifying PostgreSQL and pgvector..."
    & node --env-file=$appEnvFile .\scripts\verify-sprint6-postgres.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Database verification failed."
    }

    Write-Host "Building the Next.js application..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed after database integration."
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================================"
Write-Host "SPRINT 6 POSTGRESQL FOUNDATION PASSED"
Write-Host "============================================================"
Write-Host "Database: $($dockerValues['CLINIXAI_DB_NAME'])"
Write-Host "Host: localhost:$databasePort"
Write-Host "Migrations: 001, 002, 003 applied and verified"
Write-Host "pgvector: installed"
Write-Host "Environment file: $appEnvFile"
Write-Host ""
Write-Host "Next command:"
Write-Host "cd $frontendRoot"
Write-Host "npm run start"
