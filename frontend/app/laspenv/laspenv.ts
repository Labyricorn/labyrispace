// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { AllServiceImpls } from "@/app/store/services";
import { RpcApiType } from "@/app/store/wshclientapi";
import { Atom, PrimitiveAtom } from "jotai";
import React from "react";

export type MetaKeyAtomFnType<Keys extends keyof MetaType = keyof MetaType> = <T extends Keys>(
    id: string,
    key: T
) => Atom<MetaType[T]>;

export type ConnConfigKeyAtomFnType<Keys extends keyof ConnKeywords = keyof ConnKeywords> = <T extends Keys>(
    connName: string,
    key: T
) => Atom<ConnKeywords[T]>;

export type SettingsKeyAtomFnType<Keys extends keyof SettingsType = keyof SettingsType> = <T extends Keys>(
    key: T
) => Atom<SettingsType[T]>;

type OmitNever<T> = {
    [K in keyof T as [T[K]] extends [never] ? never : K]: T[K];
};

type Subset<T, U> = OmitNever<{
    [K in keyof T]: K extends keyof U ? T[K] : never;
}>;

type ComplexLaspEnvKeys = {
    rpc: LaspEnv["rpc"];
    electron: LaspEnv["electron"];
    atoms: LaspEnv["atoms"];
    wos: LaspEnv["wos"];
    services: LaspEnv["services"];
};

type LaspEnvMockFields = {
    isMock: LaspEnv["isMock"];
    mockSetLaspObj: LaspEnv["mockSetLaspObj"];
    mockModels: LaspEnv["mockModels"];
};

export type LaspEnvSubset<T> = LaspEnvMockFields &
    OmitNever<{
        [K in keyof T]: K extends keyof ComplexLaspEnvKeys
            ? Subset<T[K], ComplexLaspEnvKeys[K]>
            : K extends keyof LaspEnv
              ? T[K]
              : never;
    }>;

// default implementation for production is in ./laspenvimpl.ts
export type LaspEnv = {
    isMock: boolean;
    electron: ElectronApi;
    rpc: RpcApiType;
    platform: NodeJS.Platform;
    isDev: () => boolean;
    isWindows: () => boolean;
    isMacOS: () => boolean;
    atoms: GlobalAtomsType;
    createBlock: (blockDef: BlockDef, magnified?: boolean, ephemeral?: boolean) => Promise<string>;
    services: typeof AllServiceImpls;
    callBackendService: (service: string, method: string, args: any[], noUIContext?: boolean) => Promise<any>;
    showContextMenu: (menu: ContextMenuItem[], e: React.MouseEvent) => void;
    getConnStatusAtom: (conn: string) => PrimitiveAtom<ConnStatus>;
    getLocalHostDisplayNameAtom: () => Atom<string>;
    wos: {
        getLaspObjectAtom: <T extends LaspObj>(oref: string) => Atom<T>;
        getLaspObjectLoadingAtom: (oref: string) => Atom<boolean>;
        isLaspObjectNullAtom: (oref: string) => Atom<boolean>;
        useLaspObjectValue: <T extends LaspObj>(oref: string) => [T, boolean];
    };
    getSettingsKeyAtom: SettingsKeyAtomFnType;
    getBlockMetaKeyAtom: MetaKeyAtomFnType;
    getTabMetaKeyAtom: MetaKeyAtomFnType;
    getConnConfigKeyAtom: ConnConfigKeyAtomFnType;
    getConfigBackgroundAtom: (bgKey: string | null) => Atom<BackgroundConfigType>;

    // the mock fields are only usable in the preview server (may be be null or throw errors in production)
    mockSetLaspObj: <T extends LaspObj>(oref: string, obj: T) => void;
    mockModels: Map<any, any>;
};

export const LaspEnvContext = React.createContext<LaspEnv>(null);

type EnvContract<T> = {
    [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] : T[K] extends object ? EnvContract<T[K]> : T[K];
};

export function useLaspEnv<T extends EnvContract<LaspEnv> = LaspEnv>(): T {
    return React.useContext(LaspEnvContext) as T;
}
