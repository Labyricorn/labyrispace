// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.
// Modified by Labyricorn for Labyrispace: built-in local help replaces hosted docs.

import { WebViewModel } from "@/app/view/webview/webview";
import { atom } from "jotai";

class HelpViewModel extends WebViewModel {
    constructor(initOpts: ViewModelInitType) {
        super(initOpts);
        this.homepageUrl = atom("about:blank");
        this.viewType = "help";
        this.viewIcon = atom("circle-question");
        this.viewName = atom("Labyrispace Help");
        this.viewText = atom<HeaderElem[]>([]);
    }
    get viewComponent(): ViewComponent {
        return HelpView;
    }
    getSettingsMenuItems(): ContextMenuItem[] {
        return [];
    }
}
function HelpView() {
    return (
        <div className="h-full overflow-auto p-6 space-y-5 select-text">
            <h1 className="text-2xl">Labyrispace Help</h1>
            <p>
                Create another window with Ctrl+Shift+N. A terminal's gear menu offers �Move terminal to window�� for
                its destination window's active tab.
            </p>
            <p>
                Terminals, files, media previews, system monitoring, SSH, and layout storage use the local application
                backend.
            </p>
            <h2 className="text-xl">AI providers</h2>
            <p>
                Wave-hosted AI is disabled. Use the AI mode menu to configure a provider with your own credentials, or a
                local model endpoint. AI requests use your configured provider.
            </p>
            <h2 className="text-xl">Privacy and updates</h2>
            <p>
                Vendor telemetry, diagnostic pings, vendor web pages, and automatic updates are disabled. Install
                reviewed Labyrispace builds manually.
            </p>
            <p>
                This policy covers the host application. Programs run in terminals, SSH hosts, and permitted websites
                have their own network behavior.
            </p>
            <p>
                The project includes VENDOR-CONNECTIONS.md with the complete feature-impact report, plus LICENSE,
                NOTICE, and dependency acknowledgements.
            </p>
        </div>
    );
}
export { HelpViewModel };
