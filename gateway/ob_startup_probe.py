from __future__ import annotations

import asyncio
import re

from ob_client import OmbreClient


def classify_error(value: object) -> str:
    text = str(value or "").lower()
    if any(token in text for token in ("401", "403", "unauthorized", "forbidden", "oauth", "authentication", "authorization")):
        return "auth_required"
    if "404" in text or "not found" in text:
        return "endpoint_not_found"
    if "405" in text or "method not allowed" in text:
        return "method_not_allowed"
    if any(token in text for token in ("502", "503", "504", "bad gateway", "service unavailable", "gateway timeout")):
        return "upstream_error"
    if any(token in text for token in ("ssl", "certificate", "tls")):
        return "tls"
    if any(token in text for token in ("timeout", "timed out")):
        return "timeout"
    if any(token in text for token in ("name resolution", "name or service not known", "temporary failure in name resolution", "dns", "nodename nor servname")):
        return "dns"
    if any(token in text for token in ("connection refused", "all connection attempts failed", "connecterror", "connection reset")):
        return "network"
    return "unreachable"


def safe_detail(value: object) -> str:
    text = str(value or "").strip().replace("\n", " ")
    text = re.sub(r"https?://\S+", "<url>", text, flags=re.I)
    text = re.sub(r"Bearer\s+\S+", "Bearer <redacted>", text, flags=re.I)
    text = re.sub(r"(?i)(authorization|token)\s*[:=]\s*\S+", r"\1=<redacted>", text)
    return text[:180]


async def main() -> None:
    client = OmbreClient()
    if not client.configured:
        print("[CY_OB_PROBE] configured=0", flush=True)
        return

    try:
        # Read-only smoke test first so OmbreClient.call() can flatten nested transport errors.
        await asyncio.wait_for(client.search("测试", max_results=1), timeout=18)
    except asyncio.TimeoutError:
        print("[CY_OB_PROBE] configured=1 online=0 category=timeout", flush=True)
        return
    except Exception as exc:
        print(
            f"[CY_OB_PROBE] configured=1 online=0 category={classify_error(exc)} detail={safe_detail(exc)}",
            flush=True,
        )
        return

    try:
        status = await asyncio.wait_for(client.status(), timeout=18)
    except asyncio.TimeoutError:
        print("[CY_OB_PROBE] configured=1 online=1 search_call=ok tools=unknown status_category=timeout", flush=True)
        return
    except Exception as exc:
        print(
            f"[CY_OB_PROBE] configured=1 online=1 search_call=ok tools=unknown status_category={classify_error(exc)} detail={safe_detail(exc)}",
            flush=True,
        )
        return

    if not status.get("online"):
        error = status.get("error")
        print(
            f"[CY_OB_PROBE] configured=1 online=1 search_call=ok tools=unknown status_category={classify_error(error)} detail={safe_detail(error)}",
            flush=True,
        )
        return

    tools = {str(item) for item in status.get("tools") or []}
    has_search = "breath_search" in tools
    has_hold = "hold" in tools
    print(
        f"[CY_OB_PROBE] configured=1 online=1 search={int(has_search)} hold={int(has_hold)} tools={len(tools)} search_call=ok",
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
