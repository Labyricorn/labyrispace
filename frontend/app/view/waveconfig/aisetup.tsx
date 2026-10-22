// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { base64ToString, stringToBase64 } from "@/util/util";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useState } from "react";

type ProviderId = "lmstudio" | "openai" | "anthropic";

type ProviderInfo = {
    id: ProviderId;
    label: string;
    blurb: string;
    modeKey: string;
    icon: string;
    order: number;
    secretName?: string;
    defaultEndpoint?: string;
    modelFilter?: RegExp;
};

const Providers: ProviderInfo[] = [
    {
        id: "lmstudio",
        label: "LM Studio",
        blurb: "Models running on this computer. No account or key needed. Start LM Studio's local server first.",
        modeKey: "ai-lmstudio",
        icon: "server",
        order: 10,
        defaultEndpoint: "http://localhost:1234/v1",
    },
    {
        id: "openai",
        label: "OpenAI",
        blurb: "Cloud models from OpenAI. You need an OpenAI API key.",
        modeKey: "ai-openai",
        icon: "cloud",
        order: 11,
        secretName: "OPENAI_KEY",
        modelFilter: /^(gpt-|o\d|chatgpt)/,
    },
    {
        id: "anthropic",
        label: "Anthropic",
        blurb: "Claude models from Anthropic. You need an Anthropic API key.",
        modeKey: "ai-anthropic",
        icon: "cloud",
        order: 12,
        secretName: "ANTHROPIC_KEY",
    },
];

const ChatSuffix = "/chat/completions";

type Status = { kind: "idle" | "busy" | "ok" | "error"; text: string };
type Modes = Record<string, any>;

const InputClass =
    "w-full bg-black/20 border border-white/15 rounded px-3 py-1.5 text-sm text-primary outline-none focus:border-accent";
const PrimaryButton =
    "bg-accent/80 text-primary rounded hover:bg-accent transition-colors cursor-pointer px-3 py-1.5 text-sm disabled:opacity-50";
const SecondaryButton =
    "border border-white/20 rounded hover:bg-white/10 transition-colors cursor-pointer px-3 py-1.5 text-sm disabled:opacity-50";

function errorText(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.replace(/^.*?(rpc error|error):\s*/i, "");
}

function statusClass(kind: Status["kind"]): string {
    if (kind === "ok") return "text-green-400";
    if (kind === "error") return "text-red-400";
    return "text-muted-foreground";
}

type CardProps = {
    model: WaveConfigViewModel;
    info: ProviderInfo;
    modes: Modes;
    hasKey: boolean;
    isDefault: boolean;
    saveModes: (next: Modes) => Promise<void>;
    refreshSecrets: () => Promise<void>;
    setDefault: (key: string) => Promise<void>;
};

