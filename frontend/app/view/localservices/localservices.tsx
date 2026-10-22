// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { makeORef } from "@/app/store/wos";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { WaveEnv, WaveEnvSubset } from "@/app/waveenv/waveenv";
import { fireAndForget, stringToBase64 } from "@/util/util";
import * as jotai from "jotai";
import * as React from "react";
import { filterServices, sanitizeInsertText, scopeLabel, ServiceFilter } from "./localservices-util";

type LocalServicesEnv = WaveEnvSubset<{
    rpc: {
        LocalServicesListCommand: WaveEnv["rpc"]["LocalServicesListCommand"];
        ControllerInputCommand: WaveEnv["rpc"]["ControllerInputCommand"];
    };
    atoms: {
        staticTabId: WaveEnv["atoms"]["staticTabId"];
    };
    wos: {
        getWaveObjectAtom: WaveEnv["wos"]["getWaveObjectAtom"];
    };
}>;

type TerminalTarget = {
    blockId: string;
    label: string;
};

type ActionStatus = {
    message: string;
    isError: boolean;
};

const ButtonClass =
    "border border-white/20 rounded hover:bg-white/10 transition-colors cursor-pointer px-2 py-1 text-xs";
const ColumnsClass =
    "grid grid-cols-[48px_minmax(90px,1fr)_56px_minmax(90px,0.9fr)_minmax(90px,1.2fr)_124px] gap-2 items-center";

export class LocalServicesViewModel implements ViewModel {
    viewType = "localservices";
    blockId: string;
    env: LocalServicesEnv;

    viewIcon = jotai.atom<string>("plug");
    viewName = jotai.atom<string>("Local Services");
    noPadding = jotai.atom<boolean>(true);

    dataAtom = jotai.atom<ListResponse>(null) as jotai.PrimitiveAtom<ListResponse>;
    loadingAtom = jotai.atom<boolean>(false) as jotai.PrimitiveAtom<boolean>;
    errorAtom = jotai.atom<string>(null) as jotai.PrimitiveAtom<string>;
    filterAtom = jotai.atom<ServiceFilter>({
        text: "",
        tcp: true,
        udp: true,
        loopbackOnly: false,
    }) as jotai.PrimitiveAtom<ServiceFilter>;
    selectedTerminalAtom = jotai.atom<string>(null) as jotai.PrimitiveAtom<string>;
    actionStatusAtom = jotai.atom<ActionStatus>(null) as jotai.PrimitiveAtom<ActionStatus>;
    terminalsAtom: jotai.Atom<TerminalTarget[]>;

    disposed = false;
    fetchEpoch = 0;

