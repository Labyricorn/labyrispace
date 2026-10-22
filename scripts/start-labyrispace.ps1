# Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not (Test-Path 'dist/main/index.js') -or -not (Test-Path 'dist/bin/wavesrv.x64.exe')) {
        throw 'Build first: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-labyrispace.ps1'
    }
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $profileRoot = Join-Path $projectRoot '.local/profile'
    $env:WAVETERM_HOME = $profileRoot
    $env:WAVETERM_CONFIG_HOME = Join-Path $profileRoot 'config'
    $env:WAVETERM_DATA_HOME = Join-Path $profileRoot 'data'
    # Upstream network defaults are retained pending the privacy changes discussion.
    $env:WCLOUD_PING_ENDPOINT = 'https://ping-dev.waveterm.dev/central'
    $env:WCLOUD_ENDPOINT = 'https://api-dev.waveterm.dev/central'
    $env:WCLOUD_WS_ENDPOINT = 'wss://wsapi-dev.waveterm.dev'
    & node node_modules/electron/cli.js . "--user-data-dir=$(Join-Path $profileRoot 'electron')"
    if ($LASTEXITCODE -ne 0) { throw 'Application exited with an error.' }
} finally { Pop-Location }
