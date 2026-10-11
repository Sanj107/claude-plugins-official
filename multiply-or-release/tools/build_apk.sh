#!/usr/bin/env bash
# Builds an installable APK without the Android SDK (only a JDK 11+ and curl/unzip/zip):
#   aapt2 + framework resources  <- apktool release jar
#   dx (Java bytecode -> dex)    <- com.jakewharton.android.repackaged:dalvik-dx (Maven Central)
#   zipalign + v1/v2/v3 signing  <- uber-apk-signer (uses its bundled debug key)
# With the Android SDK installed, `./gradlew assembleRelease` in android/ produces the same app.
#
# Usage: tools/build_apk.sh [output.apk]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN="$ROOT/android/app/src/main"
TOOLS="${MOR_TOOLS_DIR:-$HOME/.cache/multiply-or-release-tools}"
BUILD="$ROOT/build"
OUT="${1:-$ROOT/release/multiply-or-release.apk}"

PACKAGE=com.sanj107.multiplyrelease
VERSION_CODE=1
VERSION_NAME=1.0
MIN_SDK=24
TARGET_SDK=34

APKTOOL_VER=3.0.3
DX_VER=16.0.1
SIGNER_VER=1.3.0

fetch() { # url dest
  [ -s "$2" ] && return 0
  echo "Downloading $1"
  curl -fsSL --retry 3 -o "$2.part" "$1"
  mv "$2.part" "$2"
}

mkdir -p "$TOOLS"
fetch "https://github.com/iBotPeaches/Apktool/releases/download/v$APKTOOL_VER/apktool_$APKTOOL_VER.jar" "$TOOLS/apktool-$APKTOOL_VER.jar"
fetch "https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/$DX_VER/dalvik-dx-$DX_VER.jar" "$TOOLS/dx-$DX_VER.jar"
fetch "https://github.com/patrickfav/uber-apk-signer/releases/download/v$SIGNER_VER/uber-apk-signer-$SIGNER_VER.jar" "$TOOLS/uber-apk-signer-$SIGNER_VER.jar"

case "$(uname -s)" in
  Linux) AAPT2_PATH=prebuilt/linux/aapt2 ;;
  Darwin) AAPT2_PATH=prebuilt/macosx/aapt2 ;;
  *) echo "No bundled aapt2 for $(uname -s); use Gradle instead." >&2; exit 1 ;;
esac
if [ ! -x "$TOOLS/aapt2" ] || [ ! -s "$TOOLS/android-framework.jar" ]; then
  unzip -o -q -j "$TOOLS/apktool-$APKTOOL_VER.jar" "$AAPT2_PATH" prebuilt/android-framework.jar -d "$TOOLS"
  chmod +x "$TOOLS/aapt2"
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/stubs" "$BUILD/classes"

echo "1/4 Compiling Java"
javac -nowarn -Xlint:-options --release 8 -d "$BUILD/stubs" $(find "$ROOT/tools/android-stubs" -name '*.java')
javac -nowarn -Xlint:-options --release 8 -cp "$BUILD/stubs" -d "$BUILD/classes" $(find "$MAIN/java" -name '*.java')

echo "2/4 Converting to dex"
java -cp "$TOOLS/dx-$DX_VER.jar" com.android.dx.command.Main --dex --min-sdk-version=$MIN_SDK \
  --output="$BUILD/classes.dex" "$BUILD/classes"

echo "3/4 Linking resources and assets"
# Gradle injects the package from `namespace`; do the same here.
sed "s|<manifest |<manifest package=\"$PACKAGE\" |" "$MAIN/AndroidManifest.xml" > "$BUILD/AndroidManifest.xml"
"$TOOLS/aapt2" compile --dir "$MAIN/res" -o "$BUILD/res.zip"
"$TOOLS/aapt2" link -o "$BUILD/unsigned.apk" -I "$TOOLS/android-framework.jar" \
  --manifest "$BUILD/AndroidManifest.xml" -A "$MAIN/assets" \
  --min-sdk-version $MIN_SDK --target-sdk-version $TARGET_SDK \
  --version-code $VERSION_CODE --version-name $VERSION_NAME \
  "$BUILD/res.zip"
(cd "$BUILD" && zip -q -X unsigned.apk classes.dex)

echo "4/4 Aligning and signing"
java -jar "$TOOLS/uber-apk-signer-$SIGNER_VER.jar" -a "$BUILD/unsigned.apk" -o "$BUILD/signed" --allowResign
mkdir -p "$(dirname "$OUT")"
cp "$BUILD"/signed/*.apk "$OUT"
echo "APK: $OUT"
