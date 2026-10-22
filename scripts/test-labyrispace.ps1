# Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
$previousCC = $env:CC
$previousCGO = $env:CGO_ENABLED
try {
    if (-not $env:CC) { $env:CC = Join-Path $PSScriptRoot 'zig-cc.cmd' }
    $env:CGO_ENABLED = '1'
    & go test ./pkg/web ./pkg/localservices ./pkg/vendorpolicy ./pkg/wcloud ./pkg/telemetry ./pkg/wconfig ./pkg/aiusechat ./pkg/aiusechat/aiutil ./pkg/service/clientservice ./pkg/wshrpc/wshserver ./pkg/wcore ./pkg/service/blockservice
    if ($LASTEXITCODE -ne 0) { throw 'Backend and privacy tests failed.' }
    & npx.cmd vitest run emain frontend/layout/tests frontend/util frontend/app/view/localservices frontend/app/view/webview/webview.test.tsx --reporter=dot
    if ($LASTEXITCODE -ne 0) { throw 'Layout tests failed.' }
} finally {
    $env:CC = $previousCC
    $env:CGO_ENABLED = $previousCGO
    Pop-Location
}
