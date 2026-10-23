// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Modified by Labyricorn for Labyrispace: disable Wave vendor connections.

package clientservice

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/Labyricorn/labyrispace/pkg/remote/conncontroller"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wcore"
	"github.com/Labyricorn/labyrispace/pkg/wshrpc"
	"github.com/Labyricorn/labyrispace/pkg/wslconn"
	"github.com/Labyricorn/labyrispace/pkg/wstore"
)

type ClientService struct{}

const DefaultTimeout = 2 * time.Second

func (cs *ClientService) GetClientData() (*laspobj.Client, error) {
	log.Println("GetClientData")
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	return wcore.GetClientData(ctx)
}

func (cs *ClientService) GetTab(tabId string) (*laspobj.Tab, error) {
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	tab, err := wstore.DBGet[*laspobj.Tab](ctx, tabId)
	if err != nil {
		return nil, fmt.Errorf("error getting tab: %w", err)
	}
	return tab, nil
}

func (cs *ClientService) GetAllConnStatus(ctx context.Context) ([]wshrpc.ConnStatus, error) {
	sshStatuses := conncontroller.GetAllConnStatus()
	wslStatuses := wslconn.GetAllConnStatus()
	return append(sshStatuses, wslStatuses...), nil
}

// moves the window to the front of the windowId stack
func (cs *ClientService) FocusWindow(ctx context.Context, windowId string) error {
	return wcore.FocusWindow(ctx, windowId)
}

func (cs *ClientService) AgreeTos(ctx context.Context) (laspobj.UpdatesRtnType, error) {
	ctx = laspobj.ContextWithUpdates(ctx)
	clientData, err := wstore.DBGetSingleton[*laspobj.Client](ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting client data: %w", err)
	}
	timestamp := time.Now().UnixMilli()
	clientData.TosAgreed = timestamp
	err = wstore.DBUpdate(ctx, clientData)
	if err != nil {
		return nil, fmt.Errorf("error updating client data: %w", err)
	}
	wcore.BootstrapStarterLayout(ctx)
	return laspobj.ContextGetUpdatesRtn(ctx), nil
}

func (cs *ClientService) TelemetryUpdate(ctx context.Context, telemetryEnabled bool) error {
	if telemetryEnabled {
		return fmt.Errorf("telemetry is disabled by Labyrispace policy")
	}
	return nil
}
