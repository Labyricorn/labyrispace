// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"fmt"
	"os"
	"reflect"
	"strings"

	"github.com/Labyricorn/labyrispace/pkg/gogen"
	"github.com/Labyricorn/labyrispace/pkg/util/utilfn"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wconfig"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
)

const WshClientFileName = "pkg/wshrpc/wshclient/wshclient.go"
const LaspObjMetaConstsFileName = "pkg/laspobj/metaconsts.go"
const SettingsMetaConstsFileName = "pkg/wconfig/metaconsts.go"

func GenerateWshClient() error {
	fmt.Fprintf(os.Stderr, "generating wshclient file to %s\n", WshClientFileName)
	var buf strings.Builder
	gogen.GenerateBoilerplate(&buf, "wshclient", []string{
		"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes",
		"github.com/Labyricorn/labyrispace/pkg/localservices",
		"github.com/Labyricorn/labyrispace/pkg/netinfo",
		"github.com/Labyricorn/labyrispace/pkg/baseds",
		"github.com/Labyricorn/labyrispace/pkg/telemetry/telemetrydata",
		"github.com/Labyricorn/labyrispace/pkg/vdom",
		"github.com/Labyricorn/labyrispace/pkg/laspobj",
		"github.com/Labyricorn/labyrispace/pkg/wconfig",
		"github.com/Labyricorn/labyrispace/pkg/wps",
		"github.com/Labyricorn/labyrispace/pkg/wshrpc",
		"github.com/Labyricorn/labyrispace/pkg/wshutil",
	})
	wshDeclMap := wshrpc.GenerateWshCommandDeclMap()
	for _, key := range utilfn.GetOrderedMapKeys(wshDeclMap) {
		methodDecl := wshDeclMap[key]
		if methodDecl.CommandType == wshrpc.RpcType_ResponseStream {
			gogen.GenMethod_ResponseStream(&buf, methodDecl)
		} else if methodDecl.CommandType == wshrpc.RpcType_Call {
			gogen.GenMethod_Call(&buf, methodDecl)
		} else {
			panic("unsupported command type " + methodDecl.CommandType)
		}
	}
	buf.WriteString("\n")
	written, err := utilfn.WriteFileIfDifferent(WshClientFileName, []byte(buf.String()))
	if !written {
		fmt.Fprintf(os.Stderr, "no changes to %s\n", WshClientFileName)
	}
	return err
}

func GenerateLaspObjMetaConsts() error {
	fmt.Fprintf(os.Stderr, "generating laspobj meta consts file to %s\n", LaspObjMetaConstsFileName)
	var buf strings.Builder
	gogen.GenerateBoilerplate(&buf, "laspobj", []string{})
	gogen.GenerateMetaMapConsts(&buf, "MetaKey_", reflect.TypeOf(laspobj.MetaTSType{}), false)
	buf.WriteString("\n")
	written, err := utilfn.WriteFileIfDifferent(LaspObjMetaConstsFileName, []byte(buf.String()))
	if !written {
		fmt.Fprintf(os.Stderr, "no changes to %s\n", LaspObjMetaConstsFileName)
	}
	return err
}

func GenerateSettingsMetaConsts() error {
	fmt.Fprintf(os.Stderr, "generating settings meta consts file to %s\n", SettingsMetaConstsFileName)
	var buf strings.Builder
	gogen.GenerateBoilerplate(&buf, "wconfig", []string{})
	gogen.GenerateMetaMapConsts(&buf, "ConfigKey_", reflect.TypeOf(wconfig.SettingsType{}), false)
	buf.WriteString("\n")
	written, err := utilfn.WriteFileIfDifferent(SettingsMetaConstsFileName, []byte(buf.String()))
	if !written {
		fmt.Fprintf(os.Stderr, "no changes to %s\n", SettingsMetaConstsFileName)
	}
	return err
}

func main() {
	err := GenerateWshClient()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error generating wshclient: %v\n", err)
		return
	}
	err = GenerateLaspObjMetaConsts()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error generating laspobj meta consts: %v\n", err)
		return
	}
	err = GenerateSettingsMetaConsts()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error generating settings meta consts: %v\n", err)
		return
	}
}
