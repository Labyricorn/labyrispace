// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tsgen

import (
	"bytes"
	"fmt"
	"reflect"
	"strconv"

	"github.com/Labyricorn/labyrispace/pkg/baseds"
	"github.com/Labyricorn/labyrispace/pkg/blockcontroller"
	"github.com/Labyricorn/labyrispace/pkg/userinput"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wconfig"
	"github.com/Labyricorn/labyrispace/pkg/wps"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
)

var laspEventRType = reflect.TypeOf(wps.LaspEvent{})

var LaspEventDataTypes = map[string]reflect.Type{
	wps.Event_BlockClose:          reflect.TypeOf(""),
	wps.Event_ConnChange:          reflect.TypeOf(wshrpc.ConnStatus{}),
	wps.Event_SysInfo:             reflect.TypeOf(wshrpc.TimeSeriesData{}),
	wps.Event_ControllerStatus:    reflect.TypeOf((*blockcontroller.BlockControllerRuntimeStatus)(nil)),
	wps.Event_BuilderStatus:       reflect.TypeOf(wshrpc.BuilderStatusData{}),
	wps.Event_BuilderOutput:       reflect.TypeOf(map[string]any{}),
	wps.Event_LaspObjUpdate:       reflect.TypeOf(laspobj.LaspObjUpdate{}),
	wps.Event_BlockFile:           reflect.TypeOf((*wps.WSFileEventData)(nil)),
	wps.Event_Config:              reflect.TypeOf(wconfig.WatcherUpdate{}),
	wps.Event_UserInput:           reflect.TypeOf((*userinput.UserInputRequest)(nil)),
	wps.Event_RouteDown:           nil,
	wps.Event_RouteUp:             nil,
	wps.Event_WorkspaceUpdate:     nil,
	wps.Event_LaspAppAppGoUpdated: nil,
	wps.Event_TsunamiUpdateMeta:   reflect.TypeOf(wshrpc.AppMeta{}),
	wps.Event_AIModeConfig:        reflect.TypeOf(wconfig.AIModeConfigUpdate{}),
	wps.Event_BlockJobStatus:      reflect.TypeOf(wshrpc.BlockJobStatusData{}),
	wps.Event_Badge:               reflect.TypeOf(baseds.BadgeEvent{}),
}

func getLaspEventDataTSType(eventName string, tsTypesMap map[reflect.Type]string) string {
	rtype, found := LaspEventDataTypes[eventName]
	if !found {
		return "any"
	}
	if rtype == nil {
		return "null"
	}
	tsType, _ := TypeToTSType(rtype, tsTypesMap)
	if tsType == "" {
		return "any"
	}
	return tsType
}

func GenerateLaspEventTypes(tsTypesMap map[reflect.Type]string) string {
	for _, rtype := range LaspEventDataTypes {
		GenerateTSType(rtype, tsTypesMap)
	}
	// suppress default struct generation, this type is custom generated
	tsTypesMap[laspEventRType] = ""

	var buf bytes.Buffer
	buf.WriteString("// wps.LaspEvent\n")
	buf.WriteString("type LaspEventName =\n")
	for _, eventName := range wps.AllEvents {
		buf.WriteString(fmt.Sprintf("    | %s\n", strconv.Quote(eventName)))
	}
	buf.WriteString(";\n\n")
	buf.WriteString("type LaspEvent = {\n")
	buf.WriteString("    event: LaspEventName;\n")
	buf.WriteString("    scopes?: string[];\n")
	buf.WriteString("    sender?: string;\n")
	buf.WriteString("    persist?: number;\n")
	buf.WriteString("    data?: unknown;\n")
	buf.WriteString("} & (\n")
	for idx, eventName := range wps.AllEvents {
		if idx > 0 {
			buf.WriteString(" | \n")
		}
		buf.WriteString(fmt.Sprintf("    { event: %s; data?: %s; }", strconv.Quote(eventName), getLaspEventDataTSType(eventName, tsTypesMap)))
	}
	buf.WriteString("\n);\n")
	return buf.String()
}
