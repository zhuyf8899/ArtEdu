#requires -Version 5.1
<#
  ArtEdu staging 一键打开（SSH 隧道）
  ------------------------------------------------------------------
  服务器上的 web 容器只监听 127.0.0.1:8080，公网直连不通。本脚本做三件事：
    1. 建立并保持 SSH 隧道：本机 127.0.0.1:8080 -> 服务器 127.0.0.1:8080（断线自动重连）
    2. 等 /api/health 返回 200
    3. 打开浏览器到 http://127.0.0.1:8080

  用法（仓库根目录，或双击 scripts\open-staging.cmd）：
    powershell -ExecutionPolicy Bypass -File scripts\open-staging.ps1
    powershell -ExecutionPolicy Bypass -File scripts\open-staging.ps1 -Stop        # 关闭隧道
    powershell -ExecutionPolicy Bypass -File scripts\open-staging.ps1 -NoBrowser   # 只建隧道
    powershell -ExecutionPolicy Bypass -File scripts\open-staging.ps1 -Port 18080  # 换本机端口

  地址必须是 http://127.0.0.1:8080：服务器 CORS 白名单里有 127.0.0.1:8080、localhost:8080
  与 *:18080，其余地址会出现"页面能开但登录失败"。
  演示账号（密码都是 123456）：student.demo / teacher.demo / operator.demo / admin.demo
#>
[CmdletBinding()]
param(
  [switch]$Stop,
  [switch]$NoBrowser,
  [int]$Port = 8080,
  [string]$Server = 'surecat@8.212.153.167',
  [int]$RemotePort = 8080,
  [int]$TimeoutSeconds = 40,
  # 内部使用：隐藏窗口里跑 ssh 重连循环，不要手动传。
  [switch]$TunnelLoop
)

$ErrorActionPreference = 'Stop'
$statePath = Join-Path $env:TEMP 'artedu-staging-tunnel.json'
$tunnelUrl = "http://127.0.0.1:$Port"

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    $text" -ForegroundColor Yellow }

$sshArgs = @(
  '-N',
  '-o', 'BatchMode=yes',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-L', "$Port`:127.0.0.1:$RemotePort",
  $Server
)

# 隧道循环：ssh 断开后退避 5 秒重连，直到进程被 -Stop 结束。
if ($TunnelLoop) {
  while ($true) {
    & ssh @sshArgs 2>&1 | Out-Null
    Start-Sleep -Seconds 5
  }
}

function Get-TunnelState {
  if (-not (Test-Path -LiteralPath $statePath)) { return $null }
  try { return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } catch { return $null }
}

function Test-PortListening([int]$TargetPort) {
  $connection = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
  return [bool]$connection
}

if ($Stop) {
  Step '关闭 staging 隧道'
  $state = Get-TunnelState
  if ($state -and $state.pid) {
    & taskkill /T /F /PID $state.pid 2>&1 | Out-Null
    Ok "已结束隧道进程（PID $($state.pid)）"
  } else {
    Warn '没有找到本脚本启动的隧道记录'
  }
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  # 兜底：清掉可能残留的转发进程（只针对本机该端口的监听者）
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $listeners) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Ok "已释放本机端口 $Port（PID $processId）"
  }
  if (-not (Test-PortListening $Port)) { Ok "本机 $Port 已释放" }
  return
}

Step "检查 SSH 客户端"
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw '找不到 ssh 命令。请确认已安装 OpenSSH 客户端（Windows 可选功能：OpenSSH Client）。'
}
Ok "目标服务器 $Server"

$state = Get-TunnelState
$alreadyRunning = $false
if ($state -and $state.pid -and (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) -and (Test-PortListening $Port)) {
  $alreadyRunning = $true
}

if ($alreadyRunning) {
  Ok "隧道已在运行（PID $($state.pid)，本机端口 $Port）"
} else {
  if (Test-PortListening $Port) {
    Warn "本机端口 $Port 已被其它进程占用，请先释放或换端口（-Port 18080）"
  }
  Step "建立隧道：本机 $Port -> $Server`:$RemotePort"
  $launcher = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', $PSCommandPath,
    '-TunnelLoop', '-Port', $Port, '-Server', $Server, '-RemotePort', $RemotePort
  )
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $launcher -WindowStyle Hidden -PassThru
  @{ pid = $process.Id; port = $Port; server = $Server; startedAt = (Get-Date).ToString('s') } |
    ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  Ok "隧道进程已启动（PID $($process.Id)），断线会自动重连"
}

Step "等待站点就绪（最长 $TimeoutSeconds 秒）"
$ready = $false
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri "$tunnelUrl/api/health" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch {
    Start-Sleep -Milliseconds 800
  }
}

if (-not $ready) {
  Warn "等不到 $tunnelUrl/api/health 返回 200"
  Warn "排查：ssh $Server 'cd ~/artedu && docker compose -f docker-compose.staging.yml ps'"
  Warn "确认 web/api 容器在跑，且服务器 .env 里 ARTEDU_BIND_IP=127.0.0.1"
  if (-not $NoBrowser) { Warn '仍未打开浏览器。修好后重新执行本脚本即可。' }
  exit 1
}

Ok '站点健康检查通过'
Write-Host ''
Write-Host "  地址：$tunnelUrl" -ForegroundColor White
Write-Host '  演示账号（密码 123456）：student.demo / teacher.demo / operator.demo / admin.demo' -ForegroundColor DarkGray
Write-Host "  关闭隧道：powershell -ExecutionPolicy Bypass -File scripts\open-staging.ps1 -Stop" -ForegroundColor DarkGray

if (-not $NoBrowser) {
  Step '打开浏览器'
  Start-Process $tunnelUrl
}
