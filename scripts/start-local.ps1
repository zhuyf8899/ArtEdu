#requires -Version 5.1
<#
  ArtEdu 本机一键启动脚本
  ------------------------------------------------------------------
  自动把完整环境在本机拉起来并自检：
    1. 检查 Node/npm 与本地环境文件（缺 .env 自动从示例复制）
    2. 缺依赖时自动 npm ci
    3. 启动 PostgreSQL（自动拉起 Docker Desktop 并等待就绪）
    4. 应用数据库迁移 + 写入演示数据
    5. 确保 4 个演示账号可以登录（缺则自动生成）
    6. 启动 API(4000) + 前端(4173) + 生成 Worker
    7. 自检：健康检查 + 真实登录一次，然后打开浏览器

  用法（在仓库根目录）：
    powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
    powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -Stop           # 停止
    powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -NoBrowser      # 不自动开浏览器
    powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -ForceAccounts  # 强制重建演示账号

  演示账号（密码都是 123456）：student.demo / teacher.demo / operator.demo / admin.demo
#>
[CmdletBinding()]
param(
  [switch]$Stop,
  [switch]$NoBrowser,
  [switch]$ForceAccounts
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$WEB_URL = 'http://localhost:4173'
$API_URL = 'http://localhost:4000/api'
$DEMO_USERS = @('student.demo', 'teacher.demo', 'operator.demo', 'admin.demo')
$DEMO_PASSWORD = '123456'

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    [OK] $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    [!!] $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "    [XX] $text" -ForegroundColor Red }

function Invoke-Npm {
  param([string]$WorkingDir, [string[]]$NpmArgs)
  Push-Location $WorkingDir
  try {
    # 显式用 npm.cmd：PATH 里若存在 npm.ps1 垫片（例如便携 Node），会被优先解析且受执行策略影响。
    & $script:NpmCmd @NpmArgs
    if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') 执行失败（退出码 $LASTEXITCODE）" }
  } finally { Pop-Location }
}

function Resolve-NpmCmd {
  foreach ($candidate in @('npm.cmd', 'npm')) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -ne 'Alias' } | Select-Object -First 1
    if ($found -and $found.Source -and $found.Source -notmatch '\.ps1$') { return $found.Source }
  }
  return 'npm.cmd'
}

