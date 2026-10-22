// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
// Packages each widget into dist/widgets: copies everything except src, then bundles src/main.ts (when present)
// into main.js with esbuild.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const Root = path.resolve(__dirname, "..");
const Source = path.join(Root, "widgets");
const Target = path.join(Root, "dist", "widgets");

fs.rmSync(Target, { recursive: true, force: true });
fs.mkdirSync(Target, { recursive: true });
let count = 0;
for (const entry of fs.readdirSync(Source, { withFileTypes: true })) {
    const from = path.join(Source, entry.name);
    if (!entry.isDirectory() || !fs.existsSync(path.join(from, "manifest.json"))) continue;
    const to = path.join(Target, entry.name);
    fs.cpSync(from, to, {
        recursive: true,
        filter: (src) => {
            const top = path.relative(from, src).split(path.sep)[0];
            return top !== "src" && top !== "assets";
        },
    });
    const main = path.join(from, "src", "main.ts");
    if (fs.existsSync(main)) {
        esbuild.buildSync({
            entryPoints: [main],
            bundle: true,
            format: "iife",
            target: "chrome128",
            minify: true,
            legalComments: "none",
            outfile: path.join(to, "main.js"),
            loader: { ".json": "json" },
        });
        const notice = path.join(from, "assets", "DATA-NOTICE.txt");
        if (fs.existsSync(notice)) fs.copyFileSync(notice, path.join(to, "DATA-NOTICE.txt"));
    } else if (fs.existsSync(path.join(from, "assets"))) {
        fs.cpSync(path.join(from, "assets"), path.join(to, "assets"), { recursive: true });
    }
    count++;
}
console.log(`packaged ${count} widget package(s) into dist/widgets`);
