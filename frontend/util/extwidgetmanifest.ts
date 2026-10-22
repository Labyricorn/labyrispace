// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export const ExtWidgetHostApi = 1;
export const ExtWidgetMaxDownloadBytes = 512 * 1024 * 1024;

export const ExtWidgetCapabilities = [
    "settings",
    "theme",
    "network.connections",
    "network.interfaces",
    "network.geolookup",
    "network.latency",
] as const;
export type ExtWidgetCapability = (typeof ExtWidgetCapabilities)[number];

export type ExtWidgetNetworkEntry = { host: string; purpose: string };

export type ExtWidgetDownload = {
    id: string;
    url: string;
    sha256: string;
    sizeBytes: number;
    license: string;
    purpose: string;
};

export type ExtWidgetManifest = {
    id: string;
    name: string;
    version: string;
    hostApi: { min: number; max: number };
    entry: string;
    capabilities: ExtWidgetCapability[];
    network: ExtWidgetNetworkEntry[];
    installDownloads: ExtWidgetDownload[];
    license: string;
    attribution?: string;
    sourceCommit?: string;
    settings?: Record<string, unknown>;
};

// Not a discriminated union: this project builds without strictNullChecks, where boolean discriminants do not narrow.
export type ManifestResult = { ok: boolean; manifest?: ExtWidgetManifest; errors?: string[] };

const KnownKeys = new Set([
    "id",
    "name",
    "version",
    "hostApi",
    "entry",
    "capabilities",
    "network",
    "installDownloads",
    "license",
    "attribution",
    "sourceCommit",
    "settings",
]);

const IdPattern = /^[a-z][a-z0-9-]{1,40}$/;
const AssetIdPattern = /^[a-z0-9][a-z0-9._-]{0,60}$/;
const VersionPattern = /^\d+\.\d+\.\d+$/;
const HostPattern = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const Sha256Pattern = /^[0-9a-f]{64}$/i;

export function isValidWidgetId(id: unknown): id is string {
    return typeof id === "string" && IdPattern.test(id);
}

export function isValidAssetId(id: unknown): id is string {
    return typeof id === "string" && AssetIdPattern.test(id);
}

