@echo off
rem ArtEdu local bring-up (double-click friendly).
rem Equivalent to: powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" %*
echo.
pause
