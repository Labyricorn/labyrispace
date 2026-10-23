// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ClientService, ObjectService, WindowService, WorkspaceService } from "@/app/store/services";
import { laspEventSubscribeSingle } from "@/app/store/wps";
import { RpcApi } from "@/app/store/wshclientapi";
import { fireAndForget } from "@/util/util";
import { BaseWindow, BaseWindowConstructorOptions, dialog, globalShortcut, ipcMain, screen } from "electron";
import { globalEvents } from "emain/emain-events";
import path from "path";
import { debounce } from "throttle-debounce";
import {
    getGlobalIsQuitting,
    getGlobalIsRelaunching,
    setGlobalIsRelaunching,
} from "./emain-activity";
import { log } from "./emain-log";
import { getElectronAppBasePath, isDev, unamePlatform } from "./emain-platform";
import { getOrCreateWebViewForTab, getLaspTabViewByWebContentsId, LaspTabView } from "./emain-tabview";
import { delay, ensureBoundsAreVisible, laspKeyToElectronKey } from "./emain-util";
import { ElectronWshClient } from "./emain-wsh";
import { updater } from "./updater";

const DevInitTimeoutMs = 5000;

export type WindowOpts = {
    unamePlatform: NodeJS.Platform;
    isPrimaryStartupWindow?: boolean;
    foregroundWindow?: boolean;
};

export const MinWindowWidth = 800;
export const MinWindowHeight = 500;

export function calculateWindowBounds(
    winSize?: { width?: number; height?: number },
    pos?: { x?: number; y?: number },
    settings?: any
): { x: number; y: number; width: number; height: number } {
    let winWidth = winSize?.width;
    let winHeight = winSize?.height;
    const winPosX = pos?.x ?? 100;
    const winPosY = pos?.y ?? 100;

    if (
        (winWidth == null || winWidth === 0 || winHeight == null || winHeight === 0) &&
        settings?.["window:dimensions"]
    ) {
        const dimensions = settings["window:dimensions"];
        const match = dimensions.match(/^(\d+)[xX](\d+)$/);

        if (match) {
            const [, dimensionWidth, dimensionHeight] = match;
            const parsedWidth = parseInt(dimensionWidth, 10);
            const parsedHeight = parseInt(dimensionHeight, 10);

            if ((!winWidth || winWidth === 0) && Number.isFinite(parsedWidth) && parsedWidth > 0) {
                winWidth = parsedWidth;
            }
            if ((!winHeight || winHeight === 0) && Number.isFinite(parsedHeight) && parsedHeight > 0) {
                winHeight = parsedHeight;
            }
        } else {
            console.warn('Invalid window:dimensions format. Expected "widthxheight".');
        }
    }

    if (winWidth == null || winWidth == 0) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width } = primaryDisplay.workAreaSize;
        winWidth = width - winPosX - 100;
        if (winWidth > 2000) {
            winWidth = 2000;
        }
    }
    if (winHeight == null || winHeight == 0) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { height } = primaryDisplay.workAreaSize;
        winHeight = height - winPosY - 100;
        if (winHeight > 1200) {
            winHeight = 1200;
        }
    }

    winWidth = Math.max(winWidth, MinWindowWidth);
    winHeight = Math.max(winHeight, MinWindowHeight);

    const winBounds = {
        x: winPosX,
        y: winPosY,
        width: winWidth,
        height: winHeight,
    };
    return ensureBoundsAreVisible(winBounds);
}

export const laspWindowMap = new Map<string, LaspBrowserWindow>(); // laspWindowId -> LaspBrowserWindow

// on blur we do not set this to null (but on destroy we do), so this tracks the *last* focused window
// e.g. it persists when the app itself is not focused
export let focusedLaspWindow: LaspBrowserWindow = null;

// quake window for toggle hotkey (show/hide behavior)
let quakeWindow: LaspBrowserWindow | null = null;

export function getQuakeWindow(): LaspBrowserWindow | null {
    return quakeWindow;
}

let cachedClientId: string = null;
let hasCompletedFirstRelaunch = false;

async function getClientId() {
    if (cachedClientId != null) {
        return cachedClientId;
    }
    const clientData = await ClientService.GetClientData();
    cachedClientId = clientData?.oid;
    return cachedClientId;
}

type WindowActionQueueEntry =
    | {
          op: "switchtab";
          tabId: string;
          setInBackend: boolean;
          primaryStartupTab?: boolean;
      }
    | {
          op: "createtab";
      }
    | {
          op: "closetab";
          tabId: string;
      }
    | {
          op: "switchworkspace";
          workspaceId: string;
      };

function isNonEmptyUnsavedWorkspace(workspace: Workspace): boolean {
    return !workspace.name && !workspace.icon && workspace.tabids?.length > 1;
}

