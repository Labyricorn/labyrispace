// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Utility to abstract the fetch function so the Electron net module can be used when available.

// `electron.net.fetch` always issues from the default session, which no longer carries the backend
// auth key (see emain-appcontents.ts). Main-process callers (ClientService.GetClientData, etc.) need the
// dedicated app session's fetch instead. The main process registers that fetch via setMainFetch during
// startup (see emain/emain.ts); until then, or in the renderer/tests/preview, this falls back to
// globalThis.fetch. This file must stay renderer-safe (no node-only imports) since it is shared.
let mainFetch: ((input: string, init?: RequestInit) => Promise<Response>) | null = null;

export function setMainFetch(fn: (input: string, init?: RequestInit) => Promise<Response>): void {
    mainFetch = fn;
}

export function fetch(input: string | GlobalRequest | URL, init?: RequestInit): Promise<Response> {
    if (mainFetch) {
        return mainFetch(input.toString(), init);
    } else {
        return globalThis.fetch(input, init);
    }
}
