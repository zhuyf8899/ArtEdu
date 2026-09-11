@echo off
rem ArtEdu 本机一键启动（双击即可）
rem 等价于：powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" %*
echo.
pause
