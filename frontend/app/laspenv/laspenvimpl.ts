// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ContextMenuModel } from "@/app/store/contextmenu";
import { AllServiceImpls } from "@/app/store/services";
import {
    atoms,
    createBlock,
    getBlockMetaKeyAtom,
    getConfigBackgroundAtom,
    getConnConfigKeyAtom,
    getConnStatusAtom,
    getLocalHostDisplayNameAtom,
    getSettingsKeyAtom,
    getTabMetaKeyAtom,
    isDev,
    WOS,
} from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { LaspEnv } from "@/app/laspenv/laspenv";
import { isMacOS, isWindows, PLATFORM } from "@/util/platformutil";

export function makeLaspEnvImpl(): LaspEnv {
    return {
        isMock: false,
        electron: (window as any).api,
        rpc: RpcApi,
        getSettingsKeyAtom,
        platform: PLATFORM,
        isDev,
        isWindows,
        isMacOS,
        atoms,
        createBlock,
        services: AllServiceImpls,
        callBackendService: WOS.callBackendService,
        showContextMenu: (menu: ContextMenuItem[], e: React.MouseEvent) => {
            ContextMenuModel.getInstance().showContextMenu(menu, e);
        },
        getConnStatusAtom,
        getLocalHostDisplayNameAtom,
        wos: {
            getLaspObjectAtom: WOS.getLaspObjectAtom,
            getLaspObjectLoadingAtom: WOS.getLaspObjectLoadingAtom,
            isLaspObjectNullAtom: WOS.isLaspObjectNullAtom,
            useLaspObjectValue: WOS.useLaspObjectValue,
        },
        getBlockMetaKeyAtom,
        getTabMetaKeyAtom,
        getConfigBackgroundAtom,
        getConnConfigKeyAtom,

        mockSetLaspObj: <T extends LaspObj>(_oref: string, _obj: T) => {
            throw new Error("mockSetLaspObj is only available in the preview server");
        },
        mockModels: new Map<any, any>(),
    };
}
