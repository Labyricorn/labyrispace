// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

export const vendorServicesDisabledMessage =
    "Wave vendor services are disabled in Labyrispace. Use local Help or configure your own AI provider.";

export function isVendorURL(rawURL: string): boolean {
    let url: URL;
    try {
        url = new URL(rawURL);
    } catch {
        return false;
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host === "waveterm.dev" || host.endsWith(".waveterm.dev")) return true;
    let path: string;
    try {
        path = decodeURIComponent(url.pathname).toLowerCase();
    } catch {
        path = url.pathname.toLowerCase();
    }
    const ownedPath = (prefix: string) => path === prefix || path.startsWith(prefix + "/");
    switch (host) {
        case "github.com":
        case "www.github.com":
            return ownedPath("/wavetermdev") || ownedPath("/sponsors/wavetermdev");
        case "api.github.com":
            return ownedPath("/repos/wavetermdev") || ownedPath("/orgs/wavetermdev") || ownedPath("/users/wavetermdev");
        case "raw.githubusercontent.com":
        case "codeload.github.com":
            return ownedPath("/wavetermdev");
    }
    return false;
}
