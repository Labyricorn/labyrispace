// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package wconfig

import "github.com/wavetermdev/waveterm/pkg/vendorpolicy"

// Apply after merging defaults and user files, so imported profiles cannot
// silently restore vendor connections. User files themselves are preserved.
func applyVendorPolicy(config *FullConfigType) {
	config.Settings.TelemetryEnabled = false
	config.Settings.AutoUpdateEnabled = false
	config.Settings.AutoUpdateInstallOnQuit = false
	config.Settings.WaveAiShowCloudModes = false
	if vendorpolicy.IsVendorURL(config.Settings.WebDefaultUrl) {
		config.Settings.WebDefaultUrl = "about:blank"
	}
	for name, mode := range config.WaveAIModes {
		if mode.Provider == "wave" || mode.WaveAICloud || vendorpolicy.IsVendorURL(mode.Endpoint) || vendorpolicy.IsVendorURL(mode.ProxyURL) {
			delete(config.WaveAIModes, name)
		}
	}
}
