// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MetaKeyAtomFnType, SettingsKeyAtomFnType, LaspEnv, LaspEnvSubset } from "@/app/laspenv/laspenv";

export type LaspConfigEnv = LaspEnvSubset<{
    electron: {
        getConfigDir: LaspEnv["electron"]["getConfigDir"];
        getPlatform: LaspEnv["electron"]["getPlatform"];
    };
    rpc: {
        FileInfoCommand: LaspEnv["rpc"]["FileInfoCommand"];
        FileReadCommand: LaspEnv["rpc"]["FileReadCommand"];
        FileWriteCommand: LaspEnv["rpc"]["FileWriteCommand"];
        SetMetaCommand: LaspEnv["rpc"]["SetMetaCommand"];
        SetConfigCommand: LaspEnv["rpc"]["SetConfigCommand"];
        AiListModelsCommand: LaspEnv["rpc"]["AiListModelsCommand"];
        GetSecretsLinuxStorageBackendCommand: LaspEnv["rpc"]["GetSecretsLinuxStorageBackendCommand"];
        GetSecretsNamesCommand: LaspEnv["rpc"]["GetSecretsNamesCommand"];
        GetSecretsCommand: LaspEnv["rpc"]["GetSecretsCommand"];
        SetSecretsCommand: LaspEnv["rpc"]["SetSecretsCommand"];
    };
    atoms: {
        fullConfigAtom: LaspEnv["atoms"]["fullConfigAtom"];
    };
    getBlockMetaKeyAtom: MetaKeyAtomFnType<"file">;
    getSettingsKeyAtom: SettingsKeyAtomFnType<"web:defaultsearch" | "laspai:defaultmode">;
    isWindows: LaspEnv["isWindows"];
}>;