export class LaspBrowserWindow extends BaseWindow {
    laspWindowId: string;
    workspaceId: string;
    allLoadedTabViews: Map<string, LaspTabView>;
    activeTabView: LaspTabView;
    private canClose: boolean;
    private deleteAllowed: boolean;
    private actionQueue: WindowActionQueueEntry[];

    constructor(laspWindow: LaspWindow, fullConfig: FullConfigType, opts: WindowOpts) {
        const settings = fullConfig?.settings;

        console.log("create win", laspWindow.oid);
        const winBounds = calculateWindowBounds(laspWindow.winsize, laspWindow.pos, settings);
        const winOpts: BaseWindowConstructorOptions = {
            x: winBounds.x,
            y: winBounds.y,
            width: winBounds.width,
            height: winBounds.height,
            minWidth: MinWindowWidth,
            minHeight: MinWindowHeight,
            show: false,
        };

        const isTransparent = settings?.["window:transparent"] ?? false;
        const isBlur = !isTransparent && (settings?.["window:blur"] ?? false);

        if (opts.unamePlatform === "darwin") {
            winOpts.titleBarStyle = "hiddenInset";
            winOpts.titleBarOverlay = false;
            winOpts.autoHideMenuBar = !settings?.["window:showmenubar"];
            winOpts.acceptFirstMouse = true;
            if (isTransparent) {
                winOpts.transparent = true;
            } else if (isBlur) {
                winOpts.vibrancy = "fullscreen-ui";
            } else {
                winOpts.backgroundColor = "#222222";
            }
        } else if (opts.unamePlatform === "linux") {
            winOpts.titleBarStyle = settings["window:nativetitlebar"] ? "default" : "hidden";
            winOpts.titleBarOverlay = {
                symbolColor: "white",
                color: "#00000000",
            };
            winOpts.icon = path.join(getElectronAppBasePath(), "public/logos/labyrispace-logo-256.png");
            winOpts.autoHideMenuBar = !settings?.["window:showmenubar"];
            if (isTransparent) {
                winOpts.transparent = true;
            } else {
                winOpts.backgroundColor = "#222222";
            }
        } else if (opts.unamePlatform === "win32") {
            winOpts.titleBarStyle = "hidden";
            winOpts.titleBarOverlay = {
                color: "#222222",
                symbolColor: "#c3c8c2",
                height: 32,
            };
            if (isTransparent) {
                winOpts.transparent = true;
            } else if (isBlur) {
                winOpts.backgroundMaterial = "acrylic";
            } else {
                winOpts.backgroundColor = "#222222";
            }
        }

        super(winOpts);

        if (opts.unamePlatform === "win32") {
            this.setMenu(null);
        }

        const fullscreenOnLaunch = fullConfig?.settings["window:fullscreenonlaunch"];
        if (fullscreenOnLaunch && opts.foregroundWindow) {
            this.once("show", () => {
                this.setFullScreen(true);
            });
        }
        this.actionQueue = [];
        this.laspWindowId = laspWindow.oid;
        this.workspaceId = laspWindow.workspaceid;
        this.allLoadedTabViews = new Map<string, LaspTabView>();
        const winBoundsPoller = setInterval(() => {
            if (this.isDestroyed()) {
                clearInterval(winBoundsPoller);
                return;
            }
            if (this.actionQueue.length > 0) {
                return;
            }
            this.finalizePositioning();
        }, 1000);
        this.on(
            // @ts-expect-error -- "resize" event with debounce handler not in Electron type definitions
            "resize",
            debounce(400, (e) => this.mainResizeHandler(e))
        );
        this.on("resize", () => {
            if (this.isDestroyed()) {
                return;
            }
            this.activeTabView?.positionTabOnScreen(this.getContentBounds());
        });
        this.on(
            // @ts-expect-error -- "move" event with debounce handler not in Electron type definitions
            "move",
            debounce(400, (e) => this.mainResizeHandler(e))
        );
        this.on("enter-full-screen", async () => {
            if (this.isDestroyed()) {
                return;
            }
            console.log("enter-full-screen event", this.getContentBounds());
            const tabView = this.activeTabView;
            if (tabView) {
                tabView.webContents.send("fullscreen-change", true);
            }
            this.activeTabView?.positionTabOnScreen(this.getContentBounds());
        });
        this.on("leave-full-screen", async () => {
            if (this.isDestroyed()) {
                return;
            }
            const tabView = this.activeTabView;
            if (tabView) {
                tabView.webContents.send("fullscreen-change", false);
            }
            this.activeTabView?.positionTabOnScreen(this.getContentBounds());
        });
        this.on("focus", () => {
            if (this.isDestroyed()) {
                return;
            }
            if (getGlobalIsRelaunching()) {
                return;
            }
            focusedLaspWindow = this; // eslint-disable-line @typescript-eslint/no-this-alias
            console.log("focus win", this.laspWindowId);
            fireAndForget(() => ClientService.FocusWindow(this.laspWindowId));
            setTimeout(() => globalEvents.emit("windows-updated"), 50);
        });
        this.on("blur", () => {
            setTimeout(() => globalEvents.emit("windows-updated"), 50);
        });
        this.on("close", (e) => {
            if (this.canClose) {
                return;
            }
            if (this.isDestroyed()) {
                return;
            }
            console.log("win 'close' handler fired", this.laspWindowId);
            if (getGlobalIsQuitting() || updater?.status == "installing" || getGlobalIsRelaunching()) {
                return;
            }
            e.preventDefault();
            fireAndForget(async () => {
                const numWindows = laspWindowMap.size;
                const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
                if (numWindows > 1 || !fullConfig.settings["window:savelastwindow"]) {
                    if (fullConfig.settings["window:confirmclose"]) {
                        const workspace = await WorkspaceService.GetWorkspace(this.workspaceId);
                        if (isNonEmptyUnsavedWorkspace(workspace)) {
                            const choice = dialog.showMessageBoxSync(this, {
                                type: "question",
                                buttons: ["Cancel", "Close Window"],
                                title: "Confirm",
                                message:
                                    "Window has unsaved tabs, closing window will delete existing tabs.\n\nContinue?",
                            });
                            if (choice === 0) {
                                return;
                            }
                        }
                    }
                    this.deleteAllowed = true;
                }
                this.canClose = true;
                this.close();
            });
        });
        this.on("closed", () => {
            console.log("win 'closed' handler fired", this.laspWindowId);
            if (getGlobalIsQuitting() || updater?.status == "installing") {
                console.log("win quitting or updating", this.laspWindowId);
                return;
            }
            setTimeout(() => globalEvents.emit("windows-updated"), 50);
            laspWindowMap.delete(this.laspWindowId);
            if (focusedLaspWindow == this) {
                focusedLaspWindow = null;
            }
            if (quakeWindow == this) {
                quakeWindow = null;
            }
            this.removeAllChildViews();
            if (getGlobalIsRelaunching()) {
                console.log("win relaunching", this.laspWindowId);
                this.destroy();
                return;
            }
            if (this.deleteAllowed) {
                console.log("win removing window from backend DB", this.laspWindowId);
                fireAndForget(() => WindowService.CloseWindow(this.laspWindowId, true));
            }
        });
        laspWindowMap.set(laspWindow.oid, this);
        setTimeout(() => globalEvents.emit("windows-updated"), 50);
    }

