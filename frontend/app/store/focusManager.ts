// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { laspAIHasFocusWithin } from "@/app/aipanel/laspai-focus-utils";
import { LaspAIModel } from "@/app/aipanel/laspai-model";
import { getBlockComponentModel } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { getLayoutModelForStaticTab } from "@/layout/index";
import { focusedBlockId } from "@/util/focusutil";
import { Atom, atom, type PrimitiveAtom } from "jotai";

export type FocusStrType = "node" | "laspai";

export class FocusManager {
    private static instance: FocusManager | null = null;

    focusType: PrimitiveAtom<FocusStrType> = atom("node");
    blockFocusAtom: Atom<string | null>;

    private constructor() {
        this.blockFocusAtom = atom((get) => {
            if (get(this.focusType) == "laspai") {
                return null;
            }
            const layoutModel = getLayoutModelForStaticTab();
            const lnode = get(layoutModel.focusedNode);
            return lnode?.data?.blockId;
        });
    }

    static getInstance(): FocusManager {
        if (!FocusManager.instance) {
            FocusManager.instance = new FocusManager();
        }
        return FocusManager.instance;
    }

    setLaspAIFocused(force: boolean = false) {
        const isAlreadyFocused = globalStore.get(this.focusType) == "laspai";
        if (!force && isAlreadyFocused) {
            return;
        }
        globalStore.set(this.focusType, "laspai");
        this.refocusNode();
    }

    setBlockFocus(force: boolean = false) {
        const ftype = globalStore.get(this.focusType);
        if (!force && ftype == "node") {
            return;
        }
        globalStore.set(this.focusType, "node");
        this.refocusNode();
    }

    laspAIFocusWithin(): boolean {
        return laspAIHasFocusWithin();
    }

    nodeFocusWithin(): boolean {
        return focusedBlockId() != null;
    }

    requestNodeFocus(): void {
        globalStore.set(this.focusType, "node");
    }

    requestLaspAIFocus(): void {
        globalStore.set(this.focusType, "laspai");
    }

    getFocusType(): FocusStrType {
        return globalStore.get(this.focusType);
    }

    refocusNode() {
        const ftype = globalStore.get(this.focusType);
        if (ftype == "laspai") {
            LaspAIModel.getInstance().focusInput();
            return;
        }
        const layoutModel = getLayoutModelForStaticTab();
        const lnode = globalStore.get(layoutModel.focusedNode);
        if (lnode == null || lnode.data?.blockId == null) {
            return;
        }
        layoutModel.focusNode(lnode.id);
        const blockId = lnode.data.blockId;
        const bcm = getBlockComponentModel(blockId);
        const ok = bcm?.viewModel?.giveFocus?.();
        if (!ok) {
            const inputElem = document.getElementById(`${blockId}-dummy-focus`);
            inputElem?.focus();
        }
    }
}
