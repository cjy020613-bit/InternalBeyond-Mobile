from __future__ import annotations

import contextlib
import json
import os
from typing import Any, AsyncIterator
from urllib.parse import urlparse


class OmbreError(RuntimeError):
    pass


def _clean_url(value: str) -> str:
    base = str(value or "").strip().rstrip("/")
    if not base:
        return ""
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise OmbreError("CY_OB_URL must be an absolute http(s) URL")
    return base if parsed.path.rstrip("/").endswith("/mcp") else base + "/mcp"


def _text_blocks(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", None) or []:
        if getattr(block, "type", None) == "text" and getattr(block, "text", None):
            parts.append(str(block.text))
    return "\n".join(parts).strip()


def _result_payload(result: Any) -> Any:
    structured = getattr(result, "structuredContent", None)
    if structured is None:
        structured = getattr(result, "structured_content", None)
    if structured is not None:
        return structured
    text = _text_blocks(result)
    if not text:
        return ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


class OmbreClient:
    """Small compatibility client for Ombre Brain's Streamable HTTP MCP endpoint."""

    def __init__(self, url: str | None = None, token: str | None = None) -> None:
        self.url = _clean_url(url if url is not None else os.getenv("CY_OB_URL", ""))
        self.token = str(token if token is not None else os.getenv("CY_OB_TOKEN", "")).strip()

    @property
    def configured(self) -> bool:
        return bool(self.url)

    def _headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        # Ombre token/hybrid auth accepts bearer; the dedicated header keeps
        # compatibility with older static-token deployments.
        return {
            "Authorization": "Bearer " + self.token,
            "Ombre-MCP-Token": self.token,
        }

    @contextlib.asynccontextmanager
    async def _session(self) -> AsyncIterator[Any]:
        if not self.configured:
            raise OmbreError("Ombre Brain is not configured")
        try:
            import httpx
            from mcp import ClientSession
            from mcp.client import streamable_http as transport
        except ImportError as exc:
            raise OmbreError("MCP client dependencies are not installed") from exc

        headers = self._headers()
        timeout = httpx.Timeout(connect=10.0, read=90.0, write=30.0, pool=10.0)
        async with httpx.AsyncClient(headers=headers, timeout=timeout, follow_redirects=True) as http_client:
            if hasattr(transport, "streamable_http_client"):
                cm = transport.streamable_http_client(self.url, http_client=http_client)
            elif hasattr(transport, "streamablehttp_client"):
                cm = transport.streamablehttp_client(self.url, headers=headers)
            else:
                raise OmbreError("installed MCP SDK has no Streamable HTTP client")
            async with cm as streams:
                read_stream, write_stream = streams[0], streams[1]
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    yield session

    async def call(self, tool: str, arguments: dict[str, Any] | None = None) -> Any:
        try:
            async with self._session() as session:
                result = await session.call_tool(tool, arguments=arguments or {})
        except OmbreError:
            raise
        except BaseException as exc:
            # anyio may wrap transport failures in ExceptionGroup.
            messages: list[str] = []

            def flatten(error: BaseException) -> None:
                children = getattr(error, "exceptions", None)
                if children:
                    for child in children:
                        flatten(child)
                else:
                    messages.append(str(error) or repr(error))

            flatten(exc)
            raise OmbreError("; ".join(messages)[:1200] or "Ombre MCP call failed") from exc

        if bool(getattr(result, "isError", False) or getattr(result, "is_error", False)):
            raise OmbreError(_text_blocks(result) or f"Ombre tool {tool} returned an error")
        return _result_payload(result)

    async def status(self) -> dict[str, Any]:
        if not self.configured:
            return {"configured": False, "online": False, "tools": []}
        try:
            async with self._session() as session:
                response = await session.list_tools()
                tools = [str(getattr(item, "name", "")) for item in getattr(response, "tools", []) if getattr(item, "name", None)]
            return {
                "configured": True,
                "online": True,
                "tools": tools,
                "has_search": "breath_search" in tools,
                "has_hold": "hold" in tools,
            }
        except Exception as exc:
            return {"configured": True, "online": False, "tools": [], "error": str(exc)}

    async def search(self, query: str, domain: str = "", max_results: int = 5) -> Any:
        text = str(query or "").strip()
        if not text:
            return ""
        return await self.call(
            "breath_search",
            {
                "query": text,
                "domain": str(domain or ""),
                "max_results": max(1, min(12, int(max_results or 5))),
            },
        )

    async def remember(
        self,
        content: str,
        title: str = "",
        tags: str = "",
        importance: int = 5,
        valence: float = -1,
        arousal: float = -1,
    ) -> Any:
        text = str(content or "").strip()
        if not text:
            raise OmbreError("memory content is empty")
        return await self.call(
            "hold",
            {
                "content": text,
                "title": str(title or ""),
                "tags": str(tags or ""),
                "importance": max(1, min(10, int(importance or 5))),
                "valence": float(valence),
                "arousal": float(arousal),
            },
        )
