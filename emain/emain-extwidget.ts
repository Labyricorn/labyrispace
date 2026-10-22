// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { createHash } from "crypto";
import * as electron from "electron";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { RpcApi } from "../frontend/app/store/wshclientapi";
import {
    ExtWidgetDownload,
    ExtWidgetHostApi,
    ExtWidgetManifest,
    isCapabilityAllowed,
    isRequestAllowed,
    isValidWidgetId,
    validateManifest,
} from "../frontend/util/extwidgetmanifest";
import { isVendorURL } from "../frontend/util/vendorpolicy";
import { getAppWebContentsIds } from "./emain-appcontents";
import { getElectronAppBasePath, getWaveConfigDir, getWaveDataDir, isDev } from "./emain-platform";
import { ElectronWshClient } from "./emain-wsh";

const MaxSettingsBytes = 64 * 1024;
const DownloadRpcTimeoutMs = 20 * 60 * 1000;

type LoadedWidget = {
    manifest: ExtWidgetManifest;
    rootDir: string;
    rootUrl: string;
    entryUrl: string;
    partition: string;
    session: electron.Session;
};

export type DownloadState = "ready" | "missing" | "declined" | "failed";
export type DownloadStatus = { id: string; state: DownloadState; message?: string };

const loadedWidgets = new Map<string, LoadedWidget>();
const sessionToWidgetId = new WeakMap<electron.Session, string>();
const declinedThisSession = new Set<string>();

function getWidgetsRoot(): string {
    return path.join(getElectronAppBasePath(), "widgets");
}

function getPreloadPath(): string {
    return path.join(getElectronAppBasePath(), "preload", "preload-extwidget.cjs");
}

export function widgetPartition(id: string): string {
    return `persist:labyrispace-ext-${id}`;
}

export function isExtWidgetWebContents(wc: electron.WebContents): boolean {
    return wc != null && !wc.isDestroyed() && sessionToWidgetId.has(wc.session);
}

