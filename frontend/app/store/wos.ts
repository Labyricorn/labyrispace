// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// LaspObjectStore

import { isPreviewWindow } from "@/app/store/windowtype";
import { laspEventSubscribeSingle } from "@/app/store/wps";
import { getWebServerEndpoint } from "@/util/endpoints";
import { fetch } from "@/util/fetchutil";
import { fireAndForget } from "@/util/util";
import { atom, Atom, Getter, PrimitiveAtom, Setter, useAtomValue } from "jotai";
import { globalStore } from "./jotaiStore";
import { ObjectService } from "./services";

type LaspObjectDataItemType<T extends LaspObj> = {
    value: T;
    loading: boolean;
};

type LaspObjectValue<T extends LaspObj> = {
    pendingPromise: Promise<T>;
    dataAtom: PrimitiveAtom<LaspObjectDataItemType<T>>;
};

function splitORef(oref: string): [string, string] {
    const parts = oref.split(":");
    if (parts.length != 2) {
        throw new Error("invalid oref");
    }
    return [parts[0], parts[1]];
}

function isBlank(str: string): boolean {
    return str == null || str == "";
}

function isBlankNum(num: number): boolean {
    return num == null || isNaN(num) || num == 0;
}

function isValidLaspObj(val: LaspObj): boolean {
    if (val == null) {
        return false;
    }
    if (isBlank(val.otype) || isBlank(val.oid) || isBlankNum(val.version)) {
        return false;
    }
    return true;
}

function makeORef(otype: string, oid: string): string {
    if (isBlank(otype) || isBlank(oid)) {
        return null;
    }
    return `${otype}:${oid}`;
}

const previewMockObjects: Map<string, LaspObj> = new Map();

function mockObjectForPreview<T extends LaspObj>(oref: string, obj: T): void {
    if (!isPreviewWindow()) {
        throw new Error("mockObjectForPreview can only be called in a preview window");
    }
    previewMockObjects.set(oref, obj);
}

function GetObject<T>(oref: string): Promise<T> {
    if (isPreviewWindow()) {
        return Promise.resolve((previewMockObjects.get(oref) as T) ?? null);
    }
    return callBackendService("object", "GetObject", [oref], true);
}

function debugLogBackendCall(methodName: string, durationStr: string, args: any[]) {
    durationStr = "| " + durationStr;
    if (methodName == "object.UpdateObject" && args.length > 0) {
        console.log("[service] object.UpdateObject", args[0].otype, args[0].oid, durationStr, args[0]);
        return;
    }
    if (methodName == "object.GetObject" && args.length > 0) {
        console.log("[service] object.GetObject", args[0], durationStr);
        return;
    }
    if (methodName == "file.StatFile" && args.length >= 2) {
        console.log("[service] file.StatFile", args[1], durationStr);
        return;
    }
    console.log("[service]", methodName, durationStr);
}

function wpsSubscribeToObject(oref: string): () => void {
    return laspEventSubscribeSingle({
        eventType: "laspobj:update",
        scope: oref,
        handler: (event) => {
            updateLaspObject(event.data);
        },
    });
}

function callBackendService(service: string, method: string, args: any[], noUIContext?: boolean): Promise<any> {
    const startTs = Date.now();
    let uiContext: UIContext = null;
    if (!noUIContext && globalThis.window != null) {
        uiContext = globalStore.get(((window as any).globalAtoms as GlobalAtomsType).uiContext);
    }
    const laspCall: WebCallType = {
        service: service,
        method: method,
        args: args,
        uicontext: uiContext,
    };
    // usp is just for debugging (easier to filter URLs)
    const methodName = `${service}.${method}`;
    const usp = new URLSearchParams();
    usp.set("service", service);
    usp.set("method", method);
    const webEndpoint = getWebServerEndpoint();
    if (webEndpoint == null) throw new Error(`cannot call ${methodName}: no web endpoint`);
    const url = webEndpoint + "/lasp/service?" + usp.toString();
    const fetchPromise = fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(laspCall),
    });
    const prtn = fetchPromise
        .then((resp) => {
            if (!resp.ok) {
                throw new Error(`call ${methodName} failed: ${resp.status} ${resp.statusText}`);
            }
            return resp.json();
        })
        .then((respData: WebReturnType) => {
            if (respData == null) {
                return null;
            }
            if (respData.updates != null) {
                updateLaspObjects(respData.updates);
            }
            if (respData.error != null) {
                throw new Error(`call ${methodName} error: ${respData.error}`);
            }
            const durationStr = Date.now() - startTs + "ms";
            debugLogBackendCall(methodName, durationStr, args);
            return respData.data;
        });
    return prtn;
}

const laspObjectValueCache = new Map<string, LaspObjectValue<any>>();

function reloadLaspObject<T extends LaspObj>(oref: string): Promise<T> {
    let wov = laspObjectValueCache.get(oref);
    if (wov === undefined) {
        wov = getLaspObjectValue<T>(oref, true);
        return wov.pendingPromise;
    }
    const prtn = GetObject<T>(oref);
    prtn.then((val) => {
        globalStore.set(wov.dataAtom, { value: val, loading: false });
    });
    return prtn;
}

