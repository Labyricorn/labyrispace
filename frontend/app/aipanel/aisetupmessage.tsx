// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: replace vendor opt-in with a provider setup button.

import { cn, fireAndForget } from "@/util/util";
import { LaspAIModel } from "./laspai-model";

const AISetupMessage = ({ className }: { className?: string }) => (
    <div className={cn("flex flex-col items-center justify-center h-full p-8 text-center gap-4", className)}>
        <h2 className="text-2xl font-semibold">Set up the AI Assistant</h2>
        <p>Pick LM Studio on this computer, or OpenAI or Anthropic with your own API key.</p>
        <button
            className="bg-accent/80 text-primary rounded hover:bg-accent transition-colors cursor-pointer px-4 py-2"
            onClick={() => fireAndForget(() => LaspAIModel.getInstance().openLaspAIConfig())}
        >
            Set up AI Assistant
        </button>
        <p className="text-sm text-muted-foreground">
            Nothing is sent anywhere until you configure a provider and send a message. Terminal applications such as
            Claude Code, Codex, OpenCode, and Pi operate independently.
        </p>
    </div>
);
AISetupMessage.displayName = "AISetupMessage";
export { AISetupMessage };
