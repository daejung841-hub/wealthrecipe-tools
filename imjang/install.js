/*
 * 앱 설치 안내 — 환경 판별 · "나중에" 규칙 · 주소 만들기 (화면과 무관한 순수 함수, node 에서 테스트)
 *
 * 설치는 브라우저 기능이라 사이트는 "큰 버튼 + 브라우저별 안내"까지만 한다(강제 설치 불가). 화면 그리기는 app.js(DOM 요소로만 만든다).
 * 허브(루트 랜딩)와 같은 판별 규칙을 이 폴더 안에서 따로 구현했다(루트 파일에 의존하지 않는다).
 *
 * detectInstallEnv(ua, o)   o = { standalone, platform, maxTouchPoints, hasPrompt }  →  { env, android, ios, app }
 *   env 판정 순서: installed → inapp → ios → samsung → chromium → desktop → other  (애매하면 other: 일반 안내로 떨어진다)
 *     installed  standalone(홈 화면 앱) — 안내를 모두 숨긴다
 *     inapp      카카오톡·네이버앱·인스타그램·페이스북·라인·다음앱 등 앱 안 브라우저(웹뷰) — 설치가 안 되고 기록이 따로 저장되거나 사라질 수 있다
 *     ios        아이폰·아이패드(사파리 등)   samsung 삼성 인터넷   chromium 안드로이드 크롬 계열(이벤트가 오면 prompt 가능)
 *     desktop    PC 브라우저   other  그 밖(일반 안내)
 *   app: 'kakao' | 'etc' | ''  (inapp 일 때 어느 앱인지)
 * INAPP_PATTERNS            앱 안 브라우저 표식 목록 — 여기만 고치면 목록이 바뀐다
 * laterActive(raw, now)     "나중에"(localStorage imjang_install_later_v1 = 누른 시각 ms)가 7일 안인가. 시각이 미래(시계가 되돌려짐)거나 이상한 값이면 false(다시 보여 준다)
 * samsungVersion(ua)      UA 의 SamsungBrowser/버전 토큰(없으면 ''). 진단 상자에만 쓴다 — Android 버전 숫자는 어떤 판단에도 쓰지 않는다
 * cleanUrl(loc)             복사·열기에 쓰는 주소(주소 끝의 ?인자·#는 뺀다)
 * chromeIntent(loc)         안드로이드 크롬으로 열기용 intent 주소   kakaoExternal(url)  카카오톡 "다른 브라우저로 열기" 주소
 *
 * 저장 키(모두 imjang_ 로 시작, 기록·백업과 무관): localStorage imjang_install_later_v1 / sessionStorage imjang_inapp_warn_closed_v1
 */
(function (root) {
  'use strict';
  const LATER_KEY = 'imjang_install_later_v1', LATER_MS = 7 * 24 * 60 * 60 * 1000, WARN_KEY = 'imjang_inapp_warn_closed_v1';
  const INAPP_PATTERNS = [
    /KAKAOTALK/i, /NAVER\(inapp/i, /Instagram/i, /FBAN|FBAV|FB_IAB/, /\bLine\//, /DaumApps/i, /\bBAND\//i,
    /Snapchat/i, /TikTok|musical_ly|BytedanceWebview/i, /Twitter/i,
  ];

  function detectInstallEnv(ua, o) {
    ua = String(ua || ''); o = o || {};
    const android = /Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua) || (o.platform === 'MacIntel' && o.maxTouchPoints > 1);
    const r = { env: 'other', android, ios, app: '' };
    if (o.standalone) { r.env = 'installed'; return r; }
    for (const p of INAPP_PATTERNS) if (p.test(ua)) { r.env = 'inapp'; r.app = /KAKAOTALK/i.test(ua) ? 'kakao' : 'etc'; return r; }
    if ((android && /; wv\)/.test(ua)) || (ios && !/Safari\//.test(ua))) { r.env = 'inapp'; r.app = 'etc'; return r; }   // 일반 웹뷰 표식
    if (ios) { r.env = 'ios'; return r; }
    if (android && /SamsungBrowser/i.test(ua)) { r.env = 'samsung'; return r; }
    if (android && (/Chrome\//.test(ua) || o.hasPrompt)) { r.env = 'chromium'; return r; }
    if (!android && !/Mobi/i.test(ua)) { r.env = 'desktop'; return r; }
    return r;
  }

  function laterActive(raw, now) {
    const t = parseInt(raw, 10);
    return Number.isFinite(t) && String(t) === String(raw).trim() && t <= now && now - t < LATER_MS;
  }
  const PLAY_CHROME_URL = 'https://play.google.com/store/apps/details?id=com.android.chrome';
  const samsungVersion = (ua) => { const m = /SamsungBrowser\/([0-9][0-9.]*)/.exec(String(ua || '')); return m ? m[1] : ''; };
  const cleanUrl = (loc) => loc.origin + loc.pathname;
  const chromeIntent = (loc) => 'intent://' + loc.host + loc.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
  const kakaoExternal = (url) => 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);

  const api = { LATER_KEY, LATER_MS, WARN_KEY, INAPP_PATTERNS, PLAY_CHROME_URL, detectInstallEnv, laterActive, samsungVersion, cleanUrl, chromeIntent, kakaoExternal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangInstall = api;
})(typeof window !== 'undefined' ? window : globalThis);
