@echo off
chcp 936 >nul
title Remove autostart - AI jizhang price backend
echo.
echo   Removing the auto-start entry for the AI jizhang price backend...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AIJizhangDealsApi /f >nul 2>&1
if errorlevel 1 (
  echo   [OK] It was not installed, nothing to remove.
) else (
  echo   [OK] Removed. The backend will no longer start when you log in.
  echo        To start it manually, run 启动比价后端.bat in this folder.
)
echo.
pause
