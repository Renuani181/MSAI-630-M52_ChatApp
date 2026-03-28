#!/bin/bash
set -e

echo "🧠 AI Chat App with Memory — Startup"
echo "======================================"

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ] && [ ! -f backend/.env ]; then
  echo ""
  echo "⚠️  ANTHROPIC_API_KEY not found."
  echo "   Set it in your environment or create backend/.env:"
  echo "   echo 'ANTHROPIC_API_KEY=sk-...' > backend/.env"
  echo ""
  exit 1
fi

# Backend
echo ""
echo "▶ Starting backend..."
cd backend
python -m venv venv 2>/dev/null || true
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null || true
pip install -q -r requirements.txt
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend
echo "▶ Installing frontend dependencies..."
cd frontend
npm install --silent
echo "▶ Starting frontend..."
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" SIGINT SIGTERM
wait
