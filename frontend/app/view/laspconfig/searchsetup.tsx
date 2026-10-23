// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { LaspConfigViewModel } from "@/app/view/laspconfig/laspconfig-model";
import { useAtomValue } from "jotai";
import { memo, useEffect, useState } from "react";

const QueryToken = "{query}";
const CustomChoice = "custom";

const SearchChoices = [
    { id: "duckduckgo", label: "DuckDuckGo", template: "https://duckduckgo.com/?q={query}" },
    { id: "google", label: "Google", template: "https://www.google.com/search?q={query}" },
    { id: "bing", label: "Bing", template: "https://www.bing.com/search?q={query}" },
    { id: "brave", label: "Brave Search", template: "https://search.brave.com/search?q={query}" },
    { id: "startpage", label: "Startpage", template: "https://www.startpage.com/do/search?q={query}" },
];

const InputClass =
    "w-full bg-black/20 border border-white/15 rounded px-3 py-1.5 text-sm text-primary outline-none focus:border-accent";

function destinationHost(template: string): string {
    try {
        return new URL(template.replace(QueryToken, "x")).host;
    } catch {
        return null;
    }
}

function validateTemplate(template: string): string {
    if (!template.includes(QueryToken)) {
        return `The address must contain ${QueryToken} where the search words go.`;
    }
    if (destinationHost(template) == null || !/^https?:\/\//i.test(template)) {
        return "Enter a full http or https address.";
    }
    return null;
}

export const SearchSetupContent = memo(({ model }: { model: LaspConfigViewModel }) => {
    const current = useAtomValue(model.env.getSettingsKeyAtom("web:defaultsearch")) ?? "";
    const matched = SearchChoices.find((c) => c.template === current);
    const [choice, setChoice] = useState<string>(matched?.id ?? CustomChoice);
    const [custom, setCustom] = useState(matched ? "" : current);
    const [message, setMessage] = useState<{ ok: boolean; text: string }>(null);

    useEffect(() => {
        const found = SearchChoices.find((c) => c.template === current);
        setChoice(found?.id ?? CustomChoice);
        if (!found) setCustom(current);
    }, [current]);

    const apply = async (template: string) => {
        const problem = validateTemplate(template);
        if (problem) {
            setMessage({ ok: false, text: problem });
            return;
        }
        try {
            await model.env.rpc.SetConfigCommand(TabRpcClient, { "web:defaultsearch": template });
            setMessage({ ok: true, text: "Saved." });
        } catch (err) {
            setMessage({ ok: false, text: String(err) });
        }
    };

    const onChoice = (id: string) => {
        setChoice(id);
        const picked = SearchChoices.find((c) => c.id === id);
        if (picked) {
            apply(picked.template);
        }
    };

    const host = destinationHost(current);
    return (
        <div className="flex flex-col gap-4 p-6 overflow-y-auto h-full max-w-xl">
            <div>
                <div className="text-lg font-semibold">Web Search</div>
                <div className="text-sm text-muted-foreground">
                    When you type words instead of an address in a web widget, they are sent to this search engine.
                </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
                Search engine
                <select
                    className={InputClass}
                    value={choice}
                    onChange={(e) => onChoice(e.target.value)}
                >
                    {SearchChoices.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.label}
                        </option>
                    ))}
                    <option value={CustomChoice}>Custom address...</option>
                </select>
            </label>
            {choice === CustomChoice && (
                <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-sm">
                        Search address (use {QueryToken} for the search words)
                        <input
                            className={InputClass}
                            placeholder={`https://example.com/search?q=${QueryToken}`}
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                        />
                    </label>
                    <div>
                        <button
                            className="bg-accent/80 text-primary rounded hover:bg-accent transition-colors cursor-pointer px-3 py-1.5 text-sm"
                            onClick={() => apply(custom.trim())}
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}
            {host && (
                <div className="text-sm text-muted-foreground">
                    Searches from a web widget are sent to <span className="text-primary">{host}</span>. Empty
                    input and blank pages stay on this computer.
                </div>
            )}
            {message && <div className={`text-sm ${message.ok ? "text-green-400" : "text-red-400"}`}>{message.text}</div>}
        </div>
    );
});
SearchSetupContent.displayName = "SearchSetupContent";
