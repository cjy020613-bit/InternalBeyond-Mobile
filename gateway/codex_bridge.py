from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Any, AsyncIterator


class RpcError(RuntimeError):
    pass


class CodexBridge:
    """One long-lived `codex app-server` process shared by browser sessions."""

    def __init__(self, codex_bin: str = "codex", codex_home: str | None = None) -> None:
        self.codex_bin, self.codex_home = codex_bin, codex_home
        self.process: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._next_id = 1
        self._pending: dict[int, asyncio.Future[Any]] = {}
        self._thread_queues: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._active_threads: set[str] = set()
        self._write_lock, self._start_lock = asyncio.Lock(), asyncio.Lock()
        self.last_usage: dict[str, Any] = {}

    async def start(self) -> None:
        async with self._start_lock:
            if self.process and self.process.returncode is None:
                return
            self._active_threads.clear()
            env = os.environ.copy()
            for key in ("OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_BASE_URL", "OPENAI_API_BASE"):
                env.pop(key, None)
            if self.codex_home:
                Path(self.codex_home).mkdir(parents=True, exist_ok=True)
                env["CODEX_HOME"] = self.codex_home
            self.process = await asyncio.create_subprocess_exec(
                self.codex_bin, "app-server", stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env)
            self._reader_task = asyncio.create_task(self._read_loop())
            asyncio.create_task(self._drain_stderr())
            await self.request("initialize", {"clientInfo": {"name": "internal-beyond-gateway", "version": "0.1.0"},
                                              "capabilities": {"experimentalApi": True}})
            await self.notify("initialized", {})

    async def stop(self) -> None:
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), 5)
            except asyncio.TimeoutError:
                self.process.kill()
        if self._reader_task:
            self._reader_task.cancel()

    async def _send(self, payload: dict[str, Any]) -> None:
        if not self.process or not self.process.stdin:
            raise RpcError("Codex App Server is unavailable")
        async with self._write_lock:
            self.process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode())
            await self.process.stdin.drain()

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        if not self.process or self.process.returncode is not None:
            await self.start()
        request_id = self._next_id
        self._next_id += 1
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        await self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})
        try:
            return await asyncio.wait_for(future, 120)
        finally:
            self._pending.pop(request_id, None)

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        await self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    async def _read_loop(self) -> None:
        assert self.process and self.process.stdout
        while True:
            raw = await self.process.stdout.readline()
            if not raw:
                error = RpcError("Codex App Server exited")
                for future in list(self._pending.values()):
                    if not future.done(): future.set_exception(error)
                return
            try: message = json.loads(raw)
            except json.JSONDecodeError: continue
            if "id" in message:
                future = self._pending.get(int(message["id"]))
                if future and not future.done():
                    if message.get("error"): future.set_exception(RpcError(json.dumps(message["error"], ensure_ascii=False)))
                    else: future.set_result(message.get("result"))
                continue
            params = message.get("params") or {}
            thread_id = self._thread_id(params)
            method = str(message.get("method", ""))
            if "usage" in method.lower() or "token" in method.lower(): self.last_usage = params
            if thread_id:
                for queue in list(self._thread_queues.get(thread_id, ())): await queue.put(message)

    async def _drain_stderr(self) -> None:
        assert self.process and self.process.stderr
        while await self.process.stderr.readline(): pass

    @staticmethod
    def _thread_id(params: dict[str, Any]) -> str:
        thread, turn = params.get("thread") or {}, params.get("turn") or {}
        return str(params.get("threadId") or params.get("thread_id") or thread.get("id") or turn.get("threadId") or "")

    @staticmethod
    def _result_id(result: Any, noun: str) -> str:
        if not isinstance(result, dict): return ""
        nested = result.get(noun) if isinstance(result.get(noun), dict) else {}
        return str(result.get(f"{noun}Id") or result.get(f"{noun}_id") or nested.get("id") or result.get("id") or "")

    async def start_thread(self, model: str, cwd: str) -> str:
        result = await self.request("thread/start", {"model": model, "cwd": cwd,
                                    "approvalPolicy": "never", "sandbox": "workspace-write",
                                    "experimentalRawEvents": False})
        thread_id = self._result_id(result, "thread")
        if not thread_id: raise RpcError("thread/start returned no thread id")
        self._active_threads.add(thread_id)
        return thread_id

    async def resume_thread(self, thread_id: str) -> None:
        if thread_id in self._active_threads: return
        await self.request("thread/resume", {"threadId": thread_id})
        self._active_threads.add(thread_id)

    async def stream_turn(self, thread_id: str, text: str, model: str) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._thread_queues[thread_id].add(queue)
        try:
            result = await self.request("turn/start", {"threadId": thread_id, "model": model,
                                        "input": [{"type": "text", "text": text}]})
            yield {"type": "turn.started", "turn_id": self._result_id(result, "turn")}
            while True:
                event = self.normalize_event(await asyncio.wait_for(queue.get(), 600))
                if event:
                    yield event
                    if event["type"] in {"turn.completed", "turn.failed"}: return
        finally:
            self._thread_queues[thread_id].discard(queue)

    @staticmethod
    def normalize_event(event: dict[str, Any]) -> dict[str, Any] | None:
        method, params = str(event.get("method") or ""), event.get("params") or {}
        if method in {"item/agentMessage/delta", "agentMessage/delta"}:
            return {"type": "text.delta", "delta": str(params.get("delta") or params.get("text") or "")}
        if method == "item/completed":
            item = params.get("item") or {}
            if item.get("type") in {"agentMessage", "message"}:
                text = item.get("text") or item.get("content") or ""
                return {"type": "text.completed", "text": text if isinstance(text, str) else ""}
        if method in {"thread/tokenUsage/updated", "turn/tokenUsage/updated"}:
            return {"type": "usage", "usage": params.get("tokenUsage") or params.get("usage") or params}
        if method == "contextCompaction": return {"type": "context.compaction", "data": params}
        if method == "turn/completed": return {"type": "turn.completed", "data": params}
        if method in {"turn/failed", "error"}: return {"type": "turn.failed", "error": params.get("message") or params.get("error") or method}
        return None

    async def account_status(self) -> dict[str, Any]:
        async def optional(method: str) -> Any:
            try: return await self.request(method, {})
            except Exception: return None
        account, rate_limits, usage = await asyncio.gather(optional("account/read"), optional("account/rateLimits/read"), optional("account/usage/read"))
        if isinstance(account, dict) and isinstance(account.get("account"), dict): account = account["account"]
        if isinstance(rate_limits, dict) and isinstance(rate_limits.get("rateLimits"), dict): rate_limits = rate_limits["rateLimits"]
        if isinstance(usage, dict) and isinstance(usage.get("usage"), dict): usage = usage["usage"]
        return {"account": account or {}, "rate_limits": rate_limits or {}, "usage": usage or self.last_usage or {}}
