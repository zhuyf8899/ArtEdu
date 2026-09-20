@echo off
rem ArtEdu staging one-click open (double-click friendly).
rem Tunnel + health check + browser. Stop the tunnel with: scripts\open-staging.cmd -Stop
chcp 65001 >nul
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-staging.ps1" %*
echo.
pause
