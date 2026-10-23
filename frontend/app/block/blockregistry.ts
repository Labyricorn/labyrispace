// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BlockNodeModel } from "@/app/block/blocktypes";
import type { TabModel } from "@/app/store/tab-model";
import { AiFileDiffViewModel } from "@/app/view/aifilediff/aifilediff";
import { LauncherViewModel } from "@/app/view/launcher/launcher";
import { PreviewModel } from "@/app/view/preview/preview-model";
import { ExtWidgetViewModel } from "@/app/view/extwidget/extwidget";
import { LocalServicesViewModel } from "@/app/view/localservices/localservices";
import { ProcessViewerViewModel } from "@/app/view/processviewer/processviewer";
import { SysinfoViewModel } from "@/app/view/sysinfo/sysinfo";
import { TsunamiViewModel } from "@/app/view/tsunami/tsunami";
import { VDomModel } from "@/app/view/vdom/vdom-model";
import { LaspEnv } from "@/app/laspenv/laspenv";
import { atom } from "jotai";
import { QuickTipsViewModel } from "../view/quicktipsview/quicktipsview";
import { LaspConfigViewModel } from "../view/laspconfig/laspconfig-model";
import { blockViewToIcon, blockViewToName } from "./blockutil";
import { HelpViewModel } from "@/view/helpview/helpview";
import { TermViewModel } from "@/view/term/term-model";
import { LaspAiModel } from "@/view/laspai/laspai";
import { WebViewModel } from "@/view/webview/webview";

const BlockRegistry: Map<string, ViewModelClass> = new Map();
BlockRegistry.set("term", TermViewModel);
BlockRegistry.set("preview", PreviewModel);
BlockRegistry.set("web", WebViewModel);
BlockRegistry.set("laspai", LaspAiModel);
BlockRegistry.set("cpuplot", SysinfoViewModel);
BlockRegistry.set("sysinfo", SysinfoViewModel);
BlockRegistry.set("vdom", VDomModel);
BlockRegistry.set("tips", QuickTipsViewModel);
BlockRegistry.set("help", HelpViewModel);
BlockRegistry.set("launcher", LauncherViewModel);
BlockRegistry.set("tsunami", TsunamiViewModel);
BlockRegistry.set("aifilediff", AiFileDiffViewModel);
BlockRegistry.set("laspconfig", LaspConfigViewModel);
BlockRegistry.set("processviewer", ProcessViewerViewModel);
BlockRegistry.set("localservices", LocalServicesViewModel);
BlockRegistry.set("extwidget", ExtWidgetViewModel);

function makeDefaultViewModel(viewType: string): ViewModel {
    const viewModel: ViewModel = {
        viewType: viewType,
        viewIcon: atom(blockViewToIcon(viewType)),
        viewName: atom(blockViewToName(viewType)),
        preIconButton: atom(null),
        endIconButtons: atom(null),
        viewComponent: null,
    };
    return viewModel;
}

function makeViewModel(
    blockId: string,
    blockView: string,
    nodeModel: BlockNodeModel,
    tabModel: TabModel,
    laspEnv: LaspEnv
): ViewModel {
    const ctor = BlockRegistry.get(blockView);
    if (ctor != null) {
        return new ctor({ blockId, nodeModel, tabModel, laspEnv });
    }
    return makeDefaultViewModel(blockView);
}

export { makeViewModel };
