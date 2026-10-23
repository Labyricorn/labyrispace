// Copyright 2026 Labyricorn.
// SPDX-License-Identifier: Apache-2.0

package wconfig

import "github.com/Labyricorn/labyrispace/pkg/vendorpolicy"

// Apply after merging defaults and user files, so imported profiles cannot
// silently restore vendor connections. User files themselves are preserved.
func applyVendorPolicy(config *FullConfigType) {
	config.Settings.TelemetryEnabled = false
	config.Settings.AutoUpdateEnabled = false
	config.Settings.AutoUpdateInstallOnQuit = false
	config.Settings.LaspAiShowCloudModes = false
	if vendorpolicy.IsVendorURL(config.Settings.WebDefaultUrl) {
		config.Settings.WebDefaultUrl = "about:blank"
	}
	for name, mode := range config.LaspAIModes {
		if mode.Provider == "lasp" || mode.LaspAICloud || vendorpolicy.IsVendorURL(mode.Endpoint) || vendorpolicy.IsVendorURL(mode.ProxyURL) {
			delete(config.LaspAIModes, name)
		}
	}
}
