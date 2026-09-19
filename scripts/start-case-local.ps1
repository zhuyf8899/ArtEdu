# Fixed local case environment. Independent hidden process; no seed/password reset.
param(
  [Parameter(Mandatory=$true)][string]$Container,
  [Parameter(Mandatory=$true)][string]$UploadRoot,
  [switch]$Migrate
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:ARTEDU_CASE_CONTAINER = $Container
$env:ARTEDU_CASE_UPLOAD_ROOT = (Resolve-Path -LiteralPath $UploadRoot).Path
$dockerCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'),
  (Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe')
)
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
$env:ARTEDU_DOCKER_BIN = if ($dockerCmd) { $dockerCmd.Source } else { $dockerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $env:ARTEDU_DOCKER_BIN) { throw 'Docker CLI missing. Start Docker Desktop first.' }
& $env:ARTEDU_DOCKER_BIN info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker not ready; no data changed.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$log = Join-Path $projectRoot "apps/api/data/case-runtime-$stamp.log"
$errorLog = Join-Path $projectRoot "apps/api/data/case-runtime-$stamp.error.log"
$arguments = @('scripts/start-case-local.mjs')
if ($Migrate) { $arguments += '--migrate' }
$child = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errorLog -PassThru
Write-Output "Starting case environment (PID $($child.Id)). Logs: $log ; $errorLog"
Write-Output 'Success is indicated by READY in the log; launcher exits on a failed startup.'
