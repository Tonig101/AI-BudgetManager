@echo off
chcp 936 >nul
title AI记账 - 真实比价后端 (service\backend_service.py)
setlocal
cd /d "%~dp0"

REM 端口固定 8010，不再接受命令行参数：前端 app.js 的 REAL_API_BASES 与健康检查
REM 都只认 8010，后端换个端口会让「搜索 + 自愈」一起失效，所以这里不留这个旋钮。
set "PORT=8010"

echo.
echo   ==========================================================
echo    AI记账 · 真实比价后端
echo    比价搜索、商品图、跨设备审批都靠它
echo   ==========================================================
echo.

REM ---- 解释器解析：用户 PATH 里可能根本没有 python.exe，不能直接写 python ----
call "%~dp0service\find_python.cmd"
set "RC=%errorlevel%"
if "%RC%"=="3" goto :nointerp
if "%RC%"=="2" goto :needdeps
echo [1/2] 依赖齐全。
goto :ready

:needdeps
echo [1/2] 找到解释器但缺依赖，正在安装（首次运行约 1-3 分钟）...
"%AJ_PY%" -m pip install -q fastapi uvicorn httpx beautifulsoup4 lxml
if errorlevel 1 goto :pipfail
echo [1/2] 依赖安装完成。
goto :ready

:ready
echo     使用解释器: %AJ_PY%
echo [2/2] 启动常驻服务：浏览器访问 http://127.0.0.1:%PORT%/api/health 应显示 real_search=true
echo.
echo     关闭本窗口即停止服务；服务崩溃会自动重启（最多 5 次）。
echo     日志写在同一个文件夹里的 backend.log。
echo     开机自启 / 静默启动用的是同一个脚本：service\backend_service.py
echo.

REM 兜底：万一 service\backend_service.py 被误删（杀软误杀等），也不要让用户卡死在这里
if not exist "%~dp0service\backend_service.py" goto :fallback

"%AJ_PY%" "%~dp0service\backend_service.py" --port %PORT%
goto :done

:fallback
echo [提示] 找不到 service\backend_service.py，改用 deals_api.py 直接启动。
echo        这种方式没有崩溃自动重启、也不会把日志写进 backend.log，建议尽快恢复该文件。
echo.
"%AJ_PY%" "%~dp0deals_api.py" --port %PORT%
goto :done

:nointerp
echo [失败] 找不到任何可用的 Python 解释器（PATH 里没有，WorkBuddy 内置目录里也没有）。
echo        请安装 Python 3.10 以上版本（安装时勾选 Add to PATH），或重装 WorkBuddy 后重试。
echo.
echo        手动排查：在命令行执行  where python   应能输出一个真实路径（不是 WindowsApps 里的）。
pause
exit /b 1

:pipfail
echo [失败] 依赖安装失败。请检查网络，或手动执行下面这条命令：
echo        "%AJ_PY%" -m pip install fastapi uvicorn httpx beautifulsoup4 lxml
echo.
pause
exit /b 1

:done
echo.
echo 服务已停止。
pause
