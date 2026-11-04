@echo off
rem Bấm đúp để mở Sân Đình chơi qua Internet (server + tunnel Cloudflare trong một cửa sổ).
rem Đóng cửa sổ này (hoặc Ctrl+C) là tắt cả server lẫn tunnel.
chcp 65001 >nul
title San Dinh - choi online
cd /d "%~dp0"
where node >nul 2>nul || (echo Chua cai Node.js 18+, tai o https://nodejs.org & pause & exit /b 1)
node server.js --online
pause
