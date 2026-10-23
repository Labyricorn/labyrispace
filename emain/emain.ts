// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.

import { RpcApi } from "@/app/store/wshclientapi";
import * as electron from "electron";
import { focusedBuilderWindow, getAllBuilderWindows } from "emain/emain-builder";
import { globalEvents } from "emain/emain-events";
import { sprintf } from "sprintf-js";
import * as services from "../frontend/app/store/services";
import { initElectronWshrpc, shutdownWshrpc } from "../frontend/app/store/wshrpcutil-base";
import { fireAndForget, sleep } from "../frontend/util/util";
import { setMainFetch } from "../frontend/util/fetchutil";
import { AuthKey, configureAuthKeyRequestInjection } from "./authkey";
import { AppSessionPartition } from "./emain-appcontents";
import { configureVendorNetworkPolicy } from "./vendor-network";
import {
    getForceQuit,
    getGlobalIsRelaunching,
    getUserConfirmedQuit,
    setForceQuit,
    setGlobalIsQuitting,
    setGlobalIsStarting,
    setUserConfirmedQuit,
} from "./emain-activity";
import { initIpcHandlers } from "./emain-ipc";
import { log } from "./emain-log";
import { initMenuEventSubscriptions, makeAndSetAppMenu, makeDockTaskbar } from "./emain-menu";
import {
    checkIfRunningUnderARM64Translation,
    getElectronAppBasePath,
    getElectronAppUnpackedBasePath,
    getLaspConfigDir,
    getLaspDataDir,
    isDev,
    unameArch,
    unamePlatform,
} from "./emain-platform";
import { ensureHotSpareTab, setMaxTabCacheSize } from "./emain-tabview";
import { applyPendingProfileImport } from "./emain-import";
import { getIsLaspSrvDead, getLaspSrvProc, getLaspSrvReady, runLaspSrv } from "./emain-laspsrv";
import {
    createBrowserWindow,
    createNewLaspWindow,
    getAllLaspWindows,
    getQuakeWindow,
    getLaspWindowById,
    getLaspWindowByWorkspaceId,
    initGlobalHotkeyEventSubscription,
    registerGlobalHotkey,
    relaunchBrowserWindows,
    LaspBrowserWindow,
} from "./emain-window";
import { ElectronWshClient, initElectronWshClient } from "./emain-wsh";
import { getLaunchSettings } from "./launchsettings";
import { configureAutoUpdater, updater } from "./updater";

const electronApp = electron.app;
electronApp.on("session-created", configureVendorNetworkPolicy);

let confirmQuit = true;

const laspDataDir = getLaspDataDir();
const laspConfigDir = getLaspConfigDir();

electron.nativeTheme.themeSource = "dark";

console.log = log;
console.log(
    sprintf(
        "laspterm-app starting, data_dir=%s, config_dir=%s electronpath=%s gopath=%s arch=%s/%s electron=%s",
        laspDataDir,
        laspConfigDir,
        getElectronAppBasePath(),
        getElectronAppUnpackedBasePath(),
        unamePlatform,
        unameArch,
        process.versions.electron
    )
);
if (isDev) {
    console.log("laspterm-app LASPTERM_DEV set");
}

function handleWSEvent(evtMsg: WSEventType) {
    fireAndForget(async () => {
        console.log("handleWSEvent", evtMsg?.eventtype);
        if (evtMsg.eventtype == "electron:newwindow") {
            console.log("electron:newwindow", evtMsg.data);
            const windowId: string = evtMsg.data;
            const windowData: LaspWindow = (await services.ObjectService.GetObject("window:" + windowId)) as LaspWindow;
            if (windowData == null) {
                return;
            }
            const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
            const newWin = await createBrowserWindow(windowData, fullConfig, {
                unamePlatform,
                isPrimaryStartupWindow: false,
            });
            newWin.show();
        } else if (evtMsg.eventtype == "electron:closewindow") {
            console.log("electron:closewindow", evtMsg.data);
            if (evtMsg.data === undefined) return;
            const ww = getLaspWindowById(evtMsg.data);
            if (ww != null) {
                ww.destroy(); // bypass the "are you sure?" dialog
            }
        } else if (evtMsg.eventtype == "electron:updateactivetab") {
            const activeTabUpdate: { workspaceid: string; newactivetabid: string } = evtMsg.data;
            console.log("electron:updateactivetab", activeTabUpdate);
            const ww = getLaspWindowByWorkspaceId(activeTabUpdate.workspaceid);
            if (ww == null) {
                return;
            }
            await ww.setActiveTab(activeTabUpdate.newactivetabid, false);
        } else {
            console.log("unhandled electron ws eventtype", evtMsg.eventtype);
        }
    });
}

