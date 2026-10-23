// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: local welcome, no vendor opt-in or links.

import { Button } from "@/app/element/button";
import { FlexiModal } from "@/app/modals/modal";
import { ClientModel } from "@/app/store/client-model";
import { disableGlobalKeybindings, enableGlobalKeybindings, globalRefocus } from "@/app/store/keymodel";
import { modalsModel } from "@/app/store/modalmodel";
import { ClientService } from "@/store/services";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

// Exported preview components retain their old signatures for the preview gallery.
const InitPage = (_props: { isCompact: boolean; telemetryUpdateFn: (value: boolean) => Promise<void> }) => (
    <div className="space-y-4">
        <h1 className="text-2xl">Welcome to Labyrispace</h1>
        <p>Lasp telemetry, diagnostic uploads, hosted AI, and upstream updates are disabled.</p>
        <p>Open terminals, arrange panels, and move terminals between windows using their header gear menus.</p>
        <p>
            Local Help contains the starting guide. External AI providers and terminal tools connect independently when
            you use them.
        </p>
    </div>
);
const NoTelemetryStarPage = (_props: { isCompact: boolean }) => <p>Vendor telemetry is disabled in Labyrispace.</p>;

const NewInstallOnboardingModal = () => {
    const client = useAtomValue(ClientModel.getInstance().clientAtom);
    const setOpen = useSetAtom(modalsModel.newInstallOnboardingOpen);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        disableGlobalKeybindings();
        return () => enableGlobalKeybindings();
    }, []);
    const begin = async () => {
        setBusy(true);
        try {
            // Legacy RPC name: only initializes the LOCAL starter layout and flag.
            // No vendor agreement or account request is made.
            if (!client?.tosagreed) await ClientService.AgreeTos();
            setOpen(false);
            setTimeout(globalRefocus, 10);
        } catch (e) {
            setError(String(e));
            setBusy(false);
        }
    };
    return (
        <FlexiModal className="w-[560px] max-w-full p-8 rounded-lg">
            <InitPage isCompact={false} telemetryUpdateFn={async () => {}} />
            {error && <p role="alert">{error}</p>}
            <Button className="mt-6" disabled={busy} onClick={begin}>
                {busy ? "Opening..." : "Open workspace"}
            </Button>
        </FlexiModal>
    );
};
NewInstallOnboardingModal.displayName = "NewInstallOnboardingModal";
export { InitPage, NewInstallOnboardingModal, NoTelemetryStarPage };