function isNonBlank(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isSafeRelativeHtml(entry: string): boolean {
    if (!entry.toLowerCase().endsWith(".html")) return false;
    if (entry.startsWith("/") || entry.startsWith("\\") || /^[a-zA-Z]:/.test(entry)) return false;
    if (entry.includes("\\") || entry.includes(":")) return false;
    return !entry.split("/").some((part) => part === ".." || part === "." || part === "");
}

export type ManifestOptions = { allowLoopbackHttp?: boolean };

function isLoopbackHost(host: string): boolean {
    return host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}

export function validateManifest(raw: unknown, opts: ManifestOptions = {}): ManifestResult {
    const errors: string[] = [];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, errors: ["manifest must be a JSON object"] };
    }
    const m = raw as Record<string, any>;
    for (const key of Object.keys(m)) {
        if (!KnownKeys.has(key)) errors.push(`unknown field "${key}"`);
    }
    if (!isValidWidgetId(m.id))
        errors.push("id must be 2-41 lowercase letters, digits or hyphens, starting with a letter");
    if (!isNonBlank(m.name)) errors.push("name is required");
    if (!isNonBlank(m.version) || !VersionPattern.test(m.version)) errors.push("version must look like 1.2.3");
    if (!isNonBlank(m.license)) errors.push("license is required");

    const hostApi = m.hostApi;
    if (
        hostApi == null ||
        !Number.isInteger(hostApi.min) ||
        !Number.isInteger(hostApi.max) ||
        hostApi.min > hostApi.max
    ) {
        errors.push("hostApi must be { min, max } integers with min <= max");
    } else if (ExtWidgetHostApi < hostApi.min || ExtWidgetHostApi > hostApi.max) {
        errors.push(`widget needs host API ${hostApi.min}-${hostApi.max}, this host provides ${ExtWidgetHostApi}`);
    }

    if (!isNonBlank(m.entry) || !isSafeRelativeHtml(m.entry)) {
        errors.push("entry must be a relative .html path inside the widget folder");
    }

    const capabilities: ExtWidgetCapability[] = [];
    if (!Array.isArray(m.capabilities)) {
        errors.push("capabilities must be an array");
    } else {
        for (const cap of m.capabilities) {
            if (!(ExtWidgetCapabilities as readonly string[]).includes(cap)) {
                errors.push(`unknown capability "${String(cap)}"`);
            } else if (!capabilities.includes(cap)) {
                capabilities.push(cap);
            }
        }
    }

    const network: ExtWidgetNetworkEntry[] = [];
    if (m.network != null && !Array.isArray(m.network)) {
        errors.push("network must be an array");
    } else {
        for (const entry of m.network ?? []) {
            if (entry == null || !isNonBlank(entry.host) || !HostPattern.test(entry.host) || entry.host.includes("/")) {
                errors.push("each network entry needs a bare host name");
            } else if (!isNonBlank(entry.purpose)) {
                errors.push(`network entry ${entry.host} needs a purpose`);
            } else {
                network.push({ host: entry.host.toLowerCase(), purpose: entry.purpose });
            }
        }
    }

    const installDownloads: ExtWidgetDownload[] = [];
    if (m.installDownloads != null && !Array.isArray(m.installDownloads)) {
        errors.push("installDownloads must be an array");
    } else {
        const seen = new Set<string>();
        for (const dl of m.installDownloads ?? []) {
            const label = dl?.id ?? "?";
            if (dl == null || !isValidAssetId(dl.id)) {
                errors.push(`download "${label}": invalid id`);
                continue;
            }
            if (seen.has(dl.id)) errors.push(`download "${label}": duplicate id`);
            seen.add(dl.id);
            let url: URL = null;
            try {
                url = new URL(dl.url);
            } catch {
                errors.push(`download "${label}": invalid url`);
            }
            const loopbackHttp =
                opts.allowLoopbackHttp && url != null && url.protocol === "http:" && isLoopbackHost(url.hostname);
            if (url && url.protocol !== "https:" && !loopbackHttp)
                errors.push(`download "${label}": url must be https`);
            if (!isNonBlank(dl.sha256) || !Sha256Pattern.test(dl.sha256))
                errors.push(`download "${label}": sha256 must be 64 hex characters`);
            if (!Number.isInteger(dl.sizeBytes) || dl.sizeBytes <= 0 || dl.sizeBytes > ExtWidgetMaxDownloadBytes) {
                errors.push(`download "${label}": sizeBytes must be between 1 and ${ExtWidgetMaxDownloadBytes}`);
            }
            if (!isNonBlank(dl.license)) errors.push(`download "${label}": license is required`);
            if (!isNonBlank(dl.purpose)) errors.push(`download "${label}": purpose is required`);
            installDownloads.push({
                id: dl.id,
                url: dl.url,
                sha256: String(dl.sha256).toLowerCase(),
                sizeBytes: dl.sizeBytes,
                license: dl.license,
                purpose: dl.purpose,
            });
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        manifest: {
            id: m.id,
            name: m.name,
            version: m.version,
            hostApi: { min: hostApi.min, max: hostApi.max },
            entry: m.entry,
            capabilities,
            network,
            installDownloads,
            license: m.license,
            attribution: typeof m.attribution === "string" ? m.attribution : undefined,
            sourceCommit: typeof m.sourceCommit === "string" ? m.sourceCommit : undefined,
            settings: m.settings,
        },
    };
}

// Methods a widget may call through the bridge, and the capability each one needs ("" means always allowed).
const MethodCapabilities: Record<string, ExtWidgetCapability | ""> = {
    "host.info": "",
    "downloads.status": "",
    "downloads.request": "",
    "settings.get": "settings",
    "settings.set": "settings",
    "theme.get": "theme",
    "network.connections": "network.connections",
    "network.interfaces": "network.interfaces",
    "network.geolookup": "network.geolookup",
    "network.latency": "network.latency",
};

export function isKnownMethod(method: string): boolean {
    return Object.prototype.hasOwnProperty.call(MethodCapabilities, method);
}

export function isCapabilityAllowed(manifest: ExtWidgetManifest, method: string): boolean {
    if (!isKnownMethod(method)) return false;
    const needed = MethodCapabilities[method];
    return needed === "" || manifest.capabilities.includes(needed);
}

// A widget may load its own files and the hosts it declared. Everything else is cancelled.
export function isRequestAllowed(manifest: ExtWidgetManifest, url: string, widgetRootUrl: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    switch (parsed.protocol) {
        case "file:": {
            const root = widgetRootUrl.endsWith("/") ? widgetRootUrl : widgetRootUrl + "/";
            return parsed.href.startsWith(root);
        }
        case "data:":
        case "blob:":
        case "about:":
            return true;
        case "http:":
        case "https:":
            return manifest.network.some((entry) => entry.host === parsed.hostname.toLowerCase());
    }
    return false;
}