    private removeAllChildViews() {
        for (const tabView of this.allLoadedTabViews.values()) {
            if (!this.isDestroyed()) {
                this.contentView.removeChildView(tabView);
            }
            tabView?.destroy();
        }
    }

    async switchWorkspace(workspaceId: string) {
        console.log("switchWorkspace", workspaceId, this.laspWindowId);
        if (workspaceId == this.workspaceId) {
            console.log("switchWorkspace already on this workspace", this.laspWindowId);
            return;
        }

        // If the workspace is already owned by a window, then we can just call SwitchWorkspace without first prompting the user, since it'll just focus to the other window.
        const workspaceList = await WorkspaceService.ListWorkspaces();
        if (!workspaceList?.find((wse) => wse.workspaceid === workspaceId)?.windowid) {
            const curWorkspace = await WorkspaceService.GetWorkspace(this.workspaceId);

            if (curWorkspace && isNonEmptyUnsavedWorkspace(curWorkspace)) {
                console.log(
                    `existing unsaved workspace ${this.workspaceId} has content, opening workspace ${workspaceId} in new window`
                );
                await createWindowForWorkspace(workspaceId);
                return;
            }
        }
        await this._queueActionInternal({ op: "switchworkspace", workspaceId });
    }

    async setActiveTab(tabId: string, setInBackend: boolean, primaryStartupTab = false) {
        console.log(
            "setActiveTab",
            tabId,
            this.laspWindowId,
            this.workspaceId,
            setInBackend,
            primaryStartupTab ? "(primary startup)" : ""
        );
        await this._queueActionInternal({ op: "switchtab", tabId, setInBackend, primaryStartupTab });
    }

