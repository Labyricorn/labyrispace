// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package laspobj

type ObjRTInfo struct {
	TsunamiAppMeta any `json:"tsunami:appmeta,omitempty" tstype:"AppMeta"`
	TsunamiSchemas any `json:"tsunami:schemas,omitempty"`

	ShellHasCurCwd       bool   `json:"shell:hascurcwd,omitempty"`
	ShellState           string `json:"shell:state,omitempty"`
	ShellType            string `json:"shell:type,omitempty"`
	ShellVersion         string `json:"shell:version,omitempty"`
	ShellUname           string `json:"shell:uname,omitempty"`
	ShellIntegration     bool   `json:"shell:integration,omitempty"`
	ShellOmz             bool   `json:"shell:omz,omitempty"`
	ShellComp            string `json:"shell:comp,omitempty"`
	ShellInputEmpty      bool   `json:"shell:inputempty,omitempty"`
	ShellLastCmd         string `json:"shell:lastcmd,omitempty"`
	ShellLastCmdExitCode int    `json:"shell:lastcmdexitcode,omitempty"`

	BuilderLayout map[string]float64 `json:"builder:layout,omitempty"`
	BuilderAppId  string             `json:"builder:appid,omitempty"`
	BuilderEnv    map[string]string  `json:"builder:env,omitempty"`

	LaspAIChatId          string `json:"laspai:chatid,omitempty"`
	LaspAIMode            string `json:"laspai:mode,omitempty"`
	LaspAIMaxOutputTokens int    `json:"laspai:maxoutputtokens,omitempty"`
}
