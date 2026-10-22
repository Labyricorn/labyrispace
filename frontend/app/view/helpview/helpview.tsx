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
            <h2 className="text-xl">Windows and terminals</h2>
            <p>
                Create another window with Ctrl+Shift+N. A terminal&apos;s gear menu offers &quot;Move terminal to
                window...&quot; to move it, with its running shell, into another window&apos;s active tab.
            </p>
            <h2 className="text-xl">Settings pages</h2>
            <p>
                Open settings from the sidebar. <b>AI Assistant</b> sets up LM Studio on this computer, or OpenAI or
                Anthropic with your own API key. <b>Web Search</b> chooses the search engine for web widgets. Keys are
                stored encrypted in Secrets.
            </p>
            <h2 className="text-xl">Local Services</h2>
            <p>
                The services widget lists the TCP ports and UDP bindings open on this computer, with the process that
                owns each. Copy puts an address on the clipboard. Insert types it into a terminal without running it.
            </p>
            <h2 className="text-xl">Web pages and the network</h2>
            <p>
                Saved web widgets on other sites wait until you press Load page. Remote images in documents wait for a
                click. Vendor telemetry, diagnostic pings, hosted AI, and automatic updates are removed. Programs run in
                terminals, SSH hosts, and the websites you open have their own network behavior.
            </p>
            <p>
                The project includes NETWORK-BEHAVIOR.md and VENDOR-CONNECTIONS.md with the details, plus LICENSE,
                NOTICE, and dependency acknowledgements.
            </p>
        </div>
    );
}
export { HelpViewModel };
