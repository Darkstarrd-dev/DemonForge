@echo off
rem 旧入口兼容:转交无控制台窗口的 start.vbs(隐藏启动后端/前端 + Edge 应用模式单窗口)。
rem 想完全无闪烁请直接双击 start.vbs。
start "" wscript.exe "%~dp0start.vbs"
