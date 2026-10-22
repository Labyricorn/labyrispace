// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

export const DedicatedWebPartition = "persist:labyrispace-web";

export type WebPartitionInput = {
    override?: string;
    metaPartition?: string;
};

// Web content must never share the session that carries the backend auth key, so there is no "default" result.
export function resolveWebPartition(input: WebPartitionInput): string {
    const override = input.override?.trim();
    if (override) {
        return override;
    }
    const saved = input.metaPartition?.trim();
    if (saved) {
        return saved;
    }
    return DedicatedWebPartition;
}
