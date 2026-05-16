@echo off
echo Starting Distill...

start "Distill Backend" cmd /k "cd /d %~dp0backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
start "Distill Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Backend  → http://localhost:8000
echo Frontend → http://localhost:5173
echo.
echo Both servers are starting in separate windows.
