"""
AI Chat App with Memory — FastAPI backend
Uses Groq (Llama 3) with streaming, conversation history, and persistent user memory.
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

from groq import Groq
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from memory_store import (
    load_memory,
    save_memory,
    format_memory_for_prompt,
)

load_dotenv()

app = FastAPI(title="AI Chat App with Memory")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"

# Persistent chat history directory
HISTORY_DIR = Path(__file__).parent / "chat_histories"
HISTORY_DIR.mkdir(exist_ok=True)

# In-memory cache of conversation histories keyed by session_id
conversations: dict[str, list[dict]] = {}


def _history_path(session_id: str) -> Path:
    safe_id = "".join(c for c in session_id if c.isalnum() or c in "-_")
    return HISTORY_DIR / f"{safe_id}.json"


def _load_history(session_id: str) -> list[dict]:
    path = _history_path(session_id)
    if path.exists():
        data = json.loads(path.read_text())
        return data.get("messages", [])
    return []


def _save_history(session_id: str, messages: list[dict], user_id: str = ""):
    path = _history_path(session_id)
    existing = {}
    if path.exists():
        existing = json.loads(path.read_text())
    existing["session_id"] = session_id
    existing["user_id"] = user_id or existing.get("user_id", "")
    existing["messages"] = messages
    existing["updated_at"] = datetime.utcnow().isoformat()
    if "created_at" not in existing:
        existing["created_at"] = existing["updated_at"]
    path.write_text(json.dumps(existing, indent=2))


def _list_sessions(user_id: str) -> list[dict]:
    sessions = []
    for f in sorted(HISTORY_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        data = json.loads(f.read_text())
        if data.get("user_id") == user_id:
            msgs = data.get("messages", [])
            # Build a preview from the first user message
            preview = next((m["content"][:60] for m in msgs if m["role"] == "user"), "Empty session")
            sessions.append({
                "session_id": data["session_id"],
                "preview": preview,
                "message_count": len(msgs),
                "updated_at": data.get("updated_at", ""),
                "created_at": data.get("created_at", ""),
            })
    return sessions


SYSTEM_PROMPT_TEMPLATE = """You are a personalized AI assistant with memory. You remember things users tell you and provide increasingly personalized responses over time.

{memory_context}

Guidelines:
- When the user shares personal information (name, preferences, goals, facts about themselves), acknowledge it naturally and remember it.
- Reference what you know about the user when relevant to make responses feel personalized.
- After learning something new and important, briefly confirm you've noted it.
- Be warm, helpful, and conversational.
- If no memory context is provided yet, introduce yourself and invite the user to share a bit about themselves."""


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/memory/{user_id}")
def get_memory(user_id: str):
    return load_memory(user_id)


@app.get("/sessions/{user_id}")
def get_sessions(user_id: str):
    return {"sessions": _list_sessions(user_id)}


@app.get("/history/{session_id}")
def get_history(session_id: str):
    if session_id not in conversations:
        conversations[session_id] = _load_history(session_id)
    return {"messages": conversations.get(session_id, [])}


@app.post("/chat")
async def chat(req: ChatRequest):
    """Stream a response from Groq, maintaining conversation history and user memory."""
    if req.session_id not in conversations:
        conversations[req.session_id] = _load_history(req.session_id)

    history = conversations[req.session_id]
    history.append({"role": "user", "content": req.message})

    memory_context = format_memory_for_prompt(req.user_id)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        memory_context=memory_context or "No prior memory of this user yet."
    )

    async def stream_response() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            stream = client.chat.completions.create(
                model=MODEL,
                max_tokens=2048,
                messages=[{"role": "system", "content": system_prompt}] + history,
                stream=True,
            )

            for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    full_response += text
                    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"

            # Save assistant message to conversation history
            history.append({"role": "assistant", "content": full_response})

            # Persist to disk
            _save_history(req.session_id, history, req.user_id)

            # Extract and save any new facts from this turn
            _extract_and_save_memory(req.user_id, req.message, full_response)

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _extract_and_save_memory(user_id: str, user_msg: str, assistant_msg: str):
    """Ask the model to extract any new facts about the user from the conversation turn."""
    try:
        extraction = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            max_tokens=512,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract personal facts from conversations. "
                        "Return a JSON object with a single key 'facts' containing a list of strings. "
                        "Each fact should be a concise statement about the user (e.g. 'Name is Alice'). "
                        "Return an empty list if no new personal facts were shared. "
                        "Only include facts the user explicitly stated. Return JSON only, no markdown."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"User said: {user_msg}\n\n"
                        f"Assistant replied: {assistant_msg}\n\n"
                        "What new personal facts did the user share? Return JSON only."
                    ),
                },
            ],
        )

        text = extraction.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        data = json.loads(text)
        facts = data.get("facts", [])

        if facts:
            memory = load_memory(user_id)
            for fact in facts:
                if fact and fact not in memory["facts"]:
                    memory["facts"].append(fact)

            if memory["facts"]:
                summary_resp = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    max_tokens=256,
                    messages=[
                        {
                            "role": "system",
                            "content": "Write a 1-2 sentence summary of a user based on facts about them. Be concise.",
                        },
                        {
                            "role": "user",
                            "content": "Facts:\n" + "\n".join(f"- {f}" for f in memory["facts"]),
                        },
                    ],
                )
                memory["summary"] = summary_resp.choices[0].message.content.strip()

            save_memory(user_id, memory)

    except Exception:
        pass  # Memory extraction is best-effort


@app.delete("/history/{session_id}")
def clear_history(session_id: str):
    conversations.pop(session_id, None)
    path = _history_path(session_id)
    if path.exists():
        path.unlink()
    return {"cleared": True}


@app.delete("/memory/{user_id}")
def clear_memory(user_id: str):
    memory = load_memory(user_id)
    memory["facts"] = []
    memory["preferences"] = {}
    memory["summary"] = ""
    save_memory(user_id, memory)
    return {"cleared": True}
