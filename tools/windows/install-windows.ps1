# Install the PJS #13 Spicy Lyrics build on Windows.
# Run with:  powershell -ExecutionPolicy Bypass -File install-windows.ps1
# (or double-click install-windows.cmd)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Spotify desktop (not the Microsoft Store version).
$spotifyExe = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
if (-not (Test-Path $spotifyExe)) {
    if (Get-AppxPackage -Name '*SpotifyMusic*' -ErrorAction SilentlyContinue) {
        Write-Host 'Spotify from the Microsoft Store is installed. Spicetify does not support it.' -ForegroundColor Red
        Write-Host 'Uninstall it, install Spotify from https://www.spotify.com/download/windows/, open it once, then run this again.'
    } else {
        Write-Host 'Spotify desktop not found. Install it from https://www.spotify.com/download/windows/, open it once and log in, then run this again.' -ForegroundColor Red
    }
    exit 1
}

# 2. Spicetify, if missing.
$spicetify = Get-Command spicetify -ErrorAction SilentlyContinue
if (-not $spicetify) {
    $local = Join-Path $env:LOCALAPPDATA 'spicetify\spicetify.exe'
    if (-not (Test-Path $local)) {
        Write-Host 'Installing Spicetify (answer N if it offers the Marketplace)...'
        Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/spicetify/cli/main/install.ps1' | Invoke-Expression
    }
    $env:PATH = (Join-Path $env:LOCALAPPDATA 'spicetify') + ';' + $env:PATH
}
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host 'Spicetify could not be found after installing. Close this window, open a new PowerShell, run "spicetify -v", then run this installer again.' -ForegroundColor Red
    exit 1
}

# 3. Copy the theme build into Spicetify's Extensions folder and enable it.
$cfg = (& spicetify -c | Select-Object -Last 1).Trim()
$ext = Join-Path (Split-Path -Parent $cfg) 'Extensions'
New-Item -ItemType Directory -Force -Path $ext | Out-Null
Copy-Item -Force (Join-Path $here 'spicy-lyrics.js') (Join-Path $ext 'spicy-lyrics.js')
$enabled = (& spicetify config extensions) -join "`n"
if ($enabled -notmatch 'spicy-lyrics\.js') { & spicetify config extensions spicy-lyrics.js | Out-Null }

# 4. Apply. First run needs a backup of the stock Spotify files.
& spicetify backup apply
if ($LASTEXITCODE -ne 0) { & spicetify apply }

Write-Host ''
Write-Host 'Done. Spotify restarts with the PJS #13 theme.' -ForegroundColor Green
Write-Host 'Open Spicy Lyrics, then Cinema View / Fullscreen to see the Halloween scene.'
