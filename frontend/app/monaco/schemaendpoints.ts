// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import aipresetsSchema from "../../../schema/aipresets.json";
import backgroundsSchema from "../../../schema/backgrounds.json";
import connectionsSchema from "../../../schema/connections.json";
import settingsSchema from "../../../schema/settings.json";
import laspaiSchema from "../../../schema/laspai.json";
import widgetsSchema from "../../../schema/widgets.json";

type SchemaInfo = {
    uri: string;
    fileMatch: Array<string>;
    schema: object;
};

const MonacoSchemas: SchemaInfo[] = [
    {
        uri: "lasp://schema/settings.json",
        fileMatch: ["*/LASPCONFIGPATH/settings.json"],
        schema: settingsSchema,
    },
    {
        uri: "lasp://schema/connections.json",
        fileMatch: ["*/LASPCONFIGPATH/connections.json"],
        schema: connectionsSchema,
    },
    {
        uri: "lasp://schema/aipresets.json",
        fileMatch: ["*/LASPCONFIGPATH/presets/ai.json"],
        schema: aipresetsSchema,
    },
    {
        uri: "lasp://schema/backgrounds.json",
        fileMatch: ["*/LASPCONFIGPATH/backgrounds.json"],
        schema: backgroundsSchema,
    },
    {
        uri: "lasp://schema/laspai.json",
        fileMatch: ["*/LASPCONFIGPATH/laspai.json"],
        schema: laspaiSchema,
    },
    {
        uri: "lasp://schema/widgets.json",
        fileMatch: ["*/LASPCONFIGPATH/widgets.json"],
        schema: widgetsSchema,
    },
];

export { MonacoSchemas };