function configureWidgetSession(id: string, ses: electron.Session) {
    if (sessionToWidgetId.has(ses)) {
        return;
    }
    sessionToWidgetId.set(ses, id);
    // This replaces the generic vendor-block listener on this session, so the vendor check is repeated here.
    ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
        const widget = loadedWidgets.get(id);
        const allowed =
            widget != null &&
            !isVendorURL(details.url) &&
            isRequestAllowed(widget.manifest, details.url, widget.rootUrl);
        if (!allowed) {
            console.log("extwidget request blocked", id, details.url.split(/[?#]/)[0]);
        }
        callback({ cancel: !allowed });
    });
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on("will-download", (event) => event.preventDefault());
}

type ManifestRead = { ok: boolean; manifest?: ExtWidgetManifest; rootDir?: string; errors?: string[] };
type WidgetLoad = { ok: boolean; widget?: LoadedWidget; errors?: string[] };

function readManifestFile(id: string): ManifestRead {
    if (!isValidWidgetId(id)) {
        return { ok: false, errors: ["invalid widget id"] };
    }
    const rootDir = path.join(getWidgetsRoot(), id);
    const manifestPath = path.join(rootDir, "manifest.json");
    if (!existsSync(manifestPath)) {
        return { ok: false, errors: [`widget "${id}" is not installed`] };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (e) {
        return { ok: false, errors: [`manifest.json could not be read: ${(e as Error).message}`] };
    }
    const result = validateManifest(raw, { allowLoopbackHttp: isDev });
    if (!result.ok) {
        return result;
    }
    if (result.manifest.id !== id) {
        return { ok: false, errors: ["manifest id does not match its folder"] };
    }
    const entryPath = path.resolve(rootDir, result.manifest.entry);
    if (!entryPath.startsWith(rootDir + path.sep) || !existsSync(entryPath)) {
        return { ok: false, errors: ["entry file was not found inside the widget folder"] };
    }
    return { ok: true, manifest: result.manifest, rootDir };
}

function loadWidget(id: string): WidgetLoad {
    const read = readManifestFile(id);
    if (!read.ok) {
        return read;
    }
    const partition = widgetPartition(id);
    const ses = electron.session.fromPartition(partition);
    const rootUrl = pathToFileURL(read.rootDir).href;
    const widget: LoadedWidget = {
        manifest: read.manifest,
        rootDir: read.rootDir,
        rootUrl,
        entryUrl: pathToFileURL(path.resolve(read.rootDir, read.manifest.entry)).href,
        partition,
        session: ses,
    };
    loadedWidgets.set(id, widget);
    configureWidgetSession(id, ses);
    return { ok: true, widget };
}

function downloadPath(id: string, dl: ExtWidgetDownload): string {
    return path.join(getWaveDataDir(), "widgets-data", id, "downloads", dl.id);
}

function sha256File(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(file);
        stream.on("error", reject);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

async function isInstalled(id: string, dl: ExtWidgetDownload): Promise<boolean> {
    const dest = downloadPath(id, dl);
    if (!existsSync(dest)) {
        return false;
    }
    try {
        return (await sha256File(dest)) === dl.sha256;
    } catch {
        return false;
    }
}

function recordDownload(id: string, entry: Record<string, unknown>) {
    try {
        const dir = path.join(getWaveDataDir(), "widgets-data", id);
        mkdirSync(dir, { recursive: true });
        appendFileSync(
            path.join(dir, "downloads.log"),
            JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n"
        );
    } catch (e) {
        console.log("could not record widget download", e);
    }
}

async function askToDownload(widget: LoadedWidget, dl: ExtWidgetDownload): Promise<boolean> {
    const host = new URL(dl.url).host;
    const sizeMb = (dl.sizeBytes / (1024 * 1024)).toFixed(1);
    const options: electron.MessageBoxOptions = {
        type: "question",
        title: "Widget download",
        message: `${widget.manifest.name} wants to download a file`,
        detail:
            `File: ${dl.id}\nSize: ${sizeMb} MB\nFrom: ${host}\nAddress: ${dl.url}\nPurpose: ${dl.purpose}\nLicense: ${dl.license}\n` +
            `Saved to: ${downloadPath(widget.manifest.id, dl)}\n\n` +
            "The file is checked against a fixed checksum before it is kept. Nothing else is downloaded, and it is not updated automatically.",
        // "Not now" is first so it is the default button and what Enter, Escape or closing the dialog choose.
        buttons: ["Not now", "Download"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    };
    const parent = electron.BaseWindow.getFocusedWindow();
    const result = parent
        ? await electron.dialog.showMessageBox(parent, options)
        : await electron.dialog.showMessageBox(options);
    return result.response === 1;
}

async function ensureDownloads(id: string, interactive: boolean): Promise<DownloadStatus[]> {
    const loaded = loadedWidgets.get(id);
    if (loaded == null) {
        return [];
    }
    const statuses: DownloadStatus[] = [];
    for (const dl of loaded.manifest.installDownloads) {
        const key = `${id}/${dl.id}`;
        if (await isInstalled(id, dl)) {
            statuses.push({ id: dl.id, state: "ready" });
            continue;
        }
        if (!interactive) {
            statuses.push({ id: dl.id, state: declinedThisSession.has(key) ? "declined" : "missing" });
            continue;
        }
        if (!(await askToDownload(loaded, dl))) {
            declinedThisSession.add(key);
            recordDownload(id, { asset: dl.id, url: dl.url, result: "declined" });
            statuses.push({ id: dl.id, state: "declined" });
            continue;
        }
        declinedThisSession.delete(key);
        try {
            const res = await RpcApi.AssetDownloadCommand(
                ElectronWshClient,
                { widgetid: id, assetid: dl.id, url: dl.url, sha256: dl.sha256, sizebytes: dl.sizeBytes },
                { timeout: DownloadRpcTimeoutMs }
            );
            recordDownload(id, { asset: dl.id, url: dl.url, bytes: res.bytes, sha256: res.sha256, result: "ok" });
            statuses.push({ id: dl.id, state: "ready" });
        } catch (e) {
            const message = (e as Error).message ?? String(e);
            recordDownload(id, { asset: dl.id, url: dl.url, result: "failed", error: message });
            statuses.push({ id: dl.id, state: "failed", message });
        }
    }
    return statuses;
}

function settingsFile(id: string): string {
    return path.join(getWaveConfigDir(), "widgets-data", `${id}.json`);
}

function readSettings(id: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(readFileSync(settingsFile(id), "utf8"));
        return parsed != null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeSettings(id: string, patch: unknown): Record<string, unknown> {
    if (patch == null || typeof patch !== "object" || Array.isArray(patch)) {
        throw new Error("settings must be an object");
    }
    const next = { ...readSettings(id), ...(patch as Record<string, unknown>) };
    const text = JSON.stringify(next, null, 2);
    if (Buffer.byteLength(text) > MaxSettingsBytes) {
        throw new Error("settings are too large");
    }
    mkdirSync(path.dirname(settingsFile(id)), { recursive: true });
    writeFileSync(settingsFile(id), text);
    return next;
}

function findCallingWidget(event: electron.IpcMainInvokeEvent): LoadedWidget {
    const frame = event.senderFrame;
    if (frame == null || frame.parent != null) {
        return null;
    }
    for (const widget of loadedWidgets.values()) {
        if (widget.session === event.sender.session && frame.url.startsWith(widget.rootUrl + "/")) {
            return widget;
        }
    }
    return null;
}

async function handleWidgetCall(event: electron.IpcMainInvokeEvent, method: unknown, args: unknown): Promise<unknown> {
    const widget = findCallingWidget(event);
    if (widget == null) {
        throw new Error("unknown widget");
    }
    const id = widget.manifest.id;
    if (typeof method !== "string" || !isCapabilityAllowed(widget.manifest, method)) {
        console.log("extwidget call denied", id, String(method).slice(0, 40));
        throw new Error(`call "${String(method).slice(0, 40)}" is not allowed for this widget`);
    }
    switch (method) {
        case "host.info":
            return {
                widgetId: id,
                version: widget.manifest.version,
                hostApi: ExtWidgetHostApi,
                capabilities: widget.manifest.capabilities,
                network: widget.manifest.network,
                downloads: await ensureDownloads(id, false),
                platform: process.platform,
            };
        case "downloads.status":
            return ensureDownloads(id, false);
        case "downloads.request":
            for (const dl of widget.manifest.installDownloads) {
                declinedThisSession.delete(`${id}/${dl.id}`);
            }
            return ensureDownloads(id, true);
        case "settings.get":
            return readSettings(id);
        case "settings.set":
            return writeSettings(id, args);
        case "theme.get":
            return { colorScheme: electron.nativeTheme.shouldUseDarkColors ? "dark" : "light" };
    }
    throw new Error("This host service is not available yet");
}

export function registerExtWidgetHandlers() {
    electron.ipcMain.handle("ext-widget-get-manifest", (event, id: string) => {
        if (!getAppWebContentsIds().has(event.sender.id)) {
            throw new Error("not allowed");
        }
        const result = loadWidget(id);
        if (!result.ok) {
            return { ok: false, errors: result.errors };
        }
        const w = result.widget;
        return {
            ok: true,
            manifest: w.manifest,
            entryUrl: w.entryUrl,
            partition: w.partition,
            preloadUrl: pathToFileURL(getPreloadPath()).href,
        };
    });
    electron.ipcMain.handle("ext-widget-ensure-downloads", async (event, id: string) => {
        if (!getAppWebContentsIds().has(event.sender.id)) {
            throw new Error("not allowed");
        }
        if (!loadedWidgets.has(id)) {
            const result = loadWidget(id);
            if (!result.ok) {
                return [];
            }
        }
        return ensureDownloads(id, true);
    });
    electron.ipcMain.handle("ext-widget-call", handleWidgetCall);

    electron.app.on("web-contents-created", (_event, wc) => {
        if (wc.getType() !== "webview") {
            return;
        }
        const guard = (event: electron.Event, url: string) => {
            const id = sessionToWidgetId.get(wc.session);
            const widget = id ? loadedWidgets.get(id) : null;
            if (id == null) {
                return;
            }
            if (widget == null || !url.startsWith(widget.rootUrl + "/")) {
                event.preventDefault();
            }
        };
        wc.on("will-navigate", guard);
        wc.on("will-redirect", guard);
    });
}
