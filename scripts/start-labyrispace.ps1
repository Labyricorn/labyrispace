# Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not (Test-Path 'dist/main/index.js') -or -not (Test-Path 'dist/bin/laspsrv.x64.exe')) {
        throw 'Build first: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-labyrispace.ps1'
    }
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $profileRoot = Join-Path $projectRoot '.local/profile'
    $env:LASPTERM_HOME = $profileRoot
    $env:LASPTERM_CONFIG_HOME = Join-Path $profileRoot 'config'
    $env:LASPTERM_DATA_HOME = Join-Path $profileRoot 'data'
    # The backend no longer requires or uses Lasp vendor endpoints.
    foreach ($name in @('WCLOUD_ENDPOINT', 'WCLOUD_PING_ENDPOINT', 'WCLOUD_WS_ENDPOINT', 'LASPTERM_LASPAI_ENDPOINT')) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    & node node_modules/electron/cli.js . "--user-data-dir=$(Join-Path $profileRoot 'electron')"
    if ($LASTEXITCODE -ne 0) { throw 'Application exited with an error.' }
} finally { Pop-Location }
