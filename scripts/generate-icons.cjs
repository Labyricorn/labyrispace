// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
// Run with: node node_modules/electron/cli.js scripts/generate-icons.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const Root = path.resolve(__dirname, "..");
const FullSvg = path.join(Root, "assets/brand/candidate-b-full.svg");
const CompactSvg = path.join(Root, "assets/brand/candidate-b-compact.svg");
const CompactMaxSize = 48;
const IcoSizes = [16, 24, 32, 48, 64, 128, 256];
const PngSizes = [16, 32, 48, 64, 128, 256, 512];

function svgForSize(size) {
    return size <= CompactMaxSize ? CompactSvg : FullSvg;
}

let win = null;

async function render(size) {
    if (!win) {
        win = new BrowserWindow({
            show: false,
            width: 512,
            height: 512,
            useContentSize: true,
            frame: false,
            transparent: true,
            webPreferences: { offscreen: true },
        });
    }
    const svg = fs.readFileSync(svgForSize(size)).toString("base64");
    const page = `<!doctype html><body style="margin:0;background:transparent;overflow:hidden"><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}" style="display:block">`;
    await win.loadURL("data:text/html;base64," + Buffer.from(page).toString("base64"));
    await new Promise((r) => setTimeout(r, 400));
    let image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    const actual = image.getSize();
    if (actual.width !== size || actual.height !== size) {
        image = image.resize({ width: size, height: size, quality: "best" });
    }
    return image.toPNG();
}

function makeIco(entries) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(entries.length, 4);
    const dir = Buffer.alloc(16 * entries.length);
    let offset = header.length + dir.length;
    entries.forEach((entry, i) => {
        const base = i * 16;
        dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base);
        dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
        dir.writeUInt16LE(1, base + 4);
        dir.writeUInt16LE(32, base + 6);
        dir.writeUInt32LE(entry.png.length, base + 8);
        dir.writeUInt32LE(offset, base + 12);
        offset += entry.png.length;
    });
    return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
    const cache = new Map();
    const get = async (size) => {
        if (!cache.has(size)) cache.set(size, await render(size));
        return cache.get(size);
    };
    for (const size of PngSizes) {
        fs.writeFileSync(path.join(Root, "build/icons", `${size}x${size}.png`), await get(size));
    }
    const ico = [];
    for (const size of IcoSizes) ico.push({ size, png: await get(size) });
    fs.writeFileSync(path.join(Root, "build/icon.ico"), makeIco(ico));
    fs.writeFileSync(path.join(Root, "public/logos/labyrispace-logo-256.png"), await get(256));
    fs.writeFileSync(path.join(Root, "public/logos/labyrispace-logo.png"), await get(512));
    fs.writeFileSync(path.join(Root, "assets/appicon-windows.png"), await get(512));
    console.log("icons generated");
    app.quit();
});
