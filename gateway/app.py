from __future__ import annotations

import asyncio, hashlib, hmac, json, os, time, uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

try:
    from .codex_bridge import CodexBridge, RpcError
    from .store import ConversationStore
except ImportError:
    from codex_bridge import CodexBridge, RpcError
    from store import ConversationStore

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("CY_DATA_DIR", ROOT / "data"))
WORKSPACE = Path(os.getenv("CY_CODEX_WORKSPACE", DATA_DIR / "workspace")); WORKSPACE.mkdir(parents=True, exist_ok=True)
TOKEN = os.getenv("CY_GATEWAY_TOKEN", "")
DEFAULT_MODEL = os.getenv("CY_CODEX_MODEL", "gpt-5.6-terra")
ALLOWED_ORIGINS = [x.strip() for x in os.getenv(
    "CY_ALLOWED_ORIGINS",
    "https://cjy020613-bit.github.io,http://localhost:8000,http://127.0.0.1:8000",
).split(",") if x.strip()]
store = ConversationStore(DATA_DIR / "conversations.sqlite3")
bridge = CodexBridge(os.getenv("CODEX_HOME") or str(DATA_DIR / "codex-home"))
conversation_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
last_usage: dict[str, dict[str, Any]] = {}

CHAT_RUNTIME_INSTRUCTIONS = (
    "This Codex thread backs a private personal chat interface. "
    "Do not inspect, modify, or execute files or shell commands unless the user explicitly asks for coding work. "
    "For ordinary conversation, respond directly as a conversational assistant and return only the answer meant for the user."
)


class ChatRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: list[dict[str, Any]] = Field(default_factory=list)
    stream: bool = True
    conversation_id: str | None = None
    identity_id: str = "default"
    prompt_blocks: dict[str, str] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


def authorize(authorization: str | None = Header(default=None)) -> None:
    if not TOKEN:
        raise HTTPException(503, "CY_GATEWAY_TOKEN is not configured")
    supplied = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else ""
    if not hmac.compare_digest(supplied, TOKEN):
        raise HTTPException(401, "invalid pairing token")


