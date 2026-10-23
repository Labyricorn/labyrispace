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

// Country-level answers all land on one centroid, so they are spread a little by address to stay distinguishable.
function spreadPoint(point: LatLon, ip: string, geo: GeoResult | undefined): LatLon {
    return typeof geo?.latitude === "number" ? point : spreadAround(point, ip, 2.5);
}

export function locateAddress(
    ip: string,
    geo: ReadonlyMap<string, GeoResult>,
    centroids: CentroidTable
): { point: LatLon; country: string } | null {
    const place = placeOf(geo.get(ip), centroids);
    return place ? { point: spreadPoint(place.point, ip, geo.get(ip)), country: place.name } : null;
}

export const SortColumns = ["process", "remote", "state", "where"] as const;
export type SortColumn = (typeof SortColumns)[number];
export type SortState = { column: SortColumn; descending: boolean } | null;

function sortValue(row: Row, column: SortColumn): string {
    switch (column) {
        case "process":
            return (row.conn.processname ?? "").toLowerCase();
        case "remote":
            return row.conn.remoteendpoint;
        case "state":
            return row.conn.state.toLowerCase();
    }
    return row.country.toLowerCase();
}

// The first click on a header sorts ascending, the next reverses it, and a different header starts over ascending.
export function nextSort(current: SortState, column: SortColumn): SortState {
    return current?.column === column ? { column, descending: !current.descending } : { column, descending: false };
}

export function sortRows(rows: Row[], sort: SortState): Row[] {
    if (sort == null) return rows;
    const sign = sort.descending ? -1 : 1;
    return [...rows].sort((a, b) => {
        const va = sortValue(a, sort.column);
        const vb = sortValue(b, sort.column);
        return va === vb ? 0 : va < vb ? -sign : sign;
    });
}

export type TraceHop = { hop: number; address?: string; millis?: number; timedout?: boolean };
export type RoutePoint = { lat: number; lon: number; hop: number; ip: string; country: string };

// Hops with no public address (your own router, timeouts) cannot be placed; they stay in the hop list but not on the globe.
export function routePoints(
    hops: TraceHop[],
    destination: string,
    geo: ReadonlyMap<string, GeoResult>,
    centroids: CentroidTable
): { points: RoutePoint[]; unplaced: number } {
    const points: RoutePoint[] = [];
    let unplaced = 0;
    let reachedDestination = false;
    for (const hop of hops) {
        if (!hop.address) continue;
        if (hop.address === destination) reachedDestination = true;
        const place = ipKindIsPublic(hop.address) ? locateAddress(hop.address, geo, centroids) : null;
        if (place == null) {
            unplaced++;
            continue;
        }
        points.push({ ...place.point, hop: hop.hop, ip: hop.address, country: place.country });
    }
    if (!reachedDestination) {
        const place = locateAddress(destination, geo, centroids);
        if (place) points.push({ ...place.point, hop: (hops[hops.length - 1]?.hop ?? 0) + 1, ip: destination, country: place.country });
    }
    return { points, unplaced };
}

export function publicHopAddresses(hops: TraceHop[]): string[] {
    return [...new Set(hops.map((h) => h.address ?? "").filter((a) => a !== "" && ipKindIsPublic(a)))];
}

function ipKindIsPublic(address: string): boolean {
    if (address.includes(":")) {
        const lower = address.toLowerCase();
        return !(lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd") || lower === "::");
    }
    const p = address.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return !(
        p[0] === 10 ||
        p[0] === 127 ||
        p[0] === 0 ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
        p[0] >= 224
    );
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
            const at = spreadPoint(place.point, conn.remoteaddress, geo.get(conn.remoteaddress));
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
