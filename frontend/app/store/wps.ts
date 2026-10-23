// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WshClient } from "@/app/store/wshclient";
import { RpcApi } from "@/app/store/wshclientapi";
import { isPreviewWindow } from "@/app/store/windowtype";
import { isBlank } from "@/util/util";
import { Subject } from "rxjs";

let WpsRpcClient: WshClient;

function setWpsRpcClient(client: WshClient) {
    WpsRpcClient = client;
}

type LaspEventSubject<T extends LaspEventName = LaspEventName> = {
    handler: (event: Extract<LaspEvent, { event: T }>) => void;
    scope?: string;
};

type LaspEventSubjectContainer = {
    handler: (event: LaspEvent) => void;
    scope?: string;
    id: string;
};

type LaspEventSubscription<T extends LaspEventName = LaspEventName> = LaspEventSubject<T> & {
    eventType: T;
};

type LaspEventUnsubscribe = {
    id: string;
    eventType: string;
};

// key is "eventType" or "eventType|oref"
const fileSubjects = new Map<string, SubjectWithRef<WSFileEventData>>();
const laspEventSubjects = new Map<string, LaspEventSubjectContainer[]>();

function wpsReconnectHandler() {
    for (const eventType of laspEventSubjects.keys()) {
        updateLaspEventSub(eventType);
    }
}

function updateLaspEventSub(eventType: string) {
    if (isPreviewWindow()) {
        return;
    }
    const subjects = laspEventSubjects.get(eventType);
    if (subjects == null) {
        RpcApi.EventUnsubCommand(WpsRpcClient, eventType, { noresponse: true });
        return;
    }
    const subreq: SubscriptionRequest = { event: eventType, scopes: [], allscopes: false };
    for (const scont of subjects) {
        if (isBlank(scont.scope)) {
            subreq.allscopes = true;
            subreq.scopes = [];
            break;
        }
        subreq.scopes.push(scont.scope);
    }
    RpcApi.EventSubCommand(WpsRpcClient, subreq, { noresponse: true });
}

function laspEventSubscribeSingle<T extends LaspEventName>(subscription: LaspEventSubscription<T>): () => void {
    // console.log("laspEventSubscribeSingle", subscription);
    if (subscription.handler == null) {
        return () => {};
    }
    const id: string = crypto.randomUUID();
    let subjects = laspEventSubjects.get(subscription.eventType);
    if (subjects == null) {
        subjects = [];
        laspEventSubjects.set(subscription.eventType, subjects);
    }
    const subcont: LaspEventSubjectContainer = {
        id,
        handler: subscription.handler as (event: LaspEvent) => void,
        scope: subscription.scope,
    };
    subjects.push(subcont);
    updateLaspEventSub(subscription.eventType);
    return () => laspEventUnsubscribe({ id, eventType: subscription.eventType });
}

function laspEventUnsubscribe(...unsubscribes: LaspEventUnsubscribe[]) {
    const eventTypeSet = new Set<string>();
    for (const unsubscribe of unsubscribes) {
        const subjects = laspEventSubjects.get(unsubscribe.eventType);
        if (subjects == null) {
            return;
        }
        const idx = subjects.findIndex((s) => s.id === unsubscribe.id);
        if (idx === -1) {
            return;
        }
        subjects.splice(idx, 1);
        if (subjects.length === 0) {
            laspEventSubjects.delete(unsubscribe.eventType);
        }
        eventTypeSet.add(unsubscribe.eventType);
    }

    for (const eventType of eventTypeSet) {
        updateLaspEventSub(eventType);
    }
}

function getFileSubject(zoneId: string, fileName: string): SubjectWithRef<WSFileEventData> {
    const subjectKey = zoneId + "|" + fileName;
    let subject = fileSubjects.get(subjectKey);
    if (subject == null) {
        subject = new Subject<any>() as any;
        subject.refCount = 0;
        subject.release = () => {
            subject.refCount--;
            if (subject.refCount === 0) {
                subject.complete();
                fileSubjects.delete(subjectKey);
            }
        };
        fileSubjects.set(subjectKey, subject);
    }
    subject.refCount++;
    return subject;
}

function handleLaspEvent(event: LaspEvent) {
    // console.log("handleLaspEvent", event);
    const subjects = laspEventSubjects.get(event.event);
    if (subjects == null) {
        return;
    }
    for (const scont of subjects) {
        if (isBlank(scont.scope)) {
            scont.handler(event);
            continue;
        }
        if (event.scopes == null) {
            continue;
        }
        if (event.scopes.includes(scont.scope)) {
            scont.handler(event);
        }
    }
}

export {
    getFileSubject,
    handleLaspEvent,
    setWpsRpcClient,
    laspEventSubscribeSingle,
    laspEventUnsubscribe,
    wpsReconnectHandler,
};
