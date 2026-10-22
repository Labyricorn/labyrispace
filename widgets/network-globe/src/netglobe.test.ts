// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    angularDistanceDeg,
    approximateLocation,
    greatCircleArc,
    isValidLatLon,
    latLonToVec,
    shortestAngleDelta,
    spreadAround,
    yawToFace,
} from "./geo";
import {
    addressesNeedingLookup,
    buildModel,
    CentroidTable,
    Connection,
    connectivityStatus,
    GeoResult,
    maskAddress,
    maskEndpoint,
    MaxPins,
} from "./model";
import { createFrameLoop } from "./scheduler";
import { DefaultSettings, motionAllowed, parseCoordinateInput, sanitizeSettings } from "./settings";

const Centroids: CentroidTable = { US: [39.5, -97.5, "United States"], DE: [51, 10, "Germany"] };

function conn(over: Partial<Connection>): Connection {
    return {
        protocol: "tcp",
        state: "ESTABLISHED",
        localaddress: "192.168.1.5",
        localport: 50000,
        remoteaddress: "203.0.113.9",
        remoteport: 443,
        remoteendpoint: "203.0.113.9:443",
        family: "ipv4",
        remotekind: "public",
        pid: 10,
        processname: "app.exe",
        identity: "known",
        ...over,
    };
}

