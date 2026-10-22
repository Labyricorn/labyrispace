// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: upstream updating removed.

import { dialog, ipcMain } from "electron";

async function explainManualUpdates() {
    await dialog.showMessageBox({
        type: "info",
        title: "Labyrispace updates",
        message: "Automatic vendor updates are disabled. Install a reviewed Labyrispace build manually.",
    });
}

// Preserve lifecycle/IPC compatibility without importing electron-updater or a feed.
export const updater = {
    status: "up-to-date" as UpdaterStatus,
    stop() {},
    checkForUpdates: async (_userInput: boolean) => explainManualUpdates(),
    promptToInstallUpdate: explainManualUpdates,
};
export function getResolvedUpdateChannel(): string {
    return "manual";
}
export async function configureAutoUpdater() {
    console.log("Automatic vendor updates disabled in Labyrispace.");
}
ipcMain.on("install-app-update", () => {
    void explainManualUpdates();
});
ipcMain.on("get-app-update-status", (event) => {
    event.returnValue = updater.status;
});
ipcMain.on("get-updater-channel", (event) => {
    event.returnValue = "manual";
});
