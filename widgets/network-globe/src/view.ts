// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { LatLon } from "./geo";

export type Palette = {
    background: string;
    ocean: string;
    land: string;
    grid: string;
    pin: string;
    pinSelected: string;
    arc: string;
    arcSelected: string;
    you: string;
    ring: string;
    satellite: string;
    glow: string;
};

export const DarkPalette: Palette = {
    background: "#0b1020",
    ocean: "#0e1a33",
    land: "#5fb8d9",
    grid: "#2c4468",
    pin: "#ffd166",
    pinSelected: "#ff6b6b",
    arc: "#3ddcc0",
    arcSelected: "#ff9f6b",
    you: "#7dffa0",
    ring: "#3b5a8a",
    satellite: "#c9d7ff",
    glow: "#3a7bd5",
};

export const LightPalette: Palette = {
    background: "#eef2f8",
    ocean: "#d5e2f3",
    land: "#2c6f94",
    grid: "#9db3cf",
    pin: "#c27a00",
    pinSelected: "#c0392b",
    arc: "#0f8f7a",
    arcSelected: "#d35400",
    you: "#1e8e3e",
    ring: "#7a93b8",
    satellite: "#304a78",
    glow: "#5b8fd9",
};

export type PinView = { ip: string; lat: number; lon: number; count: number };

export const MaxArcsDrawn = 100;

export interface GlobeView {
    readonly kind: "webgl" | "2d";
    setLand(points: ArrayLike<number>): void;
    setYou(place: LatLon | null): void;
    setPins(pins: PinView[]): void;
    setSelected(ip: string | null): void;
    setSatellites(visible: boolean): void;
    setMotion(on: boolean): void;
    setPalette(palette: Palette): void;
    resize(): void;
    render(deltaMs: number): void;
    stats(): { pins: number; arcs: number };
    dispose(): void;
}