function hideWindowWithCatch(window: LaspBrowserWindow) {
    if (window == null) {
        return;
    }
    try {
        if (window.isDestroyed()) {
            return;
        }
        window.hide();
    } catch (e) {
        console.log("error hiding window", e);
    }
}

electronApp.on("window-all-closed", () => {
    if (getGlobalIsRelaunching()) {
        return;
    }
    if (unamePlatform !== "darwin") {
        setUserConfirmedQuit(true);
        electronApp.quit();
    }
});
electronApp.on("before-quit", (e) => {
    const allWindows = getAllLaspWindows();
    const allBuilders = getAllBuilderWindows();
    if (
        confirmQuit &&
        !getForceQuit() &&
        !getUserConfirmedQuit() &&
        (allWindows.length > 0 || allBuilders.length > 0) &&
        !getIsLaspSrvDead() &&
        !process.env.LASPTERM_NOCONFIRMQUIT
    ) {
        e.preventDefault();
        const choice = electron.dialog.showMessageBoxSync(null, {
            type: "question",
            buttons: ["Cancel", "Quit"],
            title: "Confirm Quit",
            message: "Are you sure you want to quit Labyrispace?",
            defaultId: 0,
            cancelId: 0,
        });
        if (choice === 0) {
            return;
        }
        setUserConfirmedQuit(true);
        electronApp.quit();
        return;
    }
    setGlobalIsQuitting(true);
    updater?.stop();
    if (unamePlatform == "win32") {
        // win32 doesn't have a SIGINT, so we just let electron die, which
        // ends up killing laspsrv via closing it's stdin.
        return;
    }
    getLaspSrvProc()?.kill("SIGINT");
    shutdownWshrpc();
    if (getForceQuit()) {
        return;
    }
    e.preventDefault();
    for (const window of allWindows) {
        hideWindowWithCatch(window);
    }
    for (const builder of allBuilders) {
        builder.hide();
    }
    if (getIsLaspSrvDead()) {
        console.log("laspsrv is dead, quitting immediately");
        setForceQuit(true);
        electronApp.quit();
        return;
    }
    setTimeout(() => {
        console.log("waiting for laspsrv to exit...");
        setForceQuit(true);
        electronApp.quit();
    }, 3000);
});
process.on("SIGINT", () => {
    console.log("Caught SIGINT, shutting down");
    setUserConfirmedQuit(true);
    electronApp.quit();
});
process.on("SIGHUP", () => {
    console.log("Caught SIGHUP, shutting down");
    setUserConfirmedQuit(true);
    electronApp.quit();
});
process.on("SIGTERM", () => {
    console.log("Caught SIGTERM, shutting down");
    setUserConfirmedQuit(true);
    electronApp.quit();
});
let caughtException = false;
process.on("uncaughtException", (error) => {
    if (caughtException) {
        return;
    }

    // Check if the error is related to QUIC protocol, if so, ignore (can happen with the updater)
    if (error?.message?.includes("net::ERR_QUIC_PROTOCOL_ERROR")) {
        console.log("Ignoring QUIC protocol error:", error.message);
        console.log("Stack Trace:", error.stack);
        return;
    }

    caughtException = true;
    console.log("Uncaught Exception, shutting down: ", error);
    console.log("Stack Trace:", error.stack);
    // Optionally, handle cleanup or exit the app
    setUserConfirmedQuit(true);
    electronApp.quit();
});

let lastLaspWindowCount = 0;
let lastIsBuilderWindowActive = false;
globalEvents.on("windows-updated", () => {
    const wwCount = getAllLaspWindows().length;
    const isBuilderActive = focusedBuilderWindow != null;
    if (wwCount == lastLaspWindowCount && isBuilderActive == lastIsBuilderWindowActive) {
        return;
    }
    lastLaspWindowCount = wwCount;
    lastIsBuilderWindowActive = isBuilderActive;
    console.log("windows-updated", wwCount, "builder-active:", isBuilderActive);
    makeAndSetAppMenu();
});

