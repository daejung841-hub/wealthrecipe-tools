/*
 * 임장 체크리스트 서비스워커 (scope: 이 폴더 ./ 만)
 *
 * 캐시 전략
 *  - 앱 셸(html·js·css·data json·icons·manifest): 설치할 때 한꺼번에 저장(precache)하고, 이후에는 저장본을 먼저 쓴다(cache-first).
 *    내용을 고쳐 배포할 때는 아래 CACHE_VERSION 숫자를 올린다 → 새 서비스워커가 설치되고, 앱이 "새 버전이 있어요" 배너를 띄운다.
 *  - ../config.js, ../gate.js (입장 비밀번호): 항상 네트워크를 먼저 시도(network-first, 캐시 무시하고 서버에 확인)하고 성공하면 캐시를 갱신한다.
 *    인터넷이 안 될 때만 저장본을 쓴다 → 비밀번호를 바꾼 뒤 온라인으로 열면 옛 비밀번호가 통과되지 않는다.
 *  - 그 밖의 요청(다른 도구, 계산기, 외부 주소)은 가로채지 않는다(캐시 안 함).
 *  - 주소 끝에 ?resetsw=1 을 붙여 열면 이 서비스워커를 해제하고 imjang 캐시를 모두 지운 뒤 새로 불러온다(사용자 기록은 건드리지 않음).
 */
const CACHE_VERSION = 'imjang-v1';                 // ← 배포할 때마다 올리는 곳(이 한 곳)
const CACHE_PREFIX = 'imjang-';
const GATE_CACHE = CACHE_PREFIX + 'gate';          // 버전과 무관하게 유지(오프라인 입장용 config.js·gate.js 저장본)
const GATE_FILES = ['../config.js', '../gate.js'];
const PRECACHE = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'auth.js', 'backup.js', 'photo.js', 'pwa.js', 'rules.js', 'send.js', 'share.js', 'store.js',
  'data/config.json', 'data/items.json', 'data/redev.json', 'data/sites.json', 'data/stages.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];
const abs = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // HTTP 캐시를 거치지 않고 서버의 최신 파일을 받는다
    await cache.addAll(PRECACHE.map((p) => new Request(abs(p), { cache: 'reload' })));
    // 오프라인 입장용 비밀번호 파일: 실패해도 설치는 계속(온라인에서 열 때마다 갱신된다)
    await Promise.all(GATE_FILES.map(async (p) => { try { const r = await fetch(new Request(abs(p), { cache: 'reload' })); if (r.ok) await (await caches.open(GATE_CACHE)).put(abs(p), r); } catch (x) { /* 나중에 */ } }));
    // 자동으로 바로 교체하지 않는다: 앱이 배너로 알리고, 사용자가 누르면 SKIP_WAITING 메시지로 교체
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE_VERSION, GATE_CACHE]);
    await Promise.all((await caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX) && !keep.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
});

// 비상 해제 화면: 서비스워커가 직접 응답해서, 저장된 앱 파일이 오래됐거나 깨져 있어도 동작한다
function resetPage(target) {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>초기화 중</title>'
    + '<body style="font-family:sans-serif;padding:24px;line-height:1.6">앱 저장본을 정리했어요. 잠시 후 다시 열려요…'
    + '<script>setTimeout(function(){location.replace(' + JSON.stringify(target) + ')},400)</script></body>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                                   // 외부 요청은 가로채지 않음

  // 비상 해제
  if (req.mode === 'navigate' && url.searchParams.get('resetsw') === '1') {
    const clean = new URL(url); clean.searchParams.delete('resetsw');
    e.respondWith((async () => {
      await Promise.all((await caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));   // imjang 캐시만 (다른 도구 캐시는 건드리지 않음)
      await self.registration.unregister();
      return resetPage(clean.pathname + clean.search + clean.hash);
    })());
    return;
  }

  const scope = new URL(self.registration.scope);
  const inScope = url.pathname.startsWith(scope.pathname);

  // 입장 비밀번호 파일: 네트워크 우선, 오프라인일 때만 저장본
  if (GATE_FILES.some((p) => abs(p) === url.origin + url.pathname)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(new Request(req.url, { cache: 'no-cache' }));   // 서버에 확인(오래된 HTTP 캐시 무시)
        if (res.ok) { (await caches.open(GATE_CACHE)).put(req.url.split('?')[0], res.clone()); return res; }
        return res;                                                              // 서버가 응답했으면(404 등) 그대로 — 저장본으로 덮지 않는다
      } catch (err) {
        const hit = await (await caches.open(GATE_CACHE)).match(req.url.split('?')[0]);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (!inScope) return;                                                              // 다른 도구·계산기: 가로채지 않음

  // 앱 셸: 저장본 우선. 주소의 ?gate=on 같은 인자는 무시하고 찾는다. 없으면 네트워크.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch (err) { if (req.mode === 'navigate') { const idx = await cache.match(abs('index.html')); if (idx) return idx; } throw err; }
  })());
});
