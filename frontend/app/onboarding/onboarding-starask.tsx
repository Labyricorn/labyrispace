// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: replace vendor solicitation with local guidance.
import { Button } from "@/app/element/button";
export function StarAskPage({ onClose }: { onClose: () => void; page?: string }) {
    return (
        <div className="space-y-4 text-center p-6">
            <h2 className="text-2xl">Labyrispace is ready</h2>
            <p>
                Vendor services are disabled. Local Help describes terminals, windows, and configuring your own AI
                provider.
            </p>
            <Button onClick={onClose}>Continue</Button>
        </div>
    );
}
