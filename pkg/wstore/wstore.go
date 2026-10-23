// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wstore

import (
	"context"
	"fmt"
	"sync"

	"github.com/Labyricorn/labyrispace/pkg/laspbase"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
)

func init() {
	for _, rtype := range laspobj.AllLaspObjTypes() {
		laspobj.RegisterType(rtype)
	}
}

var (
	clientIdLock   sync.Mutex
	cachedClientId string
)

func SetClientId(clientId string) {
	clientIdLock.Lock()
	defer clientIdLock.Unlock()
	cachedClientId = clientId
}

// in the main server, this will not return empty string
// it does return empty in wsh, but all wstore methods are invalid in wsh mode, so that shouldn't be an issue
func GetClientId() string {
	clientIdLock.Lock()
	defer clientIdLock.Unlock()
	if laspbase.IsDevMode() && cachedClientId == "" {
		panic("cachedClientId is empty")
	}
	return cachedClientId
}

func UpdateTabName(ctx context.Context, tabId, name string) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		tab, _ := DBGet[*laspobj.Tab](tx.Context(), tabId)
		if tab == nil {
			return fmt.Errorf("tab not found: %q", tabId)
		}
		if tabId != "" {
			tab.Name = name
			DBUpdate(tx.Context(), tab)
		}
		return nil
	})
}

func UpdateObjectMeta(ctx context.Context, oref laspobj.ORef, meta laspobj.MetaMapType, mergeSpecial bool) error {
	return WithTx(ctx, func(tx *TxWrap) error {
		if oref.IsEmpty() {
			return fmt.Errorf("empty object reference")
		}
		obj, _ := DBGetORef(tx.Context(), oref)
		if obj == nil {
			return ErrNotFound
		}
		objMeta := laspobj.GetMeta(obj)
		if objMeta == nil {
			objMeta = make(map[string]any)
		}
		newMeta := laspobj.MergeMeta(objMeta, meta, mergeSpecial)
		laspobj.SetMeta(obj, newMeta)
		DBUpdate(tx.Context(), obj)
		return nil
	})
}
