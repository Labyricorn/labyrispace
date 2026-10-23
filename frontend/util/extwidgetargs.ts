// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { isIP } from "net";

export const MaxGeoLookups = 500;
const MaxAddressLength = 64;
const MaxTargetLength = 253;

export type GeoLookupArgs = { ips: string[] };
export type LatencyArgs = { target: string; port?: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasControlCharacters(text: string): boolean {
    return /[\u0000-\u001f\u007f-\u009f]/.test(text);
}

// The main process checks what a widget sends before it reaches the backend, which then checks it again.
export function parseGeoLookupArgs(args: unknown): GeoLookupArgs {
    if (!isPlainObject(args) || !Array.isArray(args.ips)) {
        throw new Error("network.geolookup needs { ips: string[] }");
    }
    if (args.ips.length > MaxGeoLookups) {
        throw new Error(`at most ${MaxGeoLookups} addresses can be looked up at once`);
    }
    const ips: string[] = [];
    for (const ip of args.ips) {
        if (typeof ip !== "string" || ip.length === 0 || ip.length > MaxAddressLength || hasControlCharacters(ip)) {
            throw new Error("every address must be a short plain string");
        }
        ips.push(ip);
    }
    return { ips };
}

export function parseLatencyArgs(args: unknown): LatencyArgs {
    if (args == null) {
        return { target: "gateway" };
    }
    if (!isPlainObject(args)) {
        throw new Error("network.latency needs { target?: string, port?: number }");
    }
    const target = args.target == null ? "gateway" : args.target;
    if (
        typeof target !== "string" ||
        target.trim() === "" ||
        target.length > MaxTargetLength ||
        hasControlCharacters(target)
    ) {
        throw new Error('the target must be a host name, an IP address, or "gateway"');
    }
    const result: LatencyArgs = { target: target.trim() };
    if (args.port != null) {
        if (typeof args.port !== "number" || !Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
            throw new Error("the port must be a whole number from 1 to 65535");
        }
        result.port = args.port;
    }
    return result;
}

export type PublicIpArgs = { url: string; host: string };

const MaxPublicIpUrlLength = 300;
const LoopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The provider is chosen by the person using the widget and approved again in a host dialog, so this only rejects
// shapes that could never be a plain lookup address.
export function parsePublicIpArgs(args: unknown, allowLoopbackHttp: boolean): PublicIpArgs {
    if (!isPlainObject(args) || typeof args.url !== "string") {
        throw new Error("network.publicip needs { url: string }");
    }
    const text = args.url.trim();
    if (text === "" || text.length > MaxPublicIpUrlLength || hasControlCharacters(text)) {
        throw new Error("the provider address must be a short web address");
    }
    let parsed: URL;
    try {
        parsed = new URL(text);
    } catch {
        throw new Error("the provider address is not a valid web address");
    }
    if (parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") {
        throw new Error("the provider address cannot contain credentials or a fragment");
    }
    const loopback = allowLoopbackHttp && parsed.protocol === "http:" && LoopbackHosts.has(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopback) {
        throw new Error("the provider address must start with https://");
    }
    return { url: parsed.href, host: parsed.host };
}

// Providers answer with either the bare address or a small JSON object holding it. Anything else is refused so a
// provider cannot push arbitrary text into the widget.
export function parsePublicIpResponse(body: string): string {
    const text = body.trim();
    if (text.length === 0 || text.length > 2048) {
        throw new Error("the provider returned an unexpected answer");
    }
    let candidate = text;
    if (text.startsWith("{")) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error("the provider returned an unexpected answer");
        }
        const found = isPlainObject(parsed) ? (parsed.ip ?? parsed.query ?? parsed.address) : null;
        if (typeof found !== "string") {
            throw new Error("the provider answer did not contain an address");
        }
        candidate = found.trim();
    }
    if (candidate.length > MaxAddressLength || isIP(candidate) === 0) {
        throw new Error("the provider answer was not an IP address");
    }
    return candidate;
}
