#Requires -Version 5.1
<#
.SYNOPSIS
  Installs, updates or removes vane (Windows build) for Claude Code.

.DESCRIPTION
  install  adds this folder as the "vane-windows" marketplace and installs vane@vane-windows
           through the Claude Code CLI. If the upstream vane@vane is enabled, it is disabled
           so the pane is not drawn twice.
  update   fast-forwards this checkout (git pull --ff-only); refuses if it is dirty.
  remove   uninstalls vane@vane-windows and removes the marketplace. The folder is kept.

  ~/.claude/settings.json is backed up with a timestamp before any change.

.EXAMPLE
  .\install.ps1 install
  .\install.ps1 install -DryRun
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('install', 'update', 'remove')]
  [string]$Action = 'install',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$MarketplaceName = 'vane-windows'
$PluginKey = "vane@$MarketplaceName"
$UpstreamKey = 'vane@vane'
$Checkout = $PSScriptRoot
$Settings = Join-Path $env:USERPROFILE '.claude\settings.json'

function Say([string]$Text) { Write-Host "vane: $Text" }
function Die([string]$Text) { Write-Host "vane: $Text" -ForegroundColor Red; exit 1 }

function Invoke-Claude([string[]]$Arguments, [switch]$AllowFailure) {
  if ($DryRun) { Say "dry run: claude $($Arguments -join ' ')"; return $true }
  & claude @Arguments
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) { Die "claude $($Arguments -join ' ') failed." }
  return ($LASTEXITCODE -eq 0)
}

function Backup-Settings {
  if ($DryRun -or -not (Test-Path $Settings)) { return }
  $backup = "$Settings.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
  Copy-Item $Settings $backup
  Say "backed up settings to $backup"
}

function Test-UpstreamEnabled {
  if (-not (Test-Path $Settings)) { return $false }
  try { $data = [IO.File]::ReadAllText($Settings) | ConvertFrom-Json } catch { return $false }
  $enabled = $data.enabledPlugins
  return ($null -ne $enabled -and $enabled.PSObject.Properties[$UpstreamKey] -and $enabled.$UpstreamKey -eq $true)
}

function Install-Vane {
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Die "the 'claude' command is not on PATH." }
  $manifest = Join-Path $Checkout '.claude-plugin\marketplace.json'
  if (-not (Test-Path $manifest)) { Die 'no .claude-plugin\marketplace.json next to this script.' }
  $name = ([IO.File]::ReadAllText($manifest) | ConvertFrom-Json).name
  if ($name -ne $MarketplaceName) { Die "marketplace.json names '$name', expected '$MarketplaceName'." }

  Backup-Settings
  $null = Invoke-Claude @('plugin', 'marketplace', 'add', $Checkout)
  $null = Invoke-Claude @('plugin', 'install', $PluginKey)
  if (Test-UpstreamEnabled) {
    $null = Invoke-Claude @('plugin', 'disable', $UpstreamKey) -AllowFailure
    Say "disabled $UpstreamKey so the pane is not drawn twice."
  }
  Say 'done. Run /reload-plugins in Claude Code, or restart it.'
}

function Update-Vane {
  if (-not (Test-Path (Join-Path $Checkout '.git'))) { Die "$Checkout is not a git checkout." }
  if (git -C $Checkout status --porcelain) { Die 'the checkout has local changes; commit or stash them first.' }
  if ($DryRun) { Say "dry run: git -C $Checkout pull --ff-only"; return }
  git -C $Checkout pull --ff-only
  if ($LASTEXITCODE -ne 0) { Die 'git pull --ff-only failed (diverged?). Nothing else was changed.' }
  Say 'updated. Run /reload-plugins in Claude Code.'
}

function Remove-Vane {
  Backup-Settings
  $null = Invoke-Claude @('plugin', 'uninstall', $PluginKey) -AllowFailure
  $null = Invoke-Claude @('plugin', 'marketplace', 'remove', $MarketplaceName) -AllowFailure
  Say "removed $PluginKey. The folder $Checkout was kept. Re-enable upstream with: claude plugin enable $UpstreamKey"
}

switch ($Action) {
  'install' { Install-Vane }
  'update' { Update-Vane }
  'remove' { Remove-Vane }
}
