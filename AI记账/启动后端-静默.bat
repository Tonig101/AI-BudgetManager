@echo off
REM AI jizhang - start price backend silently (no console window)
REM Double-click to start manually. Autostart is already installed as a registry Run entry.
setlocal
cd /d "%~dp0"
for /f "delims=" %%i in ('python -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))" 2^>nul') do set "PYW=%%i"
if not defined PYW set "PYW=pythonw.exe"
start "" "%PYW%" "%~dp0_autostart.py"
endlocal
