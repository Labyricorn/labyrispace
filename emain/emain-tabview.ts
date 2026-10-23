import { openExternal } from "./vendor-network";
// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.

import { RpcApi } from "@/app/store/wshclientapi";
import { adaptFromElectronKeyEvent, checkKeyPressed } from "@/util/keyutil";
import { CHORD_TIMEOUT } from "@/util/sharedconst";
import { Rectangle, shell, WebContentsView } from "electron";
import { createNewLaspWindow, getLaspWindowById } from "emain/emain-window";
import path from "path";
import { isExtWidgetWebContents } from "./emain-extwidget";
import { AppSessionPartition, registerAppWebContents, unregisterAppWebContents } from "./emain-appcontents";
import { getElectronAppBasePath, isDevVite, unamePlatform } from "./emain-platform";
import {
    decreaseZoomLevel,
    handleCtrlShiftFocus,
    handleCtrlShiftState,
    increaseZoomLevel,
    resetZoomLevel,
    shFrameNavHandler,
    shNavHandler,
} from "./emain-util";
import { ElectronWshClient } from "./emain-wsh";

function handleWindowsMenuAccelerators(
    laspEvent: LaspKeyboardEvent,
    tabView: LaspTabView,
    fullConfig: FullConfigType
): boolean {
    const laspWindow = getLaspWindowById(tabView.laspWindowId);

    if (checkKeyPressed(laspEvent, "Ctrl:Shift:n")) {
        createNewLaspWindow();
        return true;
    }

    if (checkKeyPressed(laspEvent, "Ctrl:Shift:r")) {
        tabView.webContents.reloadIgnoringCache();
        return true;
    }

    if (checkKeyPressed(laspEvent, "Ctrl:v")) {
        const ctrlVPaste = fullConfig?.settings?.["app:ctrlvpaste"];
        const shouldPaste = ctrlVPaste ?? true;
        if (!shouldPaste) {
            return false;
        }
        tabView.webContents.paste();
        return true;
    }

    if (checkKeyPressed(laspEvent, "Ctrl:0")) {
        resetZoomLevel(tabView.webContents);
        return true;
    }

    if (checkKeyPressed(laspEvent, "Ctrl:=") || checkKeyPressed(laspEvent, "Ctrl:Shift:=")) {
        increaseZoomLevel(tabView.webContents);
        return true;
    }

    if (checkKeyPressed(laspEvent, "Ctrl:-") || checkKeyPressed(laspEvent, "Ctrl:Shift:-")) {
        decreaseZoomLevel(tabView.webContents);
        return true;
    }

    if (checkKeyPressed(laspEvent, "F11")) {
        if (laspWindow) {
            laspWindow.setFullScreen(!laspWindow.isFullScreen());
        }
        return true;
    }

    for (let i = 1; i <= 9; i++) {
        if (checkKeyPressed(laspEvent, `Alt:Ctrl:${i}`)) {
            const workspaceNum = i - 1;
            RpcApi.WorkspaceListCommand(ElectronWshClient).then((workspaceList) => {
                if (workspaceList && workspaceNum < workspaceList.length) {
                    const workspace = workspaceList[workspaceNum];
                    if (laspWindow) {
                        laspWindow.switchWorkspace(workspace.workspacedata.oid);
                    }
                }
            });
            return true;
        }
    }

    if (checkKeyPressed(laspEvent, "Alt:Shift:i")) {
        tabView.webContents.toggleDevTools();
        return true;
    }

    return false;
}

function computeBgColor(fullConfig: FullConfigType): string {
    const settings = fullConfig?.settings;
    const isTransparent = settings?.["window:transparent"] ?? false;
    const isBlur = !isTransparent && (settings?.["window:blur"] ?? false);
    if (isTransparent) {
        return "#00000000";
    } else if (isBlur) {
        return "#00000000";
    } else {
        return "#222222";
    }
}

const wcIdToLaspTabMap = new Map<number, LaspTabView>();

export function getLaspTabViewByWebContentsId(webContentsId: number): LaspTabView {
    if (webContentsId == null) {
        return null;
    }
    return wcIdToLaspTabMap.get(webContentsId);
}

