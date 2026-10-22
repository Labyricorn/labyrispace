// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export type AuthKeyRequestDetails = {
    url: string;
    webContentsId?: number;
};

// The key is for the app's own requests only. Requests from guest (webview) contents never receive it.
//
// A request with no webContentsId originates from the main process itself (e.g. appSession.fetch used by
// ClientService.GetClientData); that is the app, so it is allowed. A request with a webContentsId is
// allowed only if that webContents is a registered app window (tab view / builder). Guest webview content
// uses a separate session partition and never reaches this hook at all; an unknown webContentsId is denied
// as defense in depth in case something else ever shares this session.
export function shouldInjectAuthKey(
    details: AuthKeyRequestDetails,
    appWebContentsIds: ReadonlySet<number>,
    backendOrigins: readonly string[]
): boolean {
    if (details.webContentsId != null && !appWebContentsIds.has(details.webContentsId)) {
        return false;
    }
    return backendOrigins.some((origin) => details.url === origin || details.url.startsWith(origin + "/"));
}