def runtime_hash(body: ChatRequest) -> str:
    stable = {
        "model": body.model,
        "identity_id": body.identity_id,
        "identity": body.prompt_blocks.get("identity", ""),
    }
    return hashlib.sha256(json.dumps(stable, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def text_of(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(p.get("text") or "")
            for p in content
            if isinstance(p, dict) and p.get("type") in {"text", "input_text"}
        )
    return str(content)


def thread_instructions(body: ChatRequest) -> tuple[str, str]:
    identity = body.prompt_blocks.get("identity", "").strip()
    context = body.prompt_blocks.get("developer", "").strip()
    base = identity or "You are the assistant in a private personal conversation."
    developer = CHAT_RUNTIME_INSTRUCTIONS + (("\n\nCurrent app context:\n" + context) if context else "")
    return base, developer


def turn_text(body: ChatRequest, fresh: bool) -> str:
    messages = [m for m in body.messages if m.get("role") != "system"]
    if not messages:
        raise HTTPException(400, "messages is empty")
    if fresh and len(messages) > 1:
        transcript = "\n".join(f"{m.get('role','user')}: {text_of(m)}" for m in messages)
        return "Continue this conversation naturally. Here is the conversation refill:\n\n" + transcript
    return text_of(messages[-1])


async def acquire_thread(body: ChatRequest) -> tuple[str, bool, int]:
    cid = body.conversation_id or f"ephemeral:{uuid.uuid4()}"
    fingerprint = runtime_hash(body)
    current = store.get(cid)
    base, developer = thread_instructions(body)
    if current and current.identity_id != body.identity_id:
        raise HTTPException(409, "conversation belongs to another identity")
    if current and current.runtime_hash == fingerprint and current.resume_safe:
        try:
            await bridge.resume_thread(
                current.thread_id,
                model=body.model or DEFAULT_MODEL,
                cwd=str(WORKSPACE),
                base_instructions=base,
                developer_instructions=developer,
            )
            return current.thread_id, False, current.generation
        except Exception:
            store.mark(cid, False, "resume failed; rotating thread")
    generation = current.generation + 1 if current else 1
    thread_id = await bridge.start_thread(
        body.model or DEFAULT_MODEL,
        str(WORKSPACE),
        base_instructions=base,
        developer_instructions=developer,
    )
    store.save(cid, body.identity_id, thread_id, fingerprint, generation)
    return thread_id, True, generation


def chunk(rid: str, model: str, delta: str = "", finish: str | None = None) -> dict[str, Any]:
    return {
        "id": rid,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": ({"content": delta} if delta else {}), "finish_reason": finish}],
    }


async def produce(body: ChatRequest, output: asyncio.Queue[dict[str, Any]]) -> None:
    cid = body.conversation_id or f"ephemeral:{uuid.uuid4()}"
    rid = "chatcmpl-" + uuid.uuid4().hex
    collected: list[str] = []
    usage: dict[str, Any] = {}
    try:
        status = await bridge.account_status()
        if not status.get("logged_in"):
            raise RuntimeError("ChatGPT/Codex is not logged in on this gateway")
        async with conversation_locks[cid]:
            thread_id, fresh, generation = await acquire_thread(body)
            store.mark(cid, False, "turn in progress")
            async for event in bridge.stream_turn(thread_id, turn_text(body, fresh), body.model):
                if event["type"] == "text.delta":
                    collected.append(event.get("delta", ""))
                    await output.put({"kind": "delta", "id": rid, "text": event.get("delta", "")})
                elif event["type"] == "text.completed" and not collected:
                    collected.append(event.get("text", ""))
                    await output.put({"kind": "delta", "id": rid, "text": event.get("text", "")})
                elif event["type"] == "usage":
                    usage = event.get("usage") or {}
                    last_usage[body.identity_id] = usage
                elif event["type"] == "turn.failed":
                    raise RuntimeError(str(event.get("error") or "Codex turn failed"))
            store.save(cid, body.identity_id, thread_id, runtime_hash(body), generation, True)
            await output.put({"kind": "done", "id": rid, "text": "".join(collected), "usage": usage})
    except Exception as exc:
        store.mark(cid, False, str(exc))
        await output.put({"kind": "error", "id": rid, "error": str(exc)})


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await bridge.start()
    except Exception:
        pass
    yield
    await bridge.stop()


app = FastAPI(title="Internal Beyond Codex Gateway", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CY-Conversation-ID"],
)


@app.get("/healthz", dependencies=[Depends(authorize)])
async def health() -> dict[str, Any]:
    await bridge.start()
    return {"ok": True, "runtime": "openai-codex", "version": app.version}


@app.post("/v1/codex/login/device", dependencies=[Depends(authorize)])
async def login_device() -> dict[str, Any]:
    try:
        return await bridge.start_device_login()
    except RpcError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/v1/codex/login/device/{login_id}", dependencies=[Depends(authorize)])
async def login_device_status(login_id: str) -> dict[str, Any]:
    try:
        return await bridge.device_login_status(login_id)
    except RpcError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/v1/models", dependencies=[Depends(authorize)])
async def models() -> dict[str, Any]:
    data = await bridge.account_status()
    ids = data.get("models") or [DEFAULT_MODEL]
    return {"object": "list", "data": [{"id": mid, "object": "model", "owned_by": "codex-subscription"} for mid in ids]}


@app.get("/v1/codex/status", dependencies=[Depends(authorize)])
async def status() -> dict[str, Any]:
    data = await bridge.account_status()
    data["usage"] = data.get("usage") or next(iter(last_usage.values()), {})
    data.update({"model": DEFAULT_MODEL, "source": "openai-codex-sdk"})
    return data


@app.post("/v1/chat/completions", dependencies=[Depends(authorize)])
async def chat(body: ChatRequest, request: Request):
    output: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    task = asyncio.create_task(produce(body, output))
    if not body.stream:
        parts: list[str] = []
        item = await output.get()
        while item["kind"] == "delta":
            parts.append(item["text"])
            item = await output.get()
        await task
        if item["kind"] == "error":
            return JSONResponse(status_code=502, content={"error": {"message": item["error"], "type": "gateway_error"}})
        return {
            "id": item["id"],
            "object": "chat.completion",
            "created": int(time.time()),
            "model": body.model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": item.get("text") or "".join(parts)},
                "finish_reason": "stop",
            }],
            "usage": item.get("usage") or {},
        }

    async def event_stream():
        try:
            while True:
                item = await output.get()
                if item["kind"] == "delta":
                    yield "data: " + json.dumps(chunk(item["id"], body.model, item["text"]), ensure_ascii=False) + "\n\n"
                elif item["kind"] == "done":
                    final = chunk(item["id"], body.model, finish="stop")
                    if item.get("usage"):
                        final["usage"] = item["usage"]
                    yield "data: " + json.dumps(final, ensure_ascii=False) + "\n\ndata: [DONE]\n\n"
                    return
                else:
                    yield "data: " + json.dumps({"error": {"message": item["error"], "type": "gateway_error"}}, ensure_ascii=False) + "\n\ndata: [DONE]\n\n"
                    return
        finally:
            # Safari may detach. Do not cancel the producer: let Codex finish the turn.
            if await request.is_disconnected() and not task.done():
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
