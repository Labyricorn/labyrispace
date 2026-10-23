// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

//go:build sqlite_fts5

package chatdb

import "testing"

func TestFTS5Available(t *testing.T) {
	chatDB, err := MakeChatDB("")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := chatDB.db.Exec(`CREATE VIRTUAL TABLE fts_probe USING fts5(body)`); err != nil {
		t.Fatalf("FTS5 not compiled in: %v", err)
	}
	if _, err := chatDB.db.Exec(`INSERT INTO fts_probe(body) VALUES ('deploy the staging server')`); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := chatDB.db.Get(&n, `SELECT COUNT(*) FROM fts_probe WHERE fts_probe MATCH 'deploy*'`); err != nil || n != 1 {
		t.Fatalf("prefix match = %d, %v", n, err)
	}
}
