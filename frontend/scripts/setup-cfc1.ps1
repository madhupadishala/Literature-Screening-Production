param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Split-Path -Parent $FrontendRoot
$EnvFile = Join-Path $FrontendRoot ".env.local"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "CLINIXAI CFC-1 CLIENT-FACING CONSISTENCY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath (Join-Path $FrontendRoot "package.json"))) {
    throw "frontend package.json was not found at $FrontendRoot"
}

if (Test-Path -LiteralPath $EnvFile) {
    $envContent = Get-Content -LiteralPath $EnvFile -Raw

    if ($envContent -match '(?m)^ALLOW_DEMO_PRINCIPAL=') {
        $envContent = $envContent -replace '(?m)^ALLOW_DEMO_PRINCIPAL=', 'ALLOW_LOCAL_BOOTSTRAP_PRINCIPAL='
        Write-Host "Migrated local bootstrap environment key." -ForegroundColor Yellow
    }

    if ($envContent -notmatch '(?m)^NEXT_PUBLIC_APP_ENVIRONMENT=') {
        $envContent = $envContent.TrimEnd() + "`r`nNEXT_PUBLIC_APP_ENVIRONMENT=LOCAL`r`n"
    }

    if (
        $envContent -match '(?m)^ALLOW_LOCAL_BOOTSTRAP_PRINCIPAL=true\s*$' -and
        $envContent -notmatch '(?m)^DEFAULT_TENANT_DISPLAY_NAME='
    ) {
        $envContent = $envContent.TrimEnd() + "`r`nDEFAULT_TENANT_DISPLAY_NAME=Local Development Tenant`r`n"
    }

    Set-Content -LiteralPath $EnvFile -Value $envContent -Encoding UTF8
}
else {
    Write-Warning ".env.local was not found. No environment values were created."
}

Push-Location $FrontendRoot
try {
    node .\scripts\verify-cfc1.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "CFC-1 static verification failed."
    }

    if (-not $SkipBuild) {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Next.js production build failed."
        }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "CFC-1 CLIENT-FACING CONSISTENCY PASSED" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Canonical shell: installed"
Write-Host "RBAC navigation: installed"
Write-Host "Tenant/user/environment context: installed"
Write-Host "Client-facing reports: installed"
Write-Host "Visible demo and Intake wording: removed"
Write-Host ""
