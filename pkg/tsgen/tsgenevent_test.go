// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tsgen

import (
	"reflect"
	"strings"
	"testing"

	"github.com/Labyricorn/labyrispace/pkg/wps"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
)

func TestGenerateLaspEventTypes(t *testing.T) {
	tsTypesMap := make(map[reflect.Type]string)
	laspEventTypeDecl := GenerateLaspEventTypes(tsTypesMap)

	if !strings.Contains(laspEventTypeDecl, `type LaspEventName = "blockclose"`) {
		t.Fatalf("expected LaspEventName declaration, got:\n%s", laspEventTypeDecl)
	}
	if !strings.Contains(laspEventTypeDecl, `{ event: "block:jobstatus"; data?: BlockJobStatusData; }`) {
		t.Fatalf("expected typed block:jobstatus event, got:\n%s", laspEventTypeDecl)
	}
	if !strings.Contains(laspEventTypeDecl, `{ event: "route:up"; data?: null; }`) {
		t.Fatalf("expected null for known no-data event, got:\n%s", laspEventTypeDecl)
	}
	if got := getLaspEventDataTSType("unmapped:event", tsTypesMap); got != "any" {
		t.Fatalf("expected any for unmapped event fallback, got: %q", got)
	}
	if _, found := tsTypesMap[reflect.TypeOf(wps.LaspEvent{})]; !found {
		t.Fatalf("expected LaspEvent type to be seeded in tsTypesMap")
	}
	if _, found := tsTypesMap[reflect.TypeOf(wshrpc.BlockJobStatusData{})]; !found {
		t.Fatalf("expected mapped data types to be generated into tsTypesMap")
	}
}
