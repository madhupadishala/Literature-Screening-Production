[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\Users\Hp\Literature-Screening-Production",
    [ValidateSet("openai", "groq", "azure-openai", "custom")]
    [string]$AiProvider = "openai",
    [string]$SupportedProviders = "openai",
    [string]$DatabaseUrl = "",
    [string]$DatabaseHealthUrl = "",
    [string]$KnowledgeRoot = "",
    [string]$EvidenceStoreRoot = ""
)

$ErrorActionPreference = "Stop"

$frontendRoot = Join-Path $ProjectRoot "frontend"
$envFile = Join-Path $frontendRoot ".env.local"

if (-not (Test-Path -LiteralPath $frontendRoot -PathType Container)) {
    throw "Frontend directory does not exist: $frontendRoot"
}

function ConvertFrom-SecureValue {
    param([Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-SecureToken {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Find-FirstDirectory {
    param([string[]]$Candidates)

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return ""
}

$lines = [Collections.Generic.List[string]]::new()
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        [void]$lines.Add([string]$line)
    }
}

function Set-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowEmptyString()][string]$Value
    )

    $pattern = "^\s*" + [Regex]::Escape($Name) + "="
    for ($index = $lines.Count - 1; $index -ge 0; $index--) {
        if ($lines[$index] -match $pattern) {
            $lines.RemoveAt($index)
        }
    }

    $lines.Add("$Name=$Value")
}

function Get-ExistingEnvValue {
    param([Parameter(Mandatory = $true)][string]$Name)

    $pattern = "^\s*" + [Regex]::Escape($Name) + "=(.*)$"
    for ($index = $lines.Count - 1; $index -ge 0; $index--) {
        if ($lines[$index] -match $pattern) {
            return $Matches[1].Trim()
        }
    }

    return ""
}

if (-not $KnowledgeRoot) {
    $KnowledgeRoot = Find-FirstDirectory @(
        (Join-Path $frontendRoot "data\knowledge"),
        (Join-Path $ProjectRoot "data\knowledge"),
        (Join-Path $ProjectRoot "knowledge")
    )
}

if (-not $EvidenceStoreRoot) {
    $EvidenceStoreRoot = Find-FirstDirectory @(
        (Join-Path $ProjectRoot "evidence_store"),
        (Join-Path $frontendRoot "evidence_store"),
        (Join-Path $frontendRoot "data\evidence")
    )
}

$buildSha = ""
try {
    $buildSha = (& git -C $ProjectRoot rev-parse HEAD 2>$null).Trim()
}
catch {
    $buildSha = ""
}

if (-not $buildSha) {
    $buildSha = Get-ExistingEnvValue "BUILD_SHA"
}

if (-not $buildSha -or $buildSha -eq "development") {
    $buildSha = "local-remediation-" + (Get-Date -Format "yyyyMMddHHmmss")
}

$monitoringToken = Get-ExistingEnvValue "INTERNAL_MONITORING_TOKEN"
if (-not $monitoringToken -or $monitoringToken.Length -lt 32) {
    $monitoringToken = New-SecureToken
}

Set-EnvValue "NODE_ENV" "production"
Set-EnvValue "APP_VERSION" "6.0.1"
Set-EnvValue "BUILD_SHA" $buildSha
Set-EnvValue "INTERNAL_MONITORING_TOKEN" $monitoringToken
Set-EnvValue "AI_PROVIDER" $AiProvider
Set-EnvValue "AI_RUNTIME_SUPPORTED_PROVIDERS" $SupportedProviders
Set-EnvValue "RELEASE_VERSION" "6.0.1"
Set-EnvValue "RELEASE_BASE_URL" "http://localhost:3000"

switch ($AiProvider) {
    "openai" {
        $apiKey = Get-ExistingEnvValue "OPENAI_API_KEY"
        if (-not $apiKey) {
            $secureKey = Read-Host "Enter OPENAI_API_KEY (input is hidden)" -AsSecureString
            $apiKey = ConvertFrom-SecureValue $secureKey
        }
        Set-EnvValue "OPENAI_API_KEY" $apiKey
        Set-EnvValue "OPENAI_MODEL" "gpt-4.1-mini"
    }
    "groq" {
        if (($SupportedProviders -split "," | ForEach-Object { $_.Trim().ToLower() }) -notcontains "groq") {
            Write-Warning "Groq is selected but is not listed in SupportedProviders. Readiness will remain blocked until the actual provider factory supports Groq."
        }
        $apiKey = Get-ExistingEnvValue "GROQ_API_KEY"
        if (-not $apiKey) {
            $secureKey = Read-Host "Enter GROQ_API_KEY (input is hidden)" -AsSecureString
            $apiKey = ConvertFrom-SecureValue $secureKey
        }
        Set-EnvValue "GROQ_API_KEY" $apiKey
    }
    "azure-openai" {
        if (($SupportedProviders -split "," | ForEach-Object { $_.Trim().ToLower() }) -notcontains "azure-openai") {
            Write-Warning "Azure OpenAI is selected but is not listed in SupportedProviders."
        }
    }
    "custom" {
        if (($SupportedProviders -split "," | ForEach-Object { $_.Trim().ToLower() }) -notcontains "custom") {
            Write-Warning "Custom AI is selected but is not listed in SupportedProviders."
        }
    }
}

if ($KnowledgeRoot) {
    Set-EnvValue "KNOWLEDGE_ROOT" $KnowledgeRoot
}
else {
    Write-Warning "No existing knowledge repository was found. Configure KNOWLEDGE_ROOT before rerunning Sprint 6."
}

if ($EvidenceStoreRoot) {
    Set-EnvValue "EVIDENCE_STORE_ROOT" $EvidenceStoreRoot
    Set-EnvValue "EVIDENCE_STORE_BACKEND" "filesystem"
}
else {
    Write-Warning "No existing evidence store was found. Configure EVIDENCE_STORE_ROOT before rerunning Sprint 6."
}

if ($DatabaseUrl) {
    Set-EnvValue "DATABASE_URL" $DatabaseUrl
}

if ($DatabaseHealthUrl) {
    Set-EnvValue "DATABASE_HEALTH_URL" $DatabaseHealthUrl
}

$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllLines($envFile, $lines, $utf8WithoutBom)

Write-Host ""
Write-Host "Sprint 6 remediation environment updated:" -ForegroundColor Green
Write-Host $envFile
Write-Host ""
Write-Host "Configured values:"
Write-Host "  AI provider: $AiProvider"
Write-Host "  Runtime-supported providers: $SupportedProviders"
Write-Host "  Build SHA: $buildSha"
Write-Host "  Monitoring token: configured (hidden)"
Write-Host "  Knowledge root: $(if ($KnowledgeRoot) { $KnowledgeRoot } else { 'MISSING' })"
Write-Host "  Evidence root: $(if ($EvidenceStoreRoot) { $EvidenceStoreRoot } else { 'MISSING' })"
Write-Host "  Database URL: $(if ($DatabaseUrl -or (Get-ExistingEnvValue 'DATABASE_URL')) { 'configured (hidden)' } else { 'MISSING' })"
Write-Host "  Database health URL: $(if ($DatabaseHealthUrl -or (Get-ExistingEnvValue 'DATABASE_HEALTH_URL')) { 'configured' } else { 'MISSING' })"
Write-Host ""
Write-Host "DB_MIGRATIONS_APPLIED was not changed. Set it to 001,002,003 only after the migrations are actually applied." -ForegroundColor Yellow
Write-Host "Restart the Next.js server after changing .env.local."
