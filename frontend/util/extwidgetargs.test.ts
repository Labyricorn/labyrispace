// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { MaxGeoLookups, parseGeoLookupArgs, parseLatencyArgs } from "./extwidgetargs";

describe("parseGeoLookupArgs", () => {
    it("accepts a list of addresses", () => {
        expect(parseGeoLookupArgs({ ips: ["8.8.8.8", "2001:db8::1"] })).toEqual({ ips: ["8.8.8.8", "2001:db8::1"] });
        expect(parseGeoLookupArgs({ ips: [] })).toEqual({ ips: [] });
    });

    it("rejects wrong shapes", () => {
        for (const bad of [null, undefined, [], "8.8.8.8", {}, { ips: "8.8.8.8" }, { ips: [1] }, { ips: [""] }]) {
            expect(() => parseGeoLookupArgs(bad)).toThrow();
        }
    });

    it("rejects control characters, long strings and oversized lists", () => {
        expect(() => parseGeoLookupArgs({ ips: ["8.8.8.8\r\nx"] })).toThrow();
        expect(() => parseGeoLookupArgs({ ips: ["\u001b[2J"] })).toThrow();
        expect(() => parseGeoLookupArgs({ ips: ["a".repeat(65)] })).toThrow();
        expect(() => parseGeoLookupArgs({ ips: new Array(MaxGeoLookups + 1).fill("8.8.8.8") })).toThrow();
        expect(parseGeoLookupArgs({ ips: new Array(MaxGeoLookups).fill("8.8.8.8") }).ips).toHaveLength(MaxGeoLookups);
    });
});

describe("parseLatencyArgs", () => {
    it("defaults to the gateway", () => {
        expect(parseLatencyArgs(undefined)).toEqual({ target: "gateway" });
        expect(parseLatencyArgs({})).toEqual({ target: "gateway" });
    });

    it("accepts a target and port", () => {
        expect(parseLatencyArgs({ target: " example.com ", port: 443 })).toEqual({ target: "example.com", port: 443 });
    });

    it("rejects bad targets and ports", () => {
        for (const bad of ["", "  ", "a\nb", "x".repeat(254), 5, {}]) {
            expect(() => parseLatencyArgs({ target: bad })).toThrow();
        }
        for (const port of [0, -1, 65536, 1.5, "80", NaN]) {
            expect(() => parseLatencyArgs({ target: "gateway", port })).toThrow();
        }
        expect(() => parseLatencyArgs("gateway")).toThrow();
        expect(() => parseLatencyArgs([])).toThrow();
    });
});