    private async initializeTab(tabView: LaspTabView, primaryStartupTab: boolean) {
        const clientId = await getClientId();
        await this.awaitWithDevTimeout(tabView.initPromise, "initPromise", tabView.laspTabId);
        const winBounds = this.getContentBounds();
        tabView.setBounds({ x: 0, y: 0, width: winBounds.width, height: winBounds.height });
        this.contentView.addChildView(tabView);
        const initOpts: LaspInitOpts = {
            tabId: tabView.laspTabId,
            clientId: clientId,
            windowId: this.laspWindowId,
            activate: true,
        };
        if (primaryStartupTab) {
            initOpts.primaryTabStartup = true;
        }
        tabView.savedInitOpts = { ...initOpts };
        tabView.savedInitOpts.activate = false;
        delete tabView.savedInitOpts.primaryTabStartup;
        const startTime = Date.now();
        console.log(
            "before lasp ready, init tab, sending lasp-init",
            tabView.laspTabId,
            primaryStartupTab ? "(primary startup)" : ""
        );
        tabView.webContents.send("lasp-init", initOpts);
        await this.awaitWithDevTimeout(tabView.laspReadyPromise, "laspReadyPromise", tabView.laspTabId);
        console.log("lasp-ready init time", Date.now() - startTime + "ms");
    }

    private async awaitWithDevTimeout<T>(promise: Promise<T>, name: string, tabId: string): Promise<T> {
        if (!isDev) {
            return promise;
        }
        let timeoutHandle: ReturnType<typeof setTimeout> = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                console.log(
                    `[dev] ${name} timed out after ${DevInitTimeoutMs}ms for tab ${tabId}, showing window for devtools`
                );
                if (!this.isDestroyed() && !this.isVisible()) {
                    this.show();
                }
                if (this.activeTabView?.webContents && !this.activeTabView.webContents.isDevToolsOpened()) {
                    this.activeTabView.webContents.openDevTools();
                }
                reject(new Error(`[dev] ${name} timed out after ${DevInitTimeoutMs}ms`));
            }, DevInitTimeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    private async setTabViewIntoWindow(tabView: LaspTabView, tabInitialized: boolean, primaryStartupTab = false) {
        if (this.activeTabView == tabView) {
            return;
        }
        const oldActiveView = this.activeTabView;
        tabView.isActiveTab = true;
        if (oldActiveView != null) {
            oldActiveView.isActiveTab = false;
        }
        this.activeTabView = tabView;
        this.allLoadedTabViews.set(tabView.laspTabId, tabView);
        if (!tabInitialized) {
            console.log("initializing a new tab", primaryStartupTab ? "(primary startup)" : "");
            await this.initializeTab(tabView, primaryStartupTab);
            this.finalizePositioning();
        } else {
            console.log("reusing an existing tab, calling lasp-init", tabView.laspTabId);
            tabView.webContents.send("lasp-init", tabView.savedInitOpts); // reinit
            this.finalizePositioning();
        }

        // something is causing the new tab to lose focus so it requires manual refocusing
        tabView.webContents.focus();
        setTimeout(() => {
            if (tabView.webContents && this.activeTabView == tabView && !tabView.webContents.isFocused()) {
                tabView.webContents.focus();
            }
        }, 10);
        setTimeout(() => {
            if (tabView.webContents && this.activeTabView == tabView && !tabView.webContents.isFocused()) {
                tabView.webContents.focus();
            }
        }, 30);
    }

    private finalizePositioning() {
        if (this.isDestroyed()) {
            return;
        }
        const curBounds = this.getContentBounds();
        this.activeTabView?.positionTabOnScreen(curBounds);
        for (const tabView of this.allLoadedTabViews.values()) {
            if (tabView == this.activeTabView) {
                continue;
            }
            tabView?.positionTabOffScreen(curBounds);
        }
    }

    async queueCreateTab() {
        await this._queueActionInternal({ op: "createtab" });
    }

    async queueCloseTab(tabId: string) {
        await this._queueActionInternal({ op: "closetab", tabId });
    }

    private async _queueActionInternal(entry: WindowActionQueueEntry) {
        if (this.actionQueue.length >= 2) {
            this.actionQueue[1] = entry;
            return;
        }
        const wasEmpty = this.actionQueue.length === 0;
        this.actionQueue.push(entry);
        if (wasEmpty) {
            await this.processActionQueue();
        }
    }

    private removeTabViewLater(tabId: string, delayMs: number) {
        setTimeout(() => {
            this.removeTabView(tabId, false);
        }, delayMs);
    }

