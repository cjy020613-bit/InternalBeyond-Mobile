import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from app import ChatRequest, _visible_query, ombre, recall_for_turn, turn_text
from codex_bridge import CodexBridge, _assistant_text_fallback, _result_shape
from ob_client import OmbreClient, OmbreError, _clean_url, _result_payload
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

    def test_visible_agent_message_fallback(self):
        result = SimpleNamespace(items=[
            SimpleNamespace(root=SimpleNamespace(type="reasoning", text="hidden")),
            SimpleNamespace(root=SimpleNamespace(type="agentMessage", text="给用户看的回复", phase="commentary")),
        ])
        self.assertEqual(_assistant_text_fallback(result), "给用户看的回复")

    def test_typed_agent_message_fallback_without_type_field(self):
        AgentMessageThreadItem = type("AgentMessageThreadItem", (), {})
        item = AgentMessageThreadItem()
        item.text = "对象里的可见回复"
        item.phase = "commentary"
        result = SimpleNamespace(items=[SimpleNamespace(root=item)], final_response="", status="completed")
        self.assertEqual(_assistant_text_fallback(result), "对象里的可见回复")
        shape = _result_shape(result)
        self.assertEqual(shape["final_len"], 0)
        self.assertEqual(shape["items"][0]["text_len"], len("对象里的可见回复"))


class OmbreClientTests(unittest.IsolatedAsyncioTestCase):
    def test_url_normalization(self):
        self.assertEqual(_clean_url("https://memory.example.com"), "https://memory.example.com/mcp")
        self.assertEqual(_clean_url("https://memory.example.com/mcp/"), "https://memory.example.com/mcp")
        with self.assertRaises(OmbreError):
            _clean_url("memory.example.com")

    def test_result_payload_json_and_text(self):
        json_result = SimpleNamespace(content=[SimpleNamespace(type="text", text='{"ok":true}')], structuredContent=None)
        text_result = SimpleNamespace(content=[SimpleNamespace(type="text", text="记得这件事")], structuredContent=None)
        self.assertEqual(_result_payload(json_result), {"ok": True})
        self.assertEqual(_result_payload(text_result), "记得这件事")

    async def test_search_and_remember_arguments(self):
        client = OmbreClient("https://memory.example.com")
        calls = []

        async def fake_call(tool, arguments=None):
            calls.append((tool, arguments))
            return {"ok": True}

        client.call = fake_call
        await client.search("海边", domain="恋爱", max_results=99)
        await client.remember("一起去看海", title="海边", tags="约会", importance=12)
        self.assertEqual(calls[0][0], "breath_search")
        self.assertEqual(calls[0][1]["max_results"], 12)
        self.assertEqual(calls[1][0], "hold")
        self.assertEqual(calls[1][1]["importance"], 10)


class OmbreRecallTests(unittest.IsolatedAsyncioTestCase):
    def test_hidden_runtime_is_not_used_as_search_query(self):
        raw = "今晚吃火锅\n\n[CY_INTERACTION_RUNTIME]\n机器协议\n[/CY_INTERACTION_RUNTIME]"
        self.assertEqual(_visible_query(raw), "今晚吃火锅")
        self.assertEqual(_visible_query('[interaction.paw]\n{"action":"抱紧"}'), "")

    async def test_recall_failure_degrades_without_blocking_turn(self):
        body = ChatRequest(messages=[{"role": "user", "content": "还记得我们去海边吗"}])
        old_url, old_search = ombre.url, ombre.search

        async def fail_search(*args, **kwargs):
            raise OmbreError("temporary offline")

        try:
            ombre.url = "https://memory.example.com/mcp"
            ombre.search = fail_search
            recalled = await recall_for_turn(body)
            self.assertEqual(recalled, "")
            self.assertEqual(turn_text(body, False, recalled), "还记得我们去海边吗")
        finally:
            ombre.url = old_url
            ombre.search = old_search

    def test_recalled_memory_is_hidden_context_not_transcript_mutation(self):
        body = ChatRequest(messages=[{"role": "user", "content": "还记得吗"}])
        rendered = turn_text(body, False, "我记得那天一起看海。")
        self.assertIn("[CY_OB_MEMORY]", rendered)
        self.assertIn("我记得那天一起看海。", rendered)
        self.assertEqual(body.messages[0]["content"], "还记得吗")


if __name__ == "__main__":
    unittest.main()
