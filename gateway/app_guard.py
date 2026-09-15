from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path


def _ensure_codex_file_auth_store() -> None:
    """Persist ChatGPT/Codex credentials on the Railway volume.

    Headless containers should not depend on an OS keyring or process-only
    credential store. CODEX_HOME lives on /data, so force Codex to use its
    official file-backed auth store before the SDK/app-server starts.
    """
    raw_home = str(os.getenv("CODEX_HOME", "")).strip()
    if not raw_home:
        return
    home = Path(raw_home)
    home.mkdir(parents=True, exist_ok=True)
    config_path = home / "config.toml"
    try:
        current = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    except OSError:
        current = ""

    setting = 'cli_auth_credentials_store = "file"'
    pattern = re.compile(r"(?m)^\s*cli_auth_credentials_store\s*=\s*[^\n#]+")
    if pattern.search(current):
        updated = pattern.sub(setting, current, count=1)
    else:
        suffix = "" if not current or current.endswith("\n") else "\n"
        updated = current + suffix + setting + "\n"

    if updated != current:
        config_path.write_text(updated, encoding="utf-8")


_ensure_codex_file_auth_store()

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
