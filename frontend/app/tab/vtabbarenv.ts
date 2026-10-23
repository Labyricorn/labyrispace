// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SettingsKeyAtomFnType, LaspEnv, LaspEnvSubset } from "@/app/laspenv/laspenv";

export type VTabBarEnv = LaspEnvSubset<{
    electron: {
        createTab: LaspEnv["electron"]["createTab"];
        closeTab: LaspEnv["electron"]["closeTab"];
        setActiveTab: LaspEnv["electron"]["setActiveTab"];
        deleteWorkspace: LaspEnv["electron"]["deleteWorkspace"];
        createWorkspace: LaspEnv["electron"]["createWorkspace"];
        switchWorkspace: LaspEnv["electron"]["switchWorkspace"];
        installAppUpdate: LaspEnv["electron"]["installAppUpdate"];
    };
    rpc: {
        UpdateWorkspaceTabIdsCommand: LaspEnv["rpc"]["UpdateWorkspaceTabIdsCommand"];
        UpdateTabNameCommand: LaspEnv["rpc"]["UpdateTabNameCommand"];
        SetConfigCommand: LaspEnv["rpc"]["SetConfigCommand"];
        SetMetaCommand: LaspEnv["rpc"]["SetMetaCommand"];
    };
    atoms: {
        staticTabId: LaspEnv["atoms"]["staticTabId"];
        fullConfigAtom: LaspEnv["atoms"]["fullConfigAtom"];
        reinitVersion: LaspEnv["atoms"]["reinitVersion"];
        documentHasFocus: LaspEnv["atoms"]["documentHasFocus"];
        workspace: LaspEnv["atoms"]["workspace"];
        updaterStatusAtom: LaspEnv["atoms"]["updaterStatusAtom"];
        isFullScreen: LaspEnv["atoms"]["isFullScreen"];
    };
    services: {
        workspace: LaspEnv["services"]["workspace"];
    };
    wos: LaspEnv["wos"];
    showContextMenu: LaspEnv["showContextMenu"];
    getSettingsKeyAtom: SettingsKeyAtomFnType<"tab:confirmclose" | "app:tabbar" | "app:hideaibutton">;
    mockSetLaspObj: LaspEnv["mockSetLaspObj"];
    isWindows: LaspEnv["isWindows"];
    isMacOS: LaspEnv["isMacOS"];
}>;
