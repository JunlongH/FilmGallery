@echo off
echo ===============================================
echo FilmGallery Database Migration
echo Add missing columns to photos table
echo ===============================================
echo.
echo NOTE: This migration is now automatically run
echo when the application starts. You only need to
echo run this script manually if troubleshooting.
echo.
pause
echo.

REM Check if server is running
echo [1/4] Checking if server is running...
netstat -ano | findstr :4000 > nul
if %errorlevel% equ 0 (
    echo.
    echo WARNING: Server appears to be running on port 4000!
    echo Please stop the server before running migration.
    echo.
    echo Press Ctrl+C to cancel, or
    pause
)

REM Backup database
echo.
echo [2/4] Creating database backup...
set BACKUP_DIR=%USERPROFILE%\OneDrive\FilmGallery\backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

set DB_PATH=%USERPROFILE%\OneDrive\FilmGallery\film.db
set BACKUP_PATH=%BACKUP_DIR%\film_backup_%TIMESTAMP%.db

if exist "%DB_PATH%" (
    copy "%DB_PATH%" "%BACKUP_PATH%"
    if %errorlevel% equ 0 (
        echo Backup created: %BACKUP_PATH%
    ) else (
        echo ERROR: Failed to create backup!
        pause
        exit /b 1
    )
) else (
    echo WARNING: Database not found at %DB_PATH%
    echo Migration will still proceed...
)

REM Set environment variable for database path
set DATA_ROOT=%USERPROFILE%\OneDrive\FilmGallery

REM Run migration
echo.
echo [3/4] Running migration script...
node migrate-add-photo-columns.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Migration failed!
    echo Database backup is available at: %BACKUP_PATH%
    pause
    exit /b 1
)

REM Verify
echo.
echo [4/4] Migration completed successfully!
echo.
echo Database backup saved to:
echo %BACKUP_PATH%
echo.
echo You can now start the server.
echo.
pause
