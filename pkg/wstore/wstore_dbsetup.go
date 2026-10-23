// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wstore

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/sawka/txwrap"
	"github.com/Labyricorn/labyrispace/pkg/util/migrateutil"
	"github.com/Labyricorn/labyrispace/pkg/laspbase"
	"github.com/Labyricorn/labyrispace/pkg/laspobj"

	dbfs "github.com/Labyricorn/labyrispace/db"
)

const WStoreDBName = "laspterm.db"

type TxWrap = txwrap.TxWrap

var globalDB *sqlx.DB

func InitWStore() error {
	ctx, cancelFn := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelFn()
	var err error
	globalDB, err = MakeDB(ctx)
	if err != nil {
		return err
	}
	err = migrateutil.Migrate("wstore", globalDB.DB, dbfs.WStoreMigrationFS, "migrations-wstore")
	if err != nil {
		return err
	}
	log.Printf("wstore initialized\n")
	return nil
}

func GetDBName() string {
	laspHome := laspbase.GetLaspDataDir()
	return filepath.Join(laspHome, laspbase.LaspDBDir, WStoreDBName)
}

func MakeDB(ctx context.Context) (*sqlx.DB, error) {
	dbName := GetDBName()
	rtn, err := sqlx.Open("sqlite3", fmt.Sprintf("file:%s?mode=rwc&_journal_mode=WAL&_busy_timeout=5000", dbName))
	if err != nil {
		return nil, err
	}
	rtn.DB.SetMaxOpenConns(1)
	return rtn, nil
}

func WithTx(ctx context.Context, fn func(tx *TxWrap) error) (rtnErr error) {
	laspobj.ContextUpdatesBeginTx(ctx)
	defer func() {
		if rtnErr != nil {
			laspobj.ContextUpdatesRollbackTx(ctx)
		} else {
			laspobj.ContextUpdatesCommitTx(ctx)
		}
	}()
	return txwrap.WithTx(ctx, globalDB, fn)
}

func WithTxRtn[RT any](ctx context.Context, fn func(tx *TxWrap) (RT, error)) (rtnVal RT, rtnErr error) {
	laspobj.ContextUpdatesBeginTx(ctx)
	defer func() {
		if rtnErr != nil {
			laspobj.ContextUpdatesRollbackTx(ctx)
		} else {
			laspobj.ContextUpdatesCommitTx(ctx)
		}
	}()
	return txwrap.WithTxRtn(ctx, globalDB, fn)
}
