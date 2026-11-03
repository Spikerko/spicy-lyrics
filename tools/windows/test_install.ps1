# Exercise install-windows.ps1 end to end in a sandbox, without touching the
# real Spotify: fake APPDATA/LOCALAPPDATA, a fake Spotify.exe, and a
# `spicetify` stub on PATH that logs every call and keeps a real
# config-xpui.ini. Usage:
#   powershell -ExecutionPolicy Bypass -File test_install.ps1 -Pkg <folder>
param([Parameter(Mandatory)] [string] $Pkg)
$ErrorActionPreference = 'Stop'

$root = Join-Path ([IO.Path]::GetTempPath()) ("slwin_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$appdata = Join-Path $root 'Roaming'; $local = Join-Path $root 'Local'; $bin = Join-Path $root 'bin'
$cfgDir = Join-Path $appdata 'spicetify'; $cfg = Join-Path $cfgDir 'config-xpui.ini'; $log = Join-Path $root 'calls.log'
New-Item -ItemType Directory -Force $appdata, $local, $bin, (Join-Path $appdata 'Spotify') | Out-Null
Set-Content (Join-Path $appdata 'Spotify\Spotify.exe') 'fake'

# Stub spicetify: a .cmd that forwards to a PowerShell script.
$stubPs = Join-Path $bin 'spicetify-stub.ps1'
@"
`$a = `$args
Add-Content '$log' (`$a -join ' ')
New-Item -ItemType Directory -Force '$cfgDir' | Out-Null
if (-not (Test-Path '$cfg')) { Set-Content '$cfg' '' }
if (`$a[0] -eq '-c') { '$cfg'; exit 0 }
if (`$a[0] -eq 'config' -and `$a[1] -eq 'extensions') {
  `$line = (Get-Content '$cfg' | Where-Object { `$_ -like 'extensions*' }) -replace '^extensions\s*=\s*', ''
  if (`$a.Count -eq 2) { if (`$line) { `$line -split '\|' }; exit 0 }
  `$new = if (`$line) { "`$line|`$(`$a[2])" } else { `$a[2] }
  Set-Content '$cfg' "extensions = `$new"; exit 0
}
exit 0
"@ | Set-Content $stubPs
Set-Content (Join-Path $bin 'spicetify.cmd') "@powershell -NoProfile -ExecutionPolicy Bypass -File `"$stubPs`" %*"

$script = Join-Path $Pkg 'install-windows.ps1'
$pass = 0; $fail = 0
function Check($name, $ok) { if ($ok) { "PASS  $name"; $script:pass++ } else { "FAIL  $name"; $script:fail++ } }
function Run() {
  $p = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"" -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput (Join-Path $root 'out.txt') -RedirectStandardError (Join-Path $root 'err.txt')
  return $p.ExitCode
}

$saved = @{ APPDATA = $env:APPDATA; LOCALAPPDATA = $env:LOCALAPPDATA; PATH = $env:PATH; PATHEXT = $env:PATHEXT }
try {
  $env:APPDATA = $appdata; $env:LOCALAPPDATA = $local; $env:PATH = "$bin;$env:PATH"

  $rc = Run
  Check 'run 1 exits 0' ($rc -eq 0)
  $installed = Join-Path $cfgDir 'Extensions\spicy-lyrics.js'
  Check 'theme file installed byte-identical' ((Test-Path $installed) -and ((Get-FileHash $installed).Hash -eq (Get-FileHash (Join-Path $Pkg 'spicy-lyrics.js')).Hash))
  Check 'extension enabled' ((Get-Content $cfg) -contains 'extensions = spicy-lyrics.js')
  Check 'backup apply ran' ((Get-Content $log) -contains 'backup apply')
  Check 'did not try to download Spicetify (stub found)' (-not (Select-String -Quiet -Path (Join-Path $root 'out.txt') -Pattern 'Installing Spicetify'))

  $rc = Run
  Check 'run 2 (re-install) exits 0' ($rc -eq 0)
  Check 'not enabled twice on re-run' (([regex]::Matches((Get-Content $cfg -Raw), 'spicy-lyrics\.js')).Count -eq 1)

  Remove-Item (Join-Path $appdata 'Spotify') -Recurse -Force
  $rc = Run
  Check 'missing Spotify stops with exit 1' ($rc -eq 1)
  Check 'missing Spotify message shown' (Select-String -Quiet -Path (Join-Path $root 'out.txt') -Pattern 'not found|Microsoft Store')
  New-Item -ItemType Directory -Force (Join-Path $appdata 'Spotify') | Out-Null
  Set-Content (Join-Path $appdata 'Spotify\Spotify.exe') 'fake'

  # Spicetify installed in %LOCALAPPDATA%\spicetify but NOT on PATH (a fresh
  # install before the terminal is reopened). Stub lives there as a .cmd;
  # PowerShell resolves `spicetify` to spicetify.cmd once the folder is on PATH.
  # Drop any real Spicetify install from PATH (this dev machine has one) so the
  # script must fall back to %LOCALAPPDATA%\spicetify, which is the sandbox here.
  $env:PATH = (($saved.PATH -split ';') | Where-Object { $_ -and -not (Test-Path (Join-Path $_ 'spicetify.exe')) }) -join ';'
  $sdir = Join-Path $local 'spicetify'; New-Item -ItemType Directory -Force $sdir | Out-Null
  Copy-Item (Join-Path $bin 'spicetify.cmd') (Join-Path $sdir 'spicetify.cmd')
  # The script skips the download only when spicetify.exe exists. A text
  # marker would be picked over the .cmd and fail to run, so make the "exe"
  # a real program: a copy of cmd.exe that just runs our stub.
  $env:PATHEXT = '.CMD;' + $env:PATHEXT   # prefer the stub .cmd over the copied exe
  Copy-Item "$env:SystemRoot\System32\cmd.exe" (Join-Path $sdir 'spicetify.exe')
  Remove-Item $cfg -Force
  $rc = Run
  Check 'not on PATH: uses %LOCALAPPDATA%\spicetify' ($rc -eq 0 -and ((Get-Content $cfg) -contains 'extensions = spicy-lyrics.js'))
  Check 'not on PATH: no download attempted' (-not (Select-String -Quiet -Path (Join-Path $root 'out.txt') -Pattern 'Installing Spicetify'))
  if ($script:fail) { '--- installer stdout (last run):'; Get-Content (Join-Path $root 'out.txt'); '--- stderr:'; Get-Content (Join-Path $root 'err.txt') }

  '--- calls:'; Get-Content $log
} finally {
  $env:APPDATA = $saved.APPDATA; $env:LOCALAPPDATA = $saved.LOCALAPPDATA; $env:PATH = $saved.PATH; $env:PATHEXT = $saved.PATHEXT
  Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
"$pass passed, $fail failed"
exit [int]($fail -gt 0)
