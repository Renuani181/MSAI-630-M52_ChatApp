# 🧠 MemoryChat — AI Chat App with Memory

**MSAI 630 · Group 4 Project**

A chatbot that remembers you. It maintains conversation history, extracts facts about you automatically, and provides increasingly personalized responses over time.

---

## Features

- **Persistent memory** — remembers your name, interests, and facts across sessions
- **Chat history** — all conversations saved and browsable in the sidebar
- **Streaming responses** — text streams in real time
- **Personalized replies** — memory is injected into every prompt
- **Powered by Llama 3.3** via Groq (free API)

---

## Prerequisites

Make sure you have these installed:

- Python 3.9+ → check with `python3 --version`
- Node.js 16+ → check with `node --version`
- npm → check with `npm --version`

---

## Setup & Run

### 1. Clone the repo

```bash
git clone https://github.com/Renuani181/MSAI-630-M52_ChatApp.git
cd MSAI-630-M52_ChatApp
```

### 2. Add the API key

```bash
echo "GROQ_API_KEY=your_groq_api_key_here" > backend/.env
```

### 3. Start the app

```bash
chmod +x start.sh
./start.sh
```

The script will automatically:
- Create a Python virtual environment
- Install all backend dependencies
- Install all frontend dependencies
- Start both servers

Then open **http://localhost:3001** in your browser.

> **Note:** If port 3000 is already in use on your machine, the frontend will start on port 3001 automatically.

---

## Running Servers Separately (optional)

**Backend** (Terminal 1):
```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (Terminal 2):
```bash
cd frontend
npm install
npm start
```

---

## Project Structure

```
ai-chat-app/
├── backend/
│   ├── main.py            # FastAPI server, chat endpoint, streaming
│   ├── memory_store.py    # Per-user memory (facts, summary) stored as JSON
│   ├── requirements.txt
│   └── .env               # Your GROQ_API_KEY goes here (not committed)
├── frontend/
│   └── src/
│       ├── App.js         # React UI — chat, sidebar, history, memory panel
│       └── App.css        # Dark theme styles
├── start.sh               # One-command launcher
└── README.md
```

---

## Architecture

```
Browser (React)
    │
    │  SSE stream / REST
    ▼
FastAPI Backend (Python)
    ├── /chat         → streams response from Groq
    ├── /memory/:id   → get/clear user memory
    ├── /sessions/:id → list past chat sessions
    └── /history/:id  → load a past session
    │
    ├── user_memories/    (JSON per user — facts + summary)
    ├── chat_histories/   (JSON per session — full message log)
    │
    └── Groq API (Llama 3.3-70b)
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | Send message, stream response |
| GET | `/memory/{user_id}` | Get user memory |
| DELETE | `/memory/{user_id}` | Clear user memory |
| GET | `/sessions/{user_id}` | List all past sessions |
| GET | `/history/{session_id}` | Load a session's messages |
| DELETE | `/history/{session_id}` | Delete a session |

---

## Team — Group 4

MSAI 630 · M52
