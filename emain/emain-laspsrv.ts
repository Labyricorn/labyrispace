// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as electron from "electron";
import * as child_process from "node:child_process";
import * as readline from "readline";
import { WebServerEndpointVarName, WSServerEndpointVarName } from "../frontend/util/endpoints";
import { AuthKey, LaspAuthKeyEnv } from "./authkey";
import { setForceQuit, setUserConfirmedQuit } from "./emain-activity";
import {
    getElectronAppResourcesPath,
    getElectronAppUnpackedBasePath,
    getLaspConfigDir,
    getLaspDataDir,
    getLaspSrvCwd,
    getLaspSrvPath,
    getXdgCurrentDesktop,
    LaspConfigHomeVarName,
    LaspDataHomeVarName,
} from "./emain-platform";
import {
    getElectronExecPath,
    LaspAppElectronExecPath,
    LaspAppPathVarName,
    LaspAppResourcesPathVarName,
} from "./emain-util";
import { updater } from "./updater";

let isLaspSrvDead = false;
let laspSrvProc: child_process.ChildProcessWithoutNullStreams | null = null;
let LaspVersion = "unknown"; // set by LASPSRV-ESTART
let LaspBuildTime = 0; // set by LASPSRV-ESTART

export function getLaspVersion(): { version: string; buildTime: number } {
    return { version: LaspVersion, buildTime: LaspBuildTime };
}

let laspSrvReadyResolve = (value: boolean) => {};
const laspSrvReady: Promise<boolean> = new Promise((resolve, _) => {
    laspSrvReadyResolve = resolve;
});

export function getLaspSrvReady(): Promise<boolean> {
    return laspSrvReady;
}

export function getLaspSrvProc(): child_process.ChildProcessWithoutNullStreams | null {
    return laspSrvProc;
}

export function getIsLaspSrvDead(): boolean {
    return isLaspSrvDead;
}

export function runLaspSrv(handleWSEvent: (evtMsg: WSEventType) => void): Promise<boolean> {
    let pResolve: (value: boolean) => void;
    let pReject: (reason?: any) => void;
    const rtnPromise = new Promise<boolean>((argResolve, argReject) => {
        pResolve = argResolve;
        pReject = argReject;
    });
    const envCopy = { ...process.env };
    const xdgCurrentDesktop = getXdgCurrentDesktop();
    if (xdgCurrentDesktop != null) {
        envCopy["XDG_CURRENT_DESKTOP"] = xdgCurrentDesktop;
    }
    envCopy[LaspAppPathVarName] = getElectronAppUnpackedBasePath();
    envCopy[LaspAppResourcesPathVarName] = getElectronAppResourcesPath();
    envCopy[LaspAppElectronExecPath] = getElectronExecPath();
    envCopy[LaspAuthKeyEnv] = AuthKey;
    envCopy[LaspDataHomeVarName] = getLaspDataDir();
    envCopy[LaspConfigHomeVarName] = getLaspConfigDir();
    const laspSrvCmd = getLaspSrvPath();
    console.log("trying to run local server", laspSrvCmd);
    const proc = child_process.spawn(getLaspSrvPath(), {
        cwd: getLaspSrvCwd(),
        env: envCopy,
    });
    proc.on("exit", (e) => {
        if (updater?.status == "installing") {
            return;
        }
        console.log("laspsrv exited, shutting down");
        setForceQuit(true);
        isLaspSrvDead = true;
        electron.app.quit();
    });
    proc.on("spawn", (e) => {
        console.log("spawned laspsrv");
        laspSrvProc = proc;
        pResolve(true);
    });
    proc.on("error", (e) => {
        console.log("error running laspsrv", e);
        pReject(e);
    });
    const rlStdout = readline.createInterface({
        input: proc.stdout,
        terminal: false,
    });
    rlStdout.on("line", (line) => {
        console.log(line);
    });
    const rlStderr = readline.createInterface({
        input: proc.stderr,
        terminal: false,
    });
    rlStderr.on("line", (line) => {
        if (line.includes("LASPSRV-ESTART")) {
            const startParams = /ws:([a-z0-9.:]+) web:([a-z0-9.:]+) version:([a-z0-9.-]+) buildtime:(\d+)/gm.exec(
                line
            );
            if (startParams == null) {
                console.log("error parsing LASPSRV-ESTART line", line);
                setUserConfirmedQuit(true);
                electron.app.quit();
                return;
            }
            process.env[WSServerEndpointVarName] = startParams[1];
            process.env[WebServerEndpointVarName] = startParams[2];
            LaspVersion = startParams[3];
            LaspBuildTime = parseInt(startParams[4]);
            laspSrvReadyResolve(true);
            return;
        }
        if (line.startsWith("LASPSRV-EVENT:")) {
            const evtJson = line.slice("LASPSRV-EVENT:".length);
            try {
                const evtMsg: WSEventType = JSON.parse(evtJson);
                handleWSEvent(evtMsg);
            } catch (e) {
                console.log("error handling LASPSRV-EVENT", e);
            }
            return;
        }
        console.log(line);
    });
    return rtnPromise;
}
