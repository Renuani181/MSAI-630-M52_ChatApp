"""
User memory management — stores and retrieves user context across sessions.
Each user gets a JSON file with their profile, preferences, and facts.
"""
import json
import os
from datetime import datetime
from pathlib import Path

MEMORY_DIR = Path(__file__).parent / "user_memories"
MEMORY_DIR.mkdir(exist_ok=True)


def _memory_path(user_id: str) -> Path:
    safe_id = "".join(c for c in user_id if c.isalnum() or c in "-_")
    return MEMORY_DIR / f"{safe_id}.json"


def load_memory(user_id: str) -> dict:
    path = _memory_path(user_id)
    if path.exists():
        return json.loads(path.read_text())
    return {
        "user_id": user_id,
        "created_at": datetime.utcnow().isoformat(),
        "facts": [],
        "preferences": {},
        "summary": "",
    }


def save_memory(user_id: str, memory: dict) -> None:
    memory["updated_at"] = datetime.utcnow().isoformat()
    _memory_path(user_id).write_text(json.dumps(memory, indent=2))


def add_fact(user_id: str, fact: str) -> None:
    memory = load_memory(user_id)
    if fact not in memory["facts"]:
        memory["facts"].append(fact)
        save_memory(user_id, memory)


def update_summary(user_id: str, summary: str) -> None:
    memory = load_memory(user_id)
    memory["summary"] = summary
    save_memory(user_id, memory)


def format_memory_for_prompt(user_id: str) -> str:
    memory = load_memory(user_id)
    parts = []
    if memory.get("summary"):
        parts.append(f"User summary: {memory['summary']}")
    if memory.get("facts"):
        facts_str = "\n".join(f"- {f}" for f in memory["facts"][-20:])
        parts.append(f"Known facts about user:\n{facts_str}")
    if memory.get("preferences"):
        prefs = ", ".join(f"{k}: {v}" for k, v in memory["preferences"].items())
        parts.append(f"User preferences: {prefs}")
    return "\n\n".join(parts) if parts else ""
