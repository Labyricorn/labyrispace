// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"github.com/wavetermdev/waveterm/pkg/telemetry/telemetrydata"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"testing"
)

func TestDisabledTelemetryDoesNotRequireConfigOrDatabase(t *testing.T) {
	if IsTelemetryEnabled() {
		t.Fatal("telemetry enabled")
	}
	if err := RecordTEvent(context.Background(), &telemetrydata.TEvent{Event: "app:startup"}); err != nil {
		t.Fatal(err)
	}
	if err := UpdateActivity(context.Background(), wshrpc.ActivityUpdate{}); err != nil {
		t.Fatal(err)
	}
}
