@echo off
cd /d "%~dp0"

echo Killing any process on port 8000...
FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr :8000 2^>nul') DO taskkill /PID %%P /F >nul 2>&1

timeout /t 1 /nobreak >nul

echo Starting uvicorn on port 8000...
call venv\Scripts\activate.bat
uvicorn main:app --reload --port 8000
