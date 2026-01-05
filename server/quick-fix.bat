@echo off
echo ================================================
echo FilmGallery Quick Fix - Port and Migration
echo ================================================
echo.

echo [1/3] Killing process on port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000') do (
    echo Found process: %%a
    taskkill /F /PID %%a 2>nul
    if %errorlevel% equ 0 (
        echo Process killed successfully.
    )
)
timeout /t 2 >nul

echo.
echo [2/3] Running database migration...
set DATA_ROOT=%USERPROFILE%\OneDrive\FilmGallery
node migrate-add-photo-columns.js
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Migration had issues, but continuing...
)

echo.
echo [3/3] Verifying schema...
node verify-photos-schema.js

echo.
echo ================================================
echo Done! You can now start the application.
echo ================================================
pause
