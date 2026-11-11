<#
.SYNOPSIS
    Runs the SaaS QA Docs Agent for daily documentation synchronization

.DESCRIPTION
    This script invokes the saas-qa-docs-agent to scan the codebase,
    generate/update documentation, validate compliance, and create PRs.

.NOTES
    Author: Autonomous Documentation System
    Schedule: Daily 02:00 via Windows Task Scheduler
#>

param(
    [string]$WorkingDirectory = "C:\Users\Hp\Literature-Screening-Production",
    [string]$LogFile = "C:\Users\Hp\Literature-Screening-Production\logs\saas-qa-docs-agent.log",
    [string]$ClaudePath = "C:\Users\Hp\.local\bin\claude.cmd"
)

# Ensure log directory exists
$logDir = Split-Path $LogFile -Parent
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Timestamp function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogFile -Value $entry
    Write-Host $entry
}

Write-Log "=== SaaS QA Docs Agent Starting ==="

try {
    # Change to working directory
    Set-Location -Path $WorkingDirectory -ErrorAction Stop
    Write-Log "Working directory: $WorkingDirectory"

    # Verify claude exists
    if (-not (Test-Path $ClaudePath)) {
        Write-Log "Claude not found at $ClaudePath" "ERROR"
        exit 1
    }

    # Run the agent
    Write-Log "Invoking saas-qa-docs-agent..."
    $command = "`"$ClaudePath`" --agent saas-qa-docs-agent `"run daily scan and update docs`""
    Write-Log "Command: $command"

    $result = Invoke-Expression $command 2>&1
    $exitCode = $LASTEXITCODE

    Write-Log "Exit code: $exitCode"
    if ($result) {
        Write-Log "Output: $result"
    }

    if ($exitCode -eq 0) {
        Write-Log "=== SaaS QA Docs Agent Completed Successfully ==="
    } else {
        Write-Log "=== SaaS QA Docs Agent Failed ===" "ERROR"
    }

    exit $exitCode
}
catch {
    Write-Log "Exception: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    exit 1
}