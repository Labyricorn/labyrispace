// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import fixtures from "../../testdata/vendor-urls.json";
import { isVendorURL } from "./vendorpolicy";

test.each(fixtures)("vendor policy: $url", ({ url, blocked }) => {
    expect(isVendorURL(url)).toBe(blocked);
});
