#!/usr/bin/env bash
# AZET Pass for iPhone on a simulator against production: throwaway account -> login -> vault -> authenticator code (no Premium).
# The account is deleted afterwards. The master password never reaches argv, Maestro's console or its saved run:
# it goes in as MAESTRO_PW (env), the input step has a label instead of its value, console lines are filtered, and the
# Maestro run folder (commands.json, maestro.log keep raw input values) is removed.
# usage: test-ios-login.sh <simulator udid>   needs: built app (build-ios.sh), maestro, bw, tkt AZET_PASS_JWT_SECRET
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); U=${1:?simulator udid}; B=https://pass.azet.io
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT; umask 077
EMAIL="ios-sim-$RANDOM$RANDOM@example.com"; export MAESTRO_PW=$(head -c 18 /dev/urandom | base64 | tr -d '/+=')
(cd "$here/../server" && JWT_SECRET="$(tkt get AZET_PASS_JWT_SECRET)" node test/register.mjs "$B" "$EMAIL" "$MAESTRO_PW" >/dev/null)
export BITWARDENCLI_APPDATA_DIR="$W/bw"; bw config server "$B" >/dev/null
export BW_SESSION=$(bw login "$EMAIL" --passwordenv MAESTRO_PW --raw 2>/dev/null)
bw get template item | jq -c '.name="iOS sim TOTP" | .notes=null | .login={username:"sim-user",password:"sim-pass-123",totp:"JBSWY3DPEHPK3PXP",uris:[{match:null,uri:"https://example.org/login"}]}' | bw encode | bw create item >/dev/null; bw sync >/dev/null
cleanup() {  # retried: wrangler fetch fails under load; prints the rows left so a stray account is never silent
  local q="DELETE FROM ciphers WHERE user_id=(SELECT id FROM users WHERE email='$EMAIL'); DELETE FROM devices WHERE user_id=(SELECT id FROM users WHERE email='$EMAIL'); DELETE FROM users WHERE email='$EMAIL';"
  for _ in 1 2 3 4 5; do (cd "$here/../server" && npx wrangler d1 execute azet-pass --remote --command "$q" >/dev/null 2>&1) && break; sleep 15; done
  (cd "$here/../server" && npx wrangler d1 execute azet-pass --remote --json --command "SELECT COUNT(*) AS n FROM users WHERE email='$EMAIL'" 2>/dev/null | jq -r '"test account rows left: \(.[0].results[0].n)"')
  rm -rf "$W"; }
trap cleanup EXIT
cat > "$W/flow.yaml" <<YAML
appId: io.azet.pass
---
- launchApp: { clearState: true }
- tapOn: "로그인"
- tapOn: "이메일 주소"
- inputText: "$EMAIL"
- tapOn: "계속"
- extendedWaitUntil: { visible: "마스터 비밀번호", timeout: 60000 }
- tapOn: "마스터 비밀번호"
- inputText:
    text: \${MAESTRO_PW}
    label: "Input master password"
- tapOn: { text: ".*마스터 비밀번호로 로그인.*" }
- extendedWaitUntil: { visible: ".*iOS sim TOTP.*", timeout: 120000 }
- tapOn: ".*iOS sim TOTP.*"
- extendedWaitUntil: { visible: "인증 키", timeout: 30000 }
- takeScreenshot: item
YAML
MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-400000} maestro --device "$U" test --test-output-dir "$W/maestro" --debug-output "$W/maestro-debug" "$W/flow.yaml" 2>&1 \
  | while IFS= read -r l; do printf '%s\n' "${l//$MAESTRO_PW/<redacted>}"; done
shot=$(find "$W/maestro" -name item.png | head -1); [ -n "$shot" ] && cp "$shot" "${OUT:-/tmp}/azet-pass-ios-item.png" && echo "screenshot: ${OUT:-/tmp}/azet-pass-ios-item.png"
