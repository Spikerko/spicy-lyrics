Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
}
'@
$p = Get-Process Spotify | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$c = New-Object W+RECT
$w = New-Object W+RECT
[W]::GetClientRect($p.MainWindowHandle, [ref]$c) | Out-Null
[W]::GetWindowRect($p.MainWindowHandle, [ref]$w) | Out-Null
"client {0}x{1}  window {2}x{3} at ({4},{5})  title={6}" -f ($c.R - $c.L), ($c.B - $c.T), ($w.R - $w.L), ($w.B - $w.T), $w.L, $w.T, $p.MainWindowTitle