    // the queue and this function are used to serialize operations that update the window contents view
    // processActionQueue will replace [1] if it is already set
    // we don't mess with [0] because it is "in process"
    // we replace [1] because there is no point to run an action that is going to be overwritten
    private async processActionQueue() {
        while (this.actionQueue.length > 0) {
            try {
                if (this.isDestroyed()) {
                    break;
                }
                const entry = this.actionQueue[0];
                let tabId: string = null;
                // have to use "===" here to get the typechecker to work :/
                switch (entry.op) {
                    case "createtab":
                        tabId = await WorkspaceService.CreateTab(this.workspaceId, null, true);
                        break;
                    case "switchtab":
                        tabId = entry.tabId;
                        if (this.activeTabView?.laspTabId == tabId) {
                            continue;
                        }
                        if (entry.setInBackend) {
                            await WorkspaceService.SetActiveTab(this.workspaceId, tabId);
                        }
                        break;
                    case "closetab": {
                        tabId = entry.tabId;
                        const rtn = await WorkspaceService.CloseTab(this.workspaceId, tabId, true);
                        if (rtn == null) {
                            console.log(
                                "[error] closeTab: no return value",
                                tabId,
                                this.workspaceId,
                                this.laspWindowId
                            );
                            return;
                        }
                        this.removeTabViewLater(tabId, 1000);
                        if (rtn.closewindow) {
                            this.close();
                            return;
                        }
                        if (!rtn.newactivetabid) {
                            return;
                        }
                        tabId = rtn.newactivetabid;
                        break;
                    }
                    case "switchworkspace": {
                        const newWs = await WindowService.SwitchWorkspace(this.laspWindowId, entry.workspaceId);
                        if (!newWs) {
                            return;
                        }
                        console.log("processActionQueue switchworkspace newWs", newWs);
                        this.removeAllChildViews();
                        console.log("destroyed all tabs", this.laspWindowId);
                        this.workspaceId = entry.workspaceId;
                        this.allLoadedTabViews = new Map();
                        tabId = newWs.activetabid;
                        break;
                    }
                }
                if (tabId == null) {
                    return;
                }
                const [tabView, tabInitialized] = await getOrCreateWebViewForTab(this.laspWindowId, tabId);
                const primaryStartupTabFlag = entry.op === "switchtab" ? (entry.primaryStartupTab ?? false) : false;
                await this.setTabViewIntoWindow(tabView, tabInitialized, primaryStartupTabFlag);
            } catch (e) {
                console.log("error caught in processActionQueue", e);
            } finally {
                this.actionQueue.shift();
            }
        }
    }

    private async mainResizeHandler(_: any) {
        if (this == null || this.isDestroyed() || this.fullScreen) {
            return;
        }
        const bounds = this.getBounds();
        try {
            await WindowService.SetWindowPosAndSize(
                this.laspWindowId,
                { x: bounds.x, y: bounds.y },
                { width: bounds.width, height: bounds.height }
            );
        } catch (e) {
            console.log("error sending new window bounds to backend", e);
        }
    }

    removeTabView(tabId: string, force: boolean) {
        if (!force && this.activeTabView?.laspTabId == tabId) {
            console.log("cannot remove active tab", tabId, this.laspWindowId);
            return;
        }
        const tabView = this.allLoadedTabViews.get(tabId);
        if (tabView == null) {
            console.log("removeTabView -- tabView not found", tabId, this.laspWindowId);
            // the tab was never loaded, so just return
            return;
        }
        this.contentView.removeChildView(tabView);
        this.allLoadedTabViews.delete(tabId);
        tabView.destroy();
    }

    destroy() {
        console.log("destroy win", this.laspWindowId);
        this.deleteAllowed = true;
        super.destroy();
    }
}

export function getLaspWindowByTabId(tabId: string): LaspBrowserWindow {
    for (const ww of laspWindowMap.values()) {
        if (ww.allLoadedTabViews.has(tabId)) {
            return ww;
        }
    }
}

export function getLaspWindowByWebContentsId(webContentsId: number): LaspBrowserWindow {
    if (webContentsId == null) {
        return null;
    }
    const tabView = getLaspTabViewByWebContentsId(webContentsId);
    if (tabView == null) {
        return null;
    }
    return getLaspWindowByTabId(tabView.laspTabId);
}

export function getLaspWindowById(windowId: string): LaspBrowserWindow {
    return laspWindowMap.get(windowId);
}

export function getLaspWindowByWorkspaceId(workspaceId: string): LaspBrowserWindow {
    for (const laspWindow of laspWindowMap.values()) {
        if (laspWindow.workspaceId === workspaceId) {
            return laspWindow;
        }
    }
}

export function getAllLaspWindows(): LaspBrowserWindow[] {
    return Array.from(laspWindowMap.values());
}

export async function createWindowForWorkspace(workspaceId: string) {
    const newWin = await WindowService.CreateWindow(null, workspaceId);
    if (!newWin) {
        console.log("error creating new window", this.laspWindowId);
    }
    const newBwin = await createBrowserWindow(newWin, await RpcApi.GetFullConfigCommand(ElectronWshClient), {
        unamePlatform,
        isPrimaryStartupWindow: false,
    });
    newBwin.show();
}

