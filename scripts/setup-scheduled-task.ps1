<#
.SYNOPSIS
    Sets up Windows Task Scheduler to run the SaaS QA Docs Agent daily at 02:00

.DESCRIPTION
    Creates a scheduled task that runs the PowerShell script daily.
    Run as Administrator.

.NOTES
    Requires: Administrator privileges
#>

param(
    [string]$TaskName = "SaaS-QA-Docs-Agent",
    [string]$ScriptPath = "C:\Users\Hp\Literature-Screening-Production\scripts\run-saas-qa-docs-agent.ps1",
    [string]$RunTime = "02:00",
    [string]$Description = "Daily autonomous documentation sync for regulated SaaS (21 CFR Part 11, GDPR, GAMP 5)"
)

# Check if running as Admin
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

# Verify script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Script not found: $ScriptPath"
    exit 1
}

# Create action
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Create trigger (daily at specified time)
$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Register task
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description $Description `
    -Principal $principal `
    -Force

Write-Host "Scheduled task '$TaskName' created successfully"
Write-Host "Run time: Daily at $RunTime"
Write-Host "Script: $ScriptPath"

# Verify
$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "Task state: $($task.State)"