function createLaspValueObject<T extends LaspObj>(oref: string, shouldFetch: boolean): LaspObjectValue<T> {
    const wov = { pendingPromise: null, dataAtom: null };
    wov.dataAtom = atom({ value: null, loading: true });
    if (!shouldFetch) {
        return wov;
    }
    const startTs = Date.now();
    const localPromise = GetObject<T>(oref);
    wov.pendingPromise = localPromise;
    localPromise.then((val) => {
        if (wov.pendingPromise != localPromise) {
            return;
        }
        const [otype, oid] = splitORef(oref);
        if (val != null) {
            if (val["otype"] != otype) {
                throw new Error("GetObject returned wrong type");
            }
            if (val["oid"] != oid) {
                throw new Error("GetObject returned wrong id");
            }
        }
        wov.pendingPromise = null;
        globalStore.set(wov.dataAtom, { value: val, loading: false });
        console.log("LaspObj resolved", oref, Date.now() - startTs + "ms");
    });
    return wov;
}

function getLaspObjectValue<T extends LaspObj>(oref: string, createIfMissing = true): LaspObjectValue<T> {
    let wov = laspObjectValueCache.get(oref);
    if (wov === undefined && createIfMissing) {
        wov = createLaspValueObject(oref, true);
        laspObjectValueCache.set(oref, wov);
    }
    return wov;
}

function loadAndPinLaspObject<T extends LaspObj>(oref: string): Promise<T> {
    const wov = getLaspObjectValue<T>(oref);
    if (wov.pendingPromise == null) {
        const dataValue = globalStore.get(wov.dataAtom);
        return Promise.resolve(dataValue.value);
    }
    return wov.pendingPromise;
}

const laspObjectDerivedAtomCache = new Map<string, Atom<any>>();

function getLaspObjectAtom<T extends LaspObj>(oref: string): Atom<T> {
    const cacheKey = oref + ":value";
    let cachedAtom = laspObjectDerivedAtomCache.get(cacheKey) as Atom<T>;
    if (cachedAtom != null) {
        return cachedAtom;
    }
    const wov = getLaspObjectValue<T>(oref);
    cachedAtom = atom((get) => get(wov.dataAtom).value);
    laspObjectDerivedAtomCache.set(cacheKey, cachedAtom);
    return cachedAtom;
}

function getLaspObjectLoadingAtom(oref: string): Atom<boolean> {
    const cacheKey = oref + ":loading";
    let cachedAtom = laspObjectDerivedAtomCache.get(cacheKey) as Atom<boolean>;
    if (cachedAtom != null) {
        return cachedAtom;
    }
    const wov = getLaspObjectValue(oref);
    cachedAtom = atom((get) => {
        const dataValue = get(wov.dataAtom);
        return dataValue.loading;
    });
    laspObjectDerivedAtomCache.set(cacheKey, cachedAtom);
    return cachedAtom;
}

function isLaspObjectNullAtom(oref: string): Atom<boolean> {
    const cacheKey = oref + ":isnull";
    let cachedAtom = laspObjectDerivedAtomCache.get(cacheKey) as Atom<boolean>;
    if (cachedAtom != null) {
        return cachedAtom;
    }
    cachedAtom = atom((get) => get(getLaspObjectAtom(oref)) == null);
    laspObjectDerivedAtomCache.set(cacheKey, cachedAtom);
    return cachedAtom;
}

function useLaspObjectValue<T extends LaspObj>(oref: string): [T, boolean] {
    const wov = getLaspObjectValue<T>(oref);
    const atomVal = useAtomValue(wov.dataAtom);
    return [atomVal.value, atomVal.loading];
}

function updateLaspObject(update: LaspObjUpdate) {
    if (update == null) {
        return;
    }
    const oref = makeORef(update.otype, update.oid);
    const wov = getLaspObjectValue(oref);
    if (update.updatetype == "delete") {
        console.log("LaspObj deleted", oref);
        globalStore.set(wov.dataAtom, { value: null, loading: false });
    } else {
        if (!isValidLaspObj(update.obj)) {
            console.log("invalid lasp object update", update);
            return;
        }
        const curValue: LaspObjectDataItemType<LaspObj> = globalStore.get(wov.dataAtom);
        if (curValue.value != null && curValue.value.version >= update.obj.version) {
            return;
        }
        console.log("LaspObj updated", oref);
        globalStore.set(wov.dataAtom, { value: update.obj, loading: false });
    }
    return;
}

function updateLaspObjects(vals: LaspObjUpdate[]) {
    for (const val of vals) {
        updateLaspObject(val);
    }
}

// gets the value of a LaspObject from the cache.
// should provide getFn if it is available (e.g. inside of a jotai atom)
// otherwise it will use the globalStore.get function
function getObjectValue<T extends LaspObj>(oref: string, getFn?: Getter): T {
    const wov = getLaspObjectValue<T>(oref);
    if (getFn == null) {
        getFn = globalStore.get;
    }
    const atomVal = getFn(wov.dataAtom);
    return atomVal.value;
}

// sets the value of a LaspObject in the cache.
// should provide setFn if it is available (e.g. inside of a jotai atom)
// otherwise it will use the globalStore.set function
function setObjectValue<T extends LaspObj>(value: T, setFn?: Setter, pushToServer?: boolean) {
    const oref = makeORef(value.otype, value.oid);
    const wov = getLaspObjectValue(oref, false);
    if (wov === undefined) {
        return;
    }
    if (setFn === undefined) {
        setFn = globalStore.set;
    }
    setFn(wov.dataAtom, { value: value, loading: false });
    if (pushToServer) {
        fireAndForget(() => ObjectService.UpdateObject(value, false));
    }
}

export {
    callBackendService,
    getObjectValue,
    getLaspObjectAtom,
    getLaspObjectLoadingAtom,
    isLaspObjectNullAtom,
    loadAndPinLaspObject,
    makeORef,
    mockObjectForPreview,
    reloadLaspObject,
    setObjectValue,
    splitORef,
    updateLaspObject,
    updateLaspObjects,
    useLaspObjectValue,
    wpsSubscribeToObject,
};
