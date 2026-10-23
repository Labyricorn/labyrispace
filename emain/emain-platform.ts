// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.

import { app, dialog, ipcMain, shell } from "electron";
import envPaths from "env-paths";
import { existsSync, mkdirSync } from "fs";
import os from "os";
import path from "path";
import { LaspDevVarName, LaspDevViteVarName } from "../frontend/util/isdev";
import * as keyutil from "../frontend/util/keyutil";

// This is a little trick to ensure that Electron puts all its runtime data into a subdirectory to avoid conflicts with our own data.
// On macOS, it will store to ~/Library/Application \Support/labyrispace/electron
// On Linux, it will store to ~/.config/labyrispace/electron
// On Windows, it will store to %LOCALAPPDATA%/labyrispace/electron
app.setName("labyrispace/electron");

// Chromium's automatic proxy detection looks up "wpad" on the local network at startup. Set LABYRISPACE_USE_SYSTEM_PROXY=1 to use system proxy settings.
if (!process.env.LABYRISPACE_USE_SYSTEM_PROXY) {
    app.commandLine.appendSwitch("no-proxy-server");
}

const isDev = !app.isPackaged;
const isDevVite = isDev && process.env.ELECTRON_RENDERER_URL;
console.log(`Running in ${isDev ? "development" : "production"} mode`);
if (isDev) {
    process.env[LaspDevVarName] = "1";
}
if (isDevVite) {
    process.env[LaspDevViteVarName] = "1";
}

// A distinct directory name keeps Labyrispace from adopting a Lasp install's ~/.laspterm data.
const laspDirNamePrefix = "labyrispace";
const laspDirNameSuffix = isDev ? "dev" : "";
const laspDirName = `${laspDirNamePrefix}${laspDirNameSuffix ? `-${laspDirNameSuffix}` : ""}`;

const paths = envPaths("labyrispace", { suffix: laspDirNameSuffix });

app.setName(isDev ? "Labyrispace (Dev)" : "Labyrispace");
const unamePlatform = process.platform;
const unameArch: string = process.arch;
keyutil.setKeyUtilPlatform(unamePlatform);

const LaspConfigHomeVarName = "LASPTERM_CONFIG_HOME";
const LaspDataHomeVarName = "LASPTERM_DATA_HOME";
const LaspHomeVarName = "LASPTERM_HOME";

export function checkIfRunningUnderARM64Translation(fullConfig: FullConfigType) {
    if (!fullConfig.settings["app:dismissarchitecturewarning"] && app.runningUnderARM64Translation) {
        console.log("Running under ARM64 translation, alerting user");
        const dialogOpts: Electron.MessageBoxOptions = {
            type: "warning",
            buttons: ["Dismiss"],
            title: "Labyrispace has detected a performance issue",
            message: `Labyrispace is running in ARM64 translation mode which may impact performance.\n\nRecommendation: use a native ARM64 build.`,
        };

        dialog.showMessageBoxSync(null, dialogOpts);
    }
}

/**
 * Gets the path to the old Lasp home directory (defaults to `~/.laspterm`).
 * @returns The path to the directory if it exists and contains valid data for the current app, otherwise null.
 */
function getLaspHomeDir(): string {
    let home = process.env[LaspHomeVarName];
    if (!home) {
        const homeDir = app.getPath("home");
        if (homeDir) {
            home = path.join(homeDir, `.${laspDirName}`);
        }
    }
    // If home exists and it has `lasp.lock` in it, we know it has valid data from Lasp >=v0.8. Otherwise, it could be for LaspLegacy (<v0.8)
    if (home && existsSync(home) && existsSync(path.join(home, "lasp.lock"))) {
        return home;
    }
    return null;
}

/**
 * Ensure the given path exists, creating it recursively if it doesn't.
 * @param path The path to ensure.
 * @returns The same path, for chaining.
 */
function ensurePathExists(path: string): string {
    if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
    }
    return path;
}

/**
 * Gets the path to the directory where Lasp configurations are stored. Creates the directory if it does not exist.
 * Handles backwards compatibility with the old Lasp Home directory model, where configurations and data were stored together.
 * @returns The path where configurations should be stored.
 */
function getLaspConfigDir(): string {
    // If lasp home dir exists, use it for backwards compatibility
    const laspHomeDir = getLaspHomeDir();
    if (laspHomeDir) {
        return path.join(laspHomeDir, "config");
    }

    const override = process.env[LaspConfigHomeVarName];
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    let retVal: string;
    if (override) {
        retVal = override;
    } else if (xdgConfigHome) {
        retVal = path.join(xdgConfigHome, laspDirName);
    } else {
        retVal = path.join(app.getPath("home"), ".config", laspDirName);
    }
    return ensurePathExists(retVal);
}

/**
 * Gets the path to the directory where Lasp data is stored. Creates the directory if it does not exist.
 * Handles backwards compatibility with the old Lasp Home directory model, where configurations and data were stored together.
 * @returns The path where data should be stored.
 */
function getLaspDataDir(): string {
    // If lasp home dir exists, use it for backwards compatibility
    const laspHomeDir = getLaspHomeDir();
    if (laspHomeDir) {
        return laspHomeDir;
    }

    const override = process.env[LaspDataHomeVarName];
    const xdgDataHome = process.env.XDG_DATA_HOME;
    let retVal: string;
    if (override) {
        retVal = override;
    } else if (xdgDataHome) {
        retVal = path.join(xdgDataHome, laspDirName);
    } else {
        retVal = paths.data;
    }
    return ensurePathExists(retVal);
}

