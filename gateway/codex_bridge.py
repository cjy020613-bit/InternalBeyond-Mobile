from __future__ import annotations

import asyncio
import dataclasses
import enum
import json
import os
from pathlib import Path
from typing import Any, AsyncIterator


class RpcError(RuntimeError):
    pass


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(mode="json", by_alias=True, exclude_none=True)
        except TypeError:
            return value.model_dump()
    if dataclasses.is_dataclass(value):
        return dataclasses.asdict(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "__dict__"):
        return {str(k): _jsonable(v) for k, v in vars(value).items() if not k.startswith("_")}
    return str(value)


def _enum_text(value: Any) -> str:
    if isinstance(value, enum.Enum):
        value = value.value
    return str(value or "")


def _message_text(value: Any) -> str:
    """Extract visible text from an SDK message value without assuming one schema."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        parts = [_message_text(item) for item in value]
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        direct = value.get("text") or value.get("content") or value.get("value")
        if direct is value:
            return ""
        return _message_text(direct)
    for attr in ("text", "content", "value"):
        direct = getattr(value, attr, None)
        if direct is not None and direct is not value:
            text = _message_text(direct)
            if text:
                return text
    return ""


def _assistant_text_fallback(result: Any) -> str:
    """Recover the last visible agent message when final_response is absent.

    The Codex SDK may finish a turn with agent-message items even when its
    convenience ``final_response`` field is empty (for example when phase
    metadata differs across protocol versions). We inspect the typed objects
    directly and deliberately ignore reasoning/tool items.
    """
    fallback = ""
    for wrapped in getattr(result, "items", None) or []:
        item = getattr(wrapped, "root", wrapped)
        cls = type(item).__name__.lower()
        kind = _enum_text(getattr(item, "type", None) or getattr(item, "kind", None)).lower()
        normalized = kind.replace("_", "").replace("-", "").replace(" ", "")
        role = _enum_text(getattr(item, "role", None)).lower()
        is_agent = (
            "agentmessage" in cls
            or "assistantmessage" in cls
            or normalized in {"agentmessage", "assistantmessage"}
            or (normalized == "message" and role in {"", "assistant", "agent"})
        )
        if not is_agent:
            continue
        text = _message_text(getattr(item, "text", None) or getattr(item, "content", None))
        if text.strip():
            fallback = text
    return fallback


def _result_shape(result: Any) -> dict[str, Any]:
    """Return content-free diagnostics: only schema names, phases and lengths."""
    final = str(getattr(result, "final_response", None) or "")
    items: list[dict[str, Any]] = []
    for wrapped in (getattr(result, "items", None) or [])[:24]:
        item = getattr(wrapped, "root", wrapped)
        text = _message_text(getattr(item, "text", None) or getattr(item, "content", None))
        items.append({
            "wrapper": type(wrapped).__name__,
            "class": type(item).__name__,
            "type": _enum_text(getattr(item, "type", None) or getattr(item, "kind", None))[:80],
            "phase": _enum_text(getattr(item, "phase", None))[:80],
            "role": _enum_text(getattr(item, "role", None))[:40],
            "text_len": len(text),
        })
    return {
        "result_class": type(result).__name__,
        "status": _enum_text(getattr(result, "status", None))[:80],
        "final_len": len(final),
        "item_count": len(getattr(result, "items", None) or []),
        "items": items,
    }


class CodexBridge:
    """Long-lived wrapper around the official `openai-codex` Python SDK.

    The SDK owns the matching Codex runtime and reuses ChatGPT/Codex account auth
    from CODEX_HOME. The browser never receives OpenAI credentials.
    """

    def __init__(self, codex_home: str | None = None) -> None:
        self.codex_home = codex_home
        self.client: Any = None
        self._start_lock = asyncio.Lock()
        self._threads: dict[str, Any] = {}
        self._login_handles: dict[str, Any] = {}
        self._login_states: dict[str, dict[str, Any]] = {}
        self._login_tasks: dict[str, asyncio.Task[None]] = {}
        self.last_usage: dict[str, Any] = {}

    async def start(self) -> None:
        async with self._start_lock:
            if self.client is not None:
                return
            if self.codex_home:
                Path(self.codex_home).mkdir(parents=True, exist_ok=True)
                os.environ["CODEX_HOME"] = self.codex_home
            # This gateway intentionally uses ChatGPT/Codex login rather than API billing.
            for key in ("OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_BASE_URL", "OPENAI_API_BASE"):
                os.environ.pop(key, None)
            try:
                from openai_codex import AsyncCodex
            except ImportError as exc:
                raise RpcError("openai-codex is not installed") from exc
            try:
                client = AsyncCodex()
                await client.__aenter__()
                self.client = client
            except Exception as exc:
                raise RpcError(f"Unable to start Codex SDK: {exc}") from exc

    async def stop(self) -> None:
        for task in list(self._login_tasks.values()):
            if not task.done():
                task.cancel()
        self._login_tasks.clear()
        self._login_handles.clear()
        self._threads.clear()
        if self.client is not None:
            client, self.client = self.client, None
            try:
                await client.__aexit__(None, None, None)
            except Exception:
                try:
                    await client.close()
                except Exception:
                    pass

    async def _sandbox(self) -> Any:
        try:
            from openai_codex import Sandbox
            return Sandbox.read_only
        except ImportError as exc:
            raise RpcError("openai-codex is not installed") from exc

    async def start_thread(
        self,
        model: str,
        cwd: str,
        base_instructions: str = "",
        developer_instructions: str = "",
    ) -> str:
        await self.start()
        try:
            thread = await self.client.thread_start(
                model=model or None,
                cwd=cwd,
                sandbox=await self._sandbox(),
                base_instructions=base_instructions or None,
                developer_instructions=developer_instructions or None,
                ephemeral=False,
            )
            thread_id = str(getattr(thread, "id", "") or "")
            if not thread_id:
                raise RpcError("Codex SDK returned no thread id")
            self._threads[thread_id] = thread
            return thread_id
        except Exception as exc:
            if isinstance(exc, RpcError):
                raise
            raise RpcError(f"thread_start failed: {exc}") from exc

    async def resume_thread(
        self,
        thread_id: str,
        model: str = "",
        cwd: str = "",
        base_instructions: str = "",
        developer_instructions: str = "",
    ) -> None:
        await self.start()
        if thread_id in self._threads:
            return
        try:
            thread = await self.client.thread_resume(
                thread_id,
                model=model or None,
                cwd=cwd or None,
                sandbox=await self._sandbox(),
                base_instructions=base_instructions or None,
                developer_instructions=developer_instructions or None,
                include_turns=False,
            )
            self._threads[thread_id] = thread
        except Exception as exc:
            raise RpcError(f"thread_resume failed: {exc}") from exc

    async def stream_turn(self, thread_id: str, text: str, model: str) -> AsyncIterator[dict[str, Any]]:
        """Compatibility stream used by the existing HTTP layer.

        Version one deliberately returns one final text chunk. That gives us a
        reliable subscription-backed chat first; token streaming can be added on
        top of the SDK's TurnHandle later without changing the browser contract.
        """
        await self.start()
        thread = self._threads.get(thread_id)
        if thread is None:
            raise RpcError("thread is not active; resume it before starting a turn")
        try:
            result = await thread.run(text, model=model or None, sandbox=await self._sandbox())
        except Exception as exc:
            raise RpcError(f"Codex turn failed: {exc}") from exc

        turn_id = str(getattr(result, "id", "") or "")
        yield {"type": "turn.started", "turn_id": turn_id}

        usage = _jsonable(getattr(result, "usage", None)) or {}
        if isinstance(usage, dict) and usage:
            self.last_usage = usage
            yield {"type": "usage", "usage": usage}

        error = getattr(result, "error", None)
        if error:
            print("[CY_CODEX_RESULT] " + json.dumps(_result_shape(result), ensure_ascii=False, separators=(",", ":")), flush=True)
            yield {"type": "turn.failed", "error": _jsonable(error)}
            return

        text_out = str(getattr(result, "final_response", None) or "")
        fallback = ""
        if not text_out:
            fallback = _assistant_text_fallback(result)
            text_out = fallback
        shape = _result_shape(result)
        shape["fallback_len"] = len(fallback)
        shape["output_len"] = len(text_out)
        shape["paw_marker"] = bool(text_out and "[[CY_PAW" in text_out)
        print("[CY_CODEX_RESULT] " + json.dumps(shape, ensure_ascii=False, separators=(",", ":")), flush=True)
        if not text_out:
            raise RpcError("Codex turn completed without assistant text")
        yield {"type": "text.completed", "text": text_out}
        yield {"type": "turn.completed", "data": {"id": turn_id, "status": _jsonable(getattr(result, "status", None))}}

    async def start_device_login(self) -> dict[str, Any]:
        await self.start()
        try:
            handle = await self.client.login_chatgpt_device_code()
        except Exception as exc:
            raise RpcError(f"Unable to start ChatGPT device login: {exc}") from exc
        login_id = str(getattr(handle, "login_id", "") or "")
        if not login_id:
            raise RpcError("Codex SDK returned no login id")
        state = {
            "login_id": login_id,
            "status": "pending",
            "verification_url": str(getattr(handle, "verification_url", "") or ""),
            "user_code": str(getattr(handle, "user_code", "") or ""),
        }
        self._login_handles[login_id] = handle
        self._login_states[login_id] = state
        self._login_tasks[login_id] = asyncio.create_task(self._wait_for_login(login_id, handle))
        return dict(state)

    async def _wait_for_login(self, login_id: str, handle: Any) -> None:
        state = self._login_states.setdefault(login_id, {"login_id": login_id})
        try:
            result = await handle.wait()
            state["status"] = "completed"
            state["result"] = _jsonable(result)
            try:
                account = await self.client.account(refresh_token=True)
                state["account"] = _jsonable(account)
            except Exception:
                pass
        except asyncio.CancelledError:
            state["status"] = "cancelled"
            raise
        except Exception as exc:
            state["status"] = "failed"
            state["error"] = str(exc)
        finally:
            self._login_handles.pop(login_id, None)

    async def device_login_status(self, login_id: str) -> dict[str, Any]:
        await self.start()
        state = self._login_states.get(login_id)
        if not state:
            raise RpcError("unknown login id")
        return dict(state)

    async def account_status(self) -> dict[str, Any]:
        await self.start()
        account_data: dict[str, Any] = {}
        logged_in = False
        try:
            response = await self.client.account(refresh_token=False)
            dumped = _jsonable(response)
            if isinstance(dumped, dict):
                account_data = dumped.get("account") if isinstance(dumped.get("account"), dict) else dumped
                logged_in = bool(account_data)
        except Exception:
            account_data = {}
            logged_in = False

        models: list[str] = []
        try:
            model_response = _jsonable(await self.client.models())
            candidates: Any = model_response
            if isinstance(model_response, dict):
                candidates = model_response.get("data") or model_response.get("models") or model_response.get("items") or []
            if isinstance(candidates, list):
                for item in candidates:
                    if isinstance(item, str):
                        models.append(item)
                    elif isinstance(item, dict):
                        model_id = item.get("id") or item.get("model") or item.get("slug")
                        if model_id:
                            models.append(str(model_id))
        except Exception:
            pass

        return {
            "logged_in": logged_in,
            "account": account_data,
            "models": models,
            "usage": self.last_usage or {},
            "sdk": "openai-codex",
        }

    @staticmethod
    def normalize_event(event: dict[str, Any]) -> dict[str, Any] | None:
        """Retained for old tests and for a future low-level streaming adapter."""
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
        if method == "contextCompaction":
            return {"type": "context.compaction", "data": params}
        if method == "turn/completed":
            return {"type": "turn.completed", "data": params}
        if method in {"turn/failed", "error"}:
            return {"type": "turn.failed", "error": params.get("message") or params.get("error") or method}
        return None
