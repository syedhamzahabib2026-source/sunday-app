@echo off
cd /d "%~dp0"

echo Starting Sunday bot...
call venv\Scripts\activate.bat
python run_bot.py
