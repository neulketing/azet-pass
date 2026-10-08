// 공개 프런트(게이트웨이) — 오너 09-22 프런트/백엔드 분리 표준(~/.claude/rules/cloudflare-front-back-split.md).
// 데이터 바인딩·외부 키 없음. 웹 금고(../public/web-vault)는 Worker 를 거치지 않고 나가고, /api·/identity·/notifications·/icons 만 쿠키를 지우고(서버는 쿠키를 쓰지 않는다 — 토큰은 Authorization)
// 내부 키 헤더를 붙여 서비스 바인딩(BACKEND = 비공개 azet-pass)으로 그대로 넘긴다. 백엔드가 정한 헤더는 덮지 않고 HSTS·nosniff 만 채운다. 알림 웹소켓(101)은 그대로 돌려준다.
interface Env {
  BACKEND: Fetcher;
  INTERNAL_KEY: string; // 백엔드와 같은 값 — wrangler secret (볼트 AZET_PASS_INTERNAL_KEY)
}

// io.azet.pass signing certificate (vault AZET_PASS_ANDROID_KEYSTORE_B64, alias azet-pass)
const ASSET_LINKS = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "io.azet.pass",
  sha256_cert_fingerprints: ["7C:14:57:6D:08:E3:C3:5B:D3:96:94:1E:50:51:24:E5:C1:4B:78:93:DF:1C:8F:D1:E6:DF:9D:9D:F2:8E:9F:2B"] } }];

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Android App Links: lets AZET Pass for Android open the sign-up mail link (/redirect-connector.html#finish-signup…)
    if (new URL(req.url).pathname === "/.well-known/assetlinks.json") return Response.json(ASSET_LINKS);
    if (!env.INTERNAL_KEY) return new Response("unavailable", { status: 503 });
    const h = new Headers(req.headers);
    h.delete("Cookie");
    h.set("X-Azet-Internal", env.INTERNAL_KEY);
    const res = await env.BACKEND.fetch(new Request(req, { headers: h }));
    if (res.status === 101 || res.webSocket) return res;
    const out = new Response(res.body, res);
    const set = (k: string, v: string) => out.headers.has(k) || out.headers.set(k, v);
    set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    set("X-Content-Type-Options", "nosniff");
    return out;
  },
} satisfies ExportedHandler<Env>;
