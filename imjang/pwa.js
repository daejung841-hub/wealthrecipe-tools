/*
 * 앱 설치·오프라인·업데이트 도우미 (서비스워커 등록, "새 버전" 알림, 홈 화면 추가 안내, 비상 해제)
 *
 * - 서비스워커는 HTTPS 또는 localhost 에서만 등록한다. 등록에 실패해도 앱은 평소처럼 동작한다.
 * - 새 버전이 감지돼도 자동으로 새로고침하지 않는다(입력 중인 글 보호). 사용자가 누르면 저장을 마친 뒤 교체한다.
 * - 주소 끝에 ?resetsw=1 : 서비스워커 해제 + imjang 캐시 삭제 + 새로 불러오기. localStorage·IndexedDB(사용자 기록, 입장 기억)는 건드리지 않는다.
 */
(function (root) {
  'use strict';
  const nav = root.navigator, loc = root.location;
  const CACHE_PREFIX = 'imjang-';
  const isSecure = () => root.isSecureContext === true || ['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname);
  const supportsSW = () => !!nav && 'serviceWorker' in nav;

  // ───────── 비상 해제 ─────────
  const wantsReset = () => /[?&]resetsw=1\b/.test(loc.search);
  const cleanUrl = () => { const u = new URL(loc.href); u.searchParams.delete('resetsw'); return u.pathname + u.search + u.hash; };
  async function resetEverythingButUserData() {
    // 이 폴더(scope)의 서비스워커만 해제하고, 이름이 imjang- 로 시작하는 캐시만 지운다. 저장소(IndexedDB/localStorage)는 건드리지 않는다.
    try {
      if (supportsSW()) {
        const base = new URL('./', loc.href).href;
        for (const r of await nav.serviceWorker.getRegistrations()) if (r.scope === base) await r.unregister();
      }
    } catch (e) { /* 계속 */ }
    try { if (root.caches) for (const k of await root.caches.keys()) if (k.startsWith(CACHE_PREFIX)) await root.caches.delete(k); } catch (e) { /* 계속 */ }
  }
  // 앱이 시작을 멈추도록 알리고(app.js 가 확인), 정리한 뒤 인자 없는 주소로 다시 연다
  root.__imjangResetting = wantsReset();
  if (root.__imjangResetting) resetEverythingButUserData().then(() => loc.replace(cleanUrl()));

  // ───────── 설치(홈 화면에 추가) ─────────
  const isStandalone = () => (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || (nav && nav.standalone === true);
  const isIOS = () => /iphone|ipad|ipod/i.test((nav && nav.userAgent) || '') || ((nav && nav.platform) === 'MacIntel' && (nav && nav.maxTouchPoints) > 1);
  const isAndroid = () => /android/i.test((nav && nav.userAgent) || '');
  let deferredPrompt = null; const installListeners = [];
  const notifyInstall = () => installListeners.forEach((f) => { try { f(); } catch (e) { /* 무시 */ } });
  root.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; notifyInstall(); });
  root.addEventListener('appinstalled', () => { deferredPrompt = null; notifyInstall(); });
  async function promptInstall() {
    if (!deferredPrompt) return 'unavailable';
    const p = deferredPrompt; deferredPrompt = null;
    try { await p.prompt(); const c = await p.userChoice; notifyInstall(); return c && c.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch (e) { notifyInstall(); return 'dismissed'; }
  }

  // ───────── 서비스워커 등록 · 업데이트 ─────────
  let reg = null, applying = false; const updateListeners = [];
  const notifyUpdate = () => updateListeners.forEach((f) => { try { f(); } catch (e) { /* 무시 */ } });
  function watch(r) {
    if (r.waiting && nav.serviceWorker.controller) notifyUpdate();
    r.addEventListener('updatefound', () => {
      const w = r.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && nav.serviceWorker.controller) notifyUpdate(); });
    });
  }
  async function register() {
    if (root.__imjangResetting || !supportsSW() || !isSecure()) return null;
    try {
      reg = await nav.serviceWorker.register('sw.js', { scope: './' });
      watch(reg);
      // 앱을 다시 볼 때마다 새 버전이 있는지 확인(가볍게)
      root.document.addEventListener('visibilitychange', () => { if (root.document.visibilityState === 'visible') reg.update().catch(() => {}); });
      return reg;
    } catch (e) { console.warn('서비스워커 등록 실패(앱은 정상 동작)', e); return null; }
  }
  // beforeApply: 교체 전에 해야 할 일(저장 마무리). 끝나면 새 서비스워커로 교체하고 한 번만 새로고침한다.
  async function applyUpdate(beforeApply) {
    if (applying || !reg || !reg.waiting) return false;
    applying = true;
    try { if (beforeApply) await beforeApply(); } catch (e) { /* 저장 실패해도 입력은 임시 사본에 남아 있다 */ }
    nav.serviceWorker.addEventListener('controllerchange', () => loc.reload(), { once: true });
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  const api = {
    register, applyUpdate, promptInstall, isStandalone, isIOS, isAndroid, supportsSW, isSecure, wantsReset,
    canPrompt: () => !!deferredPrompt,
    onUpdate: (f) => updateListeners.push(f), onInstallChange: (f) => installListeners.push(f),
    online: () => !nav || nav.onLine !== false,
    resetEverythingButUserData,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangPWA = api;
})(typeof window !== 'undefined' ? window : globalThis);
