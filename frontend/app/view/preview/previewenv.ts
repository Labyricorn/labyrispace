// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SettingsKeyAtomFnType, LaspEnv, LaspEnvSubset } from "@/app/laspenv/laspenv";

export type PreviewEnv = LaspEnvSubset<{
    electron: {
        onQuicklook: LaspEnv["electron"]["onQuicklook"];
    };
    rpc: {
        ConnEnsureCommand: LaspEnv["rpc"]["ConnEnsureCommand"];
        FileInfoCommand: LaspEnv["rpc"]["FileInfoCommand"];
        FileReadCommand: LaspEnv["rpc"]["FileReadCommand"];
        FileListStreamCommand: LaspEnv["rpc"]["FileListStreamCommand"];
        FileWriteCommand: LaspEnv["rpc"]["FileWriteCommand"];
        FileMoveCommand: LaspEnv["rpc"]["FileMoveCommand"];
        FileDeleteCommand: LaspEnv["rpc"]["FileDeleteCommand"];
        SetConfigCommand: LaspEnv["rpc"]["SetConfigCommand"];
        SetMetaCommand: LaspEnv["rpc"]["SetMetaCommand"];
        FetchSuggestionsCommand: LaspEnv["rpc"]["FetchSuggestionsCommand"];
        DisposeSuggestionsCommand: LaspEnv["rpc"]["DisposeSuggestionsCommand"];
        FileCopyCommand: LaspEnv["rpc"]["FileCopyCommand"];
        FileCreateCommand: LaspEnv["rpc"]["FileCreateCommand"];
        FileMkdirCommand: LaspEnv["rpc"]["FileMkdirCommand"];
    };
    atoms: {
        fullConfigAtom: LaspEnv["atoms"]["fullConfigAtom"];
    };
    services: {
        object: LaspEnv["services"]["object"];
    };
    wos: LaspEnv["wos"];
    getSettingsKeyAtom: SettingsKeyAtomFnType<"preview:showhiddenfiles" | "editor:fontsize" | "preview:defaultsort">;
    getConnStatusAtom: LaspEnv["getConnStatusAtom"];
}>;
