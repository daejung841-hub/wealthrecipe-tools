/*
 * 허브(랜딩) 설치 안내 — 얇은 안내 줄 1개(첫 방문 때 한 번만) + 아이폰 홈 화면 앱 전용 안내 한 줄
 *
 * - Android·PC Chrome: beforeinstallprompt 를 받으면 "홈 화면에 추가" 버튼, 못 받으면 메뉴 사용 문구.
 * - iOS(Safari): "공유 버튼 → 홈 화면에 추가" 문구.
 * - 이미 설치된 상태(standalone)에서는 안내 줄을 만들지 않는다.
 * - 안내 줄은 카드를 가리지 않도록 화면 맨 위(배너 위)에 한 줄로 끼워 넣고, 닫으면 다시 나오지 않는다(localStorage 'hub_install_seen_v1').
 * - 아이폰 홈 화면 앱(navigator.standalone)에서만 임장 카드 안에 작은 안내를 붙인다(카드 마크업은 index.html 에서 바꾸지 않는다).
 * - 서비스워커는 쓰지 않는다.
 */
(function () {
  'use strict';
  var SEEN = 'hub_install_seen_v1';
  var main = document.getElementById('mainScreen');
  if (!main) return;

  var nav = window.navigator, ua = nav.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var iosStandalone = nav.standalone === true;
  var standalone = iosStandalone || (function () { try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } })();
  var lsGet = function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };

  var st = document.createElement('style');
  st.textContent =
    '.hub-install{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 12px;padding:4px 6px 4px 14px;border:1px solid var(--border);border-radius:10px;background:var(--accent-soft);color:var(--ink);font-size:14px;line-height:1.45;}' +
    '.hub-install .hi-text{flex:1 1 140px;min-width:0;padding:6px 0;}' +
    '.hub-install .hi-btn{min-height:44px;padding:0 16px;border:0;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;}' +
    '.hub-install .hi-add{background:var(--accent);color:var(--accent-ink);}' +
    '.hub-install .hi-close{background:transparent;color:var(--ink);font-weight:500;text-decoration:underline;}' +
    '.hub-note{clear:both;display:block;margin-top:12px;font-size:14px;line-height:1.5;color:var(--ink-muted);}';
  document.head.appendChild(st);

  // ───────── 아이폰 홈 화면 앱: 임장 카드 안내 ─────────
  function addImjangNote() {
    if (!iosStandalone) return;
    var card = main.querySelector('a.tool-card[href="imjang/"]');
    if (!card || card.querySelector('.hub-note')) return;
    var note = document.createElement('span');
    note.className = 'hub-note';
    note.textContent = '임장 기록은 이 앱 안에서만 보일 수 있어요. 임장을 따로 홈 화면에 추가했다면 그쪽에서 쓰세요.';
    card.appendChild(note);
  }

  // ───────── 설치 안내 줄 ─────────
  var deferred = null, bar = null, textEl = null, addBtn = null;
  function guideText() {
    if (deferred) return '홈 화면에 추가하면 앱처럼 바로 열려요.';
    if (isIOS) return '아이폰: 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 바로 열려요.';
    if (isAndroid) return '홈 화면에 추가하면 앱처럼 열려요. Chrome 메뉴(⋮) → "홈 화면에 추가"를 눌러 주세요.';
    return '앱처럼 쓰려면 주소창 오른쪽의 설치 아이콘이나 브라우저 메뉴(⋮)의 "앱 설치"를 눌러 주세요.';
  }
  function refresh() {
    if (!bar) return;
    textEl.textContent = guideText();
    addBtn.hidden = !deferred;
  }
  function hideBar() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; }
  function showBar() {
    if (standalone || bar || lsGet(SEEN)) return;
    if (!lsSet(SEEN, '1')) return;                        // 저장이 안 되는 환경이면 매번 뜨지 않도록 아예 보이지 않는다
    bar = document.createElement('div');
    bar.className = 'hub-install';
    bar.setAttribute('role', 'note');
    textEl = document.createElement('span'); textEl.className = 'hi-text';
    addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'hi-btn hi-add'; addBtn.textContent = '홈 화면에 추가';
    var close = document.createElement('button'); close.type = 'button'; close.className = 'hi-btn hi-close'; close.textContent = '닫기';
    addBtn.addEventListener('click', function () {
      if (!deferred) return;
      var p = deferred; deferred = null;
      try { p.prompt(); Promise.resolve(p.userChoice).then(hideBar, hideBar); } catch (e) { hideBar(); }
    });
    close.addEventListener('click', hideBar);
    bar.appendChild(textEl); bar.appendChild(addBtn); bar.appendChild(close);
    main.insertBefore(bar, main.firstChild);
    refresh();
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener('appinstalled', function () { deferred = null; hideBar(); });

  function onMainShown() { addImjangNote(); showBar(); }
  if (!main.hidden) onMainShown();
  if (window.MutationObserver) {
    new MutationObserver(function () { if (!main.hidden) onMainShown(); }).observe(main, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
