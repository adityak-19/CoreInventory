$ports = @(4000, 5173)
foreach ($port in $ports) {
    $ownerPids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
    foreach ($procId in $ownerPids) {
        if ($procId) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "Killed PID $procId on port $port"
        }
    }
}
Start-Sleep -Milliseconds 400
