#!/bin/sh
# Apache Maven Wrapper (only-script) — executes Maven 3.9.9 from .mvn/wrapper/maven-wrapper.properties
set -eu

MVNW_REPOURL="${MVNW_REPOURL:-https://repo.maven.apache.org/maven2}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROPS="$SCRIPT_DIR/.mvn/wrapper/maven-wrapper.properties"

if [ ! -f "$PROPS" ]; then
  echo "Missing $PROPS" >&2
  exit 1
fi

distributionUrl="$(grep '^distributionUrl=' "$PROPS" | head -n1 | cut -d= -f2- | tr -d '\r')"
if [ -z "$distributionUrl" ]; then
  echo "distributionUrl missing in $PROPS" >&2
  exit 1
fi

case "$distributionUrl" in
  http://*|https://*) ;;
  *) distributionUrl="$MVNW_REPOURL/$distributionUrl" ;;
esac

MVN_USER_HOME="${MAVEN_USER_HOME:-${HOME}/.m2}"
DIST_NAME="$(basename "$distributionUrl" .zip | sed 's/-bin$//')"
DIST_DIR="$MVN_USER_HOME/wrapper/dists/$DIST_NAME"
MVN_EXEC="$DIST_DIR/$DIST_NAME/bin/mvn"

if [ ! -x "$MVN_EXEC" ]; then
  if command -v mvn >/dev/null 2>&1; then
    exec mvn "$@"
  fi
  mkdir -p "$DIST_DIR"
  ARCHIVE="$DIST_DIR/$(basename "$distributionUrl")"
  echo "Downloading Maven distribution from $distributionUrl..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$distributionUrl" -o "$ARCHIVE"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$distributionUrl" -O "$ARCHIVE"
  else
    echo "Neither curl nor wget is available to download Maven." >&2
    exit 1
  fi
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$ARCHIVE" -d "$DIST_DIR"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import zipfile; zipfile.ZipFile('$ARCHIVE').extractall('$DIST_DIR')"
  else
    echo "unzip or python3 required to extract Maven distribution." >&2
    exit 1
  fi
  rm -f "$ARCHIVE"
  chmod +x "$MVN_EXEC"
fi

exec "$MVN_EXEC" "$@"
