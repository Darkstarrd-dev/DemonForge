# novelhelper 单窗口启动器
# 隐藏启动后端(:8787)与前端(:5173),前端就绪后用 Chrome 应用模式打开单窗口;
# 监视该窗口,窗口关闭(无论点应用内「退出系统」还是直接关窗 X)即清理后台进程。
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot

# 隐藏启动后端;捕获 cmd 树根 PID(其下含 npm → tsx → node),供 taskkill /T 清理整棵树
$srv = Start-Process cmd -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$root\server" -WindowStyle Hidden -PassThru
Set-Content -Path "$root\server.pid" -Value $srv.Id -Encoding ascii

# 隐藏启动前端
$fe = Start-Process cmd -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$root\frontend" -WindowStyle Hidden -PassThru
Set-Content -Path "$root\frontend.pid" -Value $fe.Id -Encoding ascii

# 轮询前端就绪(最多 ~30s),避免应用窗口打开时 Vite 尚未起好显示连接失败
$url = 'http://localhost:5173'
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null; break }
  catch { Start-Sleep -Milliseconds 500 }
}

# Chrome 应用模式 + 独立 user-data-dir:
#  --app           无地址栏/标签页的独立窗口,外观接近原生桌面应用
#  --user-data-dir 固定专属 profile,强制新开独立 Chrome 实例 —— 否则已有 Chrome 在跑时,
#                  新进程会把请求转交旧实例后立即退出,导致下面 WaitForExit 立刻返回而误清理;
#                  该 profile 同时让 localStorage 数据跨次启动持久保留
$profileDir = "$root\.chrome-profile"
$chrome = Start-Process chrome -ArgumentList "--app=$url", "--user-data-dir=$profileDir" -PassThru

# 看门狗:阻塞等待应用窗口退出。无论用户点「退出系统」(window.close())还是直接关窗,
# 窗口一关即清理后台后端/前端进程树,确保不留占用端口的孤儿进程。
$chrome.WaitForExit()
taskkill /PID $srv.Id /T /F 2>$null
taskkill /PID $fe.Id /T /F 2>$null
Remove-Item "$root\server.pid", "$root\frontend.pid" -ErrorAction SilentlyContinue
