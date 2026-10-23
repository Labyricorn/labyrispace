// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { MetaKeyAtomFnType, LaspEnv, LaspEnvSubset } from "@/app/laspenv/laspenv";
import * as jotai from "jotai";
import * as React from "react";

type ExtWidgetEnv = LaspEnvSubset<{
    electron: {
        extWidgetGetManifest: LaspEnv["electron"]["extWidgetGetManifest"];
        extWidgetEnsureDownloads: LaspEnv["electron"]["extWidgetEnsureDownloads"];
    };
    getBlockMetaKeyAtom: MetaKeyAtomFnType<"ext:id">;
}>;

type LoadState =
    | { status: "loading" }
    | { status: "error"; errors: string[] }
    | { status: "ready"; load: ExtWidgetLoadResult; downloads: ExtWidgetDownloadStatus[] };

export class ExtWidgetViewModel implements ViewModel {
    viewType = "extwidget";
    blockId: string;
    env: ExtWidgetEnv;

    viewIcon = jotai.atom<string>("cube");
    viewName = jotai.atom<string>("Widget") as jotai.PrimitiveAtom<string>;
    noPadding = jotai.atom<boolean>(true);
    extIdAtom: jotai.Atom<string>;

    constructor({ blockId, laspEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.env = laspEnv as ExtWidgetEnv;
        this.extIdAtom = this.env.getBlockMetaKeyAtom(blockId, "ext:id");
    }

    get viewComponent(): ViewComponent {
        return ExtWidgetView;
    }
}

function downloadLabel(status: ExtWidgetDownloadStatus): string {
    switch (status.state) {
        case "ready":
            return "installed";
        case "declined":
            return "not installed (you declined)";
        case "failed":
            return `failed: ${status.message ?? "unknown error"}`;
    }
    return "not installed";
}

// Blocks draw their translucent background over the window color, so the widget is given the blended result.
function blockBackground(windowColor: string, blockColor: string): string {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx == null || windowColor === "") {
        return windowColor;
    }
    ctx.fillStyle = windowColor;
    ctx.fillRect(0, 0, 1, 1);
    if (blockColor !== "") {
        ctx.fillStyle = blockColor;
        ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
}

function appColorQuery(): string {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim();
    const params = new URLSearchParams({
        bg: blockBackground(read("--main-bg-color"), read("--block-bg-color")),
        text: read("--main-text-color"),
        dim: read("--secondary-text-color"),
        line: read("--border-color"),
        accent: read("--accent-color"),
    });
    return params.toString();
}

function ExtWidgetView({ model }: ViewComponentProps<ExtWidgetViewModel>) {
    const extId = jotai.useAtomValue(model.extIdAtom);
    const [state, setState] = React.useState<LoadState>({ status: "loading" });
    const [showDetails, setShowDetails] = React.useState(false);

    const load = React.useCallback(async () => {
        if (!extId) {
            setState({ status: "error", errors: ["this block has no widget id"] });
            return;
        }
        try {
            const result = await model.env.electron.extWidgetGetManifest(extId);
            if (!result.ok) {
                setState({ status: "error", errors: result.errors });
                return;
            }
            globalStore.set(model.viewName, result.manifest.name);
            const downloads = await model.env.electron.extWidgetEnsureDownloads(extId);
            setState({ status: "ready", load: result, downloads });
        } catch (err) {
            setState({ status: "error", errors: [err instanceof Error ? err.message : String(err)] });
        }
    }, [extId, model]);

    React.useEffect(() => {
        void load();
    }, [load]);

    if (state.status === "loading") {
        return <div className="p-6 text-sm text-muted-foreground">Loading widget...</div>;
    }
    if (state.status === "error") {
        return (
            <div className="p-6 text-sm">
                <div className="text-red-400 font-semibold mb-2">This widget could not be loaded.</div>
                <ul className="list-disc ml-5 text-muted-foreground">
                    {state.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                    ))}
                </ul>
            </div>
        );
    }
    const { manifest, entryUrl, partition, preloadUrl } = state.load;
    return (
        <div className="flex flex-col w-full h-full min-h-0">
            <div className="flex-1 min-h-0 relative">
                <webview
                    className="webview"
                    src={`${entryUrl}?${appColorQuery()}`}
                    partition={partition}
                    preload={preloadUrl}
                    webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no"
                />
            </div>
            <div className="border-t border-white/10 text-xs text-muted-foreground">
                <button
                    className="cursor-pointer px-3 py-1 hover:text-primary"
                    onClick={() => setShowDetails(!showDetails)}
                >
                    {manifest.name} {manifest.version} {showDetails ? "- hide details" : "- details"}
                </button>
                {showDetails && (
                    <div className="px-3 pb-2 flex flex-col gap-1">
                        <div>License: {manifest.license}</div>
                        {manifest.attribution && <div>{manifest.attribution}</div>}
                        <div>
                            Can use: {manifest.capabilities.length > 0 ? manifest.capabilities.join(", ") : "nothing"}
                        </div>
                        <div>
                            Allowed network:{" "}
                            {manifest.network.length > 0
                                ? manifest.network.map((n) => `${n.host} (${n.purpose})`).join(", ")
                                : "none"}
                        </div>
                        {manifest.installDownloads.map((dl) => {
                            const status = state.downloads.find((d) => d.id === dl.id);
                            return (
                                <div key={dl.id} className="flex items-center gap-2">
                                    <span>
                                        Download {dl.id}: {status ? downloadLabel(status) : "not installed"}
                                    </span>
                                    {status?.state !== "ready" && (
                                        <button
                                            className="cursor-pointer underline hover:text-primary"
                                            onClick={() => void load()}
                                        >
                                            Review and download
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
