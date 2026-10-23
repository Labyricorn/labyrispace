// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { AppColors, applyAppColors, applyColorTheme, cssVariablesFor, readAppColors, themeInk } from "./theme";
import centroidData from "../assets/country-centroids.json";
import landData from "../assets/land-dots.json";
import zoneData from "../assets/timezones.json";
import { approximateLocation, LatLon, TimeZoneTable } from "./geo";
import { createWebglGlobe } from "./globe";
import { createMapView } from "./map2d";
import {
    addressesNeedingLookup,
    buildModel,
    CentroidTable,
    Connection,
    connectionKey,
    connectivityStatus,
    GeoResult,
    maskAddress,
    maskEndpoint,
    nextSort,
    publicHopAddresses,
    Row,
    RoutePoint,
    routePoints,
    SortColumn,
    SortState,
    sortRows,
    TraceHop,
} from "./model";
import { createFrameLoop } from "./scheduler";
import { ColorTheme, DefaultSettings, motionAllowed, parseCoordinateInput, sanitizeSettings, Settings } from "./settings";
import { DarkPalette, GlobeView, LightPalette } from "./view";

declare global {
    interface Window {
        labyrispaceWidget: { call: (method: string, args?: unknown) => Promise<any> };
        __netGlobe?: Record<string, unknown>;
    }
}

const RefreshMs = 3000;
const InterfaceRefreshMs = 9000;
const GeoRetryMs = 60000;
const DoubleClickMs = 450;
const SortHeaders: [SortColumn, string][] = [
    ["process", "Process"],
    ["remote", "Remote"],
    ["state", "State"],
    ["where", "Where"],
];
const ThemeLabels: [ColorTheme, string][] = [
    ["blue", "Light blue"],
    ["green", "Monochrome green"],
    ["amber", "Monochrome amber"],
    ["white", "White"],
];

type TraceState = {
    ip: string;
    status: "running" | "done" | "error";
    hops: TraceHop[];
    points: RoutePoint[];
    unplaced: number;
    message: string;
};

function host<T = any>(method: string, args?: unknown): Promise<T> {
    return window.labyrispaceWidget.call(method, args);
}

function cleanError(err: unknown): string {
    const text = err instanceof Error ? err.message : String(err);
    return text.replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
}

