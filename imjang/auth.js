/*
 * 임장 앱 입장 — 사이트 공용 게이트(config.js의 SITE_PASSWORD, gate.js의 isSiteAuthed/grantSiteAuth)를
 * 그대로 쓰되, 홈 화면 앱에서 매번 묻지 않도록 "이 기기에서 기억하기"만 더한다. config.js·gate.js는 수정하지 않는다.
 *
 * 기억 방식
 *  - 입장에 성공하면 localStorage['imjang_auth_v1']에 "지문"을 저장한다.
 *    지문 = SHA-256( 'imjang|' + 사이트 주소(origin) + '|' + 현재 SITE_PASSWORD ).  (비밀번호 자체는 저장하지 않는다)
 *  - 다음 방문 때 지문을 현재 SITE_PASSWORD로 다시 계산해 같으면 입장시키고 gate.js의 grantSiteAuth()를 불러
 *    sessionStorage['siteAuthed']도 세팅한다(→ 계산기 등 다른 도구로 가도 다시 묻지 않음).
 *  - 사이트 비밀번호가 바뀌면 지문이 달라져 기억이 자동으로 무효가 되고(저장값도 지움) 입력 화면이 뜬다.
 *    별도의 버전 값·새 비밀번호·해시 파일은 없다. 지문은 이 기기 브라우저에만 있다.
 *  - 로컬 개발 주소(localhost·127.0.0.1·[::1]·file:)에서는 게이트 없이 열린다. 게이트를 확인하려면 주소 끝에 ?gate=on
 *
 * 한계: 정적 사이트라 진짜 보안이 아니다(기존 게이트와 동일). 이 기억은 "다시 묻지 않기"일 뿐이다.
 */
(function (root) {
  'use strict';
  const KEY = 'imjang_auth_v1';

  const isLocalDev = () => {
    const l = root.location;
    if (!l) return false;
    if (/[?&]gate=on\b/.test(l.search)) return false;
    return l.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]', '::1'].includes(l.hostname);
  };
  // config.js의 'const SITE_PASSWORD'는 window 속성이 아니라 전역 렉시컬 변수라서 식별자로 직접 읽는다.
  const sitePassword = () => (typeof SITE_PASSWORD === 'string' ? SITE_PASSWORD : null);
  const gateReady = () => sitePassword() !== null && typeof root.isSiteAuthed === 'function' && typeof root.grantSiteAuth === 'function';

  // 지문. crypto.subtle이 없는 환경(http 일부)에서는 가벼운 해시로 대체한다 — 어차피 보안 용도가 아니다.
  async function fingerprint() {
    const s = 'imjang|' + root.location.origin + '|' + sitePassword();
    try {
      if (root.crypto && root.crypto.subtle) {
        const buf = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return 's256:' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 아래 대체 */ }
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'fnv:' + h.toString(16);
  }
  const read = () => { try { return root.localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = (v) => { try { v == null ? root.localStorage.removeItem(KEY) : root.localStorage.setItem(KEY, v); } catch (e) { /* 저장 불가면 기억만 못 함 */ } };

  // 앱을 열 때 한 번: 'ok'(입장) | 'locked'(비밀번호 입력 필요) | 'broken'(config.js/gate.js 로딩 실패)
  async function check() {
    if (isLocalDev()) return 'ok';
    if (!gateReady()) return 'broken';
    if (root.isSiteAuthed()) { write(await fingerprint()); return 'ok'; } // 사이트 입구에서 이미 통과한 경우도 기억해 둔다
    const saved = read();
    if (saved) {
      if (saved === (await fingerprint())) { root.grantSiteAuth(); return 'ok'; }
      write(null); // 비밀번호가 바뀐 뒤의 옛 기억
    }
    return 'locked';
  }
  async function submit(pw) {
    if (!gateReady()) return false;
    if (pw !== sitePassword()) return false;
    root.grantSiteAuth(); write(await fingerprint()); return true;
  }
  const forget = () => write(null);

  root.ImjangAuth = { check, submit, forget, isLocalDev, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
