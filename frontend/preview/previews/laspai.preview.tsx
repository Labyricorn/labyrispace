// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Block } from "@/app/block/block";
import { useLaspEnv } from "@/app/laspenv/laspenv";
import * as React from "react";
import { makeMockNodeModel } from "../mock/mock-node-model";

const PreviewNodeId = "preview-laspai-node";

export default function LaspAIPreview() {
    const env = useLaspEnv();
    const [blockId, setBlockId] = React.useState<string>(null);

    React.useEffect(() => {
        env.createBlock(
            {
                meta: {
                    view: "laspai",
                },
            },
            false,
            false
        ).then((id) => setBlockId(id));
    }, [env]);

    const nodeModel = React.useMemo(
        () =>
            blockId == null
                ? null
                : makeMockNodeModel({
                      nodeId: PreviewNodeId,
                      blockId,
                      innerRect: { width: "900px", height: "480px" },
                  }),
        [blockId]
    );

    if (blockId == null || nodeModel == null) {
        return null;
    }

    return (
        <div className="flex w-full max-w-[960px] flex-col gap-2 px-6 py-6">
            <div className="text-xs text-muted font-mono">full deprecated laspai block with the FE-only replacement UI</div>
            <div className="rounded-md border border-border bg-panel p-4">
                <div className="h-[540px]">
                    <Block preview={false} nodeModel={nodeModel} />
                </div>
            </div>
        </div>
    );
}
