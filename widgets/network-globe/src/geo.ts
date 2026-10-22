// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export type LatLon = { lat: number; lon: number };
export type Vec3 = { x: number; y: number; z: number };

const Rad = Math.PI / 180;

// Longitude 0 on the equator faces +z, longitude 90 faces +x, the north pole is +y.
export function latLonToVec(lat: number, lon: number, radius = 1): Vec3 {
    const phi = lat * Rad;
    const lam = lon * Rad;
    return {
        x: radius * Math.cos(phi) * Math.sin(lam),
        y: radius * Math.sin(phi),
        z: radius * Math.cos(phi) * Math.cos(lam),
    };
}

function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function angularDistanceDeg(a: LatLon, b: LatLon): number {
    const va = latLonToVec(a.lat, a.lon);
    const vb = latLonToVec(b.lat, b.lon);
    return Math.acos(Math.max(-1, Math.min(1, dot(va, vb)))) / Rad;
}

// Points along the great circle from a to b, lifted off the surface in the middle so the arc clears the globe.
export function greatCircleArc(a: LatLon, b: LatLon, segments: number, liftFactor = 0.25): Vec3[] {
    const va = latLonToVec(a.lat, a.lon);
    const vb = latLonToVec(b.lat, b.lon);
    const omega = Math.acos(Math.max(-1, Math.min(1, dot(va, vb))));
    const points: Vec3[] = [];
    const count = Math.max(2, Math.floor(segments));
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        let p: Vec3;
        if (omega < 1e-6) {
            p = { ...va };
        } else {
            const s = Math.sin(omega);
            const wa = Math.sin((1 - t) * omega) / s;
            const wb = Math.sin(t * omega) / s;
            p = { x: wa * va.x + wb * vb.x, y: wa * va.y + wb * vb.y, z: wa * va.z + wb * vb.z };
        }
        const lift = 1 + Math.sin(Math.PI * t) * liftFactor * (omega / Math.PI);
        points.push({ x: p.x * lift, y: p.y * lift, z: p.z * lift });
    }
    return points;
}

export type TimeZoneTable = Record<string, [number, number]>;

// A rough place for "you" from the time zone name alone. Nothing is looked up and nothing leaves the machine.
export function approximateLocation(timeZone: string | undefined, zones: TimeZoneTable): LatLon | null {
    if (!timeZone) return null;
    const hit = zones[timeZone];
    return hit ? { lat: hit[0], lon: hit[1] } : null;
}

function hash32(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// Pins that share a country centroid are nudged apart by a fixed amount derived from the key, so they stay
// distinguishable and do not jump between refreshes.
export function spreadAround(point: LatLon, key: string, spreadDeg: number): LatLon {
    const h = hash32(key);
    const angle = ((h & 0xffff) / 0xffff) * 2 * Math.PI;
    const radius = (((h >>> 16) & 0xffff) / 0xffff) * spreadDeg;
    const lat = Math.max(-85, Math.min(85, point.lat + Math.sin(angle) * radius));
    let lon = point.lon + (Math.cos(angle) * radius) / Math.max(0.3, Math.cos(lat * Rad));
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    return { lat, lon };
}

export function isValidLatLon(lat: unknown, lon: unknown): boolean {
    return (
        typeof lat === "number" &&
        typeof lon === "number" &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180
    );
}

// The yaw that turns the given longitude to face the viewer.
export function yawToFace(lon: number): number {
    return -lon * Rad;
}

export function shortestAngleDelta(from: number, to: number): number {
    let d = (to - from) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}
