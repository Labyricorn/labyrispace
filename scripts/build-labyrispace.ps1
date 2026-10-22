# Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
param([switch]$SkipFrontend)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
$previousCC = $env:CC
$previousCGO = $env:CGO_ENABLED
try {
    if (-not (Test-Path 'node_modules/electron/cli.js')) { throw 'Run npm ci --workspaces=false first.' }
    if (-not $env:CC) { $env:CC = Join-Path $PSScriptRoot 'zig-cc.cmd' }
    $env:CGO_ENABLED = '1'
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    New-Item -ItemType Directory -Path dist/bin -Force | Out-Null
    & go build -tags 'osusergo,sqlite_omit_load_extension' -ldflags "-X main.WaveVersion=$version" -o dist/bin/wavesrv.x64.exe cmd/server/main-server.go
    if ($LASTEXITCODE -ne 0) { throw 'Server build failed.' }
    $env:CGO_ENABLED = '0'
    & go build -ldflags "-X main.WaveVersion=$version" -o "dist/bin/wsh-$version-windows.x64.exe" cmd/wsh/main-wsh.go
    if ($LASTEXITCODE -ne 0) { throw 'Windows shell helper build failed.' }
    if (-not $SkipFrontend) {
        & npm.cmd run build:dev
        if ($LASTEXITCODE -ne 0) { throw 'Electron/frontend build failed.' }
        & node scripts/build-widgets.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Widget packaging failed.' }
    }
    Write-Host 'Build complete. Launch with start-labyrispace.cmd.'
} finally {
    $env:CC = $previousCC
    $env:CGO_ENABLED = $previousCGO
    Pop-Location
}
