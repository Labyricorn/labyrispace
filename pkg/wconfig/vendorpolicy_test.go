// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package wconfig

import "testing"

func TestImportedProfileCannotRestoreVendorServices(t *testing.T) {
	config := FullConfigType{WaveAIModes: map[string]AIModeConfigType{
		"cloud":     {Provider: "wave"},
		"disguised": {Provider: "custom", Endpoint: "https://cfapi.waveterm.dev/api/waveai"},
		"local":     {Provider: "custom", Endpoint: "http://127.0.0.1:1234/v1/chat/completions"},
	}}
	config.Settings.TelemetryEnabled = true
	config.Settings.AutoUpdateEnabled = true
	config.Settings.AutoUpdateInstallOnQuit = true
	config.Settings.WaveAiShowCloudModes = true
	config.Settings.WebDefaultUrl = "https://github.com/wavetermdev/waveterm"
	applyVendorPolicy(&config)
	if config.Settings.TelemetryEnabled || config.Settings.AutoUpdateEnabled || config.Settings.AutoUpdateInstallOnQuit || config.Settings.WaveAiShowCloudModes {
		t.Fatal("legacy settings restored a vendor service")
	}
	if config.Settings.WebDefaultUrl != "about:blank" {
		t.Fatal("vendor homepage retained")
	}
	if len(config.WaveAIModes) != 1 || config.WaveAIModes["local"].Endpoint == "" {
		t.Fatal("local AI mode lost or vendor AI retained")
	}
}
