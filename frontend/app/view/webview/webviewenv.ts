// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MetaKeyAtomFnType, SettingsKeyAtomFnType, LaspEnv, LaspEnvSubset } from "@/app/laspenv/laspenv";

export type WebViewEnv = LaspEnvSubset<{
    electron: {
        openExternal: LaspEnv["electron"]["openExternal"];
        getWebviewPreload: LaspEnv["electron"]["getWebviewPreload"];
        clearWebviewStorage: LaspEnv["electron"]["clearWebviewStorage"];
        getConfigDir: LaspEnv["electron"]["getConfigDir"];
        setWebviewFocus: LaspEnv["electron"]["setWebviewFocus"];
    };
    rpc: {
        FetchSuggestionsCommand: LaspEnv["rpc"]["FetchSuggestionsCommand"];
        SetMetaCommand: LaspEnv["rpc"]["SetMetaCommand"];
        SetConfigCommand: LaspEnv["rpc"]["SetConfigCommand"];
    };
    wos: LaspEnv["wos"];
    createBlock: LaspEnv["createBlock"];
    getSettingsKeyAtom: SettingsKeyAtomFnType<"web:defaulturl" | "web:defaultsearch">;
    getBlockMetaKeyAtom: MetaKeyAtomFnType<
        "web:hidenav" | "web:useragenttype" | "web:zoom" | "web:partition" | "web:autoload"
    >;
}>;
