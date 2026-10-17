@echo off
rem Keep the TikTok chat bridge running: start it again whenever it exits.
rem Usage: run-forever.cmd [config]   default .env - one config file per channel, e.g. run-forever.cmd bammmmyyi.env
rem Output goes to logs\bridge.log (or logs\bridge-<config name>.log). Close this window to stop. See README.md.
cd /d "%~dp0"
if not exist logs mkdir logs
set "CONF=%~1"
set "LOG=logs\bridge-%~n1.log"
if not defined CONF (
  set "CONF=.env"
  set "LOG=logs\bridge.log"
)
title kiew-bridge %CONF%
:loop
node tiktok-song-bridge.mjs --env "%CONF%" >> "%LOG%" 2>&1
timeout /t 60 /nobreak >nul
goto loop
