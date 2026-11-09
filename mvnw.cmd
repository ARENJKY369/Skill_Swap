@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "PROPS=%SCRIPT_DIR%.mvn\wrapper\maven-wrapper.properties"
if not exist "%PROPS%" (
  echo Missing %PROPS% 1>&2
  exit /b 1
)

set "MVNW_REPOURL=https://repo.maven.apache.org/maven2"
set "DIST_URL="
for /f "usebackq tokens=1,* delims==" %%A in ("%PROPS%") do (
  if "%%A"=="distributionUrl" set "DIST_URL=%%B"
)
if not defined DIST_URL (
  echo distributionUrl missing in %PROPS% 1>&2
  exit /b 1
)

if not defined MAVEN_USER_HOME set "MAVEN_USER_HOME=%USERPROFILE%\.m2"
for %%F in ("%DIST_URL%") do set "DIST_ZIP=%%~nxF"
set "DIST_NAME=%DIST_ZIP:.zip=%"
set "DIST_NAME=%DIST_NAME:-bin=%"
set "DIST_DIR=%MAVEN_USER_HOME%\wrapper\dists\%DIST_NAME%"
set "MVN_EXEC=%DIST_DIR%\%DIST_NAME%\bin\mvn.cmd"

if not exist "%MVN_EXEC%" (
  where mvn.cmd >nul 2>&1
  if !errorlevel! equ 0 (
    call mvn.cmd %*
    exit /b !errorlevel!
  )
  if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
  echo Downloading Apache Maven from %DIST_URL%...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri $env:DIST_URL -OutFile (Join-Path $env:DIST_DIR $env:DIST_ZIP); Expand-Archive -Path (Join-Path $env:DIST_DIR $env:DIST_ZIP) -DestinationPath $env:DIST_DIR -Force; Remove-Item (Join-Path $env:DIST_DIR $env:DIST_ZIP) -Force"
  if !errorlevel! neq 0 (
    echo Failed to download or extract Maven distribution. 1>&2
    exit /b 1
  )
)

call "%MVN_EXEC%" %*
exit /b %errorlevel%
