---
name: laspenv
description: Guide for creating LaspEnv narrowings in Lasp Terminal. Use when writing a named subset type of LaspEnv for a component tree, documenting environmental dependencies, or enabling mock environments for preview/test server usage.
---

# LaspEnv Narrowing Skill

## Purpose

A LaspEnv narrowing creates a _named subset type_ of `LaspEnv` that:

1. Documents exactly which parts of the environment a component tree actually uses.
2. Forms a type contract so callers and tests know what to provide.
3. Enables mocking in the preview/test server — you only need to implement what's listed.

## When To Create One

Create a narrowing whenever you are writing a component (or group of components) that you want to test in the preview server, or when you want to make the environmental dependencies of a component tree explicit.

## Core Principle: Only Include What You Use

**Only list the fields, methods, atoms, and keys that the component tree actually accesses.** If you don't call `wos`, don't include `wos`. If you only call one RPC command, only list that one command. The narrowing is a precise dependency declaration — not a copy of `LaspEnv`.

## File Location

- **Separate file** (preferred for shared/complex envs): name it `<feature>env.ts` next to the component, e.g. `frontend/app/block/blockenv.ts`.
- **Inline** (acceptable for small, single-file components): export the type directly from the component file, e.g. `WidgetsEnv` in `frontend/app/workspace/widgets.tsx`.

## Imports Required

```ts
import {
  MetaKeyAtomFnType, // only if you use getBlockMetaKeyAtom or getTabMetaKeyAtom
  ConnConfigKeyAtomFnType, // only if you use getConnConfigKeyAtom
  SettingsKeyAtomFnType, // only if you use getSettingsKeyAtom
  LaspEnv,
  LaspEnvSubset,
} from "@/app/laspenv/laspenv";
```

## The Shape

```ts
export type MyEnv = LaspEnvSubset<{
  // --- Simple LaspEnv properties ---
  // Copy the type verbatim from LaspEnv with LaspEnv["key"] syntax.
  isDev: LaspEnv["isDev"];
  createBlock: LaspEnv["createBlock"];
  showContextMenu: LaspEnv["showContextMenu"];
  platform: LaspEnv["platform"];

  // --- electron: list only the methods you call ---
  electron: {
    openExternal: LaspEnv["electron"]["openExternal"];
  };

  // --- rpc: list only the commands you call ---
  rpc: {
    ActivityCommand: LaspEnv["rpc"]["ActivityCommand"];
    ConnEnsureCommand: LaspEnv["rpc"]["ConnEnsureCommand"];
  };

  // --- atoms: list only the atoms you read ---
  atoms: {
    modalOpen: LaspEnv["atoms"]["modalOpen"];
    fullConfigAtom: LaspEnv["atoms"]["fullConfigAtom"];
  };

  // --- wos: always take the whole thing, no sub-typing needed ---
  wos: LaspEnv["wos"];

  // --- services: list only the services you call; no method-level narrowing ---
  services: {
    block: LaspEnv["services"]["block"];
    workspace: LaspEnv["services"]["workspace"];
  };

  // --- key-parameterized atom factories: enumerate the keys you use ---
  getSettingsKeyAtom: SettingsKeyAtomFnType<"app:focusfollowscursor" | "window:magnifiedblockopacity">;
  getBlockMetaKeyAtom: MetaKeyAtomFnType<"view" | "frame:title" | "connection">;
  getTabMetaKeyAtom: MetaKeyAtomFnType<"tabid" | "name">;
  getConnConfigKeyAtom: ConnConfigKeyAtomFnType<"conn:wshenabled">;

  // --- other atom helpers: copy verbatim ---
  getConnStatusAtom: LaspEnv["getConnStatusAtom"];
  getLocalHostDisplayNameAtom: LaspEnv["getLocalHostDisplayNameAtom"];
  getConfigBackgroundAtom: LaspEnv["getConfigBackgroundAtom"];
}>;
```

### Automatically Included Fields

Every `LaspEnvSubset<T>` automatically includes the mock fields — you never need to declare them:

- `isMock: boolean`
- `mockSetLaspObj: <T extends LaspObj>(oref: string, obj: T) => void`
- `mockModels?: Map<any, any>`

### Rules for Each Section

| Section                    | Pattern                                                | Notes                                                                                              |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `electron`                 | `electron: { method: LaspEnv["electron"]["method"]; }` | List every method called; omit the rest.                                                           |
| `rpc`                      | `rpc: { Cmd: LaspEnv["rpc"]["Cmd"]; }`                 | List every RPC command called; omit the rest.                                                      |
| `atoms`                    | `atoms: { atom: LaspEnv["atoms"]["atom"]; }`           | List every atom read; omit the rest.                                                               |
| `wos`                      | `wos: LaspEnv["wos"]`                                  | Take the whole `wos` object (no sub-typing needed), but **only add it if `wos` is actually used**. |
| `services`                 | `services: { svc: LaspEnv["services"]["svc"]; }`       | List each service used; take the whole service object (no method-level narrowing).                 |
| `getSettingsKeyAtom`       | `SettingsKeyAtomFnType<"key1" \| "key2">`              | Union all settings keys accessed.                                                                  |
| `getBlockMetaKeyAtom`      | `MetaKeyAtomFnType<"key1" \| "key2">`                  | Union all block meta keys accessed.                                                                |
| `getTabMetaKeyAtom`        | `MetaKeyAtomFnType<"key1" \| "key2">`                  | Union all tab meta keys accessed.                                                                  |
| `getConnConfigKeyAtom`     | `ConnConfigKeyAtomFnType<"key1">`                      | Union all conn config keys accessed.                                                               |
| All other `LaspEnv` fields | `LaspEnv["fieldName"]`                                 | Copy type verbatim.                                                                                |

## Using the Narrowed Type in Components

```ts
import { useLaspEnv } from "@/app/laspenv/laspenv";
import { MyEnv } from "./myenv";

const MyComponent = memo(() => {
    const env = useLaspEnv<MyEnv>();
    // TypeScript now enforces you only access what's in MyEnv.
    const val = useAtomValue(env.getSettingsKeyAtom("app:focusfollowscursor"));
    ...
});
```

The generic parameter on `useLaspEnv<MyEnv>()` casts the context to your narrowed type. The real production `LaspEnv` satisfies every narrowing; mock envs only need to implement the listed subset.

## Real Examples

- `BlockEnv` in `frontend/app/block/blockenv.ts` — complex narrowing with all section types, in a separate file.
- `WidgetsEnv` in `frontend/app/workspace/widgets.tsx` — smaller narrowing defined inline in the component file.
