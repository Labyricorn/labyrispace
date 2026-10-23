// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { Palette } from "./view";

export type AppColors = { bg: string; text: string; dim: string; line: string; accent: string };

const ColorKeys: (keyof AppColors)[] = ["bg", "text", "dim", "line", "accent"];
const ColorPattern = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/;

// The app passes its own colors in the page address so the widget can look like the blocks around it. Values that are
// not plain colors are ignored.
export function readAppColors(search: string): AppColors | null {
    const params = new URLSearchParams(search);
    const out: Partial<AppColors> = {};
    for (const key of ColorKeys) {
        const value = params.get(key);
        if (value == null || !ColorPattern.test(value.trim())) return null;
        out[key] = value.trim();
    }
    return out as AppColors;
}

export function parseRgb(color: string): [number, number, number] | null {
    const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const short = /^#([0-9a-fA-F]{3})$/.exec(color);
    if (short) {
        const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
        return [r, g, b];
    }
    const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(color);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

export function mixColor(base: string, toward: string, amount: number): string {
    const a = parseRgb(base);
    const b = parseRgb(toward);
    if (!a || !b) return base;
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
    return `#${m.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

export function applyAppColors(colors: AppColors, palette: Palette, dark: boolean): Palette {
    const lift = dark ? "#ffffff" : "#000000";
    return {
        ...palette,
        background: mixColor(colors.bg, colors.bg, 0),
        ocean: mixColor(colors.bg, lift, 0.05),
    };
}

export function cssVariablesFor(colors: AppColors, dark: boolean): Record<string, string> {
    const lift = dark ? "#ffffff" : "#000000";
    return {
        "--bg": colors.bg,
        "--panel": mixColor(colors.bg, lift, 0.05),
        "--text": colors.text,
        "--dim": colors.dim,
        "--line": colors.line,
        "--accent": colors.accent,
    };
}
