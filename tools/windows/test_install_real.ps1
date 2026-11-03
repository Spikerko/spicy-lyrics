# Real-Spicetify run of install-windows.ps1 against a COPY of Spotify.
#
# Uses the real spicetify.exe (not a stub) and a sandboxed APPDATA holding a
# copy of the user's Spotify install, so `backup apply` really patches xpui.
# The user's own Spotify is never touched: a wrapper forces --no-restart and
# points spicetify at the sandbox via its config. Asserts on the actual
# patched Spotify files, which is what the Spotify client loads.
param([Parameter(Mandatory)] [string] $Pkg)
$ErrorActionPreference = 'Stop'

$realExe = (Get-Command spicetify).Source
$userSpotify = Join-Path $env:APPDATA 'Spotify'
$before = (Get-FileHash (Join-Path $userSpotify 'Apps\xpui\extensions\spicy-lyrics.js')).Hash

$root = Join-Path 'D:\' ("slreal_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$appdata = Join-Path $root 'Roaming'; $local = Join-Path $root 'Local'; $bin = Join-Path $root 'bin'
New-Item -ItemType Directory -Force $appdata, $local, $bin | Out-Null
Write-Host "copying Spotify to sandbox ($root)..."
robocopy $userSpotify (Join-Path $appdata 'Spotify') /E /NFL /NDL /NJH /NJS /NP /XD 'Apps\xpui' | Out-Null
# Restore a pristine xpui from Spicetify's own backup, so the sandbox starts unpatched.
$userBackup = Join-Path $env:APPDATA 'spicetify\Backup'
New-Item -ItemType Directory -Force (Join-Path $appdata 'Spotify\Apps') | Out-Null
Copy-Item (Join-Path $userBackup '*.spa') (Join-Path $appdata 'Spotify\Apps\') -Force

# Wrapper: real spicetify, always --no-restart, sandbox paths in its config.
$cfgDir = Join-Path $appdata 'spicetify'
@"
@echo off
"$realExe" --no-restart %*
"@ | Set-Content (Join-Path $bin 'spicetify.cmd') -Encoding ascii

$saved = @{ APPDATA = $env:APPDATA; LOCALAPPDATA = $env:LOCALAPPDATA; PATH = $env:PATH; PATHEXT = $env:PATHEXT }
$pass = 0; $fail = 0
function Check($name, $ok) { if ($ok) { "PASS  $name"; $script:pass++ } else { "FAIL  $name"; $script:fail++ } }
try {
  $env:APPDATA = $appdata; $env:LOCALAPPDATA = $local
  $env:PATH = "$bin;" + ((($saved.PATH -split ';') | Where-Object { $_ -and -not (Test-Path (Join-Path $_ 'spicetify.exe')) }) -join ';')
  $env:PATHEXT = '.CMD;' + $saved.PATHEXT
  # Fresh spicetify config in the sandbox, pointed at the sandbox Spotify.
  & spicetify -c | Out-Null
  & spicetify config spotify_path (Join-Path $appdata 'Spotify') prefs_path (Join-Path $appdata 'Spotify\prefs') | Out-Null
  if (-not (Test-Path (Join-Path $appdata 'Spotify\prefs'))) { Copy-Item (Join-Path $userSpotify 'prefs') (Join-Path $appdata 'Spotify\prefs') -ErrorAction SilentlyContinue }

  $p = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $Pkg 'install-windows.ps1')`"" -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput (Join-Path $root 'out.txt') -RedirectStandardError (Join-Path $root 'err.txt')
  Get-Content (Join-Path $root 'out.txt') | Select-Object -Last 12

  $patched = Join-Path $appdata 'Spotify\Apps\xpui\extensions\spicy-lyrics.js'
  $index = Join-Path $appdata 'Spotify\Apps\xpui\index.html'
  Check 'installer exit 0 with real spicetify' ($p.ExitCode -eq 0)
  Check 'config enables spicy-lyrics.js' ((& spicetify config extensions) -contains 'spicy-lyrics.js')
  Check 'Spotify xpui patched with the theme file' ((Test-Path $patched) -and ((Get-FileHash $patched).Hash -eq (Get-FileHash (Join-Path $Pkg 'spicy-lyrics.js')).Hash))
  Check 'Spotify index.html loads spicy-lyrics.js' ((Test-Path $index) -and (Select-String -Quiet -Path $index -SimpleMatch 'spicy-lyrics.js'))
  Check 'patched copy carries the moved logo' ((Test-Path $patched) -and (Select-String -Quiet -Path $patched -Pattern '--hlw-logo-cx: ?calc\(var\(--hlw-lyrics-left\)'))
} finally {
  $env:APPDATA = $saved.APPDATA; $env:LOCALAPPDATA = $saved.LOCALAPPDATA; $env:PATH = $saved.PATH; $env:PATHEXT = $saved.PATHEXT
  $after = (Get-FileHash (Join-Path $userSpotify 'Apps\xpui\extensions\spicy-lyrics.js')).Hash
  Check "user's real Spotify untouched" ($before -eq $after)
  Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
"$pass passed, $fail failed"
exit [int]($fail -gt 0)
