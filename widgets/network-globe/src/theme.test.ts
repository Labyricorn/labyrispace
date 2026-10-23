// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cssVariablesFor, mixColor, readAppColors } from "./theme";

const Good =
    "?bg=rgb(34%2C+34%2C+34)&text=%23f7f7f7&dim=rgb(195%2C200%2C194)&line=rgba(255%2C255%2C255%2C0.16)&accent=rgb(88%2C193%2C66)";

describe("app colors", () => {
    it("reads plain colors", () => {
        const colors = readAppColors(Good);
        expect(colors?.bg).toBe("rgb(34, 34, 34)");
        expect(colors?.text).toBe("#f7f7f7");
    });

    it("ignores anything that is not a plain color or is incomplete", () => {
        expect(readAppColors("")).toBeNull();
        expect(readAppColors(Good.replace("%23f7f7f7", "url(http://x)"))).toBeNull();
        expect(readAppColors(Good.replace("rgb(34%2C+34%2C+34)", "red;}body{display:none"))).toBeNull();
        expect(readAppColors(Good.replace(/&accent=.*/, ""))).toBeNull();
    });

    it("mixes and builds variables", () => {
        expect(mixColor("rgb(34, 34, 34)", "#ffffff", 0.05)).toBe("#2d2d2d");
        expect(cssVariablesFor(readAppColors(Good)!, true)["--bg"]).toBe("rgb(34, 34, 34)");
    });
});
