// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    ExtWidgetManifest,
    isCapabilityAllowed,
    isRequestAllowed,
    isValidWidgetId,
    validateManifest,
} from "./extwidgetmanifest";

function base(over: Record<string, unknown> = {}) {
    return {
        id: "network-globe",
        name: "Network Globe",
        version: "0.1.0",
        hostApi: { min: 1, max: 1 },
        entry: "index.html",
        capabilities: ["settings", "network.connections"],
        network: [],
        license: "Apache-2.0",
        ...over,
    };
}

function manifestOf(over: Record<string, unknown> = {}): ExtWidgetManifest {
    const res = validateManifest(base(over));
    if (!res.ok) throw new Error(res.errors.join("; "));
    return res.manifest;
}

describe("validateManifest", () => {
    it("accepts a complete manifest", () => {
        const res = validateManifest(
            base({
                network: [{ host: "Example.COM", purpose: "lookups" }],
                installDownloads: [
                    {
                        id: "geo-country",
                        url: "https://github.com/Labyricorn/x/releases/download/v1/geo.mmdb",
                        sha256: "A".repeat(64),
                        sizeBytes: 1000,
                        license: "CC BY 4.0",
                        purpose: "country lookups",
                    },
                ],
            })
        );
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.manifest.network[0].host).toBe("example.com");
            expect(res.manifest.installDownloads[0].sha256).toBe("a".repeat(64));
        }
    });

    it("rejects bad shapes and unknown fields", () => {
        expect(validateManifest(null).ok).toBe(false);
        expect(validateManifest([]).ok).toBe(false);
        expect(validateManifest(base({ surprise: 1 })).ok).toBe(false);
    });

    it("rejects invalid ids, versions and entries", () => {
        expect(validateManifest(base({ id: "Bad Id" })).ok).toBe(false);
        expect(validateManifest(base({ id: "../x" })).ok).toBe(false);
        expect(validateManifest(base({ version: "1" })).ok).toBe(false);
        for (const entry of [
            "../index.html",
            "/abs.html",
            "C:/x.html",
            "a\\b.html",
            "script.js",
            "a//b.html",
            "https://x/i.html",
        ]) {
            expect(validateManifest(base({ entry })).ok).toBe(false);
        }
        expect(validateManifest(base({ entry: "ui/index.html" })).ok).toBe(true);
    });

    it("checks the host API range", () => {
        expect(validateManifest(base({ hostApi: { min: 2, max: 3 } })).ok).toBe(false);
        expect(validateManifest(base({ hostApi: { min: 3, max: 1 } })).ok).toBe(false);
        expect(validateManifest(base({ hostApi: { min: 0, max: 5 } })).ok).toBe(true);
    });

    it("rejects unknown capabilities and malformed network entries", () => {
        expect(validateManifest(base({ capabilities: ["filesystem"] })).ok).toBe(false);
        expect(validateManifest(base({ network: [{ host: "https://a.com/x", purpose: "p" }] })).ok).toBe(false);
        expect(validateManifest(base({ network: [{ host: "a.com" }] })).ok).toBe(false);
    });

    it("rejects unsafe downloads", () => {
        const dl = {
            id: "db",
            url: "https://example.com/db",
            sha256: "b".repeat(64),
            sizeBytes: 10,
            license: "MIT",
            purpose: "data",
        };
        expect(validateManifest(base({ installDownloads: [dl] })).ok).toBe(true);
        expect(validateManifest(base({ installDownloads: [{ ...dl, url: "http://example.com/db" }] })).ok).toBe(false);
        expect(validateManifest(base({ installDownloads: [{ ...dl, sha256: "xyz" }] })).ok).toBe(false);
        expect(validateManifest(base({ installDownloads: [{ ...dl, sizeBytes: 0 }] })).ok).toBe(false);
        expect(validateManifest(base({ installDownloads: [{ ...dl, sizeBytes: 10 ** 12 }] })).ok).toBe(false);
        expect(validateManifest(base({ installDownloads: [{ ...dl, id: "../db" }] })).ok).toBe(false);
        expect(validateManifest(base({ installDownloads: [dl, dl] })).ok).toBe(false);
    });
});

