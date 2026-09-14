from __future__ import annotations

import asyncio

import app as core

_original_recall_for_turn = core.recall_for_turn


async def recall_for_turn_guarded(body):
    """Never let long-term recall block the primary chat path.

    Ombre remains connected and is still queried every normal turn, but if a
    recall cannot finish quickly we continue without memory for that turn.
    """
    try:
        return await asyncio.wait_for(_original_recall_for_turn(body), timeout=3.0)
    except TimeoutError:
        core.last_ob_error = "Ombre recall timed out after 3.0s; chat continued without memory"
        return ""


core.recall_for_turn = recall_for_turn_guarded
app = core.app
