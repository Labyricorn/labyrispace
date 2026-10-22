// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export type ServiceFilter = {
    text: string;
    tcp: boolean;
    udp: boolean;
    loopbackOnly: boolean;
};

// Control characters in text sent to a shell can run commands or change the display, so none are inserted.
export function sanitizeInsertText(text: string): string {
    return (text ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

export function scopeLabel(scope: string): string {
    switch (scope) {
        case "loopback":
            return "This computer";
        case "wildcard":
            return "All interfaces";
        case "interface":
            return "One interface";
    }
    return scope;
}

export function filterServices(services: Service[], filter: ServiceFilter): Service[] {
    const needle = filter.text.trim().toLowerCase();
    return (services ?? []).filter((svc) => {
        if (svc.protocol === "tcp" && !filter.tcp) return false;
        if (svc.protocol === "udp" && !filter.udp) return false;
        if (filter.loopbackOnly && svc.scope !== "loopback") return false;
        if (needle === "") return true;
        const haystack = [
            svc.protocol,
            svc.address,
            String(svc.port),
            svc.endpoint,
            svc.processname ?? "",
            String(svc.pid),
        ]
            .join(" ")
            .toLowerCase();
        return haystack.includes(needle);
    });
}
