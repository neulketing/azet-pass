#!/usr/bin/env bash
# AZET Pass browser extension (Chrome/Edge MV3, Firefox) from the pinned upstream tag + rebrand.mjs.
# usage: build-extension.sh [work-dir]   -> <work-dir>/dist/azet-pass-<browser>-<version>.zip
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); . "$here/pins.env"
W=${1:-$here/../../azet-pass-work}; mkdir -p "$W/dist"; src="$W/clients-browser"
[ -d "$src" ] || git clone -q --depth 1 --branch "$BROWSER_TAG" "$CLIENTS_REPO" "$src"
git -C "$src" checkout -q -- . && git -C "$src" clean -qfd   # start from the pristine tag every time
node "$here/rebrand.mjs" "$src"
(cd "$src" && npm install --no-audit --no-fund --ignore-scripts)
# AZET revision on top of the upstream tag (stores need a higher version for every upload)
v=${EXT_VERSION:-${BROWSER_TAG#browser-v}}
sed -i '' -E "s/\"version\": \"[0-9.]+\"/\"version\": \"$v\"/" "$src/apps/browser/src/manifest.json" "$src/apps/browser/src/manifest.v3.json"
for b in chrome edge firefox; do
  (cd "$src/apps/browser" && rm -rf build && NODE_ENV=production npm run "build:$b")
  (cd "$src/apps/browser/build" && rm -f ./*.map ./*/*.map && zip -qr "$W/dist/azet-pass-$b-$v.zip" .)
done
ls -la "$W/dist"
