param(
    [string]$SourcePack = ""
)

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Split-Path -Parent $FrontendRoot

if (-not $SourcePack) {
    $SourcePack = Join-Path $ProjectRoot "ClinixAI_CFC1_ClientFacing_SourcePack.zip"
}

if (-not (Test-Path -LiteralPath $SourcePack)) {
    throw "Original CFC-1 source pack was not found: $SourcePack"
}

$Temp = Join-Path $env:TEMP ("clinixai-cfc1-rollback-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Temp -Force | Out-Null

$RestoreFiles = @(
    "frontend\app\layout.tsx",
    "frontend\app\globals.css",
    "frontend\app\page.tsx",
    "frontend\app\admin\page.tsx",
    "frontend\app\api\context\current\route.ts",
    "frontend\app\hits\page.tsx",
    "frontend\app\literature-search\page.tsx",
    "frontend\app\reports\page.tsx",
    "frontend\app\screening\page.tsx",
    "frontend\app\workflow\page.tsx",
    "frontend\app\workflow\[packageId]\page.tsx",
    "frontend\components\InvestorDemoHeader.tsx",
    "frontend\components\Navigation.tsx",
    "frontend\components\SessionTimeoutGuard.tsx",
    "frontend\components\TenantSwitcher.tsx",
    "frontend\components\TopBar.tsx",
    "frontend\components\layout\Navigation.tsx",
    "frontend\components\layout\TopBar.tsx",
    "frontend\components\workspace\Module.tsx",
    "frontend\components\workspace\StatusStrip.tsx",
    "frontend\lib\rbac.ts",
    "frontend\lib\rbac\permissions.ts",
    "frontend\lib\rbac\request-principal.ts",
    "frontend\lib\session-manager.ts",
    "frontend\lib\session.tsx"
)

try {
    Expand-Archive -LiteralPath $SourcePack -DestinationPath $Temp -Force

    foreach ($RelativePath in $RestoreFiles) {
        $Source = Join-Path $Temp $RelativePath
        $Destination = Join-Path $ProjectRoot $RelativePath

        if (-not (Test-Path -LiteralPath $Source)) {
            throw "Rollback source is missing: $RelativePath"
        }

        New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    }

    $NewHeader = Join-Path $ProjectRoot "frontend\components\WorkspaceHeader.tsx"
    Remove-Item -LiteralPath $NewHeader -Force -ErrorAction SilentlyContinue
}
finally {
    Remove-Item -LiteralPath $Temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "CFC-1 source files restored from the original source pack." -ForegroundColor Green
