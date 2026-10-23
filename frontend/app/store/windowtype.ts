// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// laspWindowType is set once at startup and never changes.
let laspWindowType: "tab" | "builder" | "preview" = "tab";

function getLaspWindowType(): "tab" | "builder" | "preview" {
    return laspWindowType;
}

function isBuilderWindow(): boolean {
    return laspWindowType === "builder";
}

function isTabWindow(): boolean {
    return laspWindowType === "tab";
}

function isPreviewWindow(): boolean {
    return laspWindowType === "preview";
}

function setLaspWindowType(windowType: "tab" | "builder" | "preview") {
    laspWindowType = windowType;
}

export { getLaspWindowType, isBuilderWindow, isPreviewWindow, isTabWindow, setLaspWindowType };
