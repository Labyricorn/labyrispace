# Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
$previousCC = $env:CC
$previousCGO = $env:CGO_ENABLED
try {
    if (-not $env:CC) { $env:CC = Join-Path $PSScriptRoot 'zig-cc.cmd' }
    $env:CGO_ENABLED = '1'
    & go test ./pkg/wcore ./pkg/service/blockservice -run TestTerminalWindowTransfer -v
    if ($LASTEXITCODE -ne 0) { throw 'Terminal transfer tests failed.' }
    & npx.cmd vitest run frontend/layout/tests --reporter=dot
    if ($LASTEXITCODE -ne 0) { throw 'Layout tests failed.' }
} finally {
    $env:CC = $previousCC
    $env:CGO_ENABLED = $previousCGO
    Pop-Location
}
