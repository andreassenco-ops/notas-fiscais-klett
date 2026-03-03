# position-windows.ps1
# Posiciona as janelas do sistema Klett no layout 2x2
# Top-Left: Bot | Top-Right: Worker
# Bottom-Left: Tunnel | Bottom-Right: Chrome (WhatsApp)

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int W, int H, bool repaint);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

# Get screen size
$screenW = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width
$screenH = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Height
$halfW = [int]($screenW / 2)
$halfH = [int]($screenH / 2)

function Move-Win($title, $x, $y, $w, $h) {
    $procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*$title*" -and $_.MainWindowHandle -ne 0 }
    foreach ($p in $procs) {
        [WinAPI]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
        [WinAPI]::MoveWindow($p.MainWindowHandle, $x, $y, $w, $h, $true) | Out-Null
        Write-Host "Posicionado: $($p.MainWindowTitle) -> ($x,$y,$w,$h)"
    }
}

# Top-Left: Bot
Move-Win "Klett Bot" 0 0 $halfW $halfH

# Top-Right: Worker
Move-Win "Klett Worker" $halfW 0 $halfW $halfH

# Bottom-Left: Tunnel
Move-Win "Klett Tunnel" 0 $halfH $halfW $halfH
