/*
 * 허브(랜딩) 설치 안내 — 큰 설치 카드 + 브라우저별 안내 시트 + 앱 안 브라우저 경고 + 진단 모드
 *
 * 설치는 브라우저 기능이라 사이트는 "큰 버튼 + 브라우저별 안내"까지만 한다(강제 설치 불가). 서비스워커는 쓰지 않는다.
 *
 * 환경 판별(detectInstallEnv, 이 파일 한 곳에서만. 순서대로 판정하고, 애매하면 일반 안내로 떨어진다)
 *   installed → inapp → ios → samsung → chromium → desktop → other
 *
 * 화면
 *  - 큰 설치 카드: 배너 아래·도구 카드 위. 설치 전(installed 아님, inapp 아님)에는 방문할 때마다 보인다.
 *    "나중에"를 누르면 7일간 숨김(localStorage 'hub_install_later_v1' = 누른 시각). 입장 기억(hub_auth_v1)과 키가 다르다.
 *  - 앱 안 브라우저(inapp)는 설치 카드 대신 화면 위쪽에 경고 줄(닫으면 이번 세션만 숨김).
 *  - 화면 아래 "앱 설치 방법" 링크: 설치 여부와 상관없이 안내 시트를 연다(이미 설치된 앱에서는 숨김).
 *  - 안내 시트: role="dialog" aria-modal, 제목에 포커스, ESC·바깥 누르기로 닫기, 닫으면 포커스 복귀.
 *  - 주소에 ?installdebug=1 : 감지 결과를 화면 아래 작은 상자로 보여 준다(서버로 보내지 않음).
 *  - 아이폰 홈 화면 앱(navigator.standalone)에서만 임장 카드 안에 작은 안내를 붙인다(카드 마크업은 index.html 에서 바꾸지 않음).
 *
 * 사용자 입력·URL 은 innerHTML 로 넣지 않는다(DOM 요소로만 만든다). 외부 요청·외부 글꼴 없음.
 */