async function appMain() {
    // Set disableHardwareAcceleration as early as possible, if required.
    const launchSettings = getLaunchSettings();
    if (launchSettings?.["window:disablehardwareacceleration"]) {
        console.log("disabling hardware acceleration, per launch settings");
        electronApp.disableHardwareAcceleration();
    }
    const startTs = Date.now();
    const instanceLock = electronApp.requestSingleInstanceLock();
    if (!instanceLock) {
        console.log("laspterm-app could not get single-instance-lock, shutting down");
        setUserConfirmedQuit(true);
        electronApp.quit();
        return;
    }
    electronApp.on("second-instance", (_event, argv, workingDirectory) => {
        console.log("second-instance event, argv:", argv, "workingDirectory:", workingDirectory);
        fireAndForget(createNewLaspWindow);
    });
    applyPendingProfileImport();
    try {
        await runLaspSrv(handleWSEvent);
    } catch (e) {
        console.log(e.toString());
    }
    const ready = await getLaspSrvReady();
    console.log("laspsrv ready signal received", ready, Date.now() - startTs, "ms");
    await electronApp.whenReady();
    // App windows (tab views, builder windows) use a dedicated named session, never the Electron default
    // session, so web widgets (which use their own persist:labyrispace-web partition) can never end up
    // sharing a session with the auth key. See SECURITY-TEST-PLAN.md.
    const appSession = electron.session.fromPartition(AppSessionPartition);
    configureVendorNetworkPolicy(appSession);
    configureAuthKeyRequestInjection(appSession);
    // Main-process service calls (ClientService.GetClientData, /lasp/file fetches) must go through the
    // app session so the injected X-AuthKey is attached; electron.net.fetch would use the default session,
    // which no longer carries the key.
    setMainFetch((input, init) => appSession.fetch(input, init));
    initIpcHandlers();

    await sleep(10); // wait a bit for laspsrv to be ready
    try {
        initElectronWshClient();
        initElectronWshrpc(ElectronWshClient, { authKey: AuthKey });
        initMenuEventSubscriptions();
    } catch (e) {
        console.log("error initializing wshrpc", e);
    }
    const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
    checkIfRunningUnderARM64Translation(fullConfig);
    if (fullConfig?.settings?.["app:confirmquit"] != null) {
        confirmQuit = fullConfig.settings["app:confirmquit"];
    }
    ensureHotSpareTab(fullConfig);
    await relaunchBrowserWindows();

    makeAndSetAppMenu();
    makeDockTaskbar();
    await configureAutoUpdater();
    setGlobalIsStarting(false);
    if (fullConfig?.settings?.["window:maxtabcachesize"] != null) {
        setMaxTabCacheSize(fullConfig.settings["window:maxtabcachesize"]);
    }

    electronApp.on("activate", () => {
        const allWindows = getAllLaspWindows();
        const anyVisible = allWindows.some((w) => !w.isDestroyed() && w.isVisible());
        if (anyVisible) {
            return;
        }
        const qw = getQuakeWindow();
        if (qw != null && !qw.isDestroyed()) {
            qw.show();
            qw.focus();
            return;
        }
        if (allWindows.length === 0) {
            fireAndForget(createNewLaspWindow);
        }
    });
    electron.powerMonitor.on("resume", () => {
        console.log("system resumed from sleep, notifying server");
        fireAndForget(async () => {
            try {
                await RpcApi.NotifySystemResumeCommand(ElectronWshClient, { noresponse: true });
            } catch (e) {
                console.log("error calling NotifySystemResumeCommand", e);
            }
        });
    });
    const rawGlobalHotKey = launchSettings?.["app:globalhotkey"];
    if (rawGlobalHotKey) {
        registerGlobalHotkey(rawGlobalHotKey);
    }
    initGlobalHotkeyEventSubscription();
}

appMain().catch((e) => {
    console.log("appMain error", e);
    setUserConfirmedQuit(true);
    electronApp.quit();
});
