// 비공개 백엔드 문지기: 프런트(gw)가 붙인 X-Azet-Internal 이 내부 키(32자 이상)와 같을 때만 통과. 상수시간 비교, 키 없으면 닫힘
export function allowed(got, key) {
  if (!key || key.length < 32 || !got || got.length !== key.length) return false;
  let d = 0;
  for (let i = 0; i < key.length; i++) d |= got.charCodeAt(i) ^ key.charCodeAt(i);
  return d === 0;
}
