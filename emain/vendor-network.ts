// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

import { dialog, Session, shell } from "electron";
import { isVendorURL, vendorServicesDisabledMessage } from "../frontend/util/vendorpolicy";

const configuredSessions = new WeakSet<Session>();

export function configureVendorNetworkPolicy(session: Session) {
    if (configuredSessions.has(session)) return;
    configuredSessions.add(session);
    session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
        const blocked = isVendorURL(details.url);
        if (blocked) console.log("Labyrispace blocked a Wave vendor request", new URL(details.url).hostname);
        callback({ cancel: blocked });
    });
}

export async function openExternal(url: string): Promise<void> {
    if (isVendorURL(url)) {
        await dialog.showMessageBox({ type: "info", title: "Labyrispace", message: vendorServicesDisabledMessage });
        return;
    }
    await shell.openExternal(url);
}
