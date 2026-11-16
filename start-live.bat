@echo off
rem Double-click to start Setup Engineer in live mode (reads iRacing telemetry while you drive)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0live-bridge.ps1" %*
pause
