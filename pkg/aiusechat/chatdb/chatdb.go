// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package chatdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"github.com/Labyricorn/labyrispace/db"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/chatstore"
	"github.com/Labyricorn/labyrispace/pkg/aiusechat/uctypes"
	"github.com/Labyricorn/labyrispace/pkg/laspbase"
	"github.com/Labyricorn/labyrispace/pkg/util/migrateutil"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

const ChatsDBName = "chats.db"
const DBTimeout = 5 * time.Second
const DefaultListLimit = 100

type ChatDB struct {
	db *sqlx.DB
}

func GetDBName() string {
	return filepath.Join(laspbase.GetLaspDataDir(), laspbase.LaspDBDir, ChatsDBName)
}

// MakeChatDB opens (and migrates) the chats database. An empty path opens an in-memory database.
func MakeChatDB(path string) (*ChatDB, error) {
	dsn := ":memory:"
	if path != "" {
		dsn = fmt.Sprintf("file:%s?mode=rwc&_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on", path)
	}
	sqlDB, err := sqlx.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening chats db: %w", err)
	}
	// A single connection keeps ":memory:" databases coherent and serializes writers.
	sqlDB.DB.SetMaxOpenConns(1)
	if _, err := sqlDB.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("enabling foreign keys: %w", err)
	}
	err = migrateutil.Migrate("chats", sqlDB.DB, db.ChatsMigrationFS, "migrations-chats")
	if err != nil {
		return nil, err
	}
	return &ChatDB{db: sqlDB}, nil
}

// InitChatStore attaches durable storage to the default chat store.
func InitChatStore() error {
	if err := laspbase.EnsureLaspDBDir(); err != nil {
		return err
	}
	chatDB, err := MakeChatDB(GetDBName())
	if err != nil {
		return err
	}
	chatstore.DefaultChatStore.SetPersister(chatDB)
	log.Printf("chat store initialized\n")
	return nil
}

func (c *ChatDB) UpsertMessage(chat *uctypes.AIChat, aiMode string, seq int, msg uctypes.GenAIMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshaling message: %w", err)
	}
	now := time.Now().UnixMilli()
	ctx, cancel := context.WithTimeout(context.Background(), DBTimeout)
	defer cancel()
	tx, err := c.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO chats (chatid, apitype, model, apiversion, aimode, createdts, updatedts)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(chatid) DO UPDATE SET updatedts = excluded.updatedts`,
		chat.ChatId, chat.APIType, chat.Model, chat.APIVersion, aiMode, now, now)
	if err != nil {
		return fmt.Errorf("upserting chat: %w", err)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO messages (chatid, messageid, seq, role, data)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(chatid, messageid) DO UPDATE SET data = excluded.data, role = excluded.role`,
		chat.ChatId, msg.GetMessageId(), seq, msg.GetRole(), string(data))
	if err != nil {
		return fmt.Errorf("upserting message: %w", err)
	}
	return tx.Commit()
}

func (c *ChatDB) DeleteMessage(chatId string, messageId string) error {
	ctx, cancel := context.WithTimeout(context.Background(), DBTimeout)
	defer cancel()
	_, err := c.db.ExecContext(ctx, `DELETE FROM messages WHERE chatid = ? AND messageid = ?`, chatId, messageId)
	return err
}

func (c *ChatDB) DeleteChat(chatId string) error {
	ctx, cancel := context.WithTimeout(context.Background(), DBTimeout)
	defer cancel()
	_, err := c.db.ExecContext(ctx, `DELETE FROM chats WHERE chatid = ?`, chatId)
	return err
}

func (c *ChatDB) SetTitleIfEmpty(chatId string, title string) error {
	ctx, cancel := context.WithTimeout(context.Background(), DBTimeout)
	defer cancel()
	_, err := c.db.ExecContext(ctx, `UPDATE chats SET title = ? WHERE chatid = ? AND title = ''`, title, chatId)
	return err
}

type chatRow struct {
	ChatId     string `db:"chatid"`
	APIType    string `db:"apitype"`
	Model      string `db:"model"`
	APIVersion string `db:"apiversion"`
}

type messageRow struct {
	Data string `db:"data"`
}

func (c *ChatDB) LoadChat(chatId string) (*uctypes.AIChat, error) {
	ctx, cancel := context.WithTimeout(context.Background(), DBTimeout)
	defer cancel()
	var row chatRow
	err := c.db.GetContext(ctx, &row, `SELECT chatid, apitype, model, apiversion FROM chats WHERE chatid = ?`, chatId)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var msgRows []messageRow
	err = c.db.SelectContext(ctx, &msgRows, `SELECT data FROM messages WHERE chatid = ? ORDER BY seq`, chatId)
	if err != nil {
		return nil, err
	}
	chat := &uctypes.AIChat{
		ChatId:         row.ChatId,
		APIType:        row.APIType,
		Model:          row.Model,
		APIVersion:     row.APIVersion,
		NativeMessages: make([]uctypes.GenAIMessage, 0, len(msgRows)),
	}
	for _, msgRow := range msgRows {
		msg, err := chatstore.DecodeMessage(row.APIType, []byte(msgRow.Data))
		if err != nil {
			return nil, fmt.Errorf("decoding message in chat %s: %w", chatId, err)
		}
		chat.NativeMessages = append(chat.NativeMessages, msg)
	}
	return chat, nil
}

type summaryRow struct {
	ChatId       string `db:"chatid"`
	Title        string `db:"title"`
	AIMode       string `db:"aimode"`
	APIType      string `db:"apitype"`
	Model        string `db:"model"`
	CreatedTs    int64  `db:"createdts"`
	UpdatedTs    int64  `db:"updatedts"`
	MessageCount int    `db:"messagecount"`
}

func (c *ChatDB) ListChats(limit int) ([]uctypes.AIChatSummary, error) {
	if limit <= 0 {
		limit = DefaultListLimit
	}
	ctx, cancel := context.WithTimeout(context.Background(), DBTimeout)
	defer cancel()
	var rows []summaryRow
	err := c.db.SelectContext(ctx, &rows, `SELECT c.chatid, c.title, c.aimode, c.apitype, c.model, c.createdts, c.updatedts,
			(SELECT COUNT(*) FROM messages m WHERE m.chatid = c.chatid) AS messagecount
		FROM chats c ORDER BY c.updatedts DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	rtn := make([]uctypes.AIChatSummary, 0, len(rows))
	for _, row := range rows {
		rtn = append(rtn, uctypes.AIChatSummary(row))
	}
	return rtn, nil
}
