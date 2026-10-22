// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
// Copies each widget package (everything except its src folder) into dist/widgets for the app to load.
const fs = require("fs");
const path = require("path");

const Root = path.resolve(__dirname, "..");
const Source = path.join(Root, "widgets");
const Target = path.join(Root, "dist", "widgets");

fs.rmSync(Target, { recursive: true, force: true });
fs.mkdirSync(Target, { recursive: true });
let count = 0;
for (const entry of fs.readdirSync(Source, { withFileTypes: true })) {
    if (!entry.isDirectory() || !fs.existsSync(path.join(Source, entry.name, "manifest.json"))) continue;
    fs.cpSync(path.join(Source, entry.name), path.join(Target, entry.name), {
        recursive: true,
        filter: (src) => path.relative(path.join(Source, entry.name), src).split(path.sep)[0] !== "src",
    });
    count++;
}
console.log(`copied ${count} widget package(s) to dist/widgets`);
