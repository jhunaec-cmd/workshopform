@echo off
REM Double-click this file to start AEC Workshop on this PC.
title AEC Workshop
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

REM First run only: install the libraries the server needs.
if not exist node_modules (
  echo Installing for the first time, please wait...
  call npm install --omit=dev
)

REM First run only: create .env with a random secret for login tokens.
if not exist .env (
  echo Creating .env settings file...
  node -e "const fs=require('fs');const s=require('crypto').randomBytes(48).toString('hex');fs.writeFileSync('.env',fs.readFileSync('.env.example','utf8').replace('change-this-to-a-long-random-string',s))"
)

start "" http://localhost:3004
node server/index.js
pause
