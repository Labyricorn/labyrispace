// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { filterServices, sanitizeInsertText } from "./localservices-util";

function svc(over: Partial<Service>): Service {
    return {
        protocol: "tcp",
        address: "127.0.0.1",
        port: 8080,
        family: "ipv4",
        scope: "loopback",
        endpoint: "127.0.0.1:8080",
        pid: 10,
        identity: "known",
        processname: "node.exe",
        ...over,
    } as Service;
}

describe("sanitizeInsertText", () => {
    it("keeps ordinary endpoints unchanged", () => {
        expect(sanitizeInsertText("127.0.0.1:8080")).toBe("127.0.0.1:8080");
        expect(sanitizeInsertText("[::1]:5173")).toBe("[::1]:5173");
    });

    it("removes characters that could run commands or move the cursor", () => {
        expect(sanitizeInsertText("a\r\nb")).toBe("ab");
        expect(sanitizeInsertText("x\u001b[2Jy")).toBe("x[2Jy");
        expect(sanitizeInsertText("c\u0003d\u0004\u007f")).toBe("cd");
        expect(sanitizeInsertText("e\u009bf")).toBe("ef");
    });

    it("handles missing input", () => {
        expect(sanitizeInsertText(null)).toBe("");
    });
});

describe("filterServices", () => {
    const all = [
        svc({}),
        svc({
            protocol: "udp",
            port: 5353,
            address: "0.0.0.0",
            scope: "wildcard",
            endpoint: "127.0.0.1:5353",
            processname: "svchost.exe",
            pid: 99,
        }),
        svc({
            port: 22,
            address: "192.168.1.5",
            scope: "interface",
            endpoint: "192.168.1.5:22",
            processname: "sshd.exe",
            pid: 7,
        }),
    ];

    it("filters by protocol and scope", () => {
        const base = { text: "", tcp: true, udp: true, loopbackOnly: false };
        expect(filterServices(all, base)).toHaveLength(3);
        expect(filterServices(all, { ...base, udp: false })).toHaveLength(2);
        expect(filterServices(all, { ...base, loopbackOnly: true })).toHaveLength(1);
    });

    it("matches text in port, process, and address", () => {
        const base = { text: "", tcp: true, udp: true, loopbackOnly: false };
        expect(filterServices(all, { ...base, text: "5353" })).toHaveLength(1);
        expect(filterServices(all, { ...base, text: "SSHD" })).toHaveLength(1);
        expect(filterServices(all, { ...base, text: "192.168" })).toHaveLength(1);
    });
});