const ProviderCard = memo(({ model, info, modes, hasKey, isDefault, saveModes, refreshSecrets, setDefault }: CardProps) => {
    const existing = modes[info.modeKey];
    const configured = existing != null;
    const [endpoint, setEndpoint] = useState(info.defaultEndpoint ?? "");
    const [apiKey, setApiKey] = useState("");
    const [modelName, setModelName] = useState("");
    const [models, setModels] = useState<string[]>([]);
    const [tools, setTools] = useState(true);
    const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });

    useEffect(() => {
        if (!existing) return;
        setModelName(existing["ai:model"] ?? "");
        const savedEndpoint: string = existing["ai:endpoint"] ?? "";
        if (info.id === "lmstudio" && savedEndpoint) {
            setEndpoint(savedEndpoint.endsWith(ChatSuffix) ? savedEndpoint.slice(0, -ChatSuffix.length) : savedEndpoint);
            setTools((existing["ai:capabilities"] ?? []).includes("tools"));
        }
    }, [existing, info.id]);

    const findModels = useCallback(async () => {
        setStatus({ kind: "busy", text: "Contacting " + info.label + "..." });
        try {
            const rtn = await model.env.rpc.AiListModelsCommand(TabRpcClient, {
                provider: info.id,
                endpoint: info.id === "lmstudio" ? endpoint : undefined,
                apitoken: apiKey.trim() || undefined,
                secretname: info.secretName,
            });
            let found = rtn?.models ?? [];
            if (info.modelFilter) {
                const filtered = found.filter((m) => info.modelFilter.test(m));
                found = filtered.length > 0 ? filtered : found;
            }
            setModels(found);
            if (found.length > 0 && modelName === "") setModelName(found[0]);
            setStatus({
                kind: "ok",
                text:
                    found.length > 0
                        ? `Connected. Found ${found.length} model${found.length === 1 ? "" : "s"}.`
                        : "Connected, but no models were listed. Load a model in LM Studio, or type a name.",
            });
        } catch (err) {
            setStatus({ kind: "error", text: errorText(err) });
        }
    }, [model, info, endpoint, apiKey, modelName]);

    const save = useCallback(async () => {
        const chosen = modelName.trim();
        if (chosen === "") {
            setStatus({ kind: "error", text: "Choose or type a model first." });
            return;
        }
        if (info.secretName && !hasKey && apiKey.trim() === "") {
            setStatus({ kind: "error", text: "Enter your API key first." });
            return;
        }
        setStatus({ kind: "busy", text: "Saving..." });
        try {
            if (info.secretName && apiKey.trim() !== "") {
                await model.env.rpc.SetSecretsCommand(TabRpcClient, { [info.secretName]: apiKey.trim() });
                await refreshSecrets();
            }
            const mode: Record<string, any> = {
                "display:name": `${info.label} - ${chosen}`,
                "display:order": info.order,
                "display:icon": info.icon,
                "ai:model": chosen,
            };
            if (info.id === "lmstudio") {
                const base = endpoint.trim().replace(/\/+$/, "");
                mode["ai:provider"] = "custom";
                mode["ai:apitype"] = "openai-chat";
                mode["ai:endpoint"] = base + ChatSuffix;
                mode["ai:capabilities"] = tools ? ["tools"] : [];
            } else {
                mode["ai:provider"] = info.id;
            }
            await saveModes({ ...modes, [info.modeKey]: mode });
            setApiKey("");
            setStatus({ kind: "ok", text: "Saved. It now appears in the AI Assistant's model menu." });
        } catch (err) {
            setStatus({ kind: "error", text: errorText(err) });
        }
    }, [model, info, modes, modelName, apiKey, hasKey, endpoint, tools, saveModes, refreshSecrets]);

    const remove = useCallback(async () => {
        const next = { ...modes };
        delete next[info.modeKey];
        try {
            await saveModes(next);
            setStatus({
                kind: "ok",
                text: info.secretName ? "Removed. Your saved key is still in Secrets." : "Removed.",
            });
        } catch (err) {
            setStatus({ kind: "error", text: errorText(err) });
        }
    }, [info, modes, saveModes]);

    const listId = `models-${info.id}`;
    return (
        <div className="border border-white/15 rounded-lg p-4 flex flex-col gap-3 bg-white/[0.03]">
            <div className="flex items-center gap-3">
                <i className={`fa-sharp fa-solid fa-${info.icon} text-accent`} />
                <div className="text-base font-semibold">{info.label}</div>
                {configured && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300">
                        {isDefault ? "Ready - default" : "Ready"}
                    </span>
                )}
                {!configured && <span className="text-xs px-2 py-0.5 rounded bg-white/10">Not set up</span>}
            </div>
            <div className="text-sm text-muted-foreground">{info.blurb}</div>
            {info.id === "lmstudio" && (
                <label className="flex flex-col gap-1 text-sm">
                    Server address
                    <input className={InputClass} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
                </label>
            )}
            {info.secretName && (
                <label className="flex flex-col gap-1 text-sm">
                    API key {hasKey && <span className="text-muted-foreground">(a key is saved; paste a new one to replace it)</span>}
                    <input
                        className={InputClass}
                        type="password"
                        autoComplete="off"
                        placeholder={hasKey ? "Saved" : "Paste your key"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
                Model
                <input
                    className={InputClass}
                    list={listId}
                    placeholder="Pick from the list or type a name"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                />
                <datalist id={listId}>
                    {models.map((m) => (
                        <option key={m} value={m} />
                    ))}
                </datalist>
            </label>
            {info.id === "lmstudio" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} />
                    This model supports tools (lets the assistant read terminals and files)
                </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button className={SecondaryButton} onClick={findModels} disabled={status.kind === "busy"}>
                    {info.id === "lmstudio" ? "Find models" : "Test key and find models"}
                </button>
                <button className={PrimaryButton} onClick={save} disabled={status.kind === "busy"}>
                    Save
                </button>
                {configured && !isDefault && (
                    <button className={SecondaryButton} onClick={() => setDefault(info.modeKey)}>
                        Use as default
                    </button>
                )}
                {configured && (
                    <button className={SecondaryButton} onClick={remove}>
                        Remove
                    </button>
                )}
            </div>
            {status.text !== "" && <div className={`text-sm ${statusClass(status.kind)}`}>{status.text}</div>}
        </div>
    );
});
ProviderCard.displayName = "ProviderCard";

