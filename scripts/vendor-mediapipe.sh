#!/usr/bin/env bash
# One-time preparation when packaging/releasing. Browser runtime never uses npm/CDN.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=0.4.1675469240
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --ignore-scripts --no-audit --no-fund --save-exact "@mediapipe/hands@${VERSION}"
cd - >/dev/null
mkdir -p vendor/mediapipe-hands
cp -R "$TMP/node_modules/@mediapipe/hands/." vendor/mediapipe-hands/
node scripts/manifest-offline.mjs
printf 'Bundled MediaPipe Hands %s. No remote browser dependencies.\n' "$VERSION"
