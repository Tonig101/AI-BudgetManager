@echo off
chcp 65001 >nul
title AI记账 - 真实比价后端 (deals_api)
cd /d "%~dp0"

echo.
echo   ==========================================================
echo    AI记账 · 真实比价后端
echo    比价搜索、商品图、跨设备审批都靠它
echo   ==========================================================
echo.

REM ---- 依赖自检：缺什么就装什么（首次运行会自动装，约 1-3 分钟）----
python -c "import fastapi,uvicorn,httpx,bs4" >nul 2>&1
if errorlevel 1 (
  echo [1/2] 首次运行，正在安装依赖（fastapi / uvicorn / httpx / beautifulsoup4）...
  python -m pip install -q fastapi uvicorn httpx beautifulsoup4 lxml
  if errorlevel 1 (
    echo.
    echo [失败] 依赖安装失败。请检查网络，或手动执行：
    echo        python -m pip install fastapi uvicorn httpx beautifulsoup4 lxml
    echo.
    pause
    exit /b 1
  )
  echo [1/2] 依赖安装完成。
) else (
  echo [1/2] 依赖齐全。
)

echo [2/2] 启动服务，浏览器访问 http://127.0.0.1:8010/api/health 应显示 real_search=true
echo.
echo     关闭本窗口即停止服务。真实搜索需要本服务在线。
echo.

python deals_api.py --port 8010

echo.
echo 服务已停止。
pause
