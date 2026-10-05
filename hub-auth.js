/*
 * 허브(랜딩) 입장 기억 — "이 기기에서 기억하기" / "이 기기에서 잊기"
 *
 * 사이트 공용 게이트(config.js의 SITE_PASSWORD, gate.js의 isSiteAuthed/grantSiteAuth)는 그대로 쓴다.
 * 이 파일은 index.html 본문 스크립트 "뒤에" 불러온다. 기존 입력·검증 코드는 건드리지 않고, 그 위에 기억만 더한다.
 *
 * 기억 방식
 *  - 입장에 성공했을 때 체크박스가 켜져 있으면 localStorage['hub_auth_v1']에 "지문"을 저장한다.
 *    지문 = SHA-256( 'hub|' + 허브 주소(origin + 폴더 경로) + '|' + 현재 SITE_PASSWORD ). 비밀번호 자체는 저장하지 않는다.
 *  - 다음에 열 때 지문을 현재 SITE_PASSWORD로 다시 계산해 같으면 grantSiteAuth()를 부르고 카드를 보여 준다.
 *    비밀번호가 바뀌면 지문이 달라져 기억이 자동으로 무효가 되고, 옛 값은 지운다.
 *  - 도구 페이지에서 인증 없이 들어와 이 화면으로 돌려보내졌을 때도 같은 방식으로 자동 통과한다.
 *  - 체크박스 기본값: 홈 화면 앱(standalone)이면 켜짐, 브라우저면 꺼짐.
 *  - crypto.subtle 이나 localStorage 를 쓸 수 없으면(사생활 모드 등) 기억 기능만 조용히 끄고 예전과 똑같이 동작한다.
 *
 * 한계: 정적 사이트라 진짜 보안이 아니다(기존 게이트와 동일). 이 기억은 "다시 묻지 않기"일 뿐이다.
 */
(function () {
  'use strict';
  var KEY = 'hub_auth_v1';
  var $ = function (id) { return document.getElementById(id); };
  var gate = $('gateScreen'), main = $('mainScreen'), form = $('gateForm'), pw = $('gatePassword'), submitBtn = $('gateSubmit');
  // config.js·gate.js 가 없거나 화면 구성이 다르면 아무것도 하지 않는다(기존 동작 그대로)
  if (!gate || !main || !form || !pw || !submitBtn) return;
  if (typeof SITE_PASSWORD !== 'string' || typeof isSiteAuthed !== 'function' || typeof grantSiteAuth !== 'function') return;

  var lsGet = function () { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } };
  var lsSet = function (v) { try { window.localStorage.setItem(KEY, v); } catch (e) { /* 저장 불가면 기억만 못 함 */ } };
  var lsDel = function () { try { window.localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } };
  var storageOk = function () {
    try { var k = '__hub_probe__'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return true; } catch (e) { return false; }
  };
  var cryptoOk = function () { return !!(window.crypto && window.crypto.subtle && window.TextEncoder); };
  var enabled = storageOk() && cryptoOk();
  var isStandalone = function () {
    try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; } catch (e) { return false; }
  };

  // 지문: 허브 주소는 origin + 폴더 경로(index.html 같은 파일명은 뺀다)
  function fingerprint() {
    var base = window.location.origin + window.location.pathname.replace(/[^\/]*$/, '');
    var s = 'hub|' + base + '|' + SITE_PASSWORD;
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
      return 's256:' + Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  // ───────── 스타일(이 파일이 만든 요소 전용) ─────────
  var st = document.createElement('style');
  st.textContent =
    '.hub-remember{display:flex;align-items:center;justify-content:center;gap:10px;min-height:44px;font-size:14px;line-height:1.3;color:var(--ink);cursor:pointer;user-select:none;}' +
    '.hub-remember input{width:22px;height:22px;margin:0;flex:none;accent-color:var(--accent);cursor:pointer;}' +
    '.hub-forget-wrap{margin-top:14px;text-align:center;}' +
    '.hub-forget{background:none;border:0;color:var(--ink-muted);font-size:14px;min-height:44px;padding:0 14px;text-decoration:underline;cursor:pointer;}' +
    '.hub-forget:hover{color:var(--accent);}';
  document.head.appendChild(st);

  // ───────── 체크박스 ─────────
  var cb = null;
  if (enabled) {
    var label = document.createElement('label');
    label.className = 'hub-remember';
    cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'hubRemember';
    cb.checked = isStandalone();
    var txt = document.createElement('span');
    txt.textContent = '이 기기에서 기억하기';
    label.appendChild(cb);
    label.appendChild(txt);
    form.insertBefore(label, submitBtn);
  }

  // ───────── 입장 성공 시 저장 ─────────
  // 기존 submit 처리(index.html)가 먼저 실행되어 맞는 비밀번호면 grantSiteAuth() 까지 끝난 뒤에 이 리스너가 돈다.
  // 틀린 비밀번호면 isSiteAuthed()가 거짓이므로 아무것도 하지 않는다 → 틀린 비밀번호 처리는 이전과 같다.
  form.addEventListener('submit', function () {
    if (!enabled || !cb || !isSiteAuthed()) return;
    if (cb.checked) { fingerprint().then(lsSet).catch(function () {}); } else { lsDel(); }
  });

  // ───────── 저장된 기억으로 자동 입장 ─────────
  if (enabled && !isSiteAuthed()) {
    var saved = lsGet();
    if (saved) {
      gate.hidden = true;                      // 확인하는 동안 입력 화면이 잠깐 번쩍이지 않게
      fingerprint().then(function (fp) {
        if (fp === saved) { grantSiteAuth(); main.hidden = false; }
        else { lsDel(); gate.hidden = false; } // 비밀번호가 바뀐 뒤의 옛 기억
      }).catch(function () { gate.hidden = false; });
    }
  }

  // ───────── 이 기기에서 잊기 ─────────
  var wrap = document.createElement('div');
  wrap.className = 'hub-forget-wrap';
  var forget = document.createElement('button');
  forget.type = 'button';
  forget.className = 'hub-forget';
  forget.textContent = '이 기기에서 잊기';
  forget.addEventListener('click', function () {
    lsDel();
    try { window.sessionStorage.removeItem(typeof SITE_AUTH_KEY === 'string' ? SITE_AUTH_KEY : 'siteAuthed'); } catch (e) { /* 무시 */ }
    main.hidden = true;
    gate.hidden = false;
    pw.value = '';
    var err = $('gateError'); if (err) err.textContent = '';
    if (cb) cb.checked = isStandalone();
    pw.focus();
  });
  wrap.appendChild(forget);
  main.appendChild(wrap);
})();
