# Builds "Setup Engineer.exe" in the folder above this one. Run: powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot; $out = Split-Path $src -Parent
Add-Type -AssemblyName System.Drawing

# --- icon: dark rounded tile with an orange gauge, saved as a PNG-based .ico ---
$ico = Join-Path $src 'app.ico'
if (-not (Test-Path $ico)) {
  function Draw([int]$s) {
    $bmp = New-Object Drawing.Bitmap $s, $s
    $g = [Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'
    $r = [int]($s * 0.22); $path = New-Object Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($s - $r - 1, 0, $r, $r, 270, 90)
    $path.AddArc($s - $r - 1, $s - $r - 1, $r, $r, 0, 90); $path.AddArc(0, $s - $r - 1, $r, $r, 90, 90); $path.CloseFigure()
    $g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(23, 26, 33))), $path)
    $w = [single]($s * 0.09); $m = $s * 0.2; $d = $s - 2 * $m
    $g.DrawArc((New-Object Drawing.Pen ([Drawing.Color]::FromArgb(60, 66, 80)), $w), $m, $m + $s * 0.05, $d, $d, 150, 240)
    $p2 = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(255, 106, 77)), $w; $p2.StartCap = 'Round'; $p2.EndCap = 'Round'
    $g.DrawArc($p2, $m, $m + $s * 0.05, $d, $d, 150, 160)
    $cx = $s / 2; $cy = $m + $s * 0.05 + $d / 2
    $p3 = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(232, 234, 239)), ([single]($s * 0.06)); $p3.EndCap = 'Round'; $p3.StartCap = 'Round'
    $g.DrawLine($p3, [single]$cx, [single]$cy, [single]($cx + $d * 0.30), [single]($cy - $d * 0.22))
    $g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(232, 234, 239))), [single]($cx - $s * 0.06), [single]($cy - $s * 0.06), [single]($s * 0.12), [single]($s * 0.12))
    $g.Dispose(); $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png); return , $ms.ToArray()
  }
  $sizes = 256, 48, 32, 16; $pngs = @($sizes | ForEach-Object { , (Draw $_) })
  $fs = [IO.File]::Create($ico); $bw = New-Object IO.BinaryWriter $fs
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
  $off = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = $sizes[$i]; $b = if ($sz -ge 256) { 0 } else { $sz }
    $bw.Write([byte]$b); $bw.Write([byte]$b); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$off); $off += $pngs[$i].Length
  }
  foreach ($p in $pngs) { $bw.Write($p) }
  $bw.Close()
}

# --- compile ---
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Sort-Object FullName | Select-Object -Last 1
$exe = Join-Path $out 'Setup Engineer.exe'
& $csc.FullName /nologo /target:winexe /optimize+ "/out:$exe" "/win32icon:$ico" `
  "/resource:$(Join-Path $out 'setup-engineer.html'),page.html" `
  /r:System.Core.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $src 'SetupEngineer.cs')
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Write-Host "Built $exe"
