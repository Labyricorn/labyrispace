// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { isValidLatLon } from "./geo";

export const ColorThemes = ["blue", "green", "amber", "white"] as const;
export type ColorTheme = (typeof ColorThemes)[number];

export type Settings = {
    live: boolean;
    hideAddresses: boolean;
    motion: "auto" | "off";
    satellites: boolean;
    manualLat: number | null;
    manualLon: number | null;
    publicIpProvider: string;
    colorTheme: ColorTheme;
};

export const DefaultSettings: Settings = {
    live: true,
    hideAddresses: false,
    motion: "auto",
    satellites: true,
    manualLat: null,
    manualLon: null,
    publicIpProvider: "",
    colorTheme: "blue",
};

// Settings come from a file the widget wrote earlier; anything unexpected falls back to the default.
export function sanitizeSettings(raw: unknown): Settings {
    const out: Settings = { ...DefaultSettings };
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return out;
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.live === "boolean") out.live = r.live;
    if (typeof r.hideAddresses === "boolean") out.hideAddresses = r.hideAddresses;
    if (r.motion === "auto" || r.motion === "off") out.motion = r.motion;
    if (typeof r.satellites === "boolean") out.satellites = r.satellites;
    if (isValidLatLon(r.manualLat, r.manualLon)) {
        out.manualLat = r.manualLat as number;
        out.manualLon = r.manualLon as number;
    }
    if (typeof r.publicIpProvider === "string" && r.publicIpProvider.length <= 300) out.publicIpProvider = r.publicIpProvider;
    if (ColorThemes.includes(r.colorTheme as ColorTheme)) out.colorTheme = r.colorTheme as ColorTheme;
    return out;
}

export function parseCoordinateInput(latText: string, lonText: string): { lat: number; lon: number } | string {
    const lat = Number(latText.trim());
    const lon = Number(lonText.trim());
    if (latText.trim() === "" || lonText.trim() === "" || !isValidLatLon(lat, lon)) {
        return "Latitude must be between -90 and 90, and longitude between -180 and 180.";
    }
    return { lat, lon };
}

export function motionAllowed(settings: Settings, prefersReducedMotion: boolean): boolean {
    return settings.motion === "auto" && !prefersReducedMotion;
}
