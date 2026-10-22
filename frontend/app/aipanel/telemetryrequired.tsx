// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: replace vendor opt-in with provider guidance.

import { cn } from "@/util/util";

const TelemetryRequiredMessage = ({ className }: { className?: string }) => (
    <div className={cn("flex flex-col items-center justify-center h-full p-8 text-center gap-4", className)}>
        <h2 className="text-2xl font-semibold">Configure an AI provider</h2>
        <p>Wave-hosted AI and telemetry are disabled in Labyrispace.</p>
        <p>
            Use the AI mode menu to configure your own provider or a local model. Provider requests go to the endpoint
            you select.
        </p>
        <p>Terminal applications such as Claude Code, Codex, OpenCode, and Pi operate independently.</p>
    </div>
);
TelemetryRequiredMessage.displayName = "TelemetryRequiredMessage";
export { TelemetryRequiredMessage };