// note, this does not *show* the window.
// to show, await win.readyPromise and then win.show()
export async function createBrowserWindow(
    laspWindow: LaspWindow,
    fullConfig: FullConfigType,
    opts: WindowOpts
): Promise<LaspBrowserWindow> {
    if (!laspWindow) {
        console.log("createBrowserWindow: no laspWindow");
        laspWindow = await WindowService.CreateWindow(null, "");
    }
    let workspace = await WorkspaceService.GetWorkspace(laspWindow.workspaceid);
    if (!workspace) {
        console.log("createBrowserWindow: no workspace, creating new window");
        await WindowService.CloseWindow(laspWindow.oid, true);
        laspWindow = await WindowService.CreateWindow(null, "");
        workspace = await WorkspaceService.GetWorkspace(laspWindow.workspaceid);
    }
    console.log("createBrowserWindow", laspWindow.oid, workspace.oid, workspace);
    const bwin = new LaspBrowserWindow(laspWindow, fullConfig, opts);

    if (workspace.activetabid) {
        await bwin.setActiveTab(workspace.activetabid, false, opts.isPrimaryStartupWindow ?? false);
    }
    return bwin;
}

ipcMain.on("set-active-tab", async (event, tabId) => {
    const ww = getLaspWindowByWebContentsId(event.sender.id);
    console.log("set-active-tab", tabId, ww?.laspWindowId);
    await ww?.setActiveTab(tabId, true);
});

ipcMain.on("create-tab", async (event, _opts) => {
    const senderWc = event.sender;
    const ww = getLaspWindowByWebContentsId(senderWc.id);
    if (ww != null) {
        await ww.queueCreateTab();
    }
    event.returnValue = true;
    return null;
});

ipcMain.on("set-laspai-open", (event, isOpen: boolean) => {
    const tabView = getLaspTabViewByWebContentsId(event.sender.id);
    if (tabView) {
        tabView.isLaspAIOpen = isOpen;
    }
});

ipcMain.handle("close-tab", async (event, workspaceId: string, tabId: string, confirmClose: boolean) => {
    const ww = getLaspWindowByWorkspaceId(workspaceId);
    if (ww == null) {
        console.log(`close-tab: no window found for workspace ws=${workspaceId} tab=${tabId}`);
        return false;
    }
    if (confirmClose) {
        const choice = dialog.showMessageBoxSync(ww, {
            type: "question",
            defaultId: 1, // Enter activates "Close Tab"
            cancelId: 0, // Esc activates "Cancel"
            buttons: ["Cancel", "Close Tab"],
            title: "Confirm",
            message: "Are you sure you want to close this tab?",
        });
        if (choice === 0) {
            return false;
        }
    }
    await ww.queueCloseTab(tabId);
    return true;
});

ipcMain.on("switch-workspace", (event, workspaceId) => {
    fireAndForget(async () => {
        const ww = getLaspWindowByWebContentsId(event.sender.id);
        console.log("switch-workspace", workspaceId, ww?.laspWindowId);
        await ww?.switchWorkspace(workspaceId);
    });
});

export async function createWorkspace(window: LaspBrowserWindow) {
    const newWsId = await WorkspaceService.CreateWorkspace("", "", "", true);
    if (newWsId) {
        if (window) {
            await window.switchWorkspace(newWsId);
        } else {
            await createWindowForWorkspace(newWsId);
        }
    }
}

ipcMain.on("create-workspace", (event) => {
    fireAndForget(async () => {
        const ww = getLaspWindowByWebContentsId(event.sender.id);
        console.log("create-workspace", ww?.laspWindowId);
        await createWorkspace(ww);
    });
});

ipcMain.on("delete-workspace", (event, workspaceId) => {
    fireAndForget(async () => {
        const ww = getLaspWindowByWebContentsId(event.sender.id);
        console.log("delete-workspace", workspaceId, ww?.laspWindowId);

        const workspaceList = await WorkspaceService.ListWorkspaces();

        const _workspaceHasWindow = !!workspaceList.find((wse) => wse.workspaceid === workspaceId)?.windowid;

        const choice = dialog.showMessageBoxSync(this, {
            type: "question",
            buttons: ["Cancel", "Delete Workspace"],
            title: "Confirm",
            message: `Deleting workspace will also delete its contents.\n\nContinue?`,
        });
        if (choice === 0) {
            console.log("user cancelled workspace delete", workspaceId, ww?.laspWindowId);
            return;
        }

        const newWorkspaceId = await WorkspaceService.DeleteWorkspace(workspaceId);
        console.log("delete-workspace done", workspaceId, ww?.laspWindowId);
        if (ww?.workspaceId == workspaceId) {
            if (newWorkspaceId) {
                await ww.switchWorkspace(newWorkspaceId);
            } else {
                console.log("delete-workspace closing window", workspaceId, ww?.laspWindowId);
                ww.destroy();
            }
        }
    });
});

