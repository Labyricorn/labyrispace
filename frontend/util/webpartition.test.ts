// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { DedicatedWebPartition, resolveWebPartition } from "./webpartition";

describe("resolveWebPartition", () => {
    it("never returns an empty value", () => {
        for (const input of [{}, { override: "" }, { metaPartition: "" }, { override: "  ", metaPartition: " " }]) {
            expect(resolveWebPartition(input)).toBe(DedicatedWebPartition);
        }
    });

    it("keeps a saved partition", () => {
        expect(resolveWebPartition({ metaPartition: "persist:work" })).toBe("persist:work");
    });

    it("lets a view override win", () => {
        expect(resolveWebPartition({ override: "tsunami:abc", metaPartition: "persist:work" })).toBe("tsunami:abc");
    });

    it("uses a named persistent partition, not the default session", () => {
        expect(DedicatedWebPartition.startsWith("persist:")).toBe(true);
        expect(DedicatedWebPartition.length).toBeGreaterThan("persist:".length);
    });
});