function h(tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]): HTMLElement {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    for (const kid of kids) {
        if (kid == null) continue;
        node.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return node;
}

const centroids = centroidData as unknown as CentroidTable;
const zones = zoneData as unknown as TimeZoneTable;

let settings: Settings = { ...DefaultSettings };
let globe: GlobeView;
let conns: Connection[] = [];
let rows: Row[] = [];
let stats = { publicCount: 0, localCount: 0, unplacedCount: 0, pinsDropped: 0 };
let interfaces: any = null;
let lastInterfacesAt = 0;
let geoCache = new Map<string, GeoResult>();
let geoStatus: "unknown" | "ready" | "missing" | "error" = "unknown";
let geoSource = "";
let geoMessage = "";
let geoCheckedAt = 0;
let downloadsAvailable = false;
let selectedKey: string | null = null;
let pendingFocusKey: string | null = null;
let sort: SortState = null;
let newestBaseline: Set<string> | null = null;
let trace: TraceState | null = null;
let traceToken = 0;
let lastClick = { key: "", at: 0 };
let isDark = true;
let appColors: AppColors | null = null;
let latencyText = "";
let publicIpHost = "";
let publicPlace: LatLon | null = null;
let lastPublicIp = "";
let inflight = false;
let lastUpdate = 0;
let frames = 0;
let renders = 0;
let dirty = true;
let youLabel = "not set";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const els: Record<string, HTMLElement> = {};

function markDirty() {
    dirty = true;
}

function currentYou(): { place: LatLon | null; label: string } {
    if (settings.manualLat != null && settings.manualLon != null) {
        return { place: { lat: settings.manualLat, lon: settings.manualLon }, label: "manual location" };
    }
    if (publicPlace) {
        return { place: publicPlace, label: "from your public address (country level)" };
    }
    const approx = approximateLocation(Intl.DateTimeFormat().resolvedOptions().timeZone, zones);
    return approx ? { place: approx, label: "approximate, from your time zone" } : { place: null, label: "not set" };
}

function showNotice(text: string, tone: "warn" | "bad" | "info" = "info") {
    els.notice.textContent = text;
    els.notice.className = text ? `notice ${tone}` : "notice hidden";
}

function addr(a: string): string {
    return settings.hideAddresses ? maskAddress(a) : a;
}

function endpoint(e: string): string {
    return settings.hideAddresses ? maskEndpoint(e) : e;
}

function renderStatus() {
    const status = connectivityStatus(interfaces?.connectivity);
    const def = (interfaces?.interfaces ?? []).find((i: any) => i.isdefault);
    const bar = els.status;
    bar.replaceChildren(
        ...[
            h("span", { class: `chip ${status.tone}` }, `● ${status.label}`),
            h("span", { class: "meta" }, def ? `Interface: ${def.name}` : "Interface: none with a gateway"),
            def && def.addresses.length
                ? h("span", { class: "meta mono" }, addr(def.addresses.slice(0, 2).join("  ")))
                : null,
            def && def.gateway ? h("span", { class: "meta mono" }, `Gateway ${addr(def.gateway)}`) : null,
            latencyText ? h("span", { class: "meta" }, latencyText) : null,
            lastPublicIp ? h("span", { class: "meta" }, `Public address: ${addr(lastPublicIp)} (from ${publicIpHost})`) : null,
        ].filter((node): node is HTMLElement => node != null)
    );
}

function displayRows(): Row[] {
    return sortRows(rows, sort);
}

function currentPalette() {
    const palette = applyColorTheme(isDark ? DarkPalette : LightPalette, settings.colorTheme, isDark);
    return appColors ? applyAppColors(appColors, palette, isDark) : palette;
}

function applyThemeCss() {
    const accent = themeInk(settings.colorTheme, isDark) ?? appColors?.accent;
    const style = document.documentElement.style;
    if (accent) style.setProperty("--accent", accent);
    else style.removeProperty("--accent");
}

function renderHeaders() {
    for (const [column] of SortHeaders) {
        const th = els[`th-${column}`];
        const active = sort?.column === column;
        th.setAttribute("aria-sort", active ? (sort!.descending ? "descending" : "ascending") : "none");
        th.querySelector(".arrow")!.textContent = active ? (sort!.descending ? " ▼" : " ▲") : "";
    }
}

function renderNewestButton() {
    const button = els.newestButton;
    const newCount = newestBaseline ? conns.filter((c) => !newestBaseline!.has(connectionKey(c))).length : 0;
    button.textContent = newestBaseline ? `Show all (${newCount} new)` : "Filter newest";
    button.setAttribute("aria-pressed", newestBaseline ? "true" : "false");
    button.classList.toggle("on", newestBaseline != null);
}

function renderTable() {
    const body = els.tbody;
    body.replaceChildren();
    renderHeaders();
    for (const row of displayRows()) {
        const c = row.conn;
        const tr = h(
            "tr",
            {
                tabindex: "0",
                "data-key": row.key,
                class: row.key === selectedKey ? "selected" : "",
                "aria-selected": row.key === selectedKey ? "true" : "false",
            },
            h("td", {}, c.processname ?? (c.pid > 0 ? `pid ${c.pid}` : "unknown")),
            h("td", { class: "mono" }, endpoint(c.remoteendpoint)),
            h("td", {}, c.state.toLowerCase().replace("_", " ")),
            h("td", { class: row.place === "placed" ? "" : "dim" }, row.country)
        );
        body.append(tr);
    }
    if (rows.length === 0) {
        const empty = newestBaseline ? "No new connections since the filter was set." : "No active connections right now.";
        body.append(h("tr", {}, h("td", { colspan: "4", class: "dim" }, empty)));
    }
    if (pendingFocusKey) {
        (body.querySelector(`tr[data-key="${CSS.escape(pendingFocusKey)}"]`) as HTMLElement | null)?.focus();
        pendingFocusKey = null;
    }
}

function renderDetails() {
    const row = rows.find((r) => r.key === selectedKey);
    const box = els.details;
    if (!row) {
        box.replaceChildren(h("div", { class: "dim" }, "Select a connection to see its details."));
        return;
    }
    const c = row.conn;
    const sameAddress = c.remotekind === "public" ? conns.filter((x) => x.remoteaddress === c.remoteaddress).length : 1;
    const pairs: [string, string][] = [
        ["Remote", endpoint(c.remoteendpoint)],
        [
            "Where",
            row.place === "placed"
                ? row.country
                : row.place === "local"
                  ? row.country
                  : "not placed (no location data)",
        ],
        ["State", c.state.toLowerCase().replace("_", " ")],
        [
            "This computer",
            endpoint(
                `${c.localaddress}:${c.localport}`.replace(/^(.*):(\d+)$/, c.family === "ipv6" ? "[$1]:$2" : "$1:$2")
            ),
        ],
        ["Process", c.processname ? `${c.processname} (pid ${c.pid})` : "unavailable"],
        ["Program", c.processpath || "unavailable"],
        ["Connections to this address", String(sameAddress)],
    ];
    const list = h("dl", {});
    for (const [k, v] of pairs) list.append(h("dt", {}, k), h("dd", { class: k === "Program" ? "mono wrap" : "" }, v));
    box.replaceChildren(list);
    if (c.remotekind === "public" && trace?.status !== "running") {
        const traceButton = h("button", { type: "button" }, "Trace route and isolate on globe");
        traceButton.addEventListener("click", () => void startTrace(row));
        box.append(h("div", { class: "row tight" }, traceButton));
    }
    if (trace) box.append(renderTrace(trace));
}

function renderTrace(t: TraceState): HTMLElement {
    const section = h("div", { class: "trace" }, h("h4", {}, `Route to ${addr(t.ip)}`));
    if (t.status === "running") {
        section.append(h("div", { class: "dim" }, "Tracing... this can take up to 40 seconds. Refresh resets the view."));
        return section;
    }
    if (t.status === "error") {
        section.append(h("div", { class: "dim" }, t.message));
        return section;
    }
    const list = h("ol", { class: "hops mono" });
    for (const hop of t.hops) {
        const place = hop.address ? geoCache.get(hop.address) : undefined;
        const where = place?.found ? place.countryname || place.countrycode || "" : "";
        const time = hop.millis ? `${hop.millis.toFixed(0)} ms` : "";
        list.append(h("li", { value: String(hop.hop) }, hop.address ? `${addr(hop.address)}  ${where}  ${time}` : "no reply"));
    }
    section.append(
        h(
            "div",
            { class: "dim" },
            `${t.points.length} stops on the globe` +
                (t.unplaced ? `, ${t.unplaced} on private networks or without location data` : "") +
                ". Refresh resets the view."
        ),
        list
    );
    return section;
}

function renderFooter() {
    const placed = rows.filter((r) => r.place === "placed").length;
    const geoText =
        geoStatus === "ready"
            ? `locations from your ${geoSource === "user" ? "own" : "downloaded"} database`
            : geoStatus === "missing"
              ? "no location database installed"
              : geoStatus === "error"
                ? `location lookup failed: ${geoMessage}`
                : "checking for a location database";
    const time = lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "never";
    els.footer.textContent =
        `${placed} on the globe · ${stats.unplacedCount} not placed · ${stats.localCount} local · updated ${time} · ${geoText}` +
        (stats.pinsDropped ? ` · ${stats.pinsDropped} more than the map can show` : "") +
        ` · You: ${youLabel} · Orbits and satellites are decorative.`;
}

function applyGeoNotice() {
    if (geoStatus === "missing") {
        showNotice(
            "No location database is installed, so connections are listed but not placed on the globe." +
                (downloadsAvailable ? " Use the button below to review the download." : ""),
            "info"
        );
    } else if (geoStatus === "error") {
        showNotice(`Locations are unavailable: ${geoMessage}`, "warn");
    } else if (els.notice.textContent.startsWith("No location") || els.notice.textContent.startsWith("Locations are")) {
        showNotice("");
    }
    els.installRow.className = geoStatus === "missing" && downloadsAvailable ? "row" : "row hidden";
}

function dbInfoText(): string {
    const state =
        geoStatus === "ready"
            ? geoSource === "user"
                ? "Using the file you imported."
                : "Using the downloaded DB-IP Lite country database."
            : "No database is installed.";
    return `${state} IP Geolocation by DB-IP (https://db-ip.com), CC BY 4.0. A file you import is used instead of the download and never leaves this computer.`;
}

function publishDebug() {
    const s = globe?.stats() ?? { pins: 0, arcs: 0 };
    window.__netGlobe = {
        kind: globe?.kind,
        frames,
        renders,
        running: loop.isRunning(),
        pins: s.pins,
        arcs: s.arcs,
        rows: rows.length,
        geoStatus,
        geoSource,
        motion: motionAllowed(settings, prefersReducedMotion.matches),
        you: youLabel,
        hideAddresses: settings.hideAddresses,
        publicIp: lastPublicIp ? "set" : "",
    };
}

function rebuild() {
    const shown = newestBaseline ? conns.filter((c) => !newestBaseline!.has(connectionKey(c))) : conns;
    const model = buildModel(shown, geoCache, centroids);
    rows = model.rows;
    stats = model.stats;
    if (selectedKey && !rows.some((r) => r.key === selectedKey)) {
        selectedKey = null;
    }
    globe.setPins(model.pins.map((p) => ({ ip: p.ip, lat: p.lat, lon: p.lon, count: p.connections.length })));
    globe.setSelected(rows.find((r) => r.key === selectedKey)?.pinIp ?? null);
    renderTable();
    renderNewestButton();
    renderDetails();
    renderFooter();
    applyGeoNotice();
    markDirty();
    publishDebug();
}

function toggleNewest() {
    newestBaseline = newestBaseline ? null : new Set(conns.map(connectionKey));
    rebuild();
}

function selectOrTrace(key: string) {
    const now = Date.now();
    const isSecond = lastClick.key === key && now - lastClick.at < DoubleClickMs;
    lastClick = isSecond ? { key: "", at: 0 } : { key, at: now };
    select(key, false);
    const row = rows.find((r) => r.key === key);
    if (isSecond && row) void startTrace(row);
}

async function startTrace(row: Row) {
    if (trace?.status === "running") return;
    if (row.conn.remotekind !== "public") {
        showNotice("Trace route needs a public address. This connection stays on your own network.", "info");
        return;
    }
    const token = ++traceToken;
    const ip = row.conn.remoteaddress;
    trace = { ip, status: "running", hops: [], points: [], unplaced: 0, message: "" };
    globe.setRoute([]);
    renderDetails();
    markDirty();
    try {
        const result = await host("network.trace", { target: ip });
        if (token !== traceToken) return;
        const hops: TraceHop[] = result.hops ?? [];
        const wanted = publicHopAddresses(hops).filter((a) => !geoCache.has(a));
        if (wanted.length > 0 && geoStatus === "ready") {
            const found = await host("network.geolookup", { ips: wanted });
            if (token !== traceToken) return;
            for (const loc of found.locations as GeoResult[]) geoCache.set(loc.ip, loc);
        }
        const route = routePoints(hops, ip, geoCache, centroids);
        trace = { ip, status: "done", hops, points: route.points, unplaced: route.unplaced, message: "" };
        globe.setRoute(route.points);
    } catch (err) {
        if (token !== traceToken) return;
        trace = { ip, status: "error", hops: [], points: [], unplaced: 0, message: cleanError(err) };
        globe.setRoute(null);
    }
    renderDetails();
    markDirty();
}

function clearTrace() {
    traceToken++;
    trace = null;
    globe.setRoute(null);
}

function select(key: string | null, focus: boolean) {
    selectedKey = key;
    if (focus && key) pendingFocusKey = key;
    const row = rows.find((r) => r.key === key);
    globe.setSelected(row?.pinIp ?? null);
    renderTable();
    renderDetails();
    markDirty();
}

async function lookupNew(force: boolean) {
    if (geoStatus === "missing" && !force && Date.now() - geoCheckedAt < GeoRetryMs) return;
    let wanted = addressesNeedingLookup(conns, new Set(geoCache.keys()));
    const probing = wanted.length === 0 && (geoStatus === "unknown" || geoStatus === "missing");
    if (wanted.length === 0 && !probing) return;
    if (probing) wanted = ["127.0.0.1"];
    try {
        const result = await host("network.geolookup", { ips: wanted });
        geoStatus = "ready";
        geoSource = result.source;
        if (!probing) for (const loc of result.locations as GeoResult[]) geoCache.set(loc.ip, loc);
    } catch (err) {
        const message = cleanError(err);
        geoCheckedAt = Date.now();
        if (/no geolocation database/i.test(message)) {
            geoStatus = "missing";
        } else {
            geoStatus = "error";
            geoMessage = message;
        }
    }
}

async function refresh(manual = false) {
    if (inflight) return;
    inflight = true;
    try {
        if (manual || Date.now() - lastInterfacesAt > InterfaceRefreshMs) {
            interfaces = await host("network.interfaces");
            lastInterfacesAt = Date.now();
            renderStatus();
        }
        const resp = await host("network.connections");
        conns = resp.connections ?? [];
        if (manual) {
            geoCache = new Map();
            selectedKey = null;
            clearTrace();
        }
        await lookupNew(manual);
        lastUpdate = Date.now();
        rebuild();
    } catch (err) {
        showNotice(`Could not read network state: ${cleanError(err)}`, "warn");
    } finally {
        inflight = false;
    }
}

async function measureLatency() {
    const button = els.latencyButton as HTMLButtonElement;
    button.disabled = true;
    latencyText = "Measuring...";
    renderStatus();
    try {
        const r = await host("network.latency", { target: "gateway" });
        if (r.reachable && !r.refused) latencyText = `Gateway ${addr(r.resolved)}: ${r.millis.toFixed(1)} ms`;
        else if (r.reachable)
            latencyText = `Gateway ${addr(r.resolved)} answered in ${r.millis.toFixed(1)} ms (port ${r.port} closed)`;
        else latencyText = `Gateway ${addr(r.resolved)} did not answer (${r.error || "no reply"})`;
    } catch (err) {
        latencyText = cleanError(err);
    } finally {
        button.disabled = false;
        renderStatus();
    }
}

async function lookupPublicAddress(input: HTMLInputElement, message: HTMLElement, button: HTMLButtonElement) {
    const url = input.value.trim();
    message.textContent = "";
    if (url === "") {
        message.textContent = "Enter the address of a lookup service first. None is built in.";
        return;
    }
    button.disabled = true;
    try {
        const r = await host("network.publicip", { url });
        settings = { ...settings, publicIpProvider: url };
        host("settings.set", settings).catch(() => {});
        publicIpHost = r.host;
        publicPlace = null;
        if (geoStatus === "ready") {
            const found = (await host("network.geolookup", { ips: [r.ip] })).locations?.[0] as GeoResult | undefined;
            const centroid = found?.found && found.countrycode ? centroids[found.countrycode] : null;
            if (centroid) publicPlace = { lat: centroid[0], lon: centroid[1] };
        }
        lastPublicIp = r.ip;
        applySettings(false);
    } catch (err) {
        message.textContent = cleanError(err);
    } finally {
        button.disabled = false;
    }
}

async function importDatabase(message: HTMLElement) {
    message.textContent = "";
    try {
        const r = await host("geo.import");
        if (!r.imported) {
            message.textContent = r.message || "Nothing was imported.";
            return;
        }
        message.textContent = "Database imported. It stays on this computer.";
        await refresh(true);
    } catch (err) {
        message.textContent = cleanError(err);
    }
}

async function removeImportedDatabase(message: HTMLElement) {
    try {
        const r = await host("geo.removeimport");
        message.textContent = r.removed ? "The imported database was removed." : "No imported database was found.";
        await refresh(true);
    } catch (err) {
        message.textContent = cleanError(err);
    }
}

function applySettings(save: boolean) {
    const you = currentYou();
    youLabel = you.label;
    globe.setYou(you.place);
    globe.setMotion(motionAllowed(settings, prefersReducedMotion.matches));
    globe.setSatellites(settings.satellites);
    applyThemeCss();
    globe.setPalette(currentPalette());
    (els.themeSelect as HTMLSelectElement).value = settings.colorTheme;
    (els.liveBox as HTMLInputElement).checked = settings.live;
    (els.hideBox as HTMLInputElement).checked = settings.hideAddresses;
    (els.satBox as HTMLInputElement).checked = settings.satellites;
    (els.motionSelect as HTMLSelectElement).value = settings.motion;
    renderStatus();
    renderTable();
    renderDetails();
    renderFooter();
    markDirty();
    publishDebug();
    if (save) {
        host("settings.set", settings).catch((err) =>
            showNotice(`Settings were not saved: ${cleanError(err)}`, "warn")
        );
    }
}

function buildUi(root: HTMLElement) {
    const checkbox = (id: string, text: string) => {
        const input = h("input", { type: "checkbox", id }) as HTMLInputElement;
        els[id] = input;
        return h("label", { class: "check" }, input, text);
    };
    els.status = h("div", { class: "status" });
    els.latencyButton = h("button", { type: "button" }, "Measure latency");
    els.latencyButton.addEventListener("click", () => void measureLatency());
    const refreshButton = h("button", { type: "button" }, "Refresh");
    refreshButton.addEventListener("click", () => void refresh(true));
    const settingsButton = h("button", { type: "button", "aria-label": "Settings" }, "Settings");
    const liveCheck = checkbox("liveBox", "Live");
    const bar = h(
        "header",
        { class: "bar" },
        els.status,
        h("div", { class: "actions" }, els.latencyButton, refreshButton, liveCheck, settingsButton)
    );

    els.notice = h("div", { class: "notice hidden", role: "status" });
    const installButton = h("button", { type: "button" }, "Review and download location database");
    installButton.addEventListener("click", async () => {
        try {
            await host("downloads.request");
            await refresh(true);
        } catch (err) {
            showNotice(cleanError(err), "warn");
        }
    });
    els.installRow = h("div", { class: "row hidden" }, installButton);

    els.globe = h("div", { class: "globe", id: "globe" });
    els.tbody = h("tbody", {});
    els.tbody.addEventListener("click", (event) => {
        const tr = (event.target as HTMLElement).closest("tr[data-key]");
        if (tr) selectOrTrace(tr.getAttribute("data-key")!);
    });
    els.tbody.addEventListener("keydown", (event) => {
        const ev = event as KeyboardEvent;
        const current = (ev.target as HTMLElement).closest("tr[data-key]") as HTMLElement | null;
        if (!current) return;
        const keys = displayRows().map((r) => r.key);
        const index = keys.indexOf(current.getAttribute("data-key") ?? "");
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            const next = keys[Math.max(0, Math.min(keys.length - 1, index + (ev.key === "ArrowDown" ? 1 : -1)))];
            if (next) select(next, true);
        } else if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            select(keys[index] ?? null, true);
        } else if (ev.key === "Escape") {
            select(null, false);
        }
    });
    const table = h(
        "table",
        { "aria-label": "Active connections" },
        h(
            "thead",
            {},
            h(
                "tr",
                {},
                ...SortHeaders.map(([column, label]) => {
                    const button = h("button", { type: "button", class: "sortbtn" }, label, h("span", { class: "arrow" }));
                    button.addEventListener("click", () => {
                        sort = nextSort(sort, column);
                        renderTable();
                    });
                    return (els[`th-${column}`] = h("th", { "aria-sort": "none" }, button));
                })
            )
        ),
        els.tbody
    );
    els.details = h("div", { class: "details", "aria-live": "polite" });
    els.newestButton = h("button", { type: "button", "aria-pressed": "false" }, "Filter newest");
    els.newestButton.addEventListener("click", toggleNewest);
    const tools = h(
        "div",
        { class: "tools" },
        els.newestButton,
        h("span", { class: "dim" }, "Click a heading to sort. Double-click a row to trace its route.")
    );
    const side = h("aside", { class: "side" }, tools, h("div", { class: "tablewrap" }, table), els.details);

    els.footer = h("footer", { class: "foot" });

    els.hideBox = checkbox("hideBox", "Hide addresses (for screenshots)").querySelector("input")!;
    els.satBox = checkbox("satBox", "Show decorative orbits and satellites").querySelector("input")!;
    els.motionSelect = h(
        "select",
        { id: "motionSelect" },
        h("option", { value: "auto" }, "Follow system setting"),
        h("option", { value: "off" }, "Always off")
    );
    els.themeSelect = h(
        "select",
        { id: "themeSelect" },
        ...ThemeLabels.map(([value, label]) => h("option", { value }, label))
    );
    const latInput = h("input", {
        type: "text",
        inputmode: "decimal",
        placeholder: "Latitude",
        "aria-label": "Latitude",
    }) as HTMLInputElement;
    const lonInput = h("input", {
        type: "text",
        inputmode: "decimal",
        placeholder: "Longitude",
        "aria-label": "Longitude",
    }) as HTMLInputElement;
    const locMessage = h("div", { class: "dim" });
    const ipInput = h("input", {
        type: "text",
        placeholder: "https://...",
        "aria-label": "Public address lookup service",
    }) as HTMLInputElement;
    ipInput.style.width = "260px";
    const ipMessage = h("div", { class: "dim" });
    const ipButton = h("button", { type: "button" }, "Look up my public address") as HTMLButtonElement;
    ipButton.addEventListener("click", () => void lookupPublicAddress(ipInput, ipMessage, ipButton));
    const dbMessage = h("div", { class: "dim" });
    const importButton = h("button", { type: "button" }, "Use my own .mmdb file...");
    importButton.addEventListener("click", () => void importDatabase(dbMessage));
    const removeButton = h("button", { type: "button" }, "Remove my imported file");
    removeButton.addEventListener("click", () => void removeImportedDatabase(dbMessage));
    const saveLoc = h("button", { type: "button" }, "Use this location");
    const clearLoc = h("button", { type: "button" }, "Use time zone instead");
    saveLoc.addEventListener("click", () => {
        const parsed = parseCoordinateInput(latInput.value, lonInput.value);
        if (typeof parsed === "string") {
            locMessage.textContent = parsed;
            return;
        }
        locMessage.textContent = "";
        settings = { ...settings, manualLat: parsed.lat, manualLon: parsed.lon };
        applySettings(true);
    });
    clearLoc.addEventListener("click", () => {
        latInput.value = lonInput.value = "";
        locMessage.textContent = "";
        settings = { ...settings, manualLat: null, manualLon: null };
        applySettings(true);
    });
    els.dbInfo = h("div", { class: "dim" });
    els.settings = h(
        "section",
        { class: "settings hidden", "aria-label": "Widget settings" },
        h("h3", {}, "Settings"),
        els.hideBox.parentElement!,
        els.satBox.parentElement!,
        h("label", { class: "check" }, "Motion: ", els.motionSelect),
        h("label", { class: "check" }, "Draw colors: ", els.themeSelect),
        h(
            "div",
            {},
            h("div", {}, "Your location on the globe (default is a rough guess from your time zone):"),
            h("div", { class: "row" }, latInput, lonInput, saveLoc, clearLoc),
            locMessage
        ),
        h(
            "div",
            {},
            h("div", {}, "Public address (asks the service you name, once, only when you press the button; you approve it first and the answer is not saved):"),
            h("div", { class: "row" }, ipInput, ipButton),
            ipMessage
        ),
        h(
            "div",
            {},
            h("div", {}, "Location database:"),
            els.dbInfo,
            h("div", { class: "row" }, importButton, removeButton),
            dbMessage
        )
    );
    settingsButton.addEventListener("click", () => {
        els.settings.classList.toggle("hidden");
        ipInput.value = settings.publicIpProvider;
        els.dbInfo.textContent = dbInfoText();
        latInput.value = settings.manualLat != null ? String(settings.manualLat) : "";
        lonInput.value = settings.manualLon != null ? String(settings.manualLon) : "";
    });
    liveCheck.querySelector("input")!.addEventListener("change", (e) => {
        settings = { ...settings, live: (e.target as HTMLInputElement).checked };
        applySettings(true);
    });
    els.hideBox.addEventListener("change", (e) => {
        settings = { ...settings, hideAddresses: (e.target as HTMLInputElement).checked };
        applySettings(true);
    });
    els.satBox.addEventListener("change", (e) => {
        settings = { ...settings, satellites: (e.target as HTMLInputElement).checked };
        applySettings(true);
    });
    els.themeSelect.addEventListener("change", (e) => {
        settings = { ...settings, colorTheme: (e.target as HTMLSelectElement).value as ColorTheme };
        applySettings(true);
    });
    els.motionSelect.addEventListener("change", (e) => {
        settings = { ...settings, motion: (e.target as HTMLSelectElement).value as Settings["motion"] };
        applySettings(true);
    });

    root.replaceChildren(
        bar,
        els.notice,
        els.installRow,
        els.settings,
        h("main", { class: "body" }, els.globe, side),
        els.footer
    );
}

