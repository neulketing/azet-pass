#!/usr/bin/env bash
# Build once with the pinned rustup toolchain, then deploy without wrangler's cargo hook
# (wrangler runs the hook with Homebrew's cargo first on PATH, which has no wasm32 target).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH
worker-build --release --locked
mkdir -p public/web-vault
sed '/^\[build\]/,/^command/d' wrangler.toml > wrangler.deploy.toml
npx wrangler deploy -c wrangler.deploy.toml "$@"
