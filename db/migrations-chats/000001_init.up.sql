CREATE TABLE chats (
    chatid TEXT PRIMARY KEY,
    apitype TEXT NOT NULL,
    model TEXT NOT NULL,
    apiversion TEXT NOT NULL,
    aimode TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    createdts INTEGER NOT NULL,
    updatedts INTEGER NOT NULL
);

CREATE INDEX idx_chats_updatedts ON chats(updatedts DESC);

CREATE TABLE messages (
    chatid TEXT NOT NULL REFERENCES chats(chatid) ON DELETE CASCADE,
    messageid TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (chatid, messageid)
);

CREATE INDEX idx_messages_chat_seq ON messages(chatid, seq);
