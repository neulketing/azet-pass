#!/usr/bin/env bash
# AZET Pass desktop on this Mac: macOS arm64 app (ad-hoc signed; Developer ID needs Apple enrolment) and the
# Windows x64 portable folder, cross-built with cargo-xwin (NSIS needs an x86 makensis = Rosetta or a Windows box).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); . "$here/pins.env"
W=${1:-$here/../../azet-pass-work}; mkdir -p "$W/dist"; src="$W/clients-desktop"
export PATH=/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:/opt/homebrew/opt/llvm/bin:$PATH
[ -d "$src" ] || git clone -q --depth 1 --branch "$DESKTOP_TAG" "$CLIENTS_REPO" "$src"
git -C "$src" checkout -q -- . && git -C "$src" clean -qfd -e node_modules
node "$here/rebrand.mjs" "$src"
(cd "$src" && npm install --no-audit --no-fund --ignore-scripts)
d="$src/apps/desktop"
(cd "$d/desktop_native" && node build.js && node build.js --target=x86_64-pc-windows-msvc)
(cd "$d" && npm run build)
(cd "$d" && CSC_NAME=- npx electron-builder --mac --arm64 --dir -p never -c.mac.identity=null || true) # Bitwarden's notarize hook fails without their ID
codesign --force --deep -s - "$d/dist/mac-arm64/AZET Pass.app" && codesign -v "$d/dist/mac-arm64/AZET Pass.app"
(cd "$d" && npx electron-builder --win dir --x64 -p never -c.win.signAndEditExecutable=false)
(cd "$d/dist" && rm -rf "AZET Pass" && mv win-unpacked "AZET Pass" && zip -qr "$W/dist/azet-pass-windows-x64.zip" "AZET Pass" && mv "AZET Pass" win-unpacked)
(cd "$d/dist/mac-arm64" && ditto -c -k --keepParent "AZET Pass.app" "$W/dist/azet-pass-mac-arm64.zip")
ls -la "$W/dist"
