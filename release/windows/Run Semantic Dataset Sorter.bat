@echo off
setlocal

cd /d "%~dp0"
set "SORTER_APP_ROOT=%~dp0"

if not exist "llm-semantic-dataset-sorter-server.exe" (
    echo Missing llm-semantic-dataset-sorter-server.exe in %~dp0
    pause
    exit /b 1
)

llm-semantic-dataset-sorter-server.exe

if errorlevel 1 (
    echo.
    echo Semantic Dataset Sorter stopped with an error.
    pause
)
