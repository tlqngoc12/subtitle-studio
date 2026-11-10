<#
.SYNOPSIS
  Restores a backup made by backup-db.ps1 with Data Pump (impdp).

.DESCRIPTION
  .\scripts\restore-db.ps1 -Dump data\backups\ss-20261110-120000.dmp -TargetSchema SS_RESTORE_TEST
      Restores into a NEW schema (remap_schema), for testing a backup. Refuses when the schema already exists.

  .\scripts\restore-db.ps1 -Dump data\backups\ss-20261110-120000.dmp
      Restores OVER SUBTITLE_STUDIO: drops that schema (all its tables and data) and imports the dump.
      Asks you to type RESTORE first. Stop the app first: docker compose stop subtitle-studio
      (a connected user cannot be dropped), and start it again afterwards.

  The password is never read here: the oracle container has ORACLE_PASSWORD in its environment and the script
  puts it in a temporary mode-600 parameter file inside the container only. Windows PowerShell 5.1 compatible.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Dump,
    [string]$TargetSchema = ''
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$compose = @('compose', '--project-directory', $repo, '-f', (Join-Path $repo 'docker-compose.yml'))

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

# Prints DPDIR=<path of DATA_PUMP_DIR>.
$dirScript = @'
set -eu
umask 077
WORK=$(mktemp -d /tmp/ssrestore.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
CONN="system/\"$ORACLE_PASSWORD\"@//localhost:1521/FREEPDB1"
cat > "$WORK/dir.sql" <<SQL
connect $CONN
set heading off feedback off pagesize 0 verify off echo off
select directory_path from dba_directories where directory_name = 'DATA_PUMP_DIR';
exit
SQL
DIR=$(sqlplus -S /nolog @"$WORK/dir.sql" < /dev/null | grep -v '^[[:space:]]*$' | tail -n 1)
case "$DIR" in /*) echo "DPDIR=$DIR";; *) echo "ERR: cannot read DATA_PUMP_DIR"; exit 3;; esac
# end
'@

# __DUMP__ file name, __TARGET__ new schema name or empty, __DROP__ 1 to drop SUBTITLE_STUDIO first.
$importScript = @'
set -eu
umask 077
WORK=$(mktemp -d /tmp/ssrestore.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
CONN="system/\"$ORACLE_PASSWORD\"@//localhost:1521/FREEPDB1"
TARGET="__TARGET__"
if [ -n "$TARGET" ]; then
  cat > "$WORK/check.sql" <<SQL
connect $CONN
set heading off feedback off pagesize 0 verify off echo off
select count(*) from dba_users where username = '$TARGET';
exit
SQL
  N=$(sqlplus -S /nolog @"$WORK/check.sql" < /dev/null | grep -E '^[[:space:]]*[0-9]+[[:space:]]*$' | tail -n 1 | tr -d '[:space:]')
  if [ "${N:-x}" != "0" ]; then echo "ERR: schema $TARGET already exists or cannot be checked, drop it first"; exit 5; fi
fi
if [ "__DROP__" = "1" ]; then
  cat > "$WORK/drop.sql" <<SQL
connect $CONN
whenever sqlerror exit failure
drop user SUBTITLE_STUDIO cascade;
exit
SQL
  if ! sqlplus -S /nolog @"$WORK/drop.sql" < /dev/null > "$WORK/drop.out" 2>&1; then
    echo "ERR: could not drop SUBTITLE_STUDIO (is the app stopped?): $(grep -oE 'ORA-[0-9]+' "$WORK/drop.out" | sort -u | tr '\n' ' ')"; exit 6
  fi
fi
{
  echo "userid=$CONN"
  echo "schemas=SUBTITLE_STUDIO"
  echo "directory=DATA_PUMP_DIR"
  echo "dumpfile=__DUMP__"
  echo "logfile=imp-__DUMP__.log"
  if [ -n "$TARGET" ]; then echo "remap_schema=SUBTITLE_STUDIO:$TARGET"; fi
} > "$WORK/imp.par"
if ! impdp parfile="$WORK/imp.par" < /dev/null > "$WORK/impdp.out" 2>&1; then
  echo "ERR: impdp failed: $(grep -oE '(ORA|UDE)-[0-9]+' "$WORK/impdp.out" | sort -u | tr '\n' ' ')"; exit 4
fi
echo "IMPORT-OK"
# end
'@

if (-not (Test-Path -LiteralPath $Dump)) { throw "Dump file not found: $Dump" }
$dumpFile = Get-Item -LiteralPath $Dump
if ($dumpFile.Name -notmatch '^[A-Za-z0-9._-]+\.dmp$') { throw 'The dump file name may only contain letters, digits, dot, dash and underscore.' }

$target = $TargetSchema.Trim().ToUpperInvariant()
$drop = '0'
if ($target) {
    if ($target -notmatch '^[A-Z][A-Z0-9_]{0,29}$') { throw 'TargetSchema must be 1-30 letters, digits or underscores, starting with a letter.' }
    if ($target -in @('SUBTITLE_STUDIO', 'SYS', 'SYSTEM')) { throw "Use no -TargetSchema to restore over SUBTITLE_STUDIO; $target cannot be a test target." }
} else {
    Write-Host 'This DROPS the schema SUBTITLE_STUDIO (all tables and data) and restores it from the dump.'
    Write-Host 'Stop the app first: docker compose stop subtitle-studio'
    $answer = Read-Host 'Type RESTORE to continue'
    if ($answer -ne 'RESTORE') { Write-Host 'Cancelled.'; exit 2 }
    $drop = '1'
}

$dpDir = $null
try {
    $dir = Invoke-Docker ($compose + @('exec', '-T', 'oracle', 'bash', '-s')) (($dirScript -replace "`r", ''))
    $line = $dir.Lines | Where-Object { $_ -match '^DPDIR=/' } | Select-Object -First 1
    if ($dir.ExitCode -ne 0 -or -not $line) { throw 'could not find the Data Pump directory (is the oracle service healthy?)' }
    $dpDir = ($line -replace '^DPDIR=', '').Trim()

    $cp = Invoke-Docker ($compose + @('cp', $dumpFile.FullName, "oracle:$dpDir/$($dumpFile.Name)"))
    if ($cp.ExitCode -ne 0) { throw 'could not copy the dump into the container' }
    # docker cp creates the file as root: let the oracle user read it.
    $null = Invoke-Docker ($compose + @('exec', '-T', '-u', 'root', 'oracle', 'chown', 'oracle:oinstall', "$dpDir/$($dumpFile.Name)"))
    $null = Invoke-Docker ($compose + @('exec', '-T', '-u', 'root', 'oracle', 'chmod', '640', "$dpDir/$($dumpFile.Name)"))

    $script = (($importScript -replace "`r", '') -replace '__DUMP__', $dumpFile.Name) -replace '__TARGET__', $target -replace '__DROP__', $drop
    $imp = Invoke-Docker ($compose + @('exec', '-T', 'oracle', 'bash', '-s')) $script
    if ($imp.ExitCode -ne 0 -or -not ($imp.Lines -contains 'IMPORT-OK')) {
        $err = $imp.Lines | Where-Object { $_ -match '^ERR:' } | Select-Object -First 1
        if ($err) { throw ($err -replace '^ERR:\s*', '') }
        throw "impdp failed (exit $($imp.ExitCode))"
    }
    Write-Host "Restore finished into $(if ($target) { $target } else { 'SUBTITLE_STUDIO' })."
    if (-not $target) { Write-Host 'Start the app again: docker compose start subtitle-studio' }
} finally {
    if ($dpDir) {
        $null = Invoke-Docker ($compose + @('exec', '-T', 'oracle', 'rm', '-f', "$dpDir/$($dumpFile.Name)", "$dpDir/imp-$($dumpFile.Name).log"))
    }
}
