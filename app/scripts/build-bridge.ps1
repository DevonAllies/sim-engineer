# Compiles the telemetry bridge (C#, .NET Framework 4 - present on every Windows 10/11 PC)
$ErrorActionPreference = 'Stop'
$app = Split-Path $PSScriptRoot -Parent
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Sort-Object FullName | Select-Object -Last 1
New-Item -ItemType Directory -Force (Join-Path $app 'bridge') | Out-Null
& $csc.FullName /nologo /target:exe /optimize+ "/out:$(Join-Path $app 'bridge\se-bridge.exe')" /r:System.Core.dll (Join-Path $app '..\bridge\Bridge.cs')
if ($LASTEXITCODE -ne 0) { throw 'bridge build failed' }
Write-Host 'bridge built'
