@echo off
REM AI jizhang - start price backend silently (no console window)
REM Both entry points share service\backend_service.py. The interpreter is
REM resolved by service\find_python.cmd because python may not be on PATH.
setlocal
cd /d "%~dp0"
REM Port is fixed at 8010: the frontend (app.js REAL_API_BASES + health probe)
REM only talks to 8010, so no command-line override here by design.
set "PORT=8010"

call "%~dp0service\find_python.cmd"
if errorlevel 3 goto :nopython
if errorlevel 2 goto :tryinstall
goto :launch

:tryinstall
REM Deps missing on the resolved interpreter: install once, then launch anyway
REM (backend_service.py will write the real import error into backend.log).
"%AJ_PY%" -m pip install -q fastapi uvicorn httpx beautifulsoup4 lxml >nul 2>&1

:launch
start "" "%AJ_PYW%" "%~dp0service\backend_service.py" --port %PORT%
endlocal
exit /b 0

:nopython
>>"%~dp0backend.log" echo [%DATE% %TIME%] [bat] no usable python interpreter found
endlocal
exit /b 1
