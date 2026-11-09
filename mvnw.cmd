@echo off
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
set "PROPS=%SCRIPT_DIR%.mvn\wrapper\maven-wrapper.properties"
for /f "usebackq tokens=1,* delims==" %%A in ("%PROPS%") do (
  if "%%A"=="distributionUrl" set "DIST_URL=%%B"
)
if not defined MAVEN_USER_HOME set "MAVEN_USER_HOME=%USERPROFILE%\.m2"
for %%F in ("%DIST_URL%") do set "DIST_ZIP=%%~nxF"
set "DIST_NAME=%DIST_ZIP:.zip=%"
set "DIST_NAME=%DIST_NAME:-bin=%"
set "DIST_DIR=%MAVEN_USER_HOME%\wrapper\dists\%DIST_NAME%"
set "MVN_EXEC=%DIST_DIR%\%DIST_NAME%\bin\mvn.cmd"

if not exist "%MVN_EXEC%" (
  where mvn >nul 2>&1 && (mvn %* & exit /b !errorlevel!)
  if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
  powershell -NoProfile -Command "Invoke-WebRequest -Uri '%DIST_URL%' -OutFile '%DIST_DIR%\%DIST_ZIP%'; Expand-Archive -Path '%DIST_DIR%\%DIST_ZIP%' -DestinationPath '%DIST_DIR%' -Force; Remove-Item '%DIST_DIR%\%DIST_ZIP%'"
)
call "%MVN_EXEC%" %*
