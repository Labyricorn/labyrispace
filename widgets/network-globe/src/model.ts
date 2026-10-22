// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { LatLon, spreadAround } from "./geo";

export const MaxPins = 300;
export const MaxArcs = 100;
export const MaxLookupsPerCall = 500;

export type Connection = {
    protocol: string;
    state: string;
    localaddress: string;
    localport: number;
    remoteaddress: string;
    remoteport: number;
    remoteendpoint: string;
    family: string;
    remotekind: string;
    pid: number;
    processname?: string;
    processpath?: string;
    identity: string;
};

export type GeoResult = {
    ip: string;
    kind: string;
    found: boolean;
    countrycode?: string;
    countryname?: string;
    latitude?: number;
    longitude?: number;
};

export type CentroidTable = Record<string, [number, number, string]>;

export type Pin = {
    ip: string;
    lat: number;
    lon: number;
    countryCode: string;
    countryName: string;
    connections: Connection[];
};

export type Row = {
    key: string;
    conn: Connection;
    pinIp: string | null;
    country: string;
    place: "placed" | "unplaced" | "local";
};

export type ModelStats = { publicCount: number; localCount: number; unplacedCount: number; pinsDropped: number };

export function connectionKey(c: Connection): string {
    return `${c.localaddress}:${c.localport}>${c.remoteendpoint}|${c.pid}`;
}

// Public addresses we have not looked up yet, in a stable order and within the per-call limit.
export function addressesNeedingLookup(conns: Connection[], known: ReadonlySet<string>): string[] {
    const wanted: string[] = [];
    const seen = new Set<string>();
    for (const c of conns) {
        if (c.remotekind !== "public" || known.has(c.remoteaddress) || seen.has(c.remoteaddress)) continue;
        seen.add(c.remoteaddress);
        wanted.push(c.remoteaddress);
        if (wanted.length >= MaxLookupsPerCall) break;
    }
    return wanted;
}

function placeOf(
    geo: GeoResult | undefined,
    centroids: CentroidTable
): { point: LatLon; code: string; name: string } | null {
    if (geo == null || !geo.found) return null;
    const code = geo.countrycode ?? "";
    const name = geo.countryname || centroids[code]?.[2] || code;
    if (typeof geo.latitude === "number" && typeof geo.longitude === "number") {
        return { point: { lat: geo.latitude, lon: geo.longitude }, code, name };
    }
    const centroid = centroids[code];
    if (!centroid) return null;
    return { point: { lat: centroid[0], lon: centroid[1] }, code, name };
}

// Groups connections into pins (one per remote address) and table rows. Pins beyond MaxPins are dropped and
// counted; their rows stay in the table as "unplaced".
export function buildModel(
    conns: Connection[],
    geo: ReadonlyMap<string, GeoResult>,
    centroids: CentroidTable
): { pins: Pin[]; rows: Row[]; stats: ModelStats } {
    const pinsByIp = new Map<string, Pin>();
    const rows: Row[] = [];
    const stats: ModelStats = { publicCount: 0, localCount: 0, unplacedCount: 0, pinsDropped: 0 };
    const dropped = new Set<string>();

    for (const conn of conns) {
        const key = connectionKey(conn);
        if (conn.remotekind !== "public") {
            stats.localCount++;
            rows.push({
                key,
                conn,
                pinIp: null,
                country: conn.remotekind === "loopback" ? "this computer" : "local network",
                place: "local",
            });
            continue;
        }
        stats.publicCount++;
        const place = placeOf(geo.get(conn.remoteaddress), centroids);
        if (place == null) {
            stats.unplacedCount++;
            rows.push({ key, conn, pinIp: null, country: "unknown", place: "unplaced" });
            continue;
        }
        let pin = pinsByIp.get(conn.remoteaddress);
        if (pin == null) {
            if (pinsByIp.size >= MaxPins) {
                if (!dropped.has(conn.remoteaddress)) {
                    dropped.add(conn.remoteaddress);
                    stats.pinsDropped++;
                }
                stats.unplacedCount++;
                rows.push({ key, conn, pinIp: null, country: place.name, place: "unplaced" });
                continue;
            }
            const spread = typeof geo.get(conn.remoteaddress)?.latitude === "number" ? 0 : 2.5;
            const at = spread > 0 ? spreadAround(place.point, conn.remoteaddress, spread) : place.point;
            pin = {
                ip: conn.remoteaddress,
                lat: at.lat,
                lon: at.lon,
                countryCode: place.code,
                countryName: place.name,
                connections: [],
            };
            pinsByIp.set(conn.remoteaddress, pin);
        }
        pin.connections.push(conn);
        rows.push({ key, conn, pinIp: pin.ip, country: place.name, place: "placed" });
    }

    const order = { placed: 0, unplaced: 1, local: 2 };
    rows.sort((a, b) => {
        if (order[a.place] !== order[b.place]) return order[a.place] - order[b.place];
        const pa = (a.conn.processname ?? "").toLowerCase();
        const pb = (b.conn.processname ?? "").toLowerCase();
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.conn.remoteendpoint < b.conn.remoteendpoint ? -1 : 1;
    });
    const pins = [...pinsByIp.values()].sort(
        (a, b) => b.connections.length - a.connections.length || (a.ip < b.ip ? -1 : 1)
    );
    return { pins, rows, stats };
}

// For screenshots and sharing. Keeps enough to recognize a network, not the host.
export function maskAddress(address: string): string {
    if (address.includes(":")) {
        const groups = address.split(":").filter((g) => g !== "");
        return groups.slice(0, 2).join(":") + ":x:x";
    }
    const parts = address.split(".");
    if (parts.length !== 4) return "hidden";
    return `${parts[0]}.${parts[1]}.x.x`;
}

export function maskEndpoint(endpoint: string): string {
    const closing = endpoint.lastIndexOf("]:");
    if (closing >= 0) {
        return `[${maskAddress(endpoint.slice(1, closing))}]:${endpoint.slice(closing + 2)}`;
    }
    const colon = endpoint.lastIndexOf(":");
    if (colon < 0) return "hidden";
    return `${maskAddress(endpoint.slice(0, colon))}:${endpoint.slice(colon + 1)}`;
}

export type Tone = "good" | "warn" | "bad" | "muted";

export function connectivityStatus(connectivity: string | undefined): { label: string; tone: Tone } {
    switch (connectivity) {
        case "internet":
            return { label: "ONLINE", tone: "good" };
        case "local":
            return { label: "LOCAL NETWORK ONLY", tone: "warn" };
        case "none":
            return { label: "OFFLINE", tone: "bad" };
    }
    return { label: "UNKNOWN", tone: "muted" };
}
