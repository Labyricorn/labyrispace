// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useLaspEnv } from "@/app/laspenv/laspenv";
import * as React from "react";
import { MockLaspEnv, RpcHandlerType, RpcOverrides, RpcStreamHandlerType, RpcStreamOverrides } from "./mocklaspenv";

export function useRpcOverride<K extends keyof RpcOverrides>(command: K, handler: RpcHandlerType): void {
    const mockEnv = useLaspEnv() as MockLaspEnv;
    const registeredRef = React.useRef(false);
    if (!registeredRef.current) {
        registeredRef.current = true;
        mockEnv.addRpcOverride(command, handler);
    }
}

export function useRpcStreamOverride<K extends keyof RpcStreamOverrides>(command: K, handler: RpcStreamHandlerType): void {
    const mockEnv = useLaspEnv() as MockLaspEnv;
    const registeredRef = React.useRef(false);
    if (!registeredRef.current) {
        registeredRef.current = true;
        mockEnv.addRpcStreamOverride(command, handler);
    }
}
