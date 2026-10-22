// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

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
