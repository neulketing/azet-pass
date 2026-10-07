// 비공개 백엔드 입구(wrangler main) — 오너 09-22 프런트/백엔드 분리 표준(2026-10-07 레인02). 도메인·workers.dev 없음,
// 공개 프런트 azet-pass-gw(gw/)의 서비스 바인딩으로만 불린다. X-Azet-Internal 이 내부 키(볼트 AZET_PASS_INTERNAL_KEY)와 같을 때만 entry.js 로
import app from "./entry.js";
import { allowed } from "./internal.js";
export { HeavyDo, NotifyDo } from "../build/index.js";

export default {
  fetch(request, env, ctx) {
    if (!allowed(request.headers.get("X-Azet-Internal"), env.INTERNAL_KEY)) return new Response("forbidden", { status: 403 });
    return app.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    return app.scheduled(event, env, ctx);
  },
};