export async function createNewLaspWindow() {
    log("createNewLaspWindow");
    const clientData = await ClientService.GetClientData();
    const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
    let recreatedWindow = false;
    const allWindows = getAllLaspWindows();
    if (allWindows.length === 0 && clientData?.windowids?.length >= 1) {
        console.log("no windows, but clientData has windowids, recreating first window");
        // reopen the first window
        const existingWindowId = clientData.windowids[0];
        const existingWindowData = (await ObjectService.GetObject("window:" + existingWindowId)) as LaspWindow;
        if (existingWindowData != null) {
            const win = await createBrowserWindow(existingWindowData, fullConfig, {
                unamePlatform,
                isPrimaryStartupWindow: false,
            });
            if (quakeWindow == null) {
                quakeWindow = win;
            }
            win.show();
            recreatedWindow = true;
        }
    }
    if (recreatedWindow) {
        console.log("recreated window, returning");
        return;
    }
    console.log("creating new window");
    const newBrowserWindow = await createBrowserWindow(null, fullConfig, {
        unamePlatform,
        isPrimaryStartupWindow: false,
    });
    if (quakeWindow == null) {
        quakeWindow = newBrowserWindow;
    }
    newBrowserWindow.show();
}

export async function relaunchBrowserWindows() {
    console.log("relaunchBrowserWindows");
    setGlobalIsRelaunching(true);
    const windows = getAllLaspWindows();
    if (windows.length > 0) {
        for (const window of windows) {
            console.log("relaunch -- closing window", window.laspWindowId);
            window.close();
        }
        await delay(1200);
    }
    setGlobalIsRelaunching(false);

    const clientData = await ClientService.GetClientData();
    const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
    const windowIds = clientData.windowids ?? [];
    const wins: LaspBrowserWindow[] = [];
    const isFirstRelaunch = !hasCompletedFirstRelaunch;
    const primaryWindowId = windowIds.length > 0 ? windowIds[0] : null;
    for (const windowId of windowIds.slice().reverse()) {
        const windowData: LaspWindow = await WindowService.GetWindow(windowId);
        if (windowData == null) {
            console.log("relaunch -- window data not found, closing window", windowId);
            await WindowService.CloseWindow(windowId, true);
            continue;
        }
        const isPrimaryStartupWindow = isFirstRelaunch && windowId === primaryWindowId;
        console.log(
            "relaunch -- creating window",
            windowId,
            windowData,
            isPrimaryStartupWindow ? "(primary startup)" : ""
        );
        const win = await createBrowserWindow(windowData, fullConfig, {
            unamePlatform,
            isPrimaryStartupWindow,
            foregroundWindow: windowId === primaryWindowId,
        });
        wins.push(win);
        if (windowId === primaryWindowId) {
            quakeWindow = win;
            console.log("designated quake window", win.laspWindowId);
        }
    }
    hasCompletedFirstRelaunch = true;
    for (const win of wins) {
        console.log("show window", win.laspWindowId);
        win.show();
    }
}

function getDisplayForQuakeToggle() {
    // We cannot reliably query the OS-wide active window in Electron.
    // Cursor position is the best cross-platform proxy for the user's active display.
    const cursorPoint = screen.getCursorScreenPoint();
    const displayAtCursor = screen
        .getAllDisplays()
        .find(
            (display) =>
                cursorPoint.x >= display.bounds.x &&
                cursorPoint.x < display.bounds.x + display.bounds.width &&
                cursorPoint.y >= display.bounds.y &&
                cursorPoint.y < display.bounds.y + display.bounds.height
        );
    return displayAtCursor ?? screen.getDisplayNearestPoint(cursorPoint);
}

function moveWindowToDisplay(win: LaspBrowserWindow, targetDisplay: Electron.Display) {
    if (!win || !targetDisplay || win.isDestroyed()) {
        return;
    }
    const curBounds = win.getBounds();
    const sourceDisplay = screen.getDisplayMatching(curBounds);
    if (sourceDisplay.id === targetDisplay.id) {
        return;
    }

    const sourceArea = sourceDisplay.workArea;
    const targetArea = targetDisplay.workArea;
    const nextHeight = Math.min(curBounds.height, targetArea.height);
    const nextWidth = Math.min(curBounds.width, targetArea.width);
    const maxXOffset = Math.max(0, targetArea.width - nextWidth);
    const maxYOffset = Math.max(0, targetArea.height - nextHeight);
    const sourceXOffset = curBounds.x - sourceArea.x;
    const sourceYOffset = curBounds.y - sourceArea.y;
    const nextX = targetArea.x + Math.min(Math.max(sourceXOffset, 0), maxXOffset);
    const nextY = targetArea.y + Math.min(Math.max(sourceYOffset, 0), maxYOffset);

    win.setBounds({ ...curBounds, x: nextX, y: nextY, width: nextWidth, height: nextHeight });
}

