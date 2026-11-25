#requires -Version 5.1
<#
.SYNOPSIS
Checks the remote main branch once and reports any change since the last check.
.DESCRIPTION
The first check compares against the ArtEdu baseline from 2026-11-24.
The last observed commit is kept in the ignored .cache directory.
#>
[CmdletBinding()]
param(
  [string]$Remote = 'origin',
  [string]$StatePath
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
if (-not $StatePath) {
  $StatePath = Join-Path $repository '.cache/artedu-remote-main.sha'
}
$baseline = '6a04d5182b51d1b4405fa2d3796e6d97f5b6eba5'
$shaPattern = '\A(?:[0-9a-f]{40}|[0-9a-f]{64})\z'
$stateFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($StatePath)
[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($stateFile))

$lock = [IO.File]::Open("$stateFile.lock", 'OpenOrCreate', 'ReadWrite', 'None')
try {
  $hasState = [IO.File]::Exists($stateFile)
  $previous = $baseline
  if ($hasState) {
    $previous = [IO.File]::ReadAllText($stateFile).Trim()
    if ($previous -notmatch $shaPattern) {
      throw "Invalid commit in state file: $stateFile"
    }
  }

  Push-Location -LiteralPath $repository
  try {
    $result = & git -c http.lowSpeedLimit=1 -c http.lowSpeedTime=30 ls-remote --exit-code -- $Remote refs/heads/main
    if ($LASTEXITCODE -ne 0) {
      throw "Could not read refs/heads/main from $Remote (Git exit $LASTEXITCODE)."
    }
  } finally {
    Pop-Location
  }

  $tip, $ref = ([string]$result) -split "`t", 2
  if ($tip -notmatch $shaPattern -or $ref -cne 'refs/heads/main') {
    throw "Unexpected response for refs/heads/main from $Remote."
  }
  if ($tip -eq $previous) {
    Write-Output "UNCHANGED $tip"
    return
  }

  $tempFile = "$stateFile.tmp"
  try {
    [IO.File]::WriteAllText($tempFile, $tip)
    if ($hasState) {
      [IO.File]::Replace($tempFile, $stateFile, [NullString]::Value)
    } else {
      [IO.File]::Move($tempFile, $stateFile)
    }
  } finally {
    [IO.File]::Delete($tempFile)
  }

  Write-Output "UPDATED $previous $tip"
} finally {
  $lock.Dispose()
}
