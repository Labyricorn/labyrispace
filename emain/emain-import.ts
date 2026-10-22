// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { app, BaseWindow, dialog } from "electron";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "fs";
import path from "path";
import { getWaveConfigDir, getWaveDataDir } from "./emain-platform";

// Names avoid the word import next to a quote: electron-vite's shim injection mistakes it for an import statement.
const PendingDirName = "profile-pending";
const FailedDirName = "profile-failed";
const BackupsDirName = "profile-backups";
const SkippedNames = new Set([PendingDirName, FailedDirName, BackupsDirName, "wave.lock", "wave.sock", "jobs"]);

function isSkipped(name: string): boolean {
    return SkippedNames.has(name) || name.endsWith(".sock");
}

function timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function copyContents(srcDir: string, destDir: string, skip: (name: string) => boolean) {
    mkdirSync(destDir, { recursive: true });
    for (const name of readdirSync(srcDir)) {
        if (skip(name)) {
            continue;
        }
        cpSync(path.join(srcDir, name), path.join(destDir, name), { recursive: true, force: true });
    }
}

function moveContents(srcDir: string, destDir: string, skip: (name: string) => boolean) {
    if (!existsSync(srcDir)) {
        return;
    }
    mkdirSync(destDir, { recursive: true });
    for (const name of readdirSync(srcDir)) {
        if (skip(name)) {
            continue;
        }
        renameSync(path.join(srcDir, name), path.join(destDir, name));
    }
}

function isUnder(child: string, parent: string): boolean {
    const rel = path.relative(parent, child);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

// Runs before the backend starts, because the database cannot be replaced while it is open.
// Existing profile files are moved to profile-backups, never deleted.
export function applyPendingProfileImport() {
    const dataDir = getWaveDataDir();
    const pendingDir = path.join(dataDir, PendingDirName);
    if (!existsSync(pendingDir)) {
        return;
    }
    try {
        const configDir = getWaveConfigDir();
        const backupDir = path.join(dataDir, BackupsDirName, timestamp());
        const configInsideData = isUnder(configDir, dataDir);
        const configName = configInsideData ? path.relative(dataDir, configDir).split(path.sep)[0] : null;
        moveContents(dataDir, path.join(backupDir, "data"), (name) => isSkipped(name) || name === configName);
        moveContents(configDir, path.join(backupDir, "config"), isSkipped);
        copyContents(path.join(pendingDir, "data"), dataDir, isSkipped);
        if (existsSync(path.join(pendingDir, "config"))) {
            copyContents(path.join(pendingDir, "config"), configDir, isSkipped);
        }
        rmSync(pendingDir, { recursive: true, force: true });
        console.log("profile import applied; previous profile saved in", backupDir);
    } catch (e) {
        console.log("profile import failed", e);
        try {
            renameSync(pendingDir, path.join(dataDir, `${FailedDirName}-${timestamp()}`));
        } catch (e2) {
            console.log("could not set aside the failed profile copy", e2);
        }
    }
}

async function pickDirectory(window: BaseWindow, title: string): Promise<string> {
    const result = await dialog.showOpenDialog(window, { title, properties: ["openDirectory"] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

function isDirectory(p: string): boolean {
    return existsSync(p) && statSync(p).isDirectory();
}

// Copy-only: the chosen folders are read but never modified.
export async function startProfileImport(window: BaseWindow) {
    const confirm = await dialog.showMessageBox(window, {
        type: "info",
        buttons: ["Continue", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Import profile",
        message: "Import a Wave profile into Labyrispace?",
        detail:
            "Close the other app first so its database is not being written. Its folders are only read, never changed. " +
            "Your current Labyrispace profile is kept in a profile-backups folder, and Labyrispace restarts to finish the import.",
    });
    if (confirm.response !== 0) {
        return;
    }
    const srcData = await pickDirectory(window, "Select the Wave data folder (the one containing db)");
    if (!srcData) {
        return;
    }
    if (!isDirectory(path.join(srcData, "db"))) {
        await dialog.showMessageBox(window, {
            type: "error",
            message: "That folder does not look like a Wave data folder.",
            detail: "Expected a db folder inside it.",
        });
        return;
    }
    let srcConfig = path.join(srcData, "config");
    if (!isDirectory(srcConfig)) {
        srcConfig = await pickDirectory(window, "Select the Wave config folder (cancel to skip settings)");
    }
    const dataDir = getWaveDataDir();
    const pendingDir = path.join(dataDir, PendingDirName);
    try {
        rmSync(pendingDir, { recursive: true, force: true });
        const srcIsConfigParent = srcConfig != null && isUnder(srcConfig, srcData);
        copyContents(srcData, path.join(pendingDir, "data"), (name) => {
            return isSkipped(name) || (srcIsConfigParent && path.join(srcData, name) === srcConfig);
        });
        if (srcConfig) {
            copyContents(srcConfig, path.join(pendingDir, "config"), isSkipped);
        }
    } catch (e) {
        rmSync(pendingDir, { recursive: true, force: true });
        await dialog.showMessageBox(window, { type: "error", message: "Import failed", detail: String(e) });
        return;
    }
    app.relaunch();
    app.exit(0);
}
