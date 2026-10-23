// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package objectservice

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Labyricorn/labyrispace/pkg/tsgen/tsgenmeta"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"
	"github.com/Labyricorn/labyrispace/pkg/wcore"
	"github.com/Labyricorn/labyrispace/pkg/wps"
	"github.com/Labyricorn/labyrispace/pkg/wstore"
)

type ObjectService struct{}

const DefaultTimeout = 2 * time.Second
const ConnContextTimeout = 60 * time.Second

func parseORef(oref string) (*laspobj.ORef, error) {
	fields := strings.Split(oref, ":")
	if len(fields) != 2 {
		return nil, fmt.Errorf("invalid object reference: %q", oref)
	}
	return &laspobj.ORef{OType: fields[0], OID: fields[1]}, nil
}

func (svc *ObjectService) GetObject_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		Desc:     "get lasp object by oref",
		ArgNames: []string{"oref"},
	}
}

func (svc *ObjectService) GetObject(orefStr string) (laspobj.LaspObj, error) {
	oref, err := parseORef(orefStr)
	if err != nil {
		return nil, err
	}
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	obj, err := wstore.DBGetORef(ctx, *oref)
	if err != nil {
		return nil, fmt.Errorf("error getting object: %w", err)
	}
	return obj, nil
}

func (svc *ObjectService) GetObjects_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		ArgNames:   []string{"orefs"},
		ReturnDesc: "objects",
	}
}

func (svc *ObjectService) GetObjects(orefStrArr []string) ([]laspobj.LaspObj, error) {
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()

	var orefArr []laspobj.ORef
	for _, orefStr := range orefStrArr {
		orefObj, err := parseORef(orefStr)
		if err != nil {
			return nil, err
		}
		orefArr = append(orefArr, *orefObj)
	}
	return wstore.DBSelectORefs(ctx, orefArr)
}

func (svc *ObjectService) CreateBlock_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		ArgNames:   []string{"uiContext", "blockDef", "rtOpts"},
		ReturnDesc: "blockId",
	}
}

func (svc *ObjectService) CreateBlock(uiContext laspobj.UIContext, blockDef *laspobj.BlockDef, rtOpts *laspobj.RuntimeOpts) (string, laspobj.UpdatesRtnType, error) {
	if uiContext.ActiveTabId == "" {
		return "", nil, fmt.Errorf("no active tab")
	}
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	ctx = laspobj.ContextWithUpdates(ctx)

	blockData, err := wcore.CreateBlock(ctx, uiContext.ActiveTabId, blockDef, rtOpts)
	if err != nil {
		return "", nil, err
	}

	return blockData.OID, laspobj.ContextGetUpdatesRtn(ctx), nil
}

func (svc *ObjectService) DeleteBlock_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		ArgNames: []string{"uiContext", "blockId"},
	}
}

func (svc *ObjectService) DeleteBlock(uiContext laspobj.UIContext, blockId string) (laspobj.UpdatesRtnType, error) {
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	ctx = laspobj.ContextWithUpdates(ctx)
	err := wcore.DeleteBlock(ctx, blockId, true)
	if err != nil {
		return nil, fmt.Errorf("error deleting block: %w", err)
	}
	return laspobj.ContextGetUpdatesRtn(ctx), nil
}

func (svc *ObjectService) UpdateObjectMeta_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		ArgNames: []string{"uiContext", "oref", "meta"},
	}
}

func (svc *ObjectService) UpdateObjectMeta(uiContext laspobj.UIContext, orefStr string, meta laspobj.MetaMapType) (laspobj.UpdatesRtnType, error) {
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	ctx = laspobj.ContextWithUpdates(ctx)
	oref, err := parseORef(orefStr)
	if err != nil {
		return nil, fmt.Errorf("error parsing object reference: %w", err)
	}
	err = wstore.UpdateObjectMeta(ctx, *oref, meta, false)
	if err != nil {
		return nil, fmt.Errorf("error updating %q meta: %w", orefStr, err)
	}
	return laspobj.ContextGetUpdatesRtn(ctx), nil
}

func (svc *ObjectService) UpdateObject_Meta() tsgenmeta.MethodMeta {
	return tsgenmeta.MethodMeta{
		ArgNames: []string{"uiContext", "laspObj", "returnUpdates"},
	}
}

func (svc *ObjectService) UpdateObject(uiContext laspobj.UIContext, laspObj laspobj.LaspObj, returnUpdates bool) (laspobj.UpdatesRtnType, error) {
	ctx, cancelFn := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancelFn()
	ctx = laspobj.ContextWithUpdates(ctx)
	if laspObj == nil {
		return nil, fmt.Errorf("update wavobj is nil")
	}
	oref := laspobj.ORefFromLaspObj(laspObj)
	found, err := wstore.DBExistsORef(ctx, *oref)
	if err != nil {
		return nil, fmt.Errorf("error getting object: %w", err)
	}
	if !found {
		return nil, fmt.Errorf("object not found: %s", oref)
	}
	err = wstore.DBUpdate(ctx, laspObj)
	if err != nil {
		return nil, fmt.Errorf("error updating object: %w", err)
	}
	if (laspObj.GetOType() == laspobj.OType_Workspace) && (laspObj.(*laspobj.Workspace).Name != "") {
		wps.Broker.Publish(wps.LaspEvent{
			Event: wps.Event_WorkspaceUpdate})
	}
	if returnUpdates {
		return laspobj.ContextGetUpdatesRtn(ctx), nil
	}
	return nil, nil
}
