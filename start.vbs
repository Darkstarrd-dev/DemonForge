' novelhelper 单窗口启动入口 — 双击运行,全程无控制台窗口。
' 以隐藏方式调用 scripts\launch.ps1(隐藏后端/前端进程 + Edge 应用模式单窗口)。
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & root & "\scripts\launch.ps1""", 0, False
