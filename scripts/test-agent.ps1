<#
.SYNOPSIS
    Test script to manually invoke the saas-qa-docs-agent

.DESCRIPTION
    Runs the agent in test mode - scans a specific feature area
    and shows what documentation would be generated/updated.
#>

param(
    [string]$WorkingDirectory = "C:\Users\Hp\Literature-Screening-Production",
    [string]$FeatureArea = "",
    [string]$ClaudePath = "C:\Users\Hp\.local\bin\claude.cmd"
)

Set-Location -Path $WorkingDirectory

if ($FeatureArea) {
    $prompt = "scan and update docs for $FeatureArea only (dry-run mode, show what would be generated)"
} else {
    $prompt = "run daily scan and update docs (dry-run mode, show what would be generated)"
}

Write-Host "Testing saas-qa-docs-agent..."
Write-Host "Prompt: $prompt"
Write-Host ""

$command = "`"$ClaudePath`" --agent saas-qa-docs-agent `"$prompt`""
Invoke-Expression $command