function getElectronAppBasePath(): string {
    // import.meta.dirname in dev points to laspterm/dist/main
    return path.dirname(import.meta.dirname);
}

function getElectronAppUnpackedBasePath(): string {
    return getElectronAppBasePath().replace("app.asar", "app.asar.unpacked");
}

function getElectronAppResourcesPath(): string {
    if (isDev) {
        // import.meta.dirname in dev points to laspterm/dist/main
        return path.dirname(import.meta.dirname);
    }
    return process.resourcesPath;
}

const laspsrvBinName = `laspsrv.${unameArch}`;

function getLaspSrvPath(): string {
    if (process.platform === "win32") {
        const winBinName = `${laspsrvBinName}.exe`;
        const appPath = path.join(getElectronAppUnpackedBasePath(), "bin", winBinName);
        return `${appPath}`;
    }
    return path.join(getElectronAppUnpackedBasePath(), "bin", laspsrvBinName);
}

function getLaspSrvCwd(): string {
    return getLaspDataDir();
}

ipcMain.on("get-is-dev", (event) => {
    event.returnValue = isDev;
});
ipcMain.on("get-platform", (event, url) => {
    event.returnValue = unamePlatform;
});
ipcMain.on("get-user-name", (event) => {
    const userInfo = os.userInfo();
    event.returnValue = userInfo.username;
});
ipcMain.on("get-host-name", (event) => {
    event.returnValue = os.hostname();
});
ipcMain.on("get-webview-preload", (event) => {
    event.returnValue = path.join(getElectronAppBasePath(), "preload", "preload-webview.cjs");
});
ipcMain.on("get-data-dir", (event) => {
    event.returnValue = getLaspDataDir();
});
ipcMain.on("get-config-dir", (event) => {
    event.returnValue = getLaspConfigDir();
});
ipcMain.on("get-home-dir", (event) => {
    event.returnValue = app.getPath("home");
});

/**
 * Gets the value of the XDG_CURRENT_DESKTOP environment variable. If ORIGINAL_XDG_CURRENT_DESKTOP is set, it will be returned instead.
 * This corrects for a strange behavior in Electron, where it sets its own value for XDG_CURRENT_DESKTOP to improve Chromium compatibility.
 * @see https://www.electronjs.org/docs/latest/api/environment-variables#original_xdg_current_desktop
 * @returns The value of the XDG_CURRENT_DESKTOP environment variable, or ORIGINAL_XDG_CURRENT_DESKTOP if set, or undefined if neither are set.
 */
function getXdgCurrentDesktop(): string {
    if (process.env.ORIGINAL_XDG_CURRENT_DESKTOP) {
        return process.env.ORIGINAL_XDG_CURRENT_DESKTOP;
    } else if (process.env.XDG_CURRENT_DESKTOP) {
        return process.env.XDG_CURRENT_DESKTOP;
    } else {
        return undefined;
    }
}

/**
 * Calls the given callback with the value of the XDG_CURRENT_DESKTOP environment variable set to ORIGINAL_XDG_CURRENT_DESKTOP if it is set.
 * @see https://www.electronjs.org/docs/latest/api/environment-variables#original_xdg_current_desktop
 * @param callback The callback to call.
 */
function callWithOriginalXdgCurrentDesktop(callback: () => void) {
    const currXdgCurrentDesktopDefined = "XDG_CURRENT_DESKTOP" in process.env;
    const currXdgCurrentDesktop = process.env.XDG_CURRENT_DESKTOP;
    const originalXdgCurrentDesktop = getXdgCurrentDesktop();
    if (originalXdgCurrentDesktop) {
        process.env.XDG_CURRENT_DESKTOP = originalXdgCurrentDesktop;
    }
    callback();
    if (originalXdgCurrentDesktop) {
        if (currXdgCurrentDesktopDefined) {
            process.env.XDG_CURRENT_DESKTOP = currXdgCurrentDesktop;
        } else {
            delete process.env.XDG_CURRENT_DESKTOP;
        }
    }
}

/**
 * Calls the given async callback with the value of the XDG_CURRENT_DESKTOP environment variable set to ORIGINAL_XDG_CURRENT_DESKTOP if it is set.
 * @see https://www.electronjs.org/docs/latest/api/environment-variables#original_xdg_current_desktop
 * @param callback The async callback to call.
 */
async function callWithOriginalXdgCurrentDesktopAsync(callback: () => Promise<void>) {
    const currXdgCurrentDesktopDefined = "XDG_CURRENT_DESKTOP" in process.env;
    const currXdgCurrentDesktop = process.env.XDG_CURRENT_DESKTOP;
    const originalXdgCurrentDesktop = getXdgCurrentDesktop();
    if (originalXdgCurrentDesktop) {
        process.env.XDG_CURRENT_DESKTOP = originalXdgCurrentDesktop;
    }
    await callback();
    if (originalXdgCurrentDesktop) {
        if (currXdgCurrentDesktopDefined) {
            process.env.XDG_CURRENT_DESKTOP = currXdgCurrentDesktop;
        } else {
            delete process.env.XDG_CURRENT_DESKTOP;
        }
    }
}

export {
    callWithOriginalXdgCurrentDesktop,
    callWithOriginalXdgCurrentDesktopAsync,
    getElectronAppBasePath,
    getElectronAppResourcesPath,
    getElectronAppUnpackedBasePath,
    getLaspConfigDir,
    getLaspDataDir,
    getLaspSrvCwd,
    getLaspSrvPath,
    getXdgCurrentDesktop,
    isDev,
    isDevVite,
    unameArch,
    unamePlatform,
    LaspConfigHomeVarName,
    LaspDataHomeVarName,
};
