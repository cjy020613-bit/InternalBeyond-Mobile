from __future__ import annotations

import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Conversation:
    conversation_id: str
    identity_id: str
    thread_id: str
    runtime_hash: str
    generation: int
    resume_safe: bool
    last_error: str = ""


class ConversationStore:
    def __init__(self, path: str | Path) -> None:
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._init()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def _init(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
                conversation_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL,
                thread_id TEXT NOT NULL, runtime_hash TEXT NOT NULL,
                generation INTEGER NOT NULL DEFAULT 1,
                resume_safe INTEGER NOT NULL DEFAULT 1,
                last_error TEXT NOT NULL DEFAULT '', created_at REAL NOT NULL,
                updated_at REAL NOT NULL)""")

    def get(self, conversation_id: str) -> Conversation | None:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM conversations WHERE conversation_id=?", (conversation_id,)).fetchone()
        if not row:
            return None
        return Conversation(row["conversation_id"], row["identity_id"], row["thread_id"],
                            row["runtime_hash"], int(row["generation"]), bool(row["resume_safe"]), row["last_error"])

    def save(self, conversation_id: str, identity_id: str, thread_id: str,
             runtime_hash: str, generation: int, resume_safe: bool = True,
             last_error: str = "") -> Conversation:
        now = time.time()
        with self._lock, self._connect() as conn:
            conn.execute("""INSERT INTO conversations
                (conversation_id,identity_id,thread_id,runtime_hash,generation,resume_safe,last_error,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET
                identity_id=excluded.identity_id,thread_id=excluded.thread_id,
                runtime_hash=excluded.runtime_hash,generation=excluded.generation,
                resume_safe=excluded.resume_safe,last_error=excluded.last_error,updated_at=excluded.updated_at""",
                (conversation_id, identity_id, thread_id, runtime_hash, generation,
                 int(resume_safe), last_error[:500], now, now))
        return self.get(conversation_id)  # type: ignore[return-value]

    def mark(self, conversation_id: str, resume_safe: bool, error: str = "") -> None:
        with self._lock, self._connect() as conn:
            conn.execute("UPDATE conversations SET resume_safe=?,last_error=?,updated_at=? WHERE conversation_id=?",
                         (int(resume_safe), error[:500], time.time(), conversation_id))
