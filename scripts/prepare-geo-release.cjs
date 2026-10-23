// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
//
// Developer tool, not part of the app. Fetches the free DB-IP "IP to Country Lite" database once, checks that it is
// a MaxMind DB file, and writes the files for a Labyricorn-controlled release into .local/release/geo.
// DB-IP Lite is licensed CC BY 4.0, which allows redistribution with attribution (https://db-ip.com).
// Run: node scripts/prepare-geo-release.cjs [YYYY-MM]
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const OutDir = path.resolve(__dirname, "..", ".local", "release", "geo");
const Marker = Buffer.from("\xAB\xCD\xEFMaxMind.com", "latin1");

function monthsToTry(arg) {
    if (arg) return [arg];
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return [fmt(now), fmt(prev)];
}

async function fetchMonth(month) {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`;
    const res = await fetch(url);
    if (!res.ok) return { month, url, error: `HTTP ${res.status}` };
    return { month, url, gz: Buffer.from(await res.arrayBuffer()) };
}

(async () => {
    let found = null;
    for (const month of monthsToTry(process.argv[2])) {
        const attempt = await fetchMonth(month);
        if (attempt.gz) {
            found = attempt;
            break;
        }
        console.log(`${attempt.url}: ${attempt.error}`);
    }
    if (!found) throw new Error("no database could be downloaded");
    const data = zlib.gunzipSync(found.gz);
    if (data.lastIndexOf(Marker) < 0) throw new Error("the file is not a MaxMind DB");
    fs.mkdirSync(OutDir, { recursive: true });
    const name = `dbip-country-lite-${found.month}.mmdb`;
    fs.writeFileSync(path.join(OutDir, name), data);
    const sha = crypto.createHash("sha256").update(data).digest("hex");
    fs.writeFileSync(path.join(OutDir, "SHA256SUMS"), `${sha}  ${name}\n`);
    fs.writeFileSync(
        path.join(OutDir, "ATTRIBUTION.txt"),
        `This release asset is the DB-IP IP to Country Lite database (${found.month}).\n` +
            "IP Geolocation by DB-IP (https://db-ip.com).\n" +
            "Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0):\n" +
            "https://creativecommons.org/licenses/by/4.0/\n" +
            "The file is unmodified apart from decompression.\n"
    );
    fs.writeFileSync(
        path.join(OutDir, "release.json"),
        JSON.stringify({ name, month: found.month, sizeBytes: data.length, sha256: sha, source: found.url }, null, 2) + "\n"
    );
    console.log(JSON.stringify({ name, month: found.month, sizeBytes: data.length, sha256: sha }));
})().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