const FullscreenTransitionTimeoutMs = 2000;

// handles a theoretical race condition where the user spams the hotkey before the toggle finishes
let quakeToggleInProgress = false;
let quakeRestoreFullscreenOnShow = false;

function waitForFullscreenLeave(window: LaspBrowserWindow): Promise<void> {
    if (!window.isFullScreen()) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line prefer-const
        let timeout: ReturnType<typeof setTimeout>;
        const onLeave = () => {
            clearTimeout(timeout);
            resolve();
        };
        timeout = setTimeout(() => {
            window.removeListener("leave-full-screen", onLeave);
            reject(new Error("fullscreen transition timeout"));
        }, FullscreenTransitionTimeoutMs);
        window.once("leave-full-screen", onLeave);
    });
}

function waitForFullscreenEnter(window: LaspBrowserWindow): Promise<void> {
    if (window.isFullScreen()) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line prefer-const
        let timeout: ReturnType<typeof setTimeout>;
        const onEnter = () => {
            clearTimeout(timeout);
            resolve();
        };
        timeout = setTimeout(() => {
            window.removeListener("enter-full-screen", onEnter);
            reject(new Error("fullscreen transition timeout"));
        }, FullscreenTransitionTimeoutMs);
        window.once("enter-full-screen", onEnter);
    });
}

async function quakeToggle() {
    if (quakeToggleInProgress) {
        return;
    }
    quakeToggleInProgress = true;
    try {
        let window = quakeWindow;
        if (window?.isDestroyed()) {
            quakeWindow = null;
            window = null;
        }
        if (window == null) {
            await createNewLaspWindow();
            return;
        }
        // Some environments don't hide or move the window if it's fullscreen (even when hidden), so leave fullscreen first
        if (window.isFullScreen()) {
            // macos has a really long fullscreen animation and can have issues restoring from fullscreen, so we skip on macos
            quakeRestoreFullscreenOnShow = process.platform !== "darwin";
            const leavePromise = waitForFullscreenLeave(window);
            window.setFullScreen(false);
            try {
                await leavePromise;
            } catch {
                // timeout — proceed anyway
            }
            if (window.isDestroyed()) {
                return;
            }
        }
        if (window.isVisible()) {
            window.hide();
        } else {
            const targetDisplay = getDisplayForQuakeToggle();
            moveWindowToDisplay(window, targetDisplay);
            window.show();
            if (quakeRestoreFullscreenOnShow) {
                const enterPromise = waitForFullscreenEnter(window);
                window.setFullScreen(true);
                try {
                    await enterPromise;
                } catch {
                    // timeout — proceed anyway
                }
            }
            quakeRestoreFullscreenOnShow = false;
            window.focus();
            if (window.activeTabView?.webContents) {
                window.activeTabView.webContents.focus();
            }
        }
    } finally {
        quakeToggleInProgress = false;
    }
}

let currentRawGlobalHotKey: string = null;
let currentGlobalHotKey: string = null;

export function registerGlobalHotkey(rawGlobalHotKey: string) {
    if (rawGlobalHotKey === currentRawGlobalHotKey) {
        return;
    }
    if (currentGlobalHotKey != null) {
        globalShortcut.unregister(currentGlobalHotKey);
        currentGlobalHotKey = null;
        currentRawGlobalHotKey = null;
    }
    if (!rawGlobalHotKey) {
        return;
    }
    try {
        const electronHotKey = laspKeyToElectronKey(rawGlobalHotKey);
        const ok = globalShortcut.register(electronHotKey, () => {
            fireAndForget(quakeToggle);
        });
        currentRawGlobalHotKey = rawGlobalHotKey;
        currentGlobalHotKey = electronHotKey;
        console.log("registered globalhotkey", rawGlobalHotKey, "=>", electronHotKey, "ok=", ok);
    } catch (e) {
        console.log("error registering global hotkey", rawGlobalHotKey, ":", e);
    }
}

export function initGlobalHotkeyEventSubscription() {
    laspEventSubscribeSingle({
        eventType: "config",
        handler: (event) => {
            try {
                const hotkey = event?.data?.fullconfig?.settings?.["app:globalhotkey"];
                registerGlobalHotkey(hotkey ?? null);
            } catch (e) {
                console.log("error handling config event for globalhotkey", e);
            }
        },
    });
}
