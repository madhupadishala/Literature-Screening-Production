[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SubscriptionId,

    [string]$ResourceGroup = "rg-clinixai-literature-stg",
    [string]$Location = "centralindia",
    [string]$Prefix = "clinixai-lit-stg",
    [string]$ReleaseVersion = "0.1.0",
    [string]$BuildSha,
    [switch]$SkipMigration
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$templateFile = Join-Path $PSScriptRoot "main.bicep"

if (-not $BuildSha) {
    $BuildSha = (git -C $repositoryRoot rev-parse HEAD).Trim()
}

if ($BuildSha.Length -lt 7) {
    throw "BuildSha must contain at least seven characters."
}

Write-Host "Checking Azure CLI authentication..."
az account show --output none
az account set --subscription $SubscriptionId

$postgresPasswordSecure = Read-Host `
    "Enter a URL-safe PostgreSQL administrator password" -AsSecureString
$groqApiKeySecure = Read-Host "Enter the Groq API key" -AsSecureString
$monitoringTokenSecure = Read-Host `
    "Enter a random monitoring token of at least 32 characters" -AsSecureString

$postgresPassword = [System.Net.NetworkCredential]::new("", $postgresPasswordSecure).Password
$groqApiKey = [System.Net.NetworkCredential]::new("", $groqApiKeySecure).Password
$monitoringToken = [System.Net.NetworkCredential]::new("", $monitoringTokenSecure).Password

if ($postgresPassword -notmatch '^[A-Za-z0-9._~-]{16,128}$') {
    throw "PostgreSQL password must be 16-128 URL-safe characters: letters, numbers, dot, underscore, tilde or hyphen."
}

if ($monitoringToken.Length -lt 32) {
    throw "Monitoring token must contain at least 32 characters."
}

az group create `
    --name $ResourceGroup `
    --location $Location `
    --output none

Write-Host "Provisioning private Azure staging infrastructure..."
$bootstrap = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $templateFile `
    --parameters `
        prefix=$Prefix `
        location=$Location `
        postgresAdminPassword=$postgresPassword `
        groqApiKey=$groqApiKey `
        internalMonitoringToken=$monitoringToken `
        releaseVersion=$ReleaseVersion `
        buildSha=$BuildSha `
    --query properties.outputs `
    --output json | ConvertFrom-Json

$registryName = $bootstrap.containerRegistryName.value
$registryServer = $bootstrap.containerRegistryLoginServer.value
$appName = $bootstrap.applicationName.value
$migrationJobName = $bootstrap.migrationJobName.value
$image = "$registryServer/clinixai-literature:$BuildSha"

Write-Host "Building immutable image in Azure Container Registry..."
az acr build `
    --registry $registryName `
    --image "clinixai-literature:$BuildSha" `
    --file "frontend/Dockerfile" `
    $repositoryRoot

Write-Host "Updating the application and migration job to the immutable image..."
$deployment = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $templateFile `
    --parameters `
        prefix=$Prefix `
        location=$Location `
        containerImage=$image `
        postgresAdminPassword=$postgresPassword `
        groqApiKey=$groqApiKey `
        internalMonitoringToken=$monitoringToken `
        releaseVersion=$ReleaseVersion `
        buildSha=$BuildSha `
    --query properties.outputs `
    --output json | ConvertFrom-Json

if (-not $SkipMigration) {
    Write-Host "Starting the controlled database migration job..."
    $executionName = az containerapp job start `
        --name $migrationJobName `
        --resource-group $ResourceGroup `
        --query name `
        --output tsv

    Write-Host "Migration execution: $executionName"
    Write-Host "Inspect it with:"
    Write-Host "az containerapp job execution show --name $migrationJobName --resource-group $ResourceGroup --job-execution-name $executionName"
}

$applicationUrl = $deployment.applicationUrl.value
Write-Host ""
Write-Host "ClinixAI staging URL: $applicationUrl"
Write-Host "Liveness endpoint: $applicationUrl/api/health/live"
Write-Host "Readiness endpoint: $applicationUrl/api/health/ready"
Write-Host ""
Write-Host "Do not configure a custom domain until readiness and controlled UAT pass."
