#!/usr/bin/env bash
# Web build of the game (for a browser / iPhone, e.g. published as a claude.ai artifact).
# The Android assets are used as they are; only the page shell differs: the artifact host wraps the page
# in its own <html>/<head>/<body>, so index.html here holds just the title, the stylesheet and the body.
# Usage: tools/build_web.sh <out-dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A="$ROOT/android/app/src/main/assets"
OUT="${1:?usage: tools/build_web.sh <out-dir>}"
rm -rf "$OUT"
mkdir -p "$OUT/css" "$OUT/js" "$OUT/lib" "$OUT/fonts" "$OUT/img"
cp "$A"/css/*.css "$OUT/css/"
cp "$A"/js/*.js "$OUT/js/"
cp "$A/lib/three.min.js" "$OUT/lib/"
cp "$A"/fonts/*.ttf "$OUT/fonts/"
cp "$A"/img/* "$OUT/img/"
{
  echo '<title>Воксельные Корсары</title>'
  echo '<link rel="stylesheet" href="css/style.css">'
  # One deliberate dark look (the game's own palette), whatever the viewer's theme.
  echo '<style>:root { color-scheme: dark; } html, body { height: 100%; background: #0a1a2f; color: #fff; }</style>'
  sed -n '/<body>/,/<\/body>/p' "$A/index.html" | sed '1d;$d'
} > "$OUT/index.html"
echo "web build: $OUT ($(du -sh "$OUT" | cut -f1), $(find "$OUT" -type f | wc -l) files)"
