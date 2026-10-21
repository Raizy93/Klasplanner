@echo off
rem Start Klassenplanner lokaal en open de app in de browser.
rem Dubbelklik op dit bestand (of op een snelkoppeling ernaar).
title Klassenplanner
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is niet gevonden. Installeer het via https://nodejs.org en probeer het opnieuw.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Eerste keer starten: benodigde onderdelen worden geinstalleerd...
  call npm install
  if errorlevel 1 (
    echo.
    echo Installeren is mislukt. Controleer je internetverbinding en probeer het opnieuw.
    pause
    exit /b 1
  )
)

echo.
echo Klassenplanner wordt gestart. De browser opent vanzelf.
echo Laat dit venster open zolang je de app gebruikt. Sluit het venster om te stoppen.
echo.
call npm run dev -- --open

echo.
echo Klassenplanner is gestopt.
pause
