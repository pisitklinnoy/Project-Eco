$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Force $dataDir | Out-Null
$pythonPath = Join-Path $projectRoot '.venv-timeseries\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
}
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Install the project Python dependencies into .venv first.' }
$pythonWindowless = Join-Path (Split-Path -Parent $pythonPath) 'pythonw.exe'
if (Test-Path -LiteralPath $pythonWindowless) { $pythonPath = $pythonWindowless }
$vitePath = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vitePath)) { throw 'Run npm ci in frontend first.' }
$env:DATABASE_URL = 'sqlite:///' + ((Join-Path $dataDir 'local-preview.db') -replace '\\', '/')
$env:ENABLE_OTEL = 'false'
$env:BACKEND_API_URL = 'http://127.0.0.1:8112'
if (-not (Get-NetTCPConnection -State Listen -LocalPort 8112 -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $pythonPath -ArgumentList '-m uvicorn main:app --host 127.0.0.1 --port 8112' `
        -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $dataDir 'backend-local.log') -RedirectStandardError (Join-Path $dataDir 'backend-local-error.log') | Out-Null
}
if (-not (Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList "`"$vitePath`" --host 127.0.0.1 --port 3001 --strictPort" `
        -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $dataDir 'frontend-local.log') -RedirectStandardError (Join-Path $dataDir 'frontend-local-error.log') | Out-Null
}
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $stations = Invoke-RestMethod 'http://127.0.0.1:3001/api/v1/stations' -TimeoutSec 2
        if (@($stations | Where-Object station_code -eq 'STN-MUANGKONG').Count -eq 1) {
            Write-Output 'Project Eco ready: http://127.0.0.1:3001/ (API: http://127.0.0.1:8112/docs)'
            exit 0
        }
    } catch { }
    Start-Sleep -Seconds 1
}
throw 'Project Eco did not become ready. Check data/*-local*.log and verify ports 3001/8112 belong to this project.'
