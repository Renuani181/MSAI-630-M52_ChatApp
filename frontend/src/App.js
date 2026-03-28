import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

const API = process.env.REACT_APP_API_URL || '';  // set REACT_APP_API_URL in production

const FUN_NAMES = [
  'hulk', 'thor', 'nova', 'blaze', 'echo', 'pixel', 'storm', 'cipher',
  'viper', 'rogue', 'titan', 'sage', 'phantom', 'zenith', 'bolt'
];

function getOrCreateUserId() {
  let userId = localStorage.getItem('chat_user_id');
  if (!userId || userId.startsWith('user_')) {
    userId = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    localStorage.setItem('chat_user_id', userId);
  }
  return userId;
}

export default function App() {
  const [userId] = useState(getOrCreateUserId);
  const [sessionId, setSessionId] = useState(() => 'session_' + uuidv4().slice(0, 8));
  const [editingFact, setEditingFact] = useState(null); // index of fact being edited
  const [editingValue, setEditingValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [memory, setMemory] = useState(null);
  const [showMemory, setShowMemory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/memory/${userId}`);
      const data = await res.json();
      setMemory(data);
    } catch { /* ignore */ }
  }, [userId]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sessions/${userId}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => { fetchMemory(); }, [fetchMemory]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const loadSession = async (sid) => {
    try {
      const res = await fetch(`${API}/history/${sid}`);
      const data = await res.json();
      const msgs = (data.messages || []).map(m => ({ ...m, id: uuidv4() }));
      setSessionId(sid);
      setMessages(msgs);
      setShowHistory(false);
    } catch { /* ignore */ }
  };

  const newChat = () => {
    setSessionId('session_' + uuidv4().slice(0, 8));
    setMessages([]);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text, id: uuidv4() }]);
    setStreaming(true);

    const assistantId = uuidv4();
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId, loading: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, session_id: sessionId, message: text }),
        signal: controller.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.content, loading: false }
                  : m
              ));
            } else if (event.type === 'done') {
              fetchMemory();
              fetchSessions();
            }
          } catch { /* skip malformed events */ }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Error: could not reach the server. Is the backend running?', loading: false, error: true }
            : m
        ));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const clearConversation = async () => {
    if (streaming) { abortRef.current?.abort(); }
    await fetch(`${API}/history/${sessionId}`, { method: 'DELETE' });
    setMessages([]);
    fetchSessions();
    inputRef.current?.focus();
  };

  const clearMemory = async () => {
    await fetch(`${API}/memory/${userId}`, { method: 'DELETE' });
    await fetchMemory();
  };

  const deleteFact = async (fact) => {
    await fetch(`${API}/memory/${userId}/fact?fact=${encodeURIComponent(fact)}`, { method: 'DELETE' });
    await fetchMemory();
  };

  const editFact = (index, fact) => {
    setEditingFact(index);
    setEditingValue(fact);
  };

  const saveEditedFact = async (oldFact) => {
    if (editingValue.trim() && editingValue.trim() !== oldFact) {
      await fetch(`${API}/memory/${userId}/fact`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_fact: oldFact, new_fact: editingValue.trim() }),
      });
      await fetchMemory();
    }
    setEditingFact(null);
    setEditingValue('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">🧠 MemoryChat</div>
          <p className="sidebar-sub">AI that remembers you</p>
        </div>

        <div className="user-badge">
          <span className="user-dot" />
          <span className="user-id">{userId}</span>
        </div>

        <div className="sidebar-actions">
          <button className="btn-primary" onClick={newChat}>
            + New Chat
          </button>
          <button className="btn-secondary" onClick={() => { setShowHistory(v => !v); fetchSessions(); }}>
            {showHistory ? '✕ Hide history' : '📋 Chat history'}
          </button>
          <button className="btn-secondary" onClick={() => { setShowMemory(v => !v); fetchMemory(); }}>
            {showMemory ? '💬 Hide memory' : '🔍 View memory'}
          </button>
          {showMemory && (
            <button className="btn-danger" onClick={clearMemory}>
              ⚠️ Clear memory
            </button>
          )}
          {messages.length > 0 && (
            <button className="btn-secondary" onClick={clearConversation}>
              🗑 Delete this chat
            </button>
          )}
        </div>

        {/* Chat History Panel */}
        {showHistory && (
          <div className="memory-panel">
            <h3>Chat History</h3>
            {sessions.length === 0 && (
              <p className="memory-empty">No saved chats yet.</p>
            )}
            {sessions.map(s => (
              <button
                key={s.session_id}
                className={`session-item ${s.session_id === sessionId ? 'active' : ''}`}
                onClick={() => loadSession(s.session_id)}
              >
                <span className="session-preview">{s.preview}</span>
                <span className="session-meta">{formatDate(s.updated_at)} · {s.message_count} msgs</span>
              </button>
            ))}
          </div>
        )}

        {/* Memory Panel */}
        {showMemory && memory && (
          <div className="memory-panel">
            <h3>Stored Memory</h3>
            {memory.summary && (
              <div className="memory-section">
                <label>Summary</label>
                <p>{memory.summary}</p>
              </div>
            )}
            {memory.facts?.length > 0 && (
              <div className="memory-section">
                <label>Known Facts</label>
                <ul>
                  {memory.facts.map((f, i) => (
                    <li key={i} className="fact-item">
                      {editingFact === i ? (
                        <input
                          className="fact-input"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={() => saveEditedFact(f)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditedFact(f);
                            if (e.key === 'Escape') { setEditingFact(null); setEditingValue(''); }
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="fact-text" onClick={() => editFact(i, f)}>{f}</span>
                      )}
                      <div className="fact-actions">
                        <button className="fact-btn delete" onClick={() => deleteFact(f)} title="Delete">🗑</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!memory.summary && !memory.facts?.length && (
              <p className="memory-empty">No memory yet. Start chatting!</p>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <p>Powered by Llama 3.3 via Groq</p>
        </div>
      </aside>

      {/* Chat area */}
      <main className="chat-area">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <h2>Start a conversation</h2>
              <p>Tell me your name, interests, or what you're working on.<br />I'll remember it for next time.</p>
              <div className="suggestions">
                {["Hi! My name is...", "I'm learning...", "My favorite topic is..."].map(s => (
                  <button key={s} className="suggestion-chip" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
              <div className="avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="bubble">
                {msg.loading && !msg.content
                  ? <span className="typing"><span/><span/><span/></span>
                  : <ReactMarkdown>{msg.content}</ReactMarkdown>
                }
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="input-area">
          <div className="input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={streaming}
            />
            <button
              className={`send-btn ${streaming ? 'stop' : ''}`}
              onClick={streaming ? () => abortRef.current?.abort() : sendMessage}
              disabled={!streaming && !input.trim()}
            >
              {streaming ? '⏹' : '↑'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
