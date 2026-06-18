@echo off
rem Legacy entry: forwards to start.vbs (hidden backend/frontend launch + Edge app-mode window).
rem For a fully flicker-free launch, double-click start.vbs directly.
rem NOTE: keep this file pure ASCII; CMD reads .bat with the system code page (GBK)
rem before any chcp takes effect, so non-ASCII bytes here get mis-parsed.
start "" wscript.exe "%~dp0start.vbs"
