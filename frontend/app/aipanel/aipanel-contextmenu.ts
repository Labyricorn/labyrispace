// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { laspAIHasSelection } from "@/app/aipanel/laspai-focus-utils";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { isDev } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { fireAndForget } from "@/util/util";
import { LaspAIModel } from "./laspai-model";

const RecentChatsLimit = 15;

async function listRecentChats(): Promise<AIChatSummary[]> {
    try {
        const chats = await RpcApi.ListLaspAIChatsCommand(TabRpcClient, { limit: RecentChatsLimit });
        return chats ?? [];
    } catch (error) {
        console.error("Failed to list chats:", error);
        return [];
    }
}

export async function handleLaspAIContextMenu(e: React.MouseEvent, showCopy: boolean): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    const model = LaspAIModel.getInstance();
    const menu: ContextMenuItem[] = [];

    if (showCopy) {
        const hasSelection = laspAIHasSelection();
        if (hasSelection) {
            menu.push({
                role: "copy",
            });
            menu.push({ type: "separator" });
        }
    }

    menu.push({
        label: "New Chat",
        click: () => {
            model.clearChat();
        },
    });

    const recentChats = await listRecentChats();
    const currentChatId = model.getChatId();
    const historyItems: ContextMenuItem[] = recentChats.map((chat) => ({
        label: (chat.chatid === currentChatId ? "● " : "") + (chat.title || "(untitled chat)"),
        submenu: [
            {
                label: "Open",
                click: () => {
                    fireAndForget(() => model.openChat(chat.chatid, chat.aimode));
                },
            },
            {
                label: "Delete",
                click: () => {
                    fireAndForget(() => model.deleteChat(chat.chatid));
                },
            },
        ],
    }));
    menu.push({
        label: "Chat History",
        submenu: historyItems.length > 0 ? historyItems : [{ label: "No saved chats", enabled: false }],
    });

    menu.push({ type: "separator" });

    const rtInfo = await RpcApi.GetRTInfoCommand(TabRpcClient, {
        oref: model.orefContext,
    });

    const defaultTokens = model.inBuilder ? 24576 : 4096;
    const currentMaxTokens = rtInfo?.["laspai:maxoutputtokens"] ?? defaultTokens;

    const maxTokensSubmenu: ContextMenuItem[] = [];

    if (model.inBuilder) {
        maxTokensSubmenu.push(
            {
                label: "24k",
                type: "checkbox",
                checked: currentMaxTokens === 24576,
                click: () => {
                    RpcApi.SetRTInfoCommand(TabRpcClient, {
                        oref: model.orefContext,
                        data: { "laspai:maxoutputtokens": 24576 },
                    });
                },
            },
            {
                label: "64k",
                type: "checkbox",
                checked: currentMaxTokens === 65536,
                click: () => {
                    RpcApi.SetRTInfoCommand(TabRpcClient, {
                        oref: model.orefContext,
                        data: { "laspai:maxoutputtokens": 65536 },
                    });
                },
            }
        );
    } else {
        if (isDev()) {
            maxTokensSubmenu.push({
                label: "1k (Dev Testing)",
                type: "checkbox",
                checked: currentMaxTokens === 1024,
                click: () => {
                    RpcApi.SetRTInfoCommand(TabRpcClient, {
                        oref: model.orefContext,
                        data: { "laspai:maxoutputtokens": 1024 },
                    });
                },
            });
        }
        maxTokensSubmenu.push(
            {
                label: "4k",
                type: "checkbox",
                checked: currentMaxTokens === 4096,
                click: () => {
                    RpcApi.SetRTInfoCommand(TabRpcClient, {
                        oref: model.orefContext,
                        data: { "laspai:maxoutputtokens": 4096 },
                    });
                },
            },
            {
                label: "16k",
                type: "checkbox",
                checked: currentMaxTokens === 16384,
                click: () => {
                    RpcApi.SetRTInfoCommand(TabRpcClient, {
                        oref: model.orefContext,
                        data: { "laspai:maxoutputtokens": 16384 },
                    });
                },
            },
            {
                label: "64k",
                type: "checkbox",
                checked: currentMaxTokens === 65536,
                click: () => {
                    RpcApi.SetRTInfoCommand(TabRpcClient, {
                        oref: model.orefContext,
                        data: { "laspai:maxoutputtokens": 65536 },
                    });
                },
            }
        );
    }

    menu.push({
        label: "Max Output Tokens",
        submenu: maxTokensSubmenu,
    });

    menu.push({ type: "separator" });

    menu.push({
        label: "Configure Modes",
        click: () => {
            model.openLaspAIConfig();
        },
    });

    if (model.canCloseLaspAIPanel()) {
        menu.push({ type: "separator" });

        menu.push({
            label: "Hide AI Assistant",
            click: () => {
                model.closeLaspAIPanel();
            },
        });
    }

    ContextMenuModel.getInstance().showContextMenu(menu, e);
}
