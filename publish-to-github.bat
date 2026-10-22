@echo off
title Publish to GitHub
rem Double-click this file to publish the project to GitHub.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-to-github.ps1"
echo.
pause
