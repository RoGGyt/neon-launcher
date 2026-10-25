@echo off
chcp 65001 >nul
title Neon Launcher - сборка установщика
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установи LTS-версию с nodejs.org и запусти этот файл снова.
  start "" https://nodejs.org
  pause
  exit /b 1
)

echo.
echo [1/3] Устанавливаю зависимости...
call npm install
if errorlevel 1 goto fail

echo.
echo [2/3] Собираю установщик (пара минут)...
call npm run dist
if errorlevel 1 goto fail

echo.
echo [3/3] Копирую готовые файлы в эту папку...
for %%f in ("release\*Setup*.exe") do copy /y "%%f" "%~dp0NeonLauncher-Setup.exe" >nul
for %%f in ("release\NeonLauncher-portable-*.exe") do copy /y "%%f" "%~dp0NeonLauncher-Portable.exe" >nul

echo.
echo Готово!
echo   NeonLauncher-Setup.exe     - установщик (ярлык на рабочем столе и в Пуске)
echo   NeonLauncher-Portable.exe  - запускается сразу, без установки
echo.
explorer "%~dp0"
pause
exit /b 0

:fail
echo.
echo Сборка не удалась. Скопируй текст ошибки выше и отправь мне.
pause
exit /b 1