describe("geo math", () => {
    it("maps latitude and longitude onto the sphere", () => {
        const origin = latLonToVec(0, 0);
        expect(origin.z).toBeCloseTo(1);
        expect(origin.x).toBeCloseTo(0);
        const east = latLonToVec(0, 90);
        expect(east.x).toBeCloseTo(1);
        const north = latLonToVec(90, 0);
        expect(north.y).toBeCloseTo(1);
        const v = latLonToVec(40, -75, 2);
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(2);
    });

    it("measures angular distance", () => {
        expect(angularDistanceDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(90);
        expect(angularDistanceDeg({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBeCloseTo(0);
        expect(angularDistanceDeg({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(180);
    });

    it("builds arcs that start and end on the surface and rise in between", () => {
        const a = { lat: 0, lon: 0 };
        const b = { lat: 0, lon: 90 };
        const arc = greatCircleArc(a, b, 20, 0.3);
        expect(arc).toHaveLength(21);
        const start = arc[0];
        const end = arc[20];
        expect(Math.hypot(start.x, start.y, start.z)).toBeCloseTo(1);
        expect(Math.hypot(end.x, end.y, end.z)).toBeCloseTo(1);
        expect(end.x).toBeCloseTo(1);
        const mid = arc[10];
        expect(Math.hypot(mid.x, mid.y, mid.z)).toBeGreaterThan(1.03);
    });

    it("handles identical endpoints and a minimum segment count", () => {
        const p = { lat: 30, lon: 30 };
        const arc = greatCircleArc(p, p, 1);
        expect(arc.length).toBeGreaterThanOrEqual(3);
        for (const v of arc) expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    });

    it("guesses a place from the time zone only when it knows the zone", () => {
        const zones = { "America/Chicago": [41.85, -87.65] as [number, number] };
        expect(approximateLocation("America/Chicago", zones)).toEqual({ lat: 41.85, lon: -87.65 });
        expect(approximateLocation("Mars/Base", zones)).toBeNull();
        expect(approximateLocation(undefined, zones)).toBeNull();
    });

    it("spreads pins deterministically and within bounds", () => {
        const centre = { lat: 40, lon: -100 };
        const first = spreadAround(centre, "203.0.113.9", 2.5);
        const again = spreadAround(centre, "203.0.113.9", 2.5);
        expect(first).toEqual(again);
        expect(spreadAround(centre, "203.0.113.10", 2.5)).not.toEqual(first);
        expect(angularDistanceDeg(centre, first)).toBeLessThan(4);
        const pole = spreadAround({ lat: 89, lon: 179 }, "x", 5);
        expect(pole.lat).toBeLessThanOrEqual(85);
        expect(pole.lon).toBeGreaterThanOrEqual(-180);
        expect(pole.lon).toBeLessThanOrEqual(180);
    });

    it("validates coordinates and turns the globe by the shortest way", () => {
        expect(isValidLatLon(10, 20)).toBe(true);
        expect(isValidLatLon(91, 0)).toBe(false);
        expect(isValidLatLon("1", 2)).toBe(false);
        expect(isValidLatLon(NaN, 2)).toBe(false);
        expect(yawToFace(90)).toBeCloseTo(-Math.PI / 2);
        expect(shortestAngleDelta(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
        expect(shortestAngleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    });
});

describe("buildModel", () => {
    const geo = new Map<string, GeoResult>([
        [
            "203.0.113.9",
            { ip: "203.0.113.9", kind: "public", found: true, countrycode: "US", countryname: "United States" },
        ],
        [
            "203.0.113.10",
            { ip: "203.0.113.10", kind: "public", found: true, countrycode: "DE", countryname: "Germany" },
        ],
        ["198.51.100.1", { ip: "198.51.100.1", kind: "public", found: false }],
        [
            "198.51.100.2",
            { ip: "198.51.100.2", kind: "public", found: true, countrycode: "ZZ", countryname: "Nowhere" },
        ],
        [
            "2001:db8::1",
            { ip: "2001:db8::1", kind: "public", found: true, countrycode: "DE", latitude: 52.5, longitude: 13.4 },
        ],
    ]);

    it("groups connections by remote address and keeps local ones in the table only", () => {
        const conns = [
            conn({}),
            conn({ localport: 50001, remoteendpoint: "203.0.113.9:80", remoteport: 80 }),
            conn({ remoteaddress: "203.0.113.10", remoteendpoint: "203.0.113.10:443", processname: "b.exe" }),
            conn({ remoteaddress: "10.0.0.7", remoteendpoint: "10.0.0.7:445", remotekind: "private" }),
            conn({ remoteaddress: "127.0.0.1", remoteendpoint: "127.0.0.1:12346", remotekind: "loopback" }),
            conn({ remoteaddress: "198.51.100.1", remoteendpoint: "198.51.100.1:443" }),
            conn({ remoteaddress: "198.51.100.2", remoteendpoint: "198.51.100.2:443" }),
            conn({ remoteaddress: "198.51.100.77", remoteendpoint: "198.51.100.77:443" }),
        ];
        const { pins, rows, stats } = buildModel(conns, geo, Centroids);
        expect(pins.map((p) => p.ip)).toEqual(["203.0.113.9", "203.0.113.10"]);
        expect(pins[0].connections).toHaveLength(2);
        expect(stats).toEqual({ publicCount: 6, localCount: 2, unplacedCount: 3, pinsDropped: 0 });
        expect(rows.filter((r) => r.place === "placed")).toHaveLength(3);
        expect(rows.filter((r) => r.place === "local").every((r) => r.pinIp === null)).toBe(true);
        expect(rows[0].place).toBe("placed");
        expect(rows[rows.length - 1].place).toBe("local");
    });

    it("uses database coordinates exactly and centroids with a spread", () => {
        const withCoords = buildModel(
            [conn({ remoteaddress: "2001:db8::1", remoteendpoint: "[2001:db8::1]:443", family: "ipv6" })],
            geo,
            Centroids
        );
        expect(withCoords.pins[0].lat).toBe(52.5);
        expect(withCoords.pins[0].lon).toBe(13.4);
        const centroid = buildModel([conn({})], geo, Centroids);
        expect(angularDistanceDeg({ lat: 39.5, lon: -97.5 }, centroid.pins[0])).toBeLessThan(5);
    });

    it("caps pins and reports how many were dropped", () => {
        const many: Connection[] = [];
        const table = new Map<string, GeoResult>();
        for (let i = 0; i < MaxPins + 20; i++) {
            const ip = `203.0.${Math.floor(i / 200)}.${(i % 200) + 1}`;
            many.push(conn({ remoteaddress: ip, remoteendpoint: `${ip}:443` }));
            table.set(ip, { ip, kind: "public", found: true, countrycode: "US" });
        }
        const { pins, rows, stats } = buildModel(many, table, Centroids);
        expect(pins).toHaveLength(MaxPins);
        expect(stats.pinsDropped).toBe(20);
        expect(rows).toHaveLength(MaxPins + 20);
        expect(rows.filter((r) => r.place === "unplaced")).toHaveLength(20);
    });

    it("selects only new public addresses for lookup", () => {
        const conns = [
            conn({}),
            conn({}),
            conn({ remoteaddress: "203.0.113.10" }),
            conn({ remotekind: "private", remoteaddress: "10.0.0.1" }),
        ];
        expect(addressesNeedingLookup(conns, new Set())).toEqual(["203.0.113.9", "203.0.113.10"]);
        expect(addressesNeedingLookup(conns, new Set(["203.0.113.9"]))).toEqual(["203.0.113.10"]);
    });
});

describe("masking and status", () => {
    it("hides most of an address", () => {
        expect(maskAddress("203.0.113.9")).toBe("203.0.x.x");
        expect(maskAddress("2001:db8:85a3::1")).toBe("2001:db8:x:x");
        expect(maskAddress("weird")).toBe("hidden");
        expect(maskEndpoint("203.0.113.9:443")).toBe("203.0.x.x:443");
        expect(maskEndpoint("[2001:db8::1]:443")).toBe("[2001:db8:x:x]:443");
        expect(maskEndpoint("nonsense")).toBe("hidden");
    });

    it("labels connectivity", () => {
        expect(connectivityStatus("internet")).toEqual({ label: "ONLINE", tone: "good" });
        expect(connectivityStatus("local").tone).toBe("warn");
        expect(connectivityStatus("none").label).toBe("OFFLINE");
        expect(connectivityStatus(undefined).label).toBe("UNKNOWN");
        expect(connectivityStatus("surprise").label).toBe("UNKNOWN");
    });
});

describe("settings", () => {
    it("falls back to defaults for bad input", () => {
        expect(sanitizeSettings(null)).toEqual(DefaultSettings);
        expect(sanitizeSettings([])).toEqual(DefaultSettings);
        expect(sanitizeSettings({ live: "yes", motion: "sideways", manualLat: 200, manualLon: 0 })).toEqual(
            DefaultSettings
        );
    });

    it("keeps valid values", () => {
        const got = sanitizeSettings({
            live: false,
            hideAddresses: true,
            motion: "off",
            satellites: false,
            manualLat: 10,
            manualLon: -20,
        });
        expect(got).toEqual({
            live: false,
            hideAddresses: true,
            motion: "off",
            satellites: false,
            manualLat: 10,
            manualLon: -20,
        });
    });

    it("parses coordinate input", () => {
        expect(parseCoordinateInput("40.5", "-74")).toEqual({ lat: 40.5, lon: -74 });
        expect(typeof parseCoordinateInput("", "10")).toBe("string");
        expect(typeof parseCoordinateInput("95", "10")).toBe("string");
        expect(typeof parseCoordinateInput("abc", "10")).toBe("string");
    });

    it("turns motion off for the setting or the system preference", () => {
        expect(motionAllowed(DefaultSettings, false)).toBe(true);
        expect(motionAllowed(DefaultSettings, true)).toBe(false);
        expect(motionAllowed({ ...DefaultSettings, motion: "off" }, false)).toBe(false);
    });
});

describe("frame loop", () => {
    function harness(fps: number) {
        let hidden = false;
        let nextHandle = 1;
        const pending = new Map<number, (t: number) => void>();
        const renders: number[] = [];
        const loop = createFrameLoop({
            requestFrame: (cb) => {
                const h = nextHandle++;
                pending.set(h, cb);
                return h;
            },
            cancelFrame: (h) => pending.delete(h),
            isHidden: () => hidden,
            fps,
            render: (delta) => renders.push(delta),
        });
        const step = (t: number) => {
            const callbacks = [...pending.values()];
            pending.clear();
            callbacks.forEach((cb) => cb(t));
        };
        return {
            loop,
            renders,
            step,
            pendingCount: () => pending.size,
            setHidden: (h: boolean) => {
                hidden = h;
                loop.visibilityChanged();
            },
        };
    }

    it("renders at most at the frame cap", () => {
        const h = harness(30);
        h.loop.start();
        h.step(0);
        h.step(10);
        h.step(20);
        h.step(40);
        h.step(80);
        expect(h.renders).toHaveLength(3);
    });

    it("stops asking for frames while hidden and resumes when shown", () => {
        const h = harness(30);
        h.loop.start();
        h.step(0);
        h.setHidden(true);
        expect(h.pendingCount()).toBe(0);
        expect(h.loop.isRunning()).toBe(false);
        h.step(100);
        expect(h.renders).toHaveLength(1);
        h.setHidden(false);
        expect(h.pendingCount()).toBe(1);
        h.step(200);
        expect(h.renders).toHaveLength(2);
        expect(h.renders[1]).toBe(0);
    });

    it("does not start while hidden and stops on request", () => {
        const h = harness(30);
        h.setHidden(true);
        h.loop.start();
        expect(h.pendingCount()).toBe(0);
        h.setHidden(false);
        expect(h.pendingCount()).toBe(1);
        h.loop.stop();
        expect(h.pendingCount()).toBe(0);
        h.step(10);
        expect(h.renders).toHaveLength(0);
    });
});
