// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { shouldInjectAuthKey } from "./authkey-policy";

const Backend = ["http://127.0.0.1:41000", "ws://127.0.0.1:41001"];
const AppWindows = new Set([7, 8]);

describe("shouldInjectAuthKey", () => {
    it("adds the key for app windows talking to the backend", () => {
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41000/lasp/service", webContentsId: 7 }, AppWindows, Backend)).toBe(true);
        expect(shouldInjectAuthKey({ url: "ws://127.0.0.1:41001/ws?stableid=x", webContentsId: 8 }, AppWindows, Backend)).toBe(true);
    });

    it("never adds the key for guest contents", () => {
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41000/lasp/service", webContentsId: 99 }, AppWindows, Backend)).toBe(false);
    });

    it("adds the key for main-process requests (no webContentsId) to the backend", () => {
        // appSession.fetch / electron.net.fetch from the main process carry no webContentsId; that is the app.
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41000/lasp/file" }, AppWindows, Backend)).toBe(true);
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41000/lasp/service" }, AppWindows, Backend)).toBe(true);
    });

    it("never adds the key for a non-backend destination even from the main process", () => {
        expect(shouldInjectAuthKey({ url: "https://example.com/" }, AppWindows, Backend)).toBe(false);
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41000.evil.example/" }, AppWindows, Backend)).toBe(false);
    });

    it("does not add the key for other destinations", () => {
        expect(shouldInjectAuthKey({ url: "https://example.com/", webContentsId: 7 }, AppWindows, Backend)).toBe(false);
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41000.evil.example/", webContentsId: 7 }, AppWindows, Backend)).toBe(false);
        expect(shouldInjectAuthKey({ url: "http://127.0.0.1:41002/lasp/service", webContentsId: 7 }, AppWindows, Backend)).toBe(false);
    });
});

describe("source check for default-session key injection", () => {
    // Was documented as a known gap in phase1-inventory.md section 5.1; the fix (dedicated app session
    // partition, see emain-appcontents.ts) landed, so this now asserts the fixed state directly.
    it("does not register key injection on the default session", () => {
        const emainSource = readFileSync(new URL("./emain.ts", import.meta.url), "utf8");
        expect(emainSource).not.toMatch(/configureAuthKeyRequestInjection\(\s*electron\.session\.defaultSession\s*\)/);
    });
});
