// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export type AuthKeyRequestDetails = {
    url: string;
    webContentsId?: number;
};

// The key is for the app's own windows only. Requests from guest (webview) contents never receive it.
export function shouldInjectAuthKey(
    details: AuthKeyRequestDetails,
    appWebContentsIds: ReadonlySet<number>,
    backendOrigins: readonly string[]
): boolean {
    if (details.webContentsId == null || !appWebContentsIds.has(details.webContentsId)) {
        return false;
    }
    return backendOrigins.some((origin) => details.url === origin || details.url.startsWith(origin + "/"));
}
