// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    buildSearchUrl,
    classifyUrlInput,
    DefaultSearchTemplate,
    resolveSearchTemplate,
    searchDestinationHost,
} from "./searchpolicy";

describe("classifyUrlInput", () => {
    it("keeps blank input local", () => {
        expect(classifyUrlInput("")).toBe("blank");
        expect(classifyUrlInput("  ")).toBe("blank");
        expect(classifyUrlInput("about:blank")).toBe("blank");
    });

    it("recognizes addresses", () => {
        expect(classifyUrlInput("https://example.com/x")).toBe("url");
        expect(classifyUrlInput("localhost:3000/a")).toBe("local");
        expect(classifyUrlInput("example.org/path")).toBe("domain");
    });

    it("treats other text as a search", () => {
        expect(classifyUrlInput("how to tar a directory")).toBe("search");
        expect(classifyUrlInput("rust")).toBe("search");
    });
});

describe("search template handling", () => {
    it("uses the configured template", () => {
        expect(buildSearchUrl("https://duckduckgo.com/?q={query}", "a b")).toBe("https://duckduckgo.com/?q=a%20b");
        expect(searchDestinationHost("https://search.brave.com/search?q={query}")).toBe("search.brave.com");
    });

    it("falls back to the default for unusable templates", () => {
        expect(resolveSearchTemplate(undefined)).toBe(DefaultSearchTemplate);
        expect(resolveSearchTemplate("https://example.com/")).toBe(DefaultSearchTemplate);
        expect(resolveSearchTemplate("javascript:alert({query})")).toBe(DefaultSearchTemplate);
    });
});