let loop: ReturnType<typeof createFrameLoop>;

async function start() {
    buildUi(document.getElementById("app")!);
    try {
        const info = await host("host.info");
        downloadsAvailable = (info.downloads ?? []).length > 0;
    } catch {
        downloadsAvailable = false;
    }
    try {
        settings = sanitizeSettings(await host("settings.get"));
    } catch {
        settings = { ...DefaultSettings };
    }
    try {
        const theme = await host("theme.get");
        if (theme.colorScheme === "light") isDark = false;
    } catch {
        // theme is optional
    }
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    appColors = readAppColors(location.search);
    if (appColors) {
        for (const [name, value] of Object.entries(cssVariablesFor(appColors, isDark))) {
            document.documentElement.style.setProperty(name, value);
        }
    }
    try {
        if (new URLSearchParams(location.search).get("renderer") === "2d") {
            throw new Error("flat map requested");
        }
        globe = createWebglGlobe(els.globe, currentPalette());
    } catch (err) {
        globe = createMapView(els.globe, currentPalette());
        showNotice(`3D view is unavailable (${cleanError(err)}); showing a flat map.`, "info");
    }
    globe.setLand(landData.points);
    new ResizeObserver(() => {
        globe.resize();
        markDirty();
    }).observe(els.globe);

    loop = createFrameLoop({
        requestFrame: (cb) => requestAnimationFrame(cb),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        isHidden: () => document.hidden,
        fps: 30,
        render: (delta) => {
            frames++;
            if (dirty || motionAllowed(settings, prefersReducedMotion.matches)) {
                dirty = false;
                renders++;
                globe.render(delta);
            }
            if (frames % 30 === 0) publishDebug();
        },
    });
    document.addEventListener("visibilitychange", () => loop.visibilityChanged());
    prefersReducedMotion.addEventListener("change", () => applySettings(false));
    setInterval(() => {
        if (settings.live && !document.hidden) void refresh();
    }, RefreshMs);

    applySettings(false);
    loop.start();
    await refresh(true);
}

start().catch((err) => {
    document.getElementById("app")!.textContent = `Network Globe could not start: ${cleanError(err)}`;
});
