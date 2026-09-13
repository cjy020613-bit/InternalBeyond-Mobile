import tempfile
import unittest
from pathlib import Path

from codex_bridge import CodexBridge
from store import ConversationStore


class StoreTests(unittest.TestCase):
    def test_round_trip_and_mark(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ConversationStore(Path(directory) / "sessions.sqlite3")
            store.save("c1", "yingying", "t1", "hash", 1)
            item = store.get("c1")
            self.assertIsNotNone(item)
            self.assertEqual(item.thread_id, "t1")
            self.assertTrue(item.resume_safe)
            store.mark("c1", False, "turn in progress")
            item = store.get("c1")
            self.assertFalse(item.resume_safe)
            self.assertEqual(item.last_error, "turn in progress")


class EventTests(unittest.TestCase):
    def test_delta_and_usage(self):
        delta = CodexBridge.normalize_event({"method": "item/agentMessage/delta", "params": {"delta": "你好"}})
        usage = CodexBridge.normalize_event({"method": "thread/tokenUsage/updated", "params": {"usage": {"inputTokens": 12}}})
        self.assertEqual(delta, {"type": "text.delta", "delta": "你好"})
        self.assertEqual(usage["usage"]["inputTokens"], 12)


if __name__ == "__main__":
    unittest.main()
