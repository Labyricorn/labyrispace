// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

// Tracks which Electron webContents ids belong to the app's own windows (tab views, builder windows),
// as opposed to guest <webview> content loaded from web widgets. Used to scope auth-key injection to
// app-owned requests only (see SECURITY-TEST-PLAN.md).

export { AppSessionPartition } from "../frontend/util/appsession";

const appWebContentsIds = new Set<number>();

export function registerAppWebContents(webContentsId: number) {
    appWebContentsIds.add(webContentsId);
}

export function unregisterAppWebContents(webContentsId: number) {
    appWebContentsIds.delete(webContentsId);
}

export function getAppWebContentsIds(): ReadonlySet<number> {
    return appWebContentsIds;
}