    constructor({ blockId, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.env = waveEnv as LocalServicesEnv;
        this.terminalsAtom = jotai.atom((get) => {
            const tabId = get(this.env.atoms.staticTabId);
            const tab = tabId ? get(this.env.wos.getWaveObjectAtom<Tab>(makeORef("tab", tabId))) : null;
            const targets: TerminalTarget[] = [];
            for (const id of tab?.blockids ?? []) {
                const block = get(this.env.wos.getWaveObjectAtom<Block>(makeORef("block", id)));
                if (block?.meta?.view !== "term") {
                    continue;
                }
                const title = block.meta["frame:title"];
                targets.push({ blockId: id, label: title ? String(title) : `Terminal ${targets.length + 1}` });
            }
            return targets;
        });
        fireAndForget(() => this.refresh());
    }

    get viewComponent(): ViewComponent {
        return LocalServicesView;
    }

    async refresh() {
        if (this.disposed) {
            return;
        }
        const epoch = ++this.fetchEpoch;
        globalStore.set(this.loadingAtom, true);
        try {
            const resp = await this.env.rpc.LocalServicesListCommand(TabRpcClient);
            if (this.disposed || epoch !== this.fetchEpoch) {
                return;
            }
            globalStore.set(this.dataAtom, resp);
            globalStore.set(this.errorAtom, null);
        } catch (err) {
            if (this.disposed || epoch !== this.fetchEpoch) {
                return;
            }
            globalStore.set(this.errorAtom, err instanceof Error ? err.message : String(err));
        } finally {
            if (epoch === this.fetchEpoch) {
                globalStore.set(this.loadingAtom, false);
            }
        }
    }

    setStatus(message: string, isError: boolean) {
        globalStore.set(this.actionStatusAtom, { message, isError });
    }

    async copyEndpoint(svc: Service) {
        try {
            await navigator.clipboard.writeText(svc.endpoint);
            this.setStatus(`Copied ${svc.endpoint}`, false);
        } catch (err) {
            this.setStatus(`Could not copy: ${err instanceof Error ? err.message : String(err)}`, true);
        }
    }

    async insertEndpoint(svc: Service, blockId: string) {
        if (!blockId) {
            this.setStatus("Open a terminal in this tab first.", true);
            return;
        }
        const text = sanitizeInsertText(svc.endpoint);
        if (text === "") {
            this.setStatus("Nothing to insert.", true);
            return;
        }
        try {
            await this.env.rpc.ControllerInputCommand(TabRpcClient, {
                blockid: blockId,
                inputdata64: stringToBase64(text),
            });
            this.setStatus(`Inserted ${text} (not run)`, false);
        } catch (err) {
            this.setStatus(`Could not insert: ${err instanceof Error ? err.message : String(err)}`, true);
        }
    }

    dispose() {
        this.disposed = true;
    }
}

const ServiceRow = React.memo(
    ({ svc, model, terminalId }: { svc: Service; model: LocalServicesViewModel; terminalId: string }) => {
        const who =
            svc.identity === "known"
                ? `${svc.processname} (${svc.pid})`
                : svc.pid > 0
                  ? `Unavailable (${svc.pid})`
                  : "Unavailable";
        return (
            <div className={`${ColumnsClass} px-3 py-1 text-sm border-b border-white/5 hover:bg-white/5`}>
                <div className="font-mono text-xs uppercase">{svc.protocol}</div>
                <div className="font-mono truncate" title={svc.endpoint}>
                    {svc.address}
                </div>
                <div className="font-mono text-right">{svc.port}</div>
                <div className="text-muted-foreground truncate" title={scopeLabel(svc.scope)}>
                    {scopeLabel(svc.scope)}
                </div>
                <div className="truncate" title={svc.processpath || who}>
                    {who}
                </div>
                <div className="flex gap-1 justify-end">
                    <button className={ButtonClass} onClick={() => fireAndForget(() => model.copyEndpoint(svc))}>
                        Copy
                    </button>
                    <button
                        className={`${ButtonClass} ${terminalId ? "" : "opacity-40"}`}
                        disabled={!terminalId}
                        title={
                            terminalId
                                ? "Type the address into the selected terminal without running it"
                                : "No terminal in this tab"
                        }
                        onClick={() => fireAndForget(() => model.insertEndpoint(svc, terminalId))}
                    >
                        Insert
                    </button>
                </div>
            </div>
        );
    }
);
ServiceRow.displayName = "ServiceRow";

function LocalServicesView({ model }: ViewComponentProps<LocalServicesViewModel>) {
    const data = jotai.useAtomValue(model.dataAtom);
    const loading = jotai.useAtomValue(model.loadingAtom);
    const error = jotai.useAtomValue(model.errorAtom);
    const [filter, setFilter] = jotai.useAtom(model.filterAtom);
    const terminals = jotai.useAtomValue(model.terminalsAtom);
    const [selectedTerminal, setSelectedTerminal] = jotai.useAtom(model.selectedTerminalAtom);
    const status = jotai.useAtomValue(model.actionStatusAtom);

    React.useEffect(() => {
        return () => model.dispose();
    }, [model]);

    const visible = React.useMemo(() => filterServices(data?.services ?? [], filter), [data, filter]);
    const terminalId = terminals.some((t) => t.blockId === selectedTerminal)
        ? selectedTerminal
        : (terminals[0]?.blockId ?? null);
    const unavailable = (data?.services ?? []).filter((s) => s.identity !== "known").length;

    return (
        <div className="flex flex-col w-full h-full min-h-0">
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-white/10 text-sm">
                <input
                    className="bg-black/20 border border-white/15 rounded px-2 py-1 text-sm outline-none focus:border-accent w-48"
                    placeholder="Filter by port, process, address"
                    value={filter.text}
                    onChange={(e) => setFilter({ ...filter, text: e.target.value })}
                />
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={filter.tcp}
                        onChange={(e) => setFilter({ ...filter, tcp: e.target.checked })}
                    />
                    TCP
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={filter.udp}
                        onChange={(e) => setFilter({ ...filter, udp: e.target.checked })}
                    />
                    UDP
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={filter.loopbackOnly}
                        onChange={(e) => setFilter({ ...filter, loopbackOnly: e.target.checked })}
                    />
                    This computer only
                </label>
                <div className="flex items-center gap-2 ml-auto">
                    {terminals.length > 0 && (
                        <label className="flex items-center gap-1">
                            Insert into
                            <select
                                className="bg-black/20 border border-white/15 rounded px-1 py-0.5 text-sm"
                                value={terminalId ?? ""}
                                onChange={(e) => setSelectedTerminal(e.target.value)}
                            >
                                {terminals.map((t) => (
                                    <option key={t.blockId} value={t.blockId}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <button
                        className="bg-accent/80 text-primary rounded hover:bg-accent transition-colors cursor-pointer px-3 py-1 text-sm disabled:opacity-50"
                        disabled={loading}
                        onClick={() => fireAndForget(() => model.refresh())}
                    >
                        {loading ? "Refreshing..." : "Refresh"}
                    </button>
                </div>
            </div>
            {data && data.platform !== "windows" && (
                <div className="px-3 py-1 text-xs text-warning border-b border-white/10">
                    Local Services is built and tested for Windows. Results on {data.platform} may be incomplete.
                </div>
            )}
            {error && (
                <div className="px-3 py-2 text-sm text-red-400 border-b border-white/10">
                    Could not read local services: {error}
                </div>
            )}
            <div className={`${ColumnsClass} px-3 py-1 text-xs text-muted-foreground border-b border-white/10`}>
                <div>Type</div>
                <div>Address</div>
                <div className="text-right">Port</div>
                <div>Reachable from</div>
                <div>Process</div>
                <div></div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
                {visible.map((svc) => (
                    <ServiceRow
                        key={`${svc.protocol}|${svc.address}|${svc.port}|${svc.pid}`}
                        svc={svc}
                        model={model}
                        terminalId={terminalId}
                    />
                ))}
                {data && visible.length === 0 && !error && (
                    <div className="p-6 text-sm text-muted-foreground">
                        {(data.services ?? []).length === 0
                            ? "No listening TCP ports or UDP bindings were found."
                            : "Nothing matches the current filter."}
                    </div>
                )}
                {!data && !error && <div className="p-6 text-sm text-muted-foreground">Loading...</div>}
            </div>
            <div className="px-3 py-1 text-xs text-muted-foreground border-t border-white/10 flex flex-wrap gap-x-4">
                <span>
                    {visible.length} of {data?.services?.length ?? 0} shown
                </span>
                {data && <span>Updated {new Date(data.ts).toLocaleTimeString()}</span>}
                {unavailable > 0 && (
                    <span>
                        Process names are unavailable for {unavailable} (other users&apos; or protected processes).
                    </span>
                )}
                {status && <span className={status.isError ? "text-red-400" : "text-green-400"}>{status.message}</span>}
                <span>UDP entries are open sockets, not proof of a running service. No scheme is guessed.</span>
            </div>
        </div>
    );
}
