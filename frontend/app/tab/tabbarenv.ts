// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SettingsKeyAtomFnType, LaspEnv, LaspEnvSubset } from "@/app/laspenv/laspenv";

export type TabBarEnv = LaspEnvSubset<{
    electron: {
        createTab: LaspEnv["electron"]["createTab"];
        closeTab: LaspEnv["electron"]["closeTab"];
        setActiveTab: LaspEnv["electron"]["setActiveTab"];
        showWorkspaceAppMenu: LaspEnv["electron"]["showWorkspaceAppMenu"];
        installAppUpdate: LaspEnv["electron"]["installAppUpdate"];
    };
    rpc: {
        SetConfigCommand: LaspEnv["rpc"]["SetConfigCommand"];
        SetMetaCommand: LaspEnv["rpc"]["SetMetaCommand"];
        UpdateTabNameCommand: LaspEnv["rpc"]["UpdateTabNameCommand"];
        UpdateWorkspaceTabIdsCommand: LaspEnv["rpc"]["UpdateWorkspaceTabIdsCommand"];
    };
    atoms: {
        fullConfigAtom: LaspEnv["atoms"]["fullConfigAtom"];
        hasConfigErrors: LaspEnv["atoms"]["hasConfigErrors"];
        staticTabId: LaspEnv["atoms"]["staticTabId"];
        isFullScreen: LaspEnv["atoms"]["isFullScreen"];
        zoomFactorAtom: LaspEnv["atoms"]["zoomFactorAtom"];
        reinitVersion: LaspEnv["atoms"]["reinitVersion"];
        updaterStatusAtom: LaspEnv["atoms"]["updaterStatusAtom"];
    };
    wos: LaspEnv["wos"];
    getSettingsKeyAtom: SettingsKeyAtomFnType<"app:hideaibutton" | "app:tabbar" | "tab:confirmclose" | "window:showmenubar">;
    showContextMenu: LaspEnv["showContextMenu"];
    mockSetLaspObj: LaspEnv["mockSetLaspObj"];
    isWindows: LaspEnv["isWindows"];
    isMacOS: LaspEnv["isMacOS"];
}>;
