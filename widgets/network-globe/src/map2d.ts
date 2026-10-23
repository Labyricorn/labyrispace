// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { LatLon } from "./geo";
import { RoutePoint } from "./model";
import { GlobeView, MaxArcsDrawn, Palette, PinView } from "./view";

// Used when WebGL is not available: a flat map with the same pins and arcs, no rotation.
export function createMapView(container: HTMLElement, initial: Palette): GlobeView {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    canvas.setAttribute("aria-label", "Map showing where your connections go");
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas is not available");
    }

    let palette = initial;
    let land: ArrayLike<number> = [];
    let you: LatLon | null = null;
    let pins: PinView[] = [];
    let selectedIp: string | null = null;
    let route: RoutePoint[] | null = null;
    let width = 1;
    let height = 1;

    const project = (lat: number, lon: number) => ({ x: ((lon + 180) / 360) * width, y: ((90 - lat) / 180) * height });

    function draw() {
        const c = ctx!;
        c.clearRect(0, 0, width, height);
        c.fillStyle = palette.ocean;
        c.fillRect(0, 0, width, height);
        c.strokeStyle = palette.grid;
        c.globalAlpha = 0.25;
        c.beginPath();
        for (let lon = -150; lon <= 150; lon += 30) {
            const p = project(0, lon);
            c.moveTo(p.x, 0);
            c.lineTo(p.x, height);
        }
        for (let lat = -60; lat <= 60; lat += 30) {
            const p = project(lat, 0);
            c.moveTo(0, p.y);
            c.lineTo(width, p.y);
        }
        c.stroke();
        c.globalAlpha = 1;
        c.fillStyle = palette.land;
        const dot = Math.max(1, width / 360);
        for (let i = 0; i < land.length; i += 2) {
            const p = project(land[i], land[i + 1]);
            c.fillRect(p.x, p.y, dot, dot);
        }
        if (route) {
            const stops = [...(you ? [you] : []), ...route].map((s) => project(s.lat, s.lon));
            c.strokeStyle = palette.arcSelected;
            c.lineWidth = 1.5;
            c.beginPath();
            stops.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
            c.stroke();
            c.lineWidth = 1;
            c.fillStyle = palette.pinSelected;
            route.forEach((stop) => {
                const p = project(stop.lat, stop.lon);
                c.beginPath();
                c.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
                c.fill();
            });
            if (you) {
                const p = project(you.lat, you.lon);
                c.fillStyle = palette.you;
                c.beginPath();
                c.arc(p.x, p.y, 4, 0, Math.PI * 2);
                c.fill();
            }
            return;
        }
        if (you) {
            const from = project(you.lat, you.lon);
            pins.slice(0, MaxArcsDrawn).forEach((pin) => {
                const to = project(pin.lat, pin.lon);
                c.strokeStyle = pin.ip === selectedIp ? palette.arcSelected : palette.arc;
                c.globalAlpha = pin.ip === selectedIp ? 1 : 0.4;
                c.beginPath();
                c.moveTo(from.x, from.y);
                c.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - height * 0.12, to.x, to.y);
                c.stroke();
            });
            c.globalAlpha = 1;
            c.fillStyle = palette.you;
            c.beginPath();
            c.arc(from.x, from.y, 4, 0, Math.PI * 2);
            c.fill();
        }
        pins.forEach((pin) => {
            const p = project(pin.lat, pin.lon);
            c.fillStyle = pin.ip === selectedIp ? palette.pinSelected : palette.pin;
            c.beginPath();
            c.arc(p.x, p.y, 3 + Math.min(3, Math.log2(pin.count)), 0, Math.PI * 2);
            c.fill();
        });
    }

    return {
        kind: "2d",
        setLand(points) {
            land = points;
            draw();
        },
        setYou(place) {
            you = place;
            draw();
        },
        setPins(next) {
            pins = next;
            draw();
        },
        setSelected(ip) {
            selectedIp = ip;
            draw();
        },
        setRoute(next) {
            route = next;
            draw();
        },
        setSatellites() {},
        setMotion() {},
        setPalette(next) {
            palette = next;
            draw();
        },
        resize() {
            const ratio = window.devicePixelRatio || 1;
            width = Math.max(1, container.clientWidth);
            height = Math.max(1, container.clientHeight);
            canvas.width = Math.floor(width * ratio);
            canvas.height = Math.floor(height * ratio);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            draw();
        },
        render() {},
        stats() {
            return { pins: pins.length, arcs: you ? Math.min(pins.length, MaxArcsDrawn) : 0 };
        },
        dispose() {
            canvas.remove();
        },
    };
}
