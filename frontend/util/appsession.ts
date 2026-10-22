// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

// Name of the dedicated Electron session partition used by the app's own windows (tab views, builder
// windows). Kept separate from any web-widget partition so the backend auth key injected for this
// session (see emain/authkey.ts) never reaches guest <webview> content. Shared between emain and
// frontend/util (main-process fetch helper) the same way other emain/frontend/util constants are.
export const AppSessionPartition = "persist:labyrispace-app";
