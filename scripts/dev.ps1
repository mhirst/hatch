# Windows-friendly equivalent of scripts/dev.sh
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location "$root\daemon"
$daemon = Start-Process go -ArgumentList 'run','./cmd/hatchd' -PassThru -NoNewWindow
Pop-Location

try {
  Push-Location "$root\web"
  npm run dev
  Pop-Location
}
finally {
  if ($daemon -and !$daemon.HasExited) { Stop-Process -Id $daemon.Id -Force }
}