describe("validateManifest development option", () => {
    const dl = {
        id: "db",
        url: "http://127.0.0.1:12346/db",
        sha256: "c".repeat(64),
        sizeBytes: 10,
        license: "test",
        purpose: "dev",
    };
    it("allows loopback http only when asked", () => {
        expect(validateManifest(base({ installDownloads: [dl] })).ok).toBe(false);
        expect(validateManifest(base({ installDownloads: [dl] }), { allowLoopbackHttp: true }).ok).toBe(true);
    });
    it("never allows other http hosts", () => {
        const other = { ...dl, url: "http://example.com/db" };
        expect(validateManifest(base({ installDownloads: [other] }), { allowLoopbackHttp: true }).ok).toBe(false);
    });
});

describe("isValidWidgetId", () => {
    it("accepts simple ids only", () => {
        expect(isValidWidgetId("network-globe")).toBe(true);
        expect(isValidWidgetId("a")).toBe(false);
        expect(isValidWidgetId("A-b")).toBe(false);
        expect(isValidWidgetId("a/b")).toBe(false);
        expect(isValidWidgetId(5)).toBe(false);
    });
});

describe("isCapabilityAllowed", () => {
    const m = manifestOf();
    it("allows always-available methods", () => {
        expect(isCapabilityAllowed(m, "host.info")).toBe(true);
        expect(isCapabilityAllowed(m, "downloads.status")).toBe(true);
    });
    it("requires a declared capability otherwise", () => {
        expect(isCapabilityAllowed(m, "settings.get")).toBe(true);
        expect(isCapabilityAllowed(m, "network.connections")).toBe(true);
        expect(isCapabilityAllowed(m, "network.latency")).toBe(false);
        expect(isCapabilityAllowed(m, "theme.get")).toBe(false);
    });
    it("refuses unknown methods", () => {
        expect(isCapabilityAllowed(m, "fs.readFile")).toBe(false);
        expect(isCapabilityAllowed(m, "__proto__")).toBe(false);
        expect(isCapabilityAllowed(m, "toString")).toBe(false);
    });
});

describe("isRequestAllowed", () => {
    const root = "file:///G:/app/dist/widgets/network-globe";
    const m = manifestOf({ network: [{ host: "api.example.com", purpose: "lookups" }] });

    it("allows the widget's own files only", () => {
        expect(isRequestAllowed(m, `${root}/index.html`, root)).toBe(true);
        expect(isRequestAllowed(m, `${root}/assets/a.json`, root)).toBe(true);
        expect(isRequestAllowed(m, "file:///G:/app/dist/widgets/network-globe-evil/x.html", root)).toBe(false);
        expect(isRequestAllowed(m, "file:///C:/Windows/win.ini", root)).toBe(false);
    });

    it("allows declared hosts and nothing else", () => {
        expect(isRequestAllowed(m, "https://api.example.com/v1", root)).toBe(true);
        expect(isRequestAllowed(m, "https://API.example.com/v1", root)).toBe(true);
        expect(isRequestAllowed(m, "https://example.com/", root)).toBe(false);
        expect(isRequestAllowed(m, "http://127.0.0.1:41000/lasp/service", root)).toBe(false);
        expect(isRequestAllowed(m, "ws://127.0.0.1:41001/ws", root)).toBe(false);
    });

    it("allows inline schemes and rejects invalid input", () => {
        expect(isRequestAllowed(m, "data:text/plain,hi", root)).toBe(true);
        expect(isRequestAllowed(m, "blob:null/abc", root)).toBe(true);
        expect(isRequestAllowed(m, "not a url", root)).toBe(false);
        expect(isRequestAllowed(m, "ftp://example.com/x", root)).toBe(false);
    });

    it("blocks every host when none are declared", () => {
        const none = manifestOf();
        expect(isRequestAllowed(none, "https://example.com/", root)).toBe(false);
    });
});
