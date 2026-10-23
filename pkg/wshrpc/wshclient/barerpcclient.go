// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshclient

import (
	"fmt"
	"sync"

	"github.com/google/uuid"
	"github.com/Labyricorn/labyrispace/pkg/wps"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
	"github.com/Labyricorn/labyrispace/pkg/wshutil"
)

type WshServer struct{}

func (*WshServer) WshServerImpl() {}

var WshServerImpl = WshServer{}

var laspSrvClient_Singleton *wshutil.WshRpc
var laspSrvClient_Once = &sync.Once{}
var laspSrvClient_RouteId string

func GetBareRpcClient() *wshutil.WshRpc {
	laspSrvClient_Once.Do(func() {
		laspSrvClient_Singleton = wshutil.MakeWshRpc(wshrpc.RpcContext{}, &WshServerImpl, "bare-client")
		laspSrvClient_RouteId = fmt.Sprintf("bare:%s", uuid.New().String())
		// we can safely ignore the error from RegisterTrustedLeaf since the route is valid
		wshutil.DefaultRouter.RegisterTrustedLeaf(laspSrvClient_Singleton, laspSrvClient_RouteId)
		wps.Broker.SetClient(wshutil.DefaultRouter)
	})
	return laspSrvClient_Singleton
}

func GetBareRpcClientRouteId() string {
	GetBareRpcClient()
	return laspSrvClient_RouteId
}
