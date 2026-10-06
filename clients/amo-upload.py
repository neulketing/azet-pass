#!/usr/bin/env python3
"""One-shot AMO upload of the AZET Pass Firefox extension (board row 839).
Secrets come from the environment (~/.agents/env.sh); nothing secret is printed or logged.
Usage: amo-upload.py VERSION [--dry-run] [--retries N] [--wait SECONDS] [--job LABEL]
Inputs: ~/Code/azet-pass-work/dist/azet-pass-firefox-VERSION.zip and azet-pass-browser-VERSION-source.tar.gz"""
import base64, hashlib, hmac, json, os, subprocess, sys, time, uuid
import requests

ADDON = "azet-pass-password-manager"
API = "https://addons.mozilla.org/api/v5"
DIST = os.path.expanduser("~/Code/azet-pass-work/dist")
LOG = os.path.expanduser("~/Code/azet-suite/.lanes/amo-pass.log")
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
VERSION = sys.argv[1]
ZIP = f"{DIST}/azet-pass-firefox-{VERSION}.zip"
SRC = f"{DIST}/azet-pass-browser-{VERSION}-source.tar.gz"


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def auth():
    iss, sec = os.environ["AMO_JWT_ISSUER"], os.environ["AMO_JWT_SECRET"]
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
    now = int(time.time())
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(json.dumps({"iss": iss, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 240}).encode())
    s = b64(hmac.new(sec.encode(), h + b"." + p, hashlib.sha256).digest())
    return {"Authorization": "JWT " + (h + b"." + p + b"." + s).decode()}


def versions():
    r = requests.get(f"{API}/addons/addon/{ADDON}/versions/?filter=all_with_unlisted", headers=auth(), timeout=30)
    r.raise_for_status()
    return {v["version"]: v["file"]["status"] for v in r.json()["results"]}


def attempt(dry):
    """Returns 'done', 'retry' or 'fail'."""
    have = versions()
    log(f"versions on AMO: {have}")
    if VERSION in have:
        return "done"
    log(f"zip {os.path.getsize(ZIP)} B, source {os.path.getsize(SRC)} B")
    if dry:
        log("dry-run: auth and inputs OK, upload skipped")
        return "done"
    with open(ZIP, "rb") as f:
        r = requests.post(f"{API}/addons/upload/", headers=auth(), files={"upload": f}, data={"channel": "listed"}, timeout=180)
    if r.status_code == 429 or "too many" in r.text.lower():
        log(f"rate-limited: {r.status_code} {r.text[:200]}")
        return "retry"
    if r.status_code >= 300:
        log(f"upload failed: {r.status_code} {r.text[:300]}")
        return "retry" if r.status_code >= 500 else "fail"
    up = r.json()
    for _ in range(60):
        if up.get("processed"):
            break
        time.sleep(10)
        up = requests.get(f"{API}/addons/upload/{up['uuid']}/", headers=auth(), timeout=30).json()
    if not up.get("valid"):
        log(f"upload invalid: {json.dumps(up.get('validation', {}).get('messages', [])[:5])[:500]}")
        return "fail"
    with open(SRC, "rb") as f:
        r = requests.post(f"{API}/addons/addon/{ADDON}/versions/", headers=auth(),
                          data={"upload": up["uuid"], "license": "GPL-3.0-only"}, files={"source": f}, timeout=600)
    if r.status_code == 429 or r.status_code >= 500:
        log(f"version create deferred: {r.status_code} {r.text[:300]}")
        return "retry"
    if r.status_code >= 300:
        log(f"version create failed: {r.status_code} {r.text[:300]}")
        return "fail"
    v = r.json()
    log(f"version created: {v['version']} id {v['id']} file {v['file']['status']} source {'yes' if v.get('source') else 'no'}")
    return "done" if VERSION in versions() else "fail"


def main():
    dry = "--dry-run" in sys.argv
    retries, wait, job = int(arg("--retries", 4)), int(arg("--wait", 1200)), arg("--job", None)
    for i in range(retries):
        res = attempt(dry)
        if res != "retry":
            break
        if i < retries - 1:
            log(f"retry {i + 2}/{retries} in {wait}s")
            time.sleep(wait)
    log(f"result: {res}")
    if dry:
        return 0
    if res == "done":
        st = versions().get(VERSION)
        subprocess.run(["python3", os.path.expanduser("~/.claude/scripts/staffq.py"), "done", "839",
                        f"AZET Pass 확장 {VERSION} AMO 제출(상태 {st}, 가입 링크 azet.io), 소스 첨부 — 자동 업로드 잡"])
    # one-shot job: remove it when done or definitely failed; after four rate-limited tries it fires again tomorrow
    if job and res != "retry":
        plist = os.path.expanduser(f"~/Library/LaunchAgents/{job}.plist")
        if os.path.exists(plist):
            os.remove(plist)
        subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{job}"])
    return 0 if res == "done" else 1


if __name__ == "__main__":
    sys.exit(main())
