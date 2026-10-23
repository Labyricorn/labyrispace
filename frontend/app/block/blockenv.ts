// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    ConnConfigKeyAtomFnType,
    MetaKeyAtomFnType,
    SettingsKeyAtomFnType,
    LaspEnv,
    LaspEnvSubset,
} from "@/app/laspenv/laspenv";

export type BlockEnv = LaspEnvSubset<{
    getSettingsKeyAtom: SettingsKeyAtomFnType<
        | "app:focusfollowscursor"
        | "app:showoverlayblocknums"
        | "term:showsplitbuttons"
        | "window:magnifiedblockblurprimarypx"
        | "window:magnifiedblockopacity"
    >;
    showContextMenu: LaspEnv["showContextMenu"];
    atoms: {
        modalOpen: LaspEnv["atoms"]["modalOpen"];
        controlShiftDelayAtom: LaspEnv["atoms"]["controlShiftDelayAtom"];
    };
    electron: {
        openExternal: LaspEnv["electron"]["openExternal"];
    };
    rpc: {
        ConnEnsureCommand: LaspEnv["rpc"]["ConnEnsureCommand"];
        ConnDisconnectCommand: LaspEnv["rpc"]["ConnDisconnectCommand"];
        ConnConnectCommand: LaspEnv["rpc"]["ConnConnectCommand"];
        SetConnectionsConfigCommand: LaspEnv["rpc"]["SetConnectionsConfigCommand"];
        DismissWshFailCommand: LaspEnv["rpc"]["DismissWshFailCommand"];
    };
    wos: LaspEnv["wos"];
    getConnStatusAtom: LaspEnv["getConnStatusAtom"];
    getLocalHostDisplayNameAtom: LaspEnv["getLocalHostDisplayNameAtom"];
    getConnConfigKeyAtom: ConnConfigKeyAtomFnType<"conn:wshenabled">;
    getBlockMetaKeyAtom: MetaKeyAtomFnType<
        | "frame:text"
        | "frame:activebordercolor"
        | "frame:bordercolor"
        | "view"
        | "connection"
        | "icon:color"
        | "frame:title"
        | "frame:icon"
    >;
    getTabMetaKeyAtom: MetaKeyAtomFnType<"bg:activebordercolor" | "bg:bordercolor" | "tab:background">;
    getConfigBackgroundAtom: LaspEnv["getConfigBackgroundAtom"];
}>;
