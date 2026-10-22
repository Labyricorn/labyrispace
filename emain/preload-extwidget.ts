// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from "electron";

// The only door from an external widget to the host. The main process decides, per widget, which calls work.
contextBridge.exposeInMainWorld("labyrispaceWidget", {
    call: (method: string, args?: unknown) => ipcRenderer.invoke("ext-widget-call", method, args),
});