function Get-DockerCli {
  $candidates = @('docker')
  if ($env:LOCALAPPDATA)      { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe') }
  if ($env:ProgramFiles)      { $candidates += (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe') }
  if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\resources\bin\docker.exe') }
  foreach ($candidate in $candidates) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
  }
  return $null
}

function Get-PortOwner {
  param([int[]]$Ports)
  $owners = @()
  foreach ($port in $Ports) {
    $owners += (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
  }
  return ($owners | Where-Object { $_ -and $_ -gt 0 } | Sort-Object -Unique)
}

function Test-Listening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Http {
  param([string]$Url, [int]$TimeoutSeconds = 90, [string]$Label = $Url)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  Warn "$Label 在 $TimeoutSeconds 秒内未就绪"
  return $false
}

# ------------------------------------------------------------------ 停止
if ($Stop) {
  Step 1 '停止本机开发进程（只结束本项目占用的端口，不影响其它程序）'
  $owners = Get-PortOwner -Ports 4000, 4173
  if ($owners.Count -gt 0) {
    foreach ($procId in $owners) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
    Ok "已结束占用 4000/4173 的进程：$($owners -join ', ')"
  } else { Warn '4000/4173 端口上没有进程' }

  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'ArtEdu' -and $_.CommandLine -match 'worker' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Ok "已结束生成 Worker（PID $($_.ProcessId)）" }

  Write-Host "`n    PostgreSQL 容器未删除（数据保留）。需要一并停止请执行：npm run db:down" -ForegroundColor DarkGray
  Write-Host '    已停止。' -ForegroundColor Green
  return
}

Write-Host "`n============================================================" -ForegroundColor White
Write-Host " ArtEdu 本机一键启动" -ForegroundColor White
Write-Host " 目录：$root" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor White

# ------------------------------------------------------------------ 1. 环境
Step 1 '检查运行环境'
$nodeVersion = (& node -v) 2>$null
if (-not $nodeVersion) { throw '未找到 Node.js，请先安装 Node 22 或更高版本。' }
$major = [int]($nodeVersion.Trim() -replace '^v', '' -split '\.')[0]
if ($major -lt 22) { throw "Node 版本过低（$nodeVersion），本项目需要 Node 22+。" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw '未找到 npm。' }
$script:NpmCmd = Resolve-NpmCmd
$npmVersion = (& $script:NpmCmd -v) 2>$null
Ok "Node $($nodeVersion.Trim()) / npm $("$npmVersion".Trim())"
Ok "npm 可执行文件：$script:NpmCmd"

$docker = Get-DockerCli
if ($docker) { Ok "Docker CLI：$docker" } else { Warn '未找到 Docker CLI，下一步会自动尝试（可能需要安装 Docker Desktop）' }

if (-not (Test-Path 'apps/api/.env')) {
  Copy-Item 'apps/api/.env.example' 'apps/api/.env'
  Warn 'apps/api/.env 不存在，已从 .env.example 复制（本地开发配置）'
} else { Ok 'apps/api/.env 已存在（不覆盖）' }

if (-not (Test-Path 'admin-console/.env.local')) {
  Copy-Item 'admin-console/.env.example' 'admin-console/.env.local'
  Warn 'admin-console/.env.local 不存在，已从 .env.example 复制'
} else { Ok 'admin-console/.env.local 已存在（不覆盖）' }

# ------------------------------------------------------------------ 2. 依赖
Step 2 '检查依赖（node_modules）'
if (-not (Test-Path 'apps/api/node_modules')) {
  Warn 'apps/api 依赖缺失，执行 npm ci（可能需要几分钟）'
  Invoke-Npm -WorkingDir (Join-Path $root 'apps/api') -NpmArgs @('ci')
} else { Ok 'apps/api 依赖已存在' }
if (-not (Test-Path 'admin-console/node_modules')) {
  Warn 'admin-console 依赖缺失，执行 npm ci（可能需要几分钟）'
  Invoke-Npm -WorkingDir (Join-Path $root 'admin-console') -NpmArgs @('ci')
} else { Ok 'admin-console 依赖已存在' }

# ------------------------------------------------------------------ 3. 数据库
Step 3 '启动 PostgreSQL（按需自动拉起 Docker Desktop，首次可能等 1-2 分钟）'
Invoke-Npm -WorkingDir $root -NpmArgs @('run', 'db:up')
Ok 'PostgreSQL 就绪，API 数据库账号连接正常'

# ------------------------------------------------------------------ 4. 迁移与种子
Step 4 '应用数据库迁移'
Invoke-Npm -WorkingDir $root -NpmArgs @('run', 'db:migrate')
Ok '迁移已应用到最新版本'

Step 5 '写入演示数据（幂等，可重复执行）'
Invoke-Npm -WorkingDir $root -NpmArgs @('run', 'db:seed')
Ok '演示课程 / 学习空间 / 案例数据就绪'

# ------------------------------------------------------------------ 5. 演示账号
Step 6 '确保 4 个演示账号可以登录'
$identityCount = 0
if ($docker) {
  $sql = "SELECT count(*) FROM user_identities WHERE provider='local' AND user_id IN ('user-student-demo','user-teacher-demo','user-operator-demo','user-admin-demo');"
  try {
    $raw = (& $docker exec artedu-postgres psql -U artedu -d artedu -tAc $sql) 2>$null
    $text = "$raw".Trim()
    if ($text -match '^\d+$') { $identityCount = [int]$text }
  } catch { $identityCount = 0 }
}

if ($ForceAccounts -or $identityCount -lt 4) {
  if ($ForceAccounts) { Warn '按要求强制重建演示账号（会重置这 4 个账号的密码并注销其会话）' }
  else { Warn "本地登录凭据缺失（当前 $identityCount/4），正在生成…" }
  $env:ARTEDU_ALLOW_TEST_ACCOUNTS = 'true'
  try { Invoke-Npm -WorkingDir (Join-Path $root 'apps/api') -NpmArgs @('run', 'auth:generate-test-accounts') }
  finally { Remove-Item Env:\ARTEDU_ALLOW_TEST_ACCOUNTS -ErrorAction SilentlyContinue }
  Ok '演示账号已就绪'
} else { Ok "演示账号已存在（$identityCount/4）" }

# ------------------------------------------------------------------ 6. 启动服务
Step 7 '启动 API / 前端 / 生成 Worker'
$busy = @()
foreach ($port in 4000, 4173) { if (Test-Listening -Port $port) { $busy += $port } }
if ($busy.Count -gt 0) {
  Warn "端口 $($busy -join '/') 已被占用，跳过启动（如需重启请先执行 -Stop）"
} else {
  Start-Process -FilePath 'cmd.exe' -WorkingDirectory $root -ArgumentList @('/k', 'title ArtEdu dev && npm run dev') | Out-Null
  Ok '已在新窗口启动 npm run dev（那个窗口就是运行日志，关掉即停止）'
}

# ------------------------------------------------------------------ 7. 自检
Step 8 '自检'
$apiOk = Wait-Http -Url "$API_URL/health" -TimeoutSeconds 120 -Label 'API 健康检查'
if ($apiOk) { Ok 'API 健康检查通过' } else { Fail 'API 未就绪，请看 dev 窗口日志' }

$webOk = Wait-Http -Url $WEB_URL -TimeoutSeconds 60 -Label '前端页面'
if ($webOk) { Ok '前端页面可访问' } else { Fail '前端未就绪，请看 dev 窗口日志' }

$loginOk = $false
try {
  $body = @{ username = 'admin.demo'; password = $DEMO_PASSWORD } | ConvertTo-Json
  $login = Invoke-WebRequest -Uri "$API_URL/auth/login" -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10
  if ($login.StatusCode -eq 200 -or $login.StatusCode -eq 201) { $loginOk = $true }
} catch { $loginOk = $false }
if ($loginOk) { Ok "真实登录验证通过（admin.demo / $DEMO_PASSWORD）" } else { Fail '登录验证失败，请检查第 6 步的账号生成结果' }

# ------------------------------------------------------------------ 汇总
Write-Host "`n============================================================" -ForegroundColor White
if ($apiOk -and $webOk -and $loginOk) { Write-Host " 启动完成，可以开始看了" -ForegroundColor Green }
else { Write-Host " 启动未完全通过，请看上面的 [XX] 与 dev 窗口日志" -ForegroundColor Yellow }
Write-Host "============================================================" -ForegroundColor White
Write-Host " 测试门户 / 管理后台 : $WEB_URL"
Write-Host " API                 : $API_URL"
Write-Host " 健康检查            : $API_URL/health"
Write-Host " 管理后台            : $WEB_URL/admin"
Write-Host ''
Write-Host " 演示账号（密码均为 $DEMO_PASSWORD）"
foreach ($user in $DEMO_USERS) { Write-Host "   - $user" }
Write-Host ''
Write-Host ' 看本次修复的创作流程：' -ForegroundColor Yellow
Write-Host '   1) 登录后停在首页，在输入框写下需求'
Write-Host '   2) 左下圆形按钮可切换创作能力（UI 创作 / 图案生成 / …）'
Write-Host '   3) 点「开始创作」会自动跳到 /create 专用阅读页'
Write-Host '   4) 左侧是历次对话，右侧读长回复'
Write-Host ''
Write-Host ' 停止：powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -Stop' -ForegroundColor DarkGray

if (-not $NoBrowser -and $webOk) { Start-Process $WEB_URL | Out-Null }

if (-not ($apiOk -and $webOk -and $loginOk)) { exit 1 }
