param([switch]$RecoverFailedBackend)
$ErrorActionPreference = 'Stop'

# Only known ephemeral socket directories are eligible; never touch Docker disks or volumes.
$localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
$targets = @(
    @{ Path = [IO.Path]::Combine($localRoot, 'Docker', 'run'); Names = @('dockerInference', 'dockerEthernetVfkit', 'sailor-ingest.sock', 'userAnalyticsOtlpHttp.sock') },
    @{ Path = [IO.Path]::Combine($localRoot, 'docker-secrets-engine'); Names = @('engine.sock') }
)
$running = @(Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    if (-not $RecoverFailedBackend) { exit 0 }
    $errorFile = Join-Path $localRoot 'Docker\backend.error.json'
    if (-not (Test-Path -LiteralPath $errorFile)) { throw 'No matching Docker socket failure; close Docker Desktop normally before retrying.' }
    $backendStarted = ($running | Where-Object { $_.ProcessName -eq 'com.docker.backend' } | Sort-Object StartTime -Descending | Select-Object -First 1).StartTime
    if (-not $backendStarted -or (Get-Item -LiteralPath $errorFile).LastWriteTime -lt $backendStarted.AddSeconds(-2)) {
        throw 'Error record is from an older Docker run; refusing to stop the current backend.'
    }
    $errorDialog = @(Get-CimInstance Win32_Process -Filter "Name = 'Docker Desktop.exe'" | Where-Object { $_.CommandLine -match '--name=error-dialog' })
    if ($errorDialog.Count -eq 0) { throw 'No Docker failure dialog is running; refusing to interrupt startup.' }
    $failure = Get-Content -LiteralPath $errorFile -Raw
    if ($failure -notmatch 'initializing (Ingest server|Secrets Engine)' -or $failure -notmatch 'The file cannot be accessed by the system') {
        throw 'Docker reported a different failure; refusing to stop it automatically.'
    }
    $allowedRoots = @(
        ([IO.Path]::Combine($localRoot, 'Programs', 'DockerDesktop') + '\'),
        ([IO.Path]::Combine($env:ProgramFiles, 'Docker', 'Docker') + '\')
    )
    foreach ($process in $running) {
        $executable = $process.Path
        if (-not $executable -or -not ($allowedRoots | Where-Object { $executable.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) {
            throw 'Unexpected Docker process location; refusing to stop it.'
        }
    }
    # Caller must already have confirmed the Docker engine is unavailable.
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}
if (Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue) { throw 'Docker is still running; no files were moved.' }

$eligible = @()
foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target.Path)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target.Path).Path
    $directory = Get-Item -LiteralPath $resolved -Force
    if ($resolved -ne $target.Path -or -not $resolved.StartsWith($localRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Unexpected runtime directory target; refusing to move it.'
    }
    $entries = @(Get-ChildItem -LiteralPath $resolved -Force)
    if ($entries | Where-Object { $_.PSIsContainer -or $_.Length -ne 0 -or -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $_.Name -notin $target.Names }) {
        throw 'Runtime directory contains something other than known empty socket entries; no cleanup attempted.'
    }
    if ($entries.Count -gt 0) { $eligible += $resolved }
}
foreach ($source in $eligible) {
    $backup = $source + '.artedu-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    if (Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue) { throw 'Docker started during recovery; stopping recovery.' }
    Move-Item -LiteralPath $source -Destination $backup
    Write-Output ('[database] Runtime sockets backed up: ' + $backup)
}
