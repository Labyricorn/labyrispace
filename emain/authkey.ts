// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { getWebServerEndpoint, getWSServerEndpoint } from "../frontend/util/endpoints";
import { shouldInjectAuthKey } from "./authkey-policy";
import { getAppWebContentsIds } from "./emain-appcontents";

const AuthKeyHeader = "X-AuthKey";
export const WaveAuthKeyEnv = "WAVETERM_AUTH_KEY";
export const AuthKey = crypto.randomUUID();

ipcMain.on("get-auth-key", (event) => {
    event.returnValue = AuthKey;
});

// Only requests from the app's own webContents (tracked in emain-appcontents.ts) ever receive the key.
// Guest <webview> content for web widgets uses a separate session partition and never reaches this hook
// at all; the webContents-id check here is defense in depth in case something else shares this session.
export function configureAuthKeyRequestInjection(session: Electron.Session) {
    const filter: Electron.WebRequestFilter = {
        urls: [`${getWebServerEndpoint()}/*`, `${getWSServerEndpoint()}/*`],
    };
    session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        if (shouldInjectAuthKey(details, getAppWebContentsIds(), [getWebServerEndpoint(), getWSServerEndpoint()])) {
            details.requestHeaders[AuthKeyHeader] = AuthKey;
        }
        callback({ requestHeaders: details.requestHeaders });
    });
}