export class LaspTabView extends WebContentsView {
    laspWindowId: string; // this will be set for any tabviews that are initialized. (unset for the hot spare)
    isActiveTab: boolean;
    isLaspAIOpen: boolean;
    private _laspTabId: string; // always set, LaspTabViews are unique per tab
    lastUsedTs: number; // ts milliseconds
    createdTs: number; // ts milliseconds
    initPromise: Promise<void>;
    initResolve: () => void;
    savedInitOpts: LaspInitOpts;
    laspReadyPromise: Promise<void>;
    laspReadyResolve: () => void;
    isInitialized: boolean = false;
    isLaspReady: boolean = false;
    isDestroyed: boolean = false;
    keyboardChordMode: boolean = false;
    resetChordModeTimeout: NodeJS.Timeout = null;

    constructor(fullConfig: FullConfigType) {
        console.log("createBareTabView");
        super({
            webPreferences: {
                preload: path.join(getElectronAppBasePath(), "preload", "index.cjs"),
                webviewTag: true,
                partition: AppSessionPartition,
            },
        });
        this.createdTs = Date.now();
        this.isLaspAIOpen = false;
        this.savedInitOpts = null;
        this.initPromise = new Promise((resolve, _) => {
            this.initResolve = resolve;
        });
        this.initPromise.then(() => {
            this.isInitialized = true;
            console.log("tabview init", Date.now() - this.createdTs + "ms");
        });
        this.laspReadyPromise = new Promise((resolve, _) => {
            this.laspReadyResolve = resolve;
        });
        this.laspReadyPromise.then(() => {
            this.isLaspReady = true;
        });
        const wcId = this.webContents.id;
        wcIdToLaspTabMap.set(wcId, this);
        registerAppWebContents(wcId);
        if (isDevVite) {
            this.webContents.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`);
        } else {
            this.webContents.loadFile(path.join(getElectronAppBasePath(), "frontend", "index.html"));
        }
        this.webContents.on("destroyed", () => {
            wcIdToLaspTabMap.delete(wcId);
            unregisterAppWebContents(wcId);
            removeLaspTabView(this.laspTabId);
            this.isDestroyed = true;
        });
        this.setBackgroundColor(computeBgColor(fullConfig));
    }

    get laspTabId(): string {
        return this._laspTabId;
    }

    set laspTabId(laspTabId: string) {
        this._laspTabId = laspTabId;
    }

    setKeyboardChordMode(mode: boolean) {
        this.keyboardChordMode = mode;
        if (mode) {
            if (this.resetChordModeTimeout) {
                clearTimeout(this.resetChordModeTimeout);
            }
            this.resetChordModeTimeout = setTimeout(() => {
                this.keyboardChordMode = false;
            }, CHORD_TIMEOUT);
        } else {
            if (this.resetChordModeTimeout) {
                clearTimeout(this.resetChordModeTimeout);
                this.resetChordModeTimeout = null;
            }
        }
    }

    positionTabOnScreen(winBounds: Rectangle) {
        const curBounds = this.getBounds();
        if (
            curBounds.width == winBounds.width &&
            curBounds.height == winBounds.height &&
            curBounds.x == 0 &&
            curBounds.y == 0
        ) {
            return;
        }
        this.setBounds({ x: 0, y: 0, width: winBounds.width, height: winBounds.height });
    }

    positionTabOffScreen(winBounds: Rectangle) {
        this.setBounds({
            x: -15000,
            y: -15000,
            width: winBounds.width,
            height: winBounds.height,
        });
    }

    isOnScreen() {
        const bounds = this.getBounds();
        return bounds.x == 0 && bounds.y == 0;
    }

    destroy() {
        console.log("destroy tab", this.laspTabId);
        removeLaspTabView(this.laspTabId);
        if (!this.isDestroyed) {
            this.webContents?.close();
        }
        this.isDestroyed = true;
    }
}

let MaxCacheSize = 10;
const wcvCache = new Map<string, LaspTabView>();

export function setMaxTabCacheSize(size: number) {
    console.log("setMaxTabCacheSize", size);
    MaxCacheSize = size;
}

export function getLaspTabView(laspTabId: string): LaspTabView | undefined {
    const rtn = wcvCache.get(laspTabId);
    if (rtn) {
        rtn.lastUsedTs = Date.now();
    }
    return rtn;
}

function tryEvictEntry(laspTabId: string): boolean {
    const tabView = wcvCache.get(laspTabId);
    if (!tabView) {
        return false;
    }
    if (tabView.isActiveTab) {
        return false;
    }
    const lastUsedDiff = Date.now() - tabView.lastUsedTs;
    if (lastUsedDiff < 1000) {
        return false;
    }
    const ww = getLaspWindowById(tabView.laspWindowId);
    if (!ww) {
        // this shouldn't happen, but if it does, just destroy the tabview
        console.log("[error] LaspWindow not found for LaspTabView", tabView.laspTabId);
        tabView.destroy();
        return true;
    } else {
        // will trigger a destroy on the tabview
        ww.removeTabView(tabView.laspTabId, false);
        return true;
    }
}

function checkAndEvictCache(): void {
    if (wcvCache.size <= MaxCacheSize) {
        return;
    }
    const sorted = Array.from(wcvCache.values()).sort((a, b) => {
        // Prioritize entries which are active
        if (a.isActiveTab && !b.isActiveTab) {
            return -1;
        }
        // Otherwise, sort by lastUsedTs
        return a.lastUsedTs - b.lastUsedTs;
    });
    for (let i = 0; i < sorted.length - MaxCacheSize; i++) {
        tryEvictEntry(sorted[i].laspTabId);
    }
}

export function clearTabCache() {
    const wcVals = Array.from(wcvCache.values());
    for (let i = 0; i < wcVals.length; i++) {
        const tabView = wcVals[i];
        tryEvictEntry(tabView.laspTabId);
    }
}

// returns [tabview, initialized]
export async function getOrCreateWebViewForTab(laspWindowId: string, tabId: string): Promise<[LaspTabView, boolean]> {
    let tabView = getLaspTabView(tabId);
    if (tabView) {
        return [tabView, true];
    }
    const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
    tabView = getSpareTab(fullConfig);
    tabView.laspWindowId = laspWindowId;
    tabView.lastUsedTs = Date.now();
    setLaspTabView(tabId, tabView);
    tabView.laspTabId = tabId;
    tabView.webContents.on("will-navigate", shNavHandler);
    tabView.webContents.on("will-frame-navigate", shFrameNavHandler);
    tabView.webContents.on("did-attach-webview", (event, wc) => {
        wc.setWindowOpenHandler((details) => {
            if (isExtWidgetWebContents(wc)) {
                return { action: "deny" };
            }
            if (wc == null || wc.isDestroyed() || tabView.webContents == null || tabView.webContents.isDestroyed()) {
                return { action: "deny" };
            }
            tabView.webContents.send("webview-new-window", wc.id, details);
            return { action: "deny" };
        });
    });
    tabView.webContents.on("before-input-event", (e, input) => {
        const laspEvent = adaptFromElectronKeyEvent(input);
        // console.log("WIN bie", tabView.laspTabId.substring(0, 8), laspEvent.type, laspEvent.code);
        handleCtrlShiftState(tabView.webContents, laspEvent);
        if (input.type == "keyDown" && tabView.keyboardChordMode) {
            e.preventDefault();
            tabView.setKeyboardChordMode(false);
            tabView.webContents.send("reinject-key", laspEvent);
            return;
        }

        if (unamePlatform === "win32" && input.type == "keyDown") {
            if (handleWindowsMenuAccelerators(laspEvent, tabView, fullConfig)) {
                e.preventDefault();
                return;
            }
        }
    });
    tabView.webContents.setWindowOpenHandler(({ url, frameName }) => {
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://")) {
            console.log("openExternal fallback", url);
            openExternal(url);
        }
        console.log("window-open denied", url);
        return { action: "deny" };
    });
    tabView.webContents.on("blur", () => {
        handleCtrlShiftFocus(tabView.webContents, false);
    });
    return [tabView, false];
}

export function setLaspTabView(laspTabId: string, wcv: LaspTabView): void {
    if (laspTabId == null) {
        return;
    }
    wcvCache.set(laspTabId, wcv);
    checkAndEvictCache();
}

function removeLaspTabView(laspTabId: string): void {
    if (laspTabId == null) {
        return;
    }
    wcvCache.delete(laspTabId);
}

let HotSpareTab: LaspTabView = null;

export function ensureHotSpareTab(fullConfig: FullConfigType) {
    console.log("ensureHotSpareTab");
    if (HotSpareTab == null) {
        HotSpareTab = new LaspTabView(fullConfig);
    }
}

export function getSpareTab(fullConfig: FullConfigType): LaspTabView {
    setTimeout(() => ensureHotSpareTab(fullConfig), 500);
    if (HotSpareTab != null) {
        const rtn = HotSpareTab;
        HotSpareTab = null;
        console.log("getSpareTab: returning hotspare");
        return rtn;
    } else {
        console.log("getSpareTab: creating new tab");
        return new LaspTabView(fullConfig);
    }
}