export const AiSetupContent = memo(({ model }: { model: WaveConfigViewModel }) => {
    const defaultMode = useAtomValue(model.env.getSettingsKeyAtom("waveai:defaultmode"));
    const [modes, setModes] = useState<Modes>({});
    const [secretNames, setSecretNames] = useState<string[]>([]);
    const [loadError, setLoadError] = useState<string>(null);
    const [loaded, setLoaded] = useState(false);

    const refreshSecrets = useCallback(async () => {
        try {
            setSecretNames((await model.env.rpc.GetSecretsNamesCommand(TabRpcClient)) ?? []);
        } catch {
            setSecretNames([]);
        }
    }, [model]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const fileData = await model.env.rpc.FileReadCommand(TabRpcClient, {
                    info: { path: `${model.configDir}/waveai.json` },
                });
                const text = fileData?.data64 ? base64ToString(fileData.data64) : "";
                const parsed = text.trim() === "" ? {} : JSON.parse(text);
                if (!cancelled) setModes(parsed);
            } catch (err) {
                if (!cancelled) setLoadError(`Could not read the AI model settings: ${errorText(err)}`);
            }
            await refreshSecrets();
            if (!cancelled) setLoaded(true);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [model, refreshSecrets]);

    const saveModes = useCallback(
        async (next: Modes) => {
            const text = JSON.stringify(next, null, 2);
            await model.env.rpc.FileWriteCommand(TabRpcClient, {
                info: { path: `${model.configDir}/waveai.json` },
                data64: stringToBase64(text),
            });
            globalStore.set(model.fileContentAtom, text);
            globalStore.set(model.originalContentAtom, text);
            globalStore.set(model.hasEditedAtom, false);
            setModes(next);
            const usable = (key: string) => key != null && key !== "" && next[key] != null;
            if (!usable(defaultMode)) {
                const first = Providers.find((p) => next[p.modeKey] != null);
                await model.env.rpc.SetConfigCommand(TabRpcClient, { "waveai:defaultmode": first?.modeKey ?? "" });
            }
        },
        [model, defaultMode]
    );

    const setDefault = useCallback(
        async (key: string) => {
            await model.env.rpc.SetConfigCommand(TabRpcClient, { "waveai:defaultmode": key });
        },
        [model]
    );

    if (!loaded && !loadError) {
        return <div className="p-6 text-muted-foreground">Loading...</div>;
    }
    return (
        <div className="flex flex-col gap-4 p-6 overflow-y-auto h-full">
            <div>
                <div className="text-lg font-semibold">AI Assistant</div>
                <div className="text-sm text-muted-foreground">
                    Choose where the AI Assistant gets its answers. Nothing is contacted until you press a button
                    here or send a message. Keys are stored encrypted in Secrets.
                </div>
            </div>
            {loadError && <div className="text-sm text-red-400">{loadError}</div>}
            {Providers.map((info) => (
                <ProviderCard
                    key={info.id}
                    model={model}
                    info={info}
                    modes={modes}
                    hasKey={info.secretName != null && secretNames.includes(info.secretName)}
                    isDefault={defaultMode === info.modeKey}
                    saveModes={saveModes}
                    refreshSecrets={refreshSecrets}
                    setDefault={setDefault}
                />
            ))}
            <div className="text-xs text-muted-foreground">
                Need something else, like another provider or a custom address? Use the JSON tab.
            </div>
        </div>
    );
});
AiSetupContent.displayName = "AiSetupContent";