(function () {
  'use strict';
  var main = document.getElementById('mainScreen');
  if (!main) return;

  var LATER_KEY = 'hub_install_later_v1', LATER_MS = 7 * 24 * 60 * 60 * 1000;
  var WARN_KEY = 'hub_inapp_warn_closed_v1';          // sessionStorage: 경고 줄을 닫은 세션만 숨김
  // 앱 안 브라우저(웹뷰) 표식. Whale 처럼 독립 브라우저는 넣지 않는다. 여기만 고치면 목록이 바뀐다.
  var INAPP_PATTERNS = [
    /KAKAOTALK/i, /NAVER\(inapp/i, /Instagram/i, /FBAN|FBAV|FB_IAB/, /\bLine\//, /DaumApps/i, /\bBAND\//i,
    /Snapchat/i, /TikTok|musical_ly|BytedanceWebview/i, /Twitter/i
  ];

  var nav = window.navigator, ua = nav.userAgent || '';
  var lsGet = function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  var ssGet = function (k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } };
  var ssSet = function (k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* 무시 */ } };
  var mqStandalone = function () { try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } };

  // ───────── 환경 판별 ─────────
  // o: { standalone, platform, maxTouchPoints, hasPrompt }  →  { env, android, ios, app('kakao' 등) }
  function detectInstallEnv(uaStr, o) {
    uaStr = uaStr || ''; o = o || {};
    var android = /Android/i.test(uaStr);
    var ios = /iPhone|iPad|iPod/i.test(uaStr) || (o.platform === 'MacIntel' && o.maxTouchPoints > 1);
    var r = { env: 'other', android: android, ios: ios, app: '' };
    if (o.standalone) { r.env = 'installed'; return r; }
    for (var i = 0; i < INAPP_PATTERNS.length; i++) {
      if (INAPP_PATTERNS[i].test(uaStr)) { r.env = 'inapp'; r.app = /KAKAOTALK/i.test(uaStr) ? 'kakao' : 'etc'; return r; }
    }
    if ((android && /; wv\)/.test(uaStr)) || (ios && !/Safari\//.test(uaStr))) { r.env = 'inapp'; r.app = 'etc'; return r; }   // 일반 웹뷰 표식
    if (ios) { r.env = 'ios'; return r; }
    if (android && /SamsungBrowser/i.test(uaStr)) { r.env = 'samsung'; return r; }
    if (android && (/Chrome\//.test(uaStr) || o.hasPrompt)) { r.env = 'chromium'; return r; }
    if (!android && !/Mobi/i.test(uaStr)) { r.env = 'desktop'; return r; }
    return r;
  }

  var deferred = null, promptSeen = false;
  function currentInfo() {
    return detectInstallEnv(ua, { standalone: nav.standalone === true || mqStandalone(), platform: nav.platform, maxTouchPoints: nav.maxTouchPoints, hasPrompt: promptSeen });
  }
  var info = currentInfo(), installedNow = false;
  var cleanUrl = function () { return window.location.origin + window.location.pathname; };

  // ───────── DOM 도우미(innerHTML 안 씀) ─────────
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') n.className = attrs[k]; else if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function icon(kind) {                                   // 글자와 함께 그리는 작은 아이콘(⋮ 메뉴, □↑ 공유, ⊕ 설치)
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '22'); s.setAttribute('height', '22'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    var add = function (tag, a) { var p = document.createElementNS(SVGNS, tag); for (var k in a) p.setAttribute(k, a[k]); s.appendChild(p); };
    if (kind === 'menu') { s.setAttribute('stroke-width', '3.2'); add('path', { d: 'M12 5h.01M12 12h.01M12 19h.01' }); }
    else if (kind === 'share') { add('path', { d: 'M12 15V4' }); add('path', { d: 'M8 8l4-4 4 4' }); add('path', { d: 'M6 11H5v9h14v-9h-1' }); }
    else { add('circle', { cx: '12', cy: '12', r: '9' }); add('path', { d: 'M12 8v8M8 12h8' }); }
    var chip = el('span', { class: 'hub-chip', 'aria-hidden': 'true' }); chip.appendChild(s); return chip;
  }

  // ───────── 스타일 ─────────
  var st = document.createElement('style');
  st.textContent =
    '.hub-ic,.hub-warn{--hi-bg:#FFF1CC;--hi-bd:#D99A1E;--hi-ink:#3A2A05;--hi-sub:#5A4510;--hi-btn:#0E5C6B;--hi-btn-ink:#fff;}' +
    '.hub-warn{--hi-bg:#FFE3DF;--hi-bd:#D64545;--hi-ink:#4A0F0F;--hi-sub:#6B1D1D;--hi-btn:#B42318;}' +
    ':root[data-theme="dark"] .hub-ic,:root[data-theme="dark"] .hub-warn{--hi-bg:#3A2E15;--hi-bd:#E3B25A;--hi-ink:#FBEFD2;--hi-sub:#E6D3A6;--hi-btn:#E3B25A;--hi-btn-ink:#1E1605;}' +
    ':root[data-theme="dark"] .hub-warn{--hi-bg:#4A1D1D;--hi-bd:#FF7A7A;--hi-ink:#FFE3E0;--hi-sub:#FFC9C3;--hi-btn:#FF7A7A;--hi-btn-ink:#2A0A0A;}' +
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .hub-ic,:root:not([data-theme="light"]) .hub-warn{--hi-bg:#3A2E15;--hi-bd:#E3B25A;--hi-ink:#FBEFD2;--hi-sub:#E6D3A6;--hi-btn:#E3B25A;--hi-btn-ink:#1E1605;}' +
    ':root:not([data-theme="light"]) .hub-warn{--hi-bg:#4A1D1D;--hi-bd:#FF7A7A;--hi-ink:#FFE3E0;--hi-sub:#FFC9C3;--hi-btn:#FF7A7A;--hi-btn-ink:#2A0A0A;}}' +
    '.hub-ic{margin:0 0 22px;padding:18px 18px 16px;border:2px solid var(--hi-bd);border-radius:14px;background:var(--hi-bg);color:var(--hi-ink);box-shadow:var(--shadow);}' +
    '.hub-ic .hi-title{margin:0;font-family:var(--font-body);font-size:18px;font-weight:700;line-height:1.35;}' +
    '.hub-ic .hi-desc{margin:4px 0 0;font-size:15px;line-height:1.5;color:var(--hi-sub);}' +
    '@media (min-width:601px){.hub-ic .hi-desc{font-size:16px;}.hub-ic .hi-title{font-size:19px;}}' +
    '.hi-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;}' +
    '.hub-btn{min-height:48px;padding:0 20px;border-radius:10px;border:2px solid transparent;font-size:16px;font-weight:700;line-height:1.2;cursor:pointer;font-family:inherit;}' +
    '.hub-btn.pri{background:var(--hi-btn,var(--accent));color:var(--hi-btn-ink,var(--accent-ink));flex:1 1 180px;}' +
    '.hub-btn.sec{background:transparent;color:var(--hi-ink,var(--ink));border-color:currentColor;font-weight:500;}' +
    '.hub-btn:focus-visible,.hub-link:focus-visible{outline:3px solid var(--accent);outline-offset:2px;}' +
    '.hub-warn{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 16px;padding:12px 14px;border:2px solid var(--hi-bd);border-radius:12px;background:var(--hi-bg);color:var(--hi-ink);font-size:15px;line-height:1.5;font-weight:700;}' +
    '.hub-warn .hw-text{flex:1 1 200px;min-width:0;}' +
    '.hub-warn .hub-btn{min-height:44px;padding:0 14px;font-size:15px;}' +
    '.hub-link-wrap{margin-top:18px;text-align:center;}' +
    '.hub-link{background:none;border:0;color:var(--accent);font-size:15px;font-weight:700;min-height:44px;padding:0 14px;text-decoration:underline;cursor:pointer;font-family:inherit;}' +
    '.hub-chip{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin:0 4px;padding:3px;border:1.5px solid currentColor;border-radius:8px;line-height:0;}' +
    '.hub-overlay{position:fixed;inset:0;z-index:1000;background:rgba(10,18,22,.62);display:flex;align-items:flex-end;justify-content:center;padding:0;}' +
    '@media (min-width:601px){.hub-overlay{align-items:center;padding:24px;}}' +
    '.hub-sheet{width:100%;max-width:520px;max-height:92vh;overflow:auto;background:var(--surface);color:var(--ink);border:1px solid var(--border-strong);border-radius:18px 18px 0 0;padding:22px 20px 20px;box-shadow:0 -8px 30px rgba(0,0,0,.35);}' +
    '@media (min-width:601px){.hub-sheet{border-radius:18px;}}' +
    '.hub-sheet h2{margin:0 0 12px;font-size:20px;line-height:1.4;outline:none;}' +
    '.hub-sheet p{margin:0 0 12px;font-size:17px;line-height:1.65;}' +
    '.hub-sheet ol{margin:0 0 14px;padding:0 0 0 24px;font-size:18px;line-height:1.9;}' +
    '.hub-sheet li{padding-left:4px;margin-bottom:4px;}' +
    '.hub-sheet .hs-note{font-size:15px;color:var(--ink-muted);}' +
    '.hub-sheet .hs-status{min-height:24px;font-size:15px;color:var(--ink);font-weight:700;}' +
    '.hub-sheet .hs-addr{display:block;width:100%;margin:0 0 12px;padding:12px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-alt);color:var(--ink);font-size:15px;font-family:var(--font-mono);}' +
    '.hub-sheet .hi-row{margin-top:8px;}' +
    '.hub-sheet .hub-btn.pri{background:var(--accent);color:var(--accent-ink);}' +
    '.hub-sheet .hub-btn.sec{color:var(--ink);border-color:var(--border-strong);}' +
    '.hub-note{clear:both;display:block;margin-top:12px;font-size:14px;line-height:1.5;color:var(--ink-muted);}' +
    '.hub-debug{margin:24px auto 16px;width:calc(100% - 32px);max-width:928px;padding:10px 12px;border:1px dashed var(--border-strong);border-radius:8px;background:var(--surface-alt);color:var(--ink);font:14px/1.6 var(--font-mono);word-break:break-all;}';
  document.head.appendChild(st);

  // ───────── 아이폰 홈 화면 앱: 임장 카드 안내 ─────────
  function addImjangNote() {
    if (nav.standalone !== true) return;
    var card = main.querySelector('a.tool-card[href="imjang/"]');
    if (!card || card.querySelector('.hub-note')) return;
    card.appendChild(el('span', { class: 'hub-note', text: '임장 기록은 이 앱 안에서만 보일 수 있어요. 임장을 따로 홈 화면에 추가했다면 그쪽에서 쓰세요.' }));
  }

  // ───────── 주소 복사 / 크롬으로 열기 ─────────
  function copyAddress(statusEl, addrEl) {
    var url = cleanUrl();
    var showFallback = function () {
      addrEl.value = url; addrEl.hidden = false;
      try { addrEl.focus(); addrEl.select(); addrEl.setSelectionRange(0, url.length); } catch (e) { /* 무시 */ }
      statusEl.textContent = '자동 복사가 안 돼요. 아래 주소를 길게 눌러 복사해 주세요.';
    };
    var done = function () { addrEl.hidden = true; statusEl.textContent = '주소를 복사했어요. 크롬(아이폰은 사파리) 주소창에 붙여 넣어 주세요.'; };
    var legacy = function () {
      try { addrEl.value = url; addrEl.hidden = false; addrEl.focus(); addrEl.select(); addrEl.setSelectionRange(0, url.length); if (document.execCommand && document.execCommand('copy')) { done(); return; } } catch (e) { /* 아래 대체 */ }
      showFallback();
    };
    try {
      if (nav.clipboard && nav.clipboard.writeText) { nav.clipboard.writeText(url).then(done, legacy); return; }
    } catch (e) { /* 아래 */ }
    legacy();
  }
  function openInChrome(isKakao) {                        // 실기기에서 먹는지는 미확인 — 실패해도 [주소 복사]로 해결되게 한다
    var url = cleanUrl(), l = window.location;
    if (isKakao) {
      window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
      if (info.android) setTimeout(function () { if (document.visibilityState === 'visible') window.location.href = 'intent://' + l.host + l.pathname + '#Intent;scheme=https;package=com.android.chrome;end'; }, 900);
      return;
    }
    window.location.href = 'intent://' + l.host + l.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
  }

  // ───────── 안내 시트 ─────────
  var sheet = null, lastFocus = null;
  function closeSheet() {
    if (!sheet) return;
    document.removeEventListener('keydown', onKey, true);
    if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
    sheet = null; document.documentElement.style.overflow = '';
    if (lastFocus && document.body.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* 무시 */ } }
  }
  function onKey(e) {
    if (!sheet) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    var f = sheet.querySelectorAll('button:not([hidden]),input:not([hidden]),[tabindex="-1"]');
    var list = Array.prototype.filter.call(f, function (x) { return x.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement.tagName === 'H2')) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function sheetBody() {                                  // 환경별 { title, kids[], chrome, kakao, copy, prompt }
    var env = info.env, kids = [], title = '홈 화면에 추가하는 방법', o = { chrome: false, kakao: false, copy: false, prompt: false };
    var steps = function () { var ol = el('ol'); for (var i = 0; i < arguments.length; i++) ol.appendChild(el.apply(null, ['li', null].concat(arguments[i]))); return ol; };
    if (env === 'inapp') {
      title = '지금은 앱 안 브라우저라 설치할 수 없어요';
      kids.push(el('p', { text: '크롬(아이폰은 사파리)으로 열어 주세요. 여기서 쓰면 기록이 따로 저장되거나 사라질 수 있어요.' }));
      if (info.ios) kids.push(el('p', { class: 'hs-note', text: '아이폰: 화면 오른쪽 아래 ⋯ 를 누르고 "다른 브라우저로 열기"(또는 "Safari로 열기")를 눌러 주세요. 메뉴 이름은 앱마다 다를 수 있어요.' }));
      else kids.push(el('p', { class: 'hs-note', text: '[크롬으로 열기]가 안 되면 [주소 복사]를 누른 뒤 크롬 주소창에 붙여 넣어 주세요.' }));
      o.chrome = info.android; o.kakao = info.app === 'kakao'; o.copy = true;
    } else if (env === 'ios') {
      kids.push(steps(['사파리 아래의 공유 버튼(', icon('share'), ')을 누르세요.'], ['"홈 화면에 추가"를 누르세요.'], ['오른쪽 위 "추가"를 누르세요.']));
      kids.push(el('p', { class: 'hs-note', text: '크롬·네이버·카카오톡 등에서 열었다면 사파리로 열어 주세요.' }));
      o.copy = true;
    } else if (env === 'samsung') {
      kids.push(el('p', { text: '삼성 인터넷 메뉴에서 "홈 화면에 추가"(또는 주소창 옆 설치 아이콘)를 찾아 주세요. 메뉴 이름은 버전에 따라 다를 수 있어요.' }));
      kids.push(el('p', { class: 'hs-note', text: '잘 안 되면 크롬으로 열어 주세요.' }));
      o.chrome = true; o.copy = true;
    } else if (env === 'chromium') {
      kids.push(steps(['오른쪽 위 ', icon('menu'), ' 메뉴를 누르세요.'], ['"앱 설치" 또는 "홈 화면에 추가"를 누르세요.'], ['"설치" 또는 "추가"를 누르세요.']));
      kids.push(el('p', { class: 'hs-note', text: '메뉴 이름은 버전에 따라 다를 수 있어요.' }));
      o.prompt = !!deferred;
    } else if (env === 'desktop') {
      kids.push(el('p', null, '주소창 오른쪽의 설치 아이콘(', icon('plus'), ')을 눌러 주세요.'));
      kids.push(el('p', { class: 'hs-note', text: '아이콘이 안 보이면 브라우저 메뉴(⋮)에서 "앱 설치" 또는 "저장 및 공유"를 찾아 보세요.' }));
      o.prompt = !!deferred;
    } else {
      kids.push(el('p', { text: '브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 찾아 주세요. 안 보이면 크롬(아이폰은 사파리)으로 열어 주세요.' }));
      o.copy = true;
    }
    return { title: title, kids: kids, o: o };
  }
  function openSheet(opener) {
    if (sheet) return;
    lastFocus = opener || document.activeElement;
    var b = sheetBody(), o = b.o;
    var h2 = el('h2', { id: 'hubSheetTitle', tabindex: '-1', text: b.title });
    var status = el('p', { class: 'hs-status', role: 'status', 'aria-live': 'polite' });
    var addr = el('input', { class: 'hs-addr', type: 'text', readonly: 'readonly', 'aria-label': '이 페이지 주소' }); addr.hidden = true;
    var row = el('div', { class: 'hi-row' });
    var btn = function (label, cls, fn) { var x = el('button', { type: 'button', class: 'hub-btn ' + cls, text: label }); x.addEventListener('click', fn); row.appendChild(x); return x; };
    if (o.prompt) btn('홈 화면에 추가', 'pri', function () { closeSheet(); doPrompt(); });
    if (o.chrome) btn('크롬으로 열기', 'pri', function () { openInChrome(false); });
    if (o.kakao) btn('다른 브라우저로 열기', 'pri', function () { openInChrome(true); });
    if (o.copy) btn('주소 복사', o.chrome || o.kakao ? 'sec' : 'pri', function () { copyAddress(status, addr); });
    btn('닫기', 'sec', closeSheet);
    var panel = el('div', { class: 'hub-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hubSheetTitle' }, h2);
    b.kids.forEach(function (k) { panel.appendChild(k); });
    panel.appendChild(status); panel.appendChild(addr); panel.appendChild(row);
    sheet = el('div', { class: 'hub-overlay' }, panel);
    sheet.addEventListener('mousedown', function (e) { if (e.target === sheet) closeSheet(); });
    sheet.addEventListener('touchstart', function (e) { if (e.target === sheet) closeSheet(); }, { passive: true });
    document.body.appendChild(sheet);
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);
    h2.focus();
  }

  // ───────── 설치 버튼 ─────────
  function doPrompt() {
    var p = deferred; deferred = null; refreshAll();
    try {
      p.prompt();
      Promise.resolve(p.userChoice).then(function (c) { if (c && c.outcome === 'accepted') { installedNow = true; refreshAll(); } });
    } catch (e) { /* 실패하면 다음 눌림에 안내 시트가 열린다 */ }
  }
  function onInstallClick(ev) {
    if (deferred) doPrompt(); else openSheet(ev && ev.currentTarget);
  }

  // ───────── 큰 설치 카드 · 경고 줄 · 하단 링크 ─────────
  var card = null, warn = null, linkWrap = null;
  var laterActive = function () {
    var t = parseInt(lsGet(LATER_KEY), 10), now = Date.now();
    return isFinite(t) && t <= now && now - t < LATER_MS;
  };
  function build() {
    card = el('section', { class: 'hub-ic', 'aria-label': '앱 설치 안내' },
      el('h2', { class: 'hi-title', text: '📲 앱처럼 설치하면 더 편해요' }),
      el('p', { class: 'hi-desc', text: '주소창 없이 바로 열려요.' }));
    var row = el('div', { class: 'hi-row' });
    var add = el('button', { type: 'button', class: 'hub-btn pri', text: '홈 화면에 추가' }); add.addEventListener('click', onInstallClick);
    var later = el('button', { type: 'button', class: 'hub-btn sec', text: '나중에' });
    later.addEventListener('click', function () { lsSet(LATER_KEY, String(Date.now())); render(); });
    row.appendChild(add); row.appendChild(later); card.appendChild(row);
    var anchor = main.querySelector('.sec-title');
    if (anchor) main.insertBefore(card, anchor); else main.insertBefore(card, main.firstChild);

    warn = el('div', { class: 'hub-warn', role: 'alert' });
    warn.appendChild(el('span', { class: 'hw-text', text: info.ios ? '앱 안 브라우저예요. 사파리로 열어 주세요.' : '앱 안 브라우저예요. 크롬으로 열어 주세요.' }));
    var how = el('button', { type: 'button', class: 'hub-btn pri', text: '방법 보기' }); how.addEventListener('click', function (e) { openSheet(e.currentTarget); });
    var close = el('button', { type: 'button', class: 'hub-btn sec', text: '닫기' }); close.addEventListener('click', function () { ssSet(WARN_KEY, '1'); render(); });
    warn.appendChild(how); warn.appendChild(close);
    main.insertBefore(warn, main.firstChild);

    linkWrap = el('div', { class: 'hub-link-wrap' });
    var link = el('button', { type: 'button', class: 'hub-link', text: '앱 설치 방법' }); link.addEventListener('click', function (e) { openSheet(e.currentTarget); });
    linkWrap.appendChild(link);
    var forgetWrap = main.querySelector('.hub-forget-wrap');
    if (forgetWrap) main.insertBefore(linkWrap, forgetWrap); else main.appendChild(linkWrap);
  }
  function render() {
    renderDebug();
    if (!card) return;
    var env = installedNow ? 'installed' : info.env;
    card.hidden = !(env !== 'installed' && env !== 'inapp' && !laterActive());
    warn.hidden = !(env === 'inapp' && !ssGet(WARN_KEY));
    linkWrap.hidden = env === 'installed';
  }
  function refreshAll() { info = installedNow ? info : currentInfo(); render(); }

  // ───────── 진단 모드 ─────────
  var debugBox = null;
  function renderDebug() {
    if (!/[?&]installdebug=1\b/.test(window.location.search)) return;
    if (!debugBox) { debugBox = el('div', { class: 'hub-debug', role: 'status' }); document.body.appendChild(debugBox); }
    var cryptoOk = !!(window.crypto && window.crypto.subtle), lsOk = false;
    try { window.localStorage.setItem('__hub_probe__', '1'); window.localStorage.removeItem('__hub_probe__'); lsOk = true; } catch (e) { /* 불가 */ }
    var lines = [
      '환경: ' + (installedNow ? 'installed' : info.env) + (info.app ? ' (' + info.app + ')' : ''),
      'standalone: ' + (nav.standalone === true || mqStandalone() ? '예' : '아니오'),
      'beforeinstallprompt: ' + (promptSeen ? '발생' : '없음'),
      'crypto.subtle: ' + (cryptoOk ? '사용 가능' : '불가') + ' / localStorage: ' + (lsOk ? '사용 가능' : '불가'),
      'UA: ' + ua.slice(0, 120)
    ];
    debugBox.textContent = '';
    lines.forEach(function (t) { debugBox.appendChild(el('div', { text: t })); });
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; promptSeen = true; refreshAll(); });
  window.addEventListener('appinstalled', function () { installedNow = true; deferred = null; closeSheet(); render(); });
  window.HubInstall = { detectInstallEnv: detectInstallEnv };   // 시험·진단용(읽기 전용 함수)

  function onMainShown() { if (!card) build(); addImjangNote(); render(); }
  renderDebug();
  if (!main.hidden) onMainShown();
  if (window.MutationObserver) {
    new MutationObserver(function () { if (!main.hidden) onMainShown(); }).observe(main, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
