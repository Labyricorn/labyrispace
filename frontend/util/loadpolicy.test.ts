// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { isRemoteWebUrl } from "./loadpolicy";

describe("isRemoteWebUrl", () => {
    it("gates pages on other hosts", () => {
        expect(isRemoteWebUrl("https://example.com/a?b=1")).toBe(true);
        expect(isRemoteWebUrl("http://192.168.1.10:8080/")).toBe(true);
    });

    it("does not gate local hosts", () => {
        expect(isRemoteWebUrl("http://localhost:3000")).toBe(false);
        expect(isRemoteWebUrl("http://127.0.0.1:12345/x")).toBe(false);
        expect(isRemoteWebUrl("http://[::1]:8080/")).toBe(false);
        expect(isRemoteWebUrl("http://app.localhost/")).toBe(false);
    });

    it("does not gate blank, file, or invalid addresses", () => {
        expect(isRemoteWebUrl("about:blank")).toBe(false);
        expect(isRemoteWebUrl("file:///C:/x.html")).toBe(false);
        expect(isRemoteWebUrl("")).toBe(false);
        expect(isRemoteWebUrl("not a url")).toBe(false);
    });
});
