<#
.SYNOPSIS
  Registers (or updates) the Windows scheduled task that runs backup-db.ps1 every day at 12:00.

.DESCRIPTION
  Task name: "SubtitleStudio DB backup". Runs as the current user only while that user is logged on (Docker
  Desktop needs the user session), and "StartWhenAvailable" runs it as soon as possible after a missed start
  (the machine was off or asleep at 12:00). Re-running this script updates the task. No administrator rights needed.
  Windows PowerShell 5.1 compatible.
#>
[CmdletBinding()]
param(
    [string]$At = '12:00'
)

$ErrorActionPreference = 'Stop'

$taskName = 'SubtitleStudio DB backup'
$script = Join-Path $PSScriptRoot 'backup-db.ps1'
if (-not (Test-Path -LiteralPath $script)) { throw "Not found: $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Daily Data Pump export of the SUBTITLE_STUDIO schema into data\backups (keeps 14).' -Force | Out-Null

$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Host ('Registered "{0}". Next run: {1}' -f $taskName, $info.NextRunTime)
