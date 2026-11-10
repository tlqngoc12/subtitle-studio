<#
.SYNOPSIS
  Backs up the Oracle schema SUBTITLE_STUDIO with Data Pump (expdp) into data\backups\.

.DESCRIPTION
  Runs expdp inside the `oracle` compose service as SYSTEM, copies the dump and its log out of the
  container (so the Oracle volume does not grow), keeps the newest 14 backups and appends one line per run
  to data\backups\backup.log. Windows PowerShell 5.1 compatible; works from any working directory.

  The password is never read by this script: the container already has ORACLE_PASSWORD in its environment
  (docker-compose.yml). Inside the container it goes into a temporary mode-600 parameter file that is deleted
  afterwards, so it is on no command line, in no log and not on the host.

  Exit code 0 = backup OK, 1 = failed (the reason is the last line of backup.log).
#>
[CmdletBinding()]
param(
    # How many backups (dump + log pairs) to keep.
    [int]$Keep = 14
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $repo 'data\backups'
$logFile = Join-Path $backupDir 'backup.log'
$compose = @('compose', '--project-directory', $repo, '-f', (Join-Path $repo 'docker-compose.yml'))

function Write-BackupLog([string]$Message) {
    Add-Content -Path $logFile -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'), $Message) -Encoding UTF8
}

# Runs docker without letting PowerShell 5.1 turn its stderr into a terminating error; returns exit code + lines.
function Invoke-Docker([string[]]$DockerArgs, [string]$StdIn = $null) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($null -ne $StdIn) {
            $lines = $StdIn | & docker @DockerArgs 2>&1 | ForEach-Object { "$_" }
        } else {
            $lines = & docker @DockerArgs 2>&1 | ForEach-Object { "$_" }
        }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $old
    }
    return [pscustomobject]@{ ExitCode = $code; Lines = @($lines) }
}

# Runs inside the oracle container (bash reads it from stdin). Prints DPDIR=<directory path> on success and, on
# failure, only ORA-/UDE- error codes: never the password, never data.
$containerScript = @'
set -eu
umask 077
WORK=$(mktemp -d /tmp/ssbackup.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
CONN="system/\"$ORACLE_PASSWORD\"@//localhost:1521/FREEPDB1"

cat > "$WORK/dir.sql" <<SQL
connect $CONN
set heading off feedback off pagesize 0 verify off echo off
select directory_path from dba_directories where directory_name = 'DATA_PUMP_DIR';
exit
SQL
DIR=$(sqlplus -S /nolog @"$WORK/dir.sql" < /dev/null | grep -v '^[[:space:]]*$' | tail -n 1)
case "$DIR" in /*) ;; *) echo "ERR: cannot read DATA_PUMP_DIR"; exit 3;; esac

cat > "$WORK/exp.par" <<PAR
userid=$CONN
schemas=SUBTITLE_STUDIO
directory=DATA_PUMP_DIR
dumpfile=__NAME__.dmp
logfile=__NAME__.log
flashback_time=systimestamp
PAR
if ! expdp parfile="$WORK/exp.par" < /dev/null > "$WORK/expdp.out" 2>&1; then
  echo "ERR: expdp failed: $(grep -oE '(ORA|UDE)-[0-9]+' "$WORK/expdp.out" | sort -u | tr '\n' ' ')"
  rm -f "$DIR/__NAME__.dmp" "$DIR/__NAME__.log"
  exit 4
fi
echo "DPDIR=$DIR"
# end
'@

$name = 'ss-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$dumpPath = $null
$dpDir = $null

try {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    # 1. The oracle service must be running and healthy.
    $id = (Invoke-Docker ($compose + @('ps', '-q', 'oracle'))).Lines | Where-Object { $_ -match '^[0-9a-f]{12,}$' } | Select-Object -First 1
    $health = $null
    if ($id) {
        $health = ((Invoke-Docker @('inspect', '-f', '{{.State.Health.Status}}', $id)).Lines | Select-Object -First 1)
    }
    if (-not $id -or $health -ne 'healthy') {
        throw 'oracle not running'
    }

    # 2-3. expdp inside the container.
    $script = ($containerScript -replace "`r", '') -replace '__NAME__', $name
    $run = Invoke-Docker ($compose + @('exec', '-T', 'oracle', 'bash', '-s')) $script
    if ($run.ExitCode -ne 0) {
        $err = $run.Lines | Where-Object { $_ -match '^ERR:' } | Select-Object -First 1
        if ($err) { throw ($err -replace '^ERR:\s*', '') }
        throw "expdp failed (exit $($run.ExitCode))"
    }
    $dpLine = $run.Lines | Where-Object { $_ -match '^DPDIR=/' } | Select-Object -First 1
    if (-not $dpLine) { throw 'expdp gave no directory path' }
    $dpDir = ($dpLine -replace '^DPDIR=', '').Trim()

    # Copy the dump and the log out, then delete them inside the container.
    $dumpPath = Join-Path $backupDir "$name.dmp"
    foreach ($ext in 'dmp', 'log') {
        $cp = Invoke-Docker ($compose + @('cp', "oracle:$dpDir/$name.$ext", (Join-Path $backupDir "$name.$ext")))
        if ($cp.ExitCode -ne 0) { throw "could not copy $name.$ext out of the container" }
    }
    $null = Invoke-Docker ($compose + @('exec', '-T', 'oracle', 'rm', '-f', "$dpDir/$name.dmp", "$dpDir/$name.log"))
    $dpDir = $null

    $item = Get-Item -LiteralPath $dumpPath
    if ($item.Length -le 0) { throw 'dump file is empty' }

    # 4. Keep the newest $Keep backups (and their logs).
    $old = Get-ChildItem -Path $backupDir -Filter 'ss-*.dmp' | Sort-Object Name -Descending | Select-Object -Skip $Keep
    foreach ($f in $old) {
        Remove-Item -LiteralPath $f.FullName -Force
        $l = [System.IO.Path]::ChangeExtension($f.FullName, 'log')
        if (Test-Path -LiteralPath $l) { Remove-Item -LiteralPath $l -Force }
    }

    # 5. One line in the log.
    Write-BackupLog ('OK {0}.dmp {1} MB' -f $name, ([math]::Round($item.Length / 1MB, 2).ToString([System.Globalization.CultureInfo]::InvariantCulture)))
    exit 0
} catch {
    $reason = ($_.Exception.Message -replace '\s+', ' ')
    if ($reason.Length -gt 200) { $reason = $reason.Substring(0, 200) }
    # Leave nothing half-done behind, in the container or in data\backups.
    if ($dpDir) {
        $null = Invoke-Docker ($compose + @('exec', '-T', 'oracle', 'rm', '-f', "$dpDir/$name.dmp", "$dpDir/$name.log"))
    }
    foreach ($ext in 'dmp', 'log') {
        $partial = Join-Path $backupDir "$name.$ext"
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
    }
    try {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
        Write-BackupLog "FAILED $reason"
    } catch { }
    [Console]::Error.WriteLine("Backup failed: $reason")
    exit 1
}
