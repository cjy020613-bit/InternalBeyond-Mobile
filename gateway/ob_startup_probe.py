from __future__ import annotations

import asyncio

from ob_client import OmbreClient


def classify_error(value: object) -> str:
    text = str(value or "").lower()
    if any(token in text for token in ("401", "403", "unauthorized", "forbidden", "oauth", "authentication", "authorization")):
        return "auth_required"
    if any(token in text for token in ("timeout", "timed out")):
        return "timeout"
    if any(token in text for token in ("name resolution", "dns", "nodename nor servname")):
        return "dns"
    return "unreachable"


async def main() -> None:
    client = OmbreClient()
    if not client.configured:
        print("[CY_OB_PROBE] configured=0", flush=True)
        return

    try:
        status = await asyncio.wait_for(client.status(), timeout=18)
    except asyncio.TimeoutError:
        print("[CY_OB_PROBE] configured=1 online=0 category=timeout", flush=True)
        return
    except Exception as exc:
        print(f"[CY_OB_PROBE] configured=1 online=0 category={classify_error(exc)}", flush=True)
        return

    if not status.get("online"):
        print(
            f"[CY_OB_PROBE] configured=1 online=0 category={classify_error(status.get('error'))}",
            flush=True,
        )
        return

    tools = {str(item) for item in status.get("tools") or []}
    has_search = "breath_search" in tools
    has_hold = "hold" in tools
    if not has_search:
        print(
            f"[CY_OB_PROBE] configured=1 online=1 search=0 hold={int(has_hold)} tools={len(tools)}",
            flush=True,
        )
        return

    try:
        # Read-only smoke test. The returned memory content is deliberately discarded.
        await asyncio.wait_for(client.search("测试", max_results=1), timeout=18)
        search_call = "ok"
    except asyncio.TimeoutError:
        search_call = "timeout"
    except Exception as exc:
        search_call = classify_error(exc)

    print(
        f"[CY_OB_PROBE] configured=1 online=1 search=1 hold={int(has_hold)} tools={len(tools)} search_call={search_call}",
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
