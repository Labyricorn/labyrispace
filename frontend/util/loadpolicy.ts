// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

function isLoopbackHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "::1" ||
        host === "0.0.0.0" ||
        /^127(\.\d{1,3}){3}$/.test(host)
    );
}

// Saved pages on other hosts stay unloaded until the user asks; local pages and non-web schemes load as before.
export function isRemoteWebUrl(url: string): boolean {
    if (!url) {
        return false;
    }
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return false;
        }
        return !isLoopbackHost(parsed.hostname);
    } catch {
        return false;
    }
}
