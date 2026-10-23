// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"sync"

	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
	"github.com/Labyricorn/labyrispace/pkg/wshutil"
)

const (
	DefaultOutputChSize = 32
	DefaultInputChSize  = 32
)

var laspSrvClient_Singleton *wshutil.WshRpc
var laspSrvClient_Once = &sync.Once{}

// returns the laspsrv main rpc client singleton
func GetMainRpcClient() *wshutil.WshRpc {
	laspSrvClient_Once.Do(func() {
		laspSrvClient_Singleton = wshutil.MakeWshRpc(wshrpc.RpcContext{}, &WshServerImpl, "main-client")
	})
	return laspSrvClient_Singleton
}
