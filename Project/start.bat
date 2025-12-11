@echo off
echo ---------------------------------------------------
echo      DEBUG MODE - Windows will stay open
echo ---------------------------------------------------

if not exist node_modules\cors (
    echo Installing missing CORS package...
    call npm install cors
)

echo.
echo Launching Controller...
start "Controller" cmd /k node src/kv_stores.js controller

timeout /t 2 /nobreak >nul

echo Launching Workers...
start "Worker 0" cmd /k node src/kv_stores.js worker 0
start "Worker 1" cmd /k node src/kv_stores.js worker 1
start "Worker 2" cmd /k node src/kv_stores.js worker 2
start "Worker 3" cmd /k node src/kv_stores.js worker 3

echo.
echo Debug Cluster Launched.
pause