// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export const DefaultSearchTemplate = "https://www.google.com/search?q={query}";
const QueryToken = "{query}";

export type UrlInputKind = "blank" | "url" | "local" | "domain" | "search";

export function classifyUrlInput(input: string): UrlInputKind {
    const text = input?.trim() ?? "";
    if (text === "" || text.toLowerCase() === "about:blank") {
        return "blank";
    }
    if (/^(http|https|file):/.test(input)) {
        return "url";
    }
    const firstPart = input.split("/")[0];
    if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/.test(firstPart)) {
        return "local";
    }
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(firstPart)) {
        return "domain";
    }
    return "search";
}

function isUsableTemplate(template: string): boolean {
    if (!template || !template.includes(QueryToken)) {
        return false;
    }
    try {
        const parsed = new URL(template.replace(QueryToken, "x"));
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

export function resolveSearchTemplate(template: string): string {
    return isUsableTemplate(template) ? template : DefaultSearchTemplate;
}

export function searchDestinationHost(template: string): string {
    return new URL(resolveSearchTemplate(template).replace(QueryToken, "x")).host;
}

export function buildSearchUrl(template: string, query: string): string {
    return resolveSearchTemplate(template).replace(QueryToken, encodeURIComponent(query));
}
