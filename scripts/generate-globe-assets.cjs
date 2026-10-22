// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0
//
// Developer tool, not part of the app. Downloads public-domain source data once and writes the small asset
// files the Network Globe widget ships with. Run: node scripts/generate-globe-assets.cjs
//   Natural Earth 110m land and admin-0 countries (public domain, naturalearthdata.com)
//   IANA time zone database zone.tab (public domain)
const fs = require("fs");
const path = require("path");

const OutDir = path.resolve(__dirname, "..", "widgets", "network-globe", "assets");
const Sources = {
    land: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
    countries:
        "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    zones: "https://raw.githubusercontent.com/eggert/tz/main/zone.tab",
};
const DotCount = 30000;

async function get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.text();
}

function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function polygonsOf(geojson) {
    const polys = [];
    for (const f of geojson.features) {
        const g = f.geometry;
        const list = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        for (const rings of list) {
            let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
            for (const [x, y] of rings[0]) {
                minLon = Math.min(minLon, x);
                maxLon = Math.max(maxLon, x);
                minLat = Math.min(minLat, y);
                maxLat = Math.max(maxLat, y);
            }
            polys.push({ rings, minLon, maxLon, minLat, maxLat });
        }
    }
    return polys;
}

function isLand(polys, lon, lat) {
    for (const p of polys) {
        if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) continue;
        if (!pointInRing(lon, lat, p.rings[0])) continue;
        let inHole = false;
        for (let h = 1; h < p.rings.length; h++) {
            if (pointInRing(lon, lat, p.rings[h])) {
                inHole = true;
                break;
            }
        }
        if (!inHole) return true;
    }
    return false;
}

function landDots(polys) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = [];
    for (let i = 0; i < DotCount; i++) {
        const y = 1 - (i / (DotCount - 1)) * 2;
        const lat = (Math.asin(y) * 180) / Math.PI;
        let lon = (((i * golden) % (2 * Math.PI)) * 180) / Math.PI;
        if (lon > 180) lon -= 360;
        if (isLand(polys, lon, lat)) points.push(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
    }
    return points;
}

function centroids(countries) {
    const out = {};
    for (const f of countries.features) {
        const p = f.properties;
        let code = p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ISO_A2;
        if (!code || code === "-99") continue;
        const lon = p.LABEL_X, lat = p.LABEL_Y;
        if (typeof lon !== "number" || typeof lat !== "number") continue;
        out[code] = [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, p.NAME];
    }
    return out;
}

function parseIso6709(text) {
    const m = /^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/.exec(text);
    if (!m) return null;
    const lat = (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60 + Number(m[4] || 0) / 3600);
    const lon = (m[5] === "-" ? -1 : 1) * (Number(m[6]) + Number(m[7]) / 60 + Number(m[8] || 0) / 3600);
    return [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
}

function zones(text) {
    const out = {};
    for (const line of text.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const cols = line.split("\t");
        if (cols.length < 3) continue;
        const coords = parseIso6709(cols[1]);
        if (coords) out[cols[2]] = coords;
    }
    return out;
}

(async () => {
    const [land, countries, zoneTab] = await Promise.all([get(Sources.land), get(Sources.countries), get(Sources.zones)]);
    fs.mkdirSync(OutDir, { recursive: true });
    const dots = landDots(polygonsOf(JSON.parse(land)));
    fs.writeFileSync(path.join(OutDir, "land-dots.json"), JSON.stringify({ count: dots.length / 2, points: dots }));
    const cents = centroids(JSON.parse(countries));
    fs.writeFileSync(path.join(OutDir, "country-centroids.json"), JSON.stringify(cents));
    const tz = zones(zoneTab);
    fs.writeFileSync(path.join(OutDir, "timezones.json"), JSON.stringify(tz));
    fs.writeFileSync(
        path.join(OutDir, "DATA-NOTICE.txt"),
        "Land outline, country label positions: Natural Earth (naturalearthdata.com), public domain.\n" +
            "Time zone coordinates: IANA Time Zone Database zone.tab, public domain.\n" +
            "Generated by scripts/generate-globe-assets.cjs.\n"
    );
    console.log(`land dots: ${dots.length / 2}, countries: ${Object.keys(cents).length}, time zones: ${Object.keys(tz).length}`);
})().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
});
