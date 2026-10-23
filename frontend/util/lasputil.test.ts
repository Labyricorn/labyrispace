// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { processBackgroundUrls } from "./lasputil";

describe("processBackgroundUrls remote images", () => {
    it("does not load images from other hosts", () => {
        expect(processBackgroundUrls("url(https://example.com/a.png) center")).toBeNull();
        expect(processBackgroundUrls("linear-gradient(red, blue), url('http://cdn.example.org/b.jpg')")).toBeNull();
    });

    it("keeps gradients, data URLs and loopback images", () => {
        expect(processBackgroundUrls("linear-gradient(red, blue)")).toContain("linear-gradient");
        expect(processBackgroundUrls("url(data:image/png;base64,AAAA)")).toContain("data:image/png");
        expect(processBackgroundUrls("url(http://127.0.0.1:8080/x.png)")).toContain("127.0.0.1");
    });
});
