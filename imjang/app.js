/*
 * 임장 체크리스트 — 화면. 항목·문구·판정은 data/*.json + rules.js가 정하고, 여기서는 그리기와 입력 처리만 한다.
 * 안전 규칙: 화면에 글을 넣을 때는 h()로 만든 노드(textContent)만 쓴다. innerHTML은 쓰지 않는다.
 *
 * 주소 끝에 붙이는 인자(?a=1&b=1):
 *   ?gate=on      [로컬 전용] 로컬 주소에서도 비밀번호 입장 화면을 보여 준다 (auth.js). 운영 주소는 늘 입장 화면이라 의미 없음
 *   ?noshare=1    [로컬 전용] 공유·복사가 전혀 안 되는 환경을 흉내 낸다 — isLocalDev() 일 때만 읽는다
 *   ?nostorage=1  [로컬 전용] IndexedDB 를 못 쓰는 환경을 흉내 낸다 — isLocalDev() 일 때만 읽는다
 *   ?sharetest=1  [어디서나] 설정 화면에 "공유 글자 수 테스트" 카드를 보인다(더미 글을 공유창으로 보낼 뿐, 기록·서버와 무관)
 *   ?resetsw=1    [어디서나, 비상용] 서비스워커 해제 + imjang- 캐시 삭제 후 인자 없는 주소로 다시 열기. 사용자 기록·입장 기억은 지우지 않는다 (sw.js, pwa.js)
 */
(function () {
  'use strict';
  const R = window.ImjangRules;
  const $ = (id) => document.getElementById(id);

  // ───────── DOM 도우미 (모든 글은 텍스트 노드로 들어간다) ─────────
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach((c) => { if (c !== undefined && c !== null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const mount = (el, ...kids) => { el.replaceChildren(); kids.flat(Infinity).forEach((c) => c && el.append(c)); };
  const svg = (tag, attrs, ...kids) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); kids.forEach((c) => e.append(c)); return e; };

  // ───────── 상태 ─────────
  const D = {};                        // 불러온 데이터: items, config, stages, sites, zonesSample
  const S = { zones: [], cur: null, step: 'info', idx: 0, mode: 'hand' };
  let store, tokens;
  const zone = () => S.zones.find((z) => z.id === S.cur);
  const T = (s) => R.interp(s, tokens);                    // {토큰} → config 값
  const shortName = (n) => String(n).replace(/ \([^)]*\)/, '');   // 첫 괄호("(구 동)")만 뗀다 — 뒤의 "(복원)"은 남긴다
  const NONE = '정보 없음';
  // 넓은 화면(PC): 1024px 이상. 배치는 CSS 가 정하고, 여기서는 화면에 따라 달라지는 동작(요약 패널 갱신·키보드·사진 버튼 이름)만 구분한다.
  const DESK = '(min-width:1024px)';
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false });
  const isDesk = () => mq(DESK).matches;
  const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const qText = (it) => T(it.q).replace(/\?$/, '');         // 질문 끝의 물음표를 뗀 짧은 이름(요약·정리 목록용)

  const visible = (it, z) => R.isVisible(it, z.ans, D.config);
  const stepItems = () => R.visibleInStep(D.items, S.step, zone().ans, D.config);
  const countable = (it) => it.type !== 'tip';

  // ───────── 저장 (자동 저장: 입력 후 짧은 지연 → 저장 어댑터) ─────────
  // 화면 위의 구역 객체(S.zones)가 항상 최신 글을 갖고 있으므로, 저장이 실패해도 입력한 글은 사라지지 않는다.
  const timers = new Map();
  const bannerState = { degraded: false, saveError: null, photoQuota: false };
  // 임시 사본(저널): IndexedDB 저장은 비동기라 앱이 닫히는 순간에 끝나지 못할 수 있다.
  // 그래서 입력할 때마다 localStorage(동기)에 구역 기록을 임시로 한 부 남기고, 저장이 성공하면 지운다.
  // 다음에 앱을 열 때 저장소보다 새로운 임시 사본이 남아 있으면 그것으로 복구한다. (키는 imjang_ 접두어)
  const JOURNAL_KEY = 'imjang_pending_v1';
  const jRead = () => { try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const jWrite = (o) => { try { Object.keys(o).length ? localStorage.setItem(JOURNAL_KEY, JSON.stringify(o)) : localStorage.removeItem(JOURNAL_KEY); } catch (e) { /* 임시 사본을 못 남겨도 저장은 계속 시도 */ } };
  const jPut = (z) => { const o = jRead(); o[z.id] = { at: Date.now(), zone: z }; jWrite(o); };
  const jDrop = (id, at) => { const o = jRead(); if (o[id] && (at === undefined || o[id].at === at)) { delete o[id]; jWrite(o); } };
  function persist(z, delay) {
    jPut(z);
    clearTimeout(timers.get(z.id));
    timers.set(z.id, setTimeout(() => saveZone(z), delay === undefined ? 0 : delay));
  }
  async function saveZone(z) {
    timers.delete(z.id);
    const at = (jRead()[z.id] || {}).at;
    try { await store.putZone(z); z.updatedAt = Date.now(); jDrop(z.id, at); if (bannerState.saveError) { bannerState.saveError = null; renderBanner(); } }
    catch (e) { bannerState.saveError = e && e.code === 'quota' ? 'quota' : 'io'; renderBanner(); }
  }
  // 저장소에 반영되지 않은 임시 사본으로 복구(앱을 열 때 한 번)
  async function recoverJournal() {
    const o = jRead(); let n = 0;
    for (const [id, e] of Object.entries(o)) {
      const i = S.zones.findIndex((x) => x.id === id);
      if (i < 0 || e.at > (S.zones[i].updatedAt || 0)) { if (i < 0) S.zones.push(e.zone); else S.zones[i] = e.zone; n++; await saveZone(e.zone); }
      else jDrop(id);
    }
    return n;
  }
  // 저장 대기 중인 글을 지금 바로 저장한다(끝나면 이어지는 Promise: 새 버전으로 바꾸기 전에 기다린다)
  function flushAll() { return Promise.all([...timers.keys()].map((id) => { clearTimeout(timers.get(id)); const z = S.zones.find((x) => x.id === id); if (z) return saveZone(z); timers.delete(id); return null; })); }
  function retrySave() { S.zones.forEach((z) => saveZone(z)); }
  function renderBanner() {
    const b = $('banner'), msgs = [];
    if (bannerState.degraded) msgs.push('저장이 안 돼요. 이 브라우저(사생활 보호 모드 등)에서는 기록을 저장할 수 없어서, 앱을 닫으면 입력한 내용이 사라져요.');
    if (bannerState.saveError === 'quota') msgs.push('저장 공간이 부족해요. 입력한 글은 화면에 그대로 있지만 아직 저장되지 않았어요. 사진을 지워 공간을 비워 주세요.');
    else if (bannerState.saveError) msgs.push('저장에 실패했어요. 입력한 글은 화면에 그대로 있어요.');
    if (bannerState.photoQuota) msgs.push('저장 공간이 부족해서 사진을 저장하지 못했어요. 글은 안전하게 저장돼 있어요. 안 쓰는 사진이나 구역을 지워 공간을 비워 주세요.');
    b.hidden = !msgs.length;
    mount(b, msgs.map((m) => h('div', null, m)), bannerState.saveError ? h('button', { class: 'banner-btn', onclick: retrySave }, '다시 저장') : null,
      bannerState.photoQuota ? h('button', { class: 'banner-btn', onclick: () => { bannerState.photoQuota = false; renderBanner(); } }, '닫기') : null);
  }

  // ───────── 공통 UI ─────────
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
  // 폰: 내 구역·사이트·설정 화면에서만 하단 탭. PC: 같은 메뉴가 왼쪽 사이드바가 되고, 구역 선택에서도 보인다(구역 작업 화면은 자체 왼쪽 목록을 쓴다)
  const navShown = (id) => ['s-home', 's-sites', 's-set'].includes(id) || (isDesk() && id === 's-pick');
  function setNav(show) { $('nav').hidden = !show; $('app').classList.toggle('has-nav', !!show); }
  function go(id) {
    if (id !== 's-zone') revokeUrls();
    const was = $(id).classList.contains('on');
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    $(id).classList.add('on');
    setNav(navShown(id));
    $('nav').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === (id === 's-pick' ? 's-home' : id)));   // PC 에서 구역 선택 중에도 사이드바의 "내 구역"을 강조
    if (id === 's-home') renderHome();
    if (id === 's-pick') renderPick();
    if (id === 's-sites') renderSites();
    if (id === 's-set') renderSet();
    if (!was && id !== 's-zone') { const bd = $(id).querySelector('.body'); if (bd) bd.scrollTop = 0; }   // 다른 화면에 갔다 돌아오면 이전 스크롤 위치가 남아 맨 위 제목이 머리글에 가려지던 문제
  }
  function keepScroll(fn) { const b = $('zBody'), st = b.scrollTop; fn(); b.scrollTop = st; }
  const openModal = (...kids) => { mount($('sheet'), kids); $('modal').classList.add('on'); };
  const closeModal = () => { $('modal').classList.remove('on'); revokeViewer(); revokeShare(); };
  // 확인 창: 눌린 쪽에 따라 true/false 로 이어진다
  function confirmModal({ title, body, yes, no, danger }) {
    return new Promise((resolve) => {
      const fin = (v) => () => { closeModal(); resolve(v); };
      openModal(h('div', { style: 'font-weight:700;font-size:18px' }, title), body ? h('div', { class: 'sub', style: 'margin-top:8px' }, body) : null,
        h('div', { class: 'stack' }, h('button', { class: 'btn ' + (danger ? 'danger' : 'gold'), onclick: fin(true) }, yes || '확인'), h('button', { class: 'btn ghost', onclick: fin(false) }, no || '취소')));
    });
  }

  // 화면용 사진 주소(object URL)는 쓰고 나면 바로 해제한다
  let liveUrls = [], viewerUrl = null, renderTok = 0;
  function revokeUrls() { liveUrls.forEach((u) => URL.revokeObjectURL(u)); liveUrls = []; renderTok++; }
  function revokeViewer() { if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; } }

  // ───────── 계산 도우미 ─────────
  const flagsOf = (z) => R.zoneFlags(D.items, z, D.config);
  const prog = (z) => R.progress(D.items, z, D.config);

  // ───────── 내 구역 / 구역 선택 ─────────
  function renderHome() {
    const el = $('homeList');
    const hint = installCardNode();
    if (!S.zones.length) { mount(el, hint, h('div', { class: 'empty' }, h('div', { style: 'font-size:40px' }, '🗺️'), h('b', null, '아직 임장 기록이 없어요'), h('br'), '아래 "새 임장 시작"을 눌러 첫 구역을 골라 보세요.')); return; }
    mount(el, hint, S.zones.map((z) => {
      const f = flagsOf(z).filter((x) => x.f.lv === 2).length, p = prog(z);
      return h('div', { class: 'card zone-row' },
        h('button', { class: 'zone-main', onclick: () => openZone(z.id) },
          h('div', { class: 'nm' }, z.name, f ? h('span', { class: 'flagtag' }, '위험 ' + f) : null),
          h('div', { class: 'meta' }, p.done + ' / ' + p.total + ' 항목 완료'),
          h('div', { class: 'prog' }, h('i', { style: 'width:' + p.pct + '%' }))),
        h('button', { class: 'zone-del', 'aria-label': z.name + ' 삭제', onclick: () => deleteZone(z) }, '삭제'));
    }));
  }
  function photoCount(z) { return Object.values(z.ans || {}).reduce((n, a) => n + ((a && a.ph) || []).length, 0); }
  async function deleteZone(z) {
    const np = photoCount(z);
    const ok = await confirmModal({ title: '이 구역을 지울까요?', body: shortName(z.name) + ' 기록' + (np ? '과 사진 ' + np + '장' : '') + '이 모두 지워지고 되돌릴 수 없어요.', yes: '지우기', no: '취소', danger: true });
    if (!ok) return;
    clearTimeout(timers.get(z.id)); timers.delete(z.id); jDrop(z.id);
    try { await store.deleteZone(z.id); } catch (e) { toast('지우지 못했어요. 다시 시도해 주세요'); return; }
    S.lastDeleteAt = Date.now(); store.setMeta('lastDeleteAt', S.lastDeleteAt).catch(() => {});
    S.zones = S.zones.filter((x) => x.id !== z.id); renderHome(); toast('지웠어요');
  }

  // 구역 선택: 목록표(redev.json)에서 검색 · 유형 필터. 처음 열 때 한 번만 불러온다.
  const PICK_PAGE = 40;
  let redevPromise = null;
  function loadRedev() {
    if (!redevPromise) redevPromise = fetch('data/redev.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('redev ' + r.status); return r.json(); }).then((j) => { D.redev = j; return j; });
    return redevPromise.catch((e) => { redevPromise = null; throw e; });
  }
  const pickState = { sheet: '', limit: PICK_PAGE };
  // 목록표 화면과 같이, 작업 메모성 괄호("지도 라벨 확인, 정확 날짜 미상" 등)는 보여 주지 않는다
  const cleanStage = window.ImjangShare.cleanStage;
  const stageLabel = (i) => (Number.isInteger(i.stageIdx) ? D.stages[i.stageIdx] : hasVal(cleanStage(i.stage)) ? cleanStage(i.stage) : NONE);
  function renderPick() {
    if (!D.redev) {
      mount($('pickFilters')); mount($('pickList'), h('div', { class: 'empty' }, '목록표를 불러오는 중이에요…'));
      loadRedev().then(renderPick).catch(() => mount($('pickList'), h('div', { class: 'empty' }, '목록표를 불러오지 못했어요. 아래에서 구역 이름을 직접 입력해 주세요.')));
      return;
    }
    const q = ($('pickQ').value || '').trim().replace(/\s+/g, ''), rows = D.redev.rows;
    const sheets = Object.keys(D.redev.sheets);
    mount($('pickFilters'), ['', ...sheets].map((s) => h('button', { class: 'chip xs' + (pickState.sheet === s ? ' on' : ''), onclick: () => { pickState.sheet = s; pickState.limit = PICK_PAGE; renderPick(); } }, s || '전체', h('small', { style: 'opacity:.7;margin-left:3px' }, s ? D.redev.sheets[s] : D.redev.count))));
    const l = rows.filter((r) => (!pickState.sheet || r.sheet === pickState.sheet) && (!q || (r.name + r.gu + (r.dong || '') + (r.subCode || '')).replace(/\s+/g, '').includes(q)));
    const shown = l.slice(0, pickState.limit);
    mount($('pickList'), shown.length ? [h('div', { class: 'sub', style: 'margin:0 2px 8px' }, l.length + '곳 · 목록표 ' + D.redev.asOf + ' 기준'),
      shown.map((r) => h('button', { class: 'card zone', onclick: () => addZone(r) },
        h('div', { class: 'nm' }, r.name + (r.subCode ? ' ' + r.subCode : '')),
        h('div', { class: 'meta' }, [r.sheet, r.gu, stageLabel(r)].filter(hasVal).join(' · ')))),
      l.length > shown.length ? h('button', { class: 'btn ghost', style: 'margin-bottom:10px', onclick: () => { pickState.limit += PICK_PAGE; renderPick(); } }, '더 보기 (' + (l.length - shown.length) + '곳 남음)') : null]
      : h('div', { class: 'empty' }, '검색 결과가 없어요. 아래에서 직접 입력해 주세요.'));
  }
  const newId = () => 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blankZone = (name, info) => ({ id: newId(), createdAt: Date.now(), name, info, infoAsOf: info ? D.redev.asOf : null, ans: {}, cmp: '', cmpRows: {}, cmpNote: '', concl: '', note: '', n: {} });
  // 목록표 값을 기록에 복사해 저장한다(스냅샷). 이후 목록표가 바뀌어도 이미 만든 기록은 그대로다.
  function addZone(row) {
    const info = JSON.parse(JSON.stringify(row));
    info.stageNames = D.stages.slice();   // 번호만 저장하지 않고 그때의 단계 이름 목록도 같이 저장(단계 목록이 바뀌어도 뜻이 어긋나지 않게)
    const z = blankZone(row.name + (row.subCode ? ' ' + row.subCode : '') + ' (' + [row.gu, row.dong].filter(hasVal).join(' ') + ')', info);
    S.zones.push(z); persist(z); openZone(z.id);
  }
  function addCustom() { const z = blankZone($('customName').value.trim() || '직접 입력 구역', null); $('customName').value = ''; S.zones.push(z); persist(z); openZone(z.id); }

  function openZone(id) { S.cur = id; S.step = 'info'; S.idx = 0; S.mode = 'hand'; go('s-zone'); renderZone(); }
  function setMode(m) { S.mode = m; S.step = D.items_meta.modes[m][0]; S.idx = 0; renderZone(); if (isDesk()) $('zBody').scrollTop = 0; }
  function setStep(s) { S.step = s; S.idx = 0; renderZone(); if (isDesk()) $('zBody').scrollTop = 0; }
  function nextStep(d) {
    const ord = D.items_meta.order, i = ord.indexOf(S.step) + d;
    if (i < 0 || i >= ord.length) return;
    S.step = ord[i]; S.mode = D.items_meta.modes.hand.includes(S.step) ? 'hand' : 'field';
    S.idx = d < 0 ? Math.max(0, stepItems().length - 1) : 0;
    renderZone(); $('zBody').scrollTop = 0;
  }
  function mv(d) {
    const its = stepItems();
    if (d > 0) { if (S.idx < its.length - 1) S.idx++; else { nextStep(1); return; } }
    else { if (S.idx > 0) S.idx--; else { nextStep(-1); return; } }
    renderZone(); $('zBody').scrollTop = 0;
  }
  const zoneMeta = (z) => {
    const i = z.info; if (!i) return '직접 입력 구역';
    const rs = R.resolveStage(i, D.stages), st = rs.idx !== null ? D.stages[rs.idx] : cleanStage(i.stage);
    return [i.sheet, i.gu, hasVal(st) ? st : null].filter(hasVal).join(' · ');
  };
  function updTop() {
    const z = zone(), p = prog(z);
    $('zCount').textContent = p.done + ' / ' + p.total + (isDesk() ? ' 항목 완료' : ' 완료'); $('zBar').style.width = p.pct + '%';
    if (isDesk()) { $('zMeta').textContent = zoneMeta(z); updTabs(); }
    updPanel();
  }
  // 왼쪽 단계 목록의 "완료/전체" 숫자를 입력과 함께 고친다(PC. 버튼은 다시 만들지 않는다)
  function updTabs() {
    const z = S.cur && zone(); if (!z) return;
    $('tabs').querySelectorAll('button[data-step]').forEach((b) => {
      const its = R.visibleInStep(D.items, b.dataset.step, z.ans, D.config).filter(countable), sm = b.querySelector('small');
      if (sm) sm.textContent = its.filter((i) => R.isDone(i, z)).length + '/' + its.length;
    });
  }

  // ───────── 넓은 화면(PC) 오른쪽 실시간 요약 ─────────
  // 정리 탭과 같은 계산 함수(flagsOf·prog·R.openItems·concNode)를 그대로 불러 쓴다. 한 번 만들어 두고 값만 고쳐서, 4개 숫자 입력칸의 포커스가 사라지지 않는다.
  let PN = null;
  const RING_C = 2 * Math.PI * 46;
  function buildPanel(z) {
    PN = { id: z.id, host: $('sumPanel'), pct: h('b'), count: h('div', { class: 'sp-count' }), redH: h('div', { class: 'sp-h' }), red: h('div', { class: 'sp-items' }), yelH: h('div', { class: 'sp-h' }), yel: h('div', { class: 'sp-items' }), conc: h('div', { class: 'hint solid sp-conc' }) };
    PN.ringVal = svg('circle', { class: 'val', cx: 55, cy: 55, r: 46, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': RING_C.toFixed(1), 'stroke-dashoffset': RING_C.toFixed(1) });
    const ring = h('div', { class: 'ring' }, svg('svg', { width: 110, height: 110, viewBox: '0 0 110 110', 'aria-hidden': 'true' }, svg('circle', { class: 'trk', cx: 55, cy: 55, r: 46, fill: 'none', 'stroke-width': 10 }), PN.ringVal), PN.pct);
    PN.inputs = [['y', '2033', '년에'], ['v', '15', '억짜리 아파트를'], ['p', '8', '억에 사온다'], ['i', '500', '만원 필요']].map(([k, ph, suf]) => concInput(k, ph, suf));
    mount(PN.host, h('div', { class: 'sumtop' }, ring, h('div', null, h('div', { class: 'sp-kick' }, '실시간 요약'), h('div', { class: 'sp-big' }, '확인 완료'), PN.count)),
      h('div', { class: 'sumbody' }, PN.redH, PN.red, PN.yelH, PN.yel,
        h('div', { class: 'sp-h' }, '내 결론 · 4개 숫자'), PN.inputs, PN.conc,
        h('div', { class: 'sp-actions' }, h('button', { class: 'btn gold', onclick: openShare }, '💬 결론만 카톡으로 보내기'), h('button', { class: 'btn ghost', onclick: openCalcConfirm }, '📊 ' + D.config.calculator.label + '에서 시세 확인')),
        h('div', { class: 'disclaimer' }, DISCLAIMER)));
  }
  function updPanel() {
    const host = $('sumPanel'), z = S.cur && zone();
    if (!host || !z || !isDesk() || S.step === 'wrap') return;
    if (!PN || PN.id !== z.id || PN.host !== host || !host.contains(PN.pct)) buildPanel(z);
    const fl = flagsOf(z), p = prog(z), open = R.openItems(D.items, z, D.config), red = fl.filter((x) => x.f.lv === 2), yel = fl.filter((x) => x.f.lv !== 2);
    const list = (arr) => (arr.length ? arr.map((x) => h('button', { class: 'sp-item ' + (x.f.lv === 2 ? 'r' : 'y'), onclick: () => jumpTo(x.it.id) }, qText(x.it))) : h('div', { class: 'sub' }, '아직 없어요'));
    PN.pct.textContent = p.pct + '%'; PN.ringVal.setAttribute('stroke-dashoffset', (RING_C * (1 - p.pct / 100)).toFixed(1));
    PN.count.textContent = p.done + ' / ' + p.total + ' 항목 · 못 확인 ' + open.length + '건';
    PN.redH.textContent = '🚩 위험 ' + red.length + '건'; mount(PN.red, list(red));
    PN.yelH.textContent = '⚠ 주의 ' + yel.length + '건'; mount(PN.yel, list(yel));
    PN.inputs.forEach((w) => { const i = w.querySelector('input'); if (document.activeElement !== i) { const v = (z.n || {})[i.dataset.nk]; i.value = v === undefined || v === null ? '' : v; } });
    updPanelConc();
  }
  function updPanelConc() { if (PN && PN.conc && S.cur && zone()) mount(PN.conc, concNode(zone())); }

  // ───────── 입력 처리 ─────────
  function ensure(id) { const z = zone(); z.ans[id] = z.ans[id] || {}; return z.ans[id]; }
  function pick(id, k, o, multi) {
    const a = ensure(id);
    if (multi) { a[k] = a[k] || []; const i = a[k].indexOf(o); i >= 0 ? a[k].splice(i, 1) : a[k].push(o); }
    else a[k] = a[k] === o ? '' : o;
    persist(zone()); redraw(id);
  }
  function addOther(id, k, input) {
    const v = (input.value || '').trim(); if (!v) return;
    const a = ensure(id); a[k + 'X'] = a[k + 'X'] || []; if (!a[k + 'X'].includes(v)) a[k + 'X'].push(v);
    persist(zone()); redraw(id);
  }
  function delOther(id, k, i) { (ensure(id)[k + 'X'] || []).splice(i, 1); persist(zone()); redraw(id); }
  function typ(id, k, v) { ensure(id)[k] = v; persist(zone(), 300); updTop(); if (pcStep()) syncPC(); else updFlag(id); }
  // 입력으로 화면이 바뀌어야 할 때: 폰은 현재 카드를 다시 그리고(스크롤 유지), PC 는 한 단계 목록 중 바뀐 카드만 고친다(입력 위치·포커스 유지)
  function redraw(id) { if (pcStep()) { updTop(); syncPC(id); } else keepScroll(renderZone); }

  // ───────── 사진 ─────────
  // 사진 본체(Blob)는 photos 스토어에, 구역 기록의 ans[항목].ph 에는 사진 id 목록만 둔다.
  const photoCfg = () => D.config.photos;
  const newPhotoId = () => 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  async function addPhotos(itemId, fileList) {
    const z = zone(), a = ensure(itemId), max = photoCfg().maxPerItem;
    a.ph = a.ph || [];
    const room = max - a.ph.length, files = [...fileList].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)).slice(0, Math.max(0, room));
    if (fileList.length > files.length && room > 0) toast('한 항목에 사진은 최대 ' + max + '장이라 ' + files.length + '장만 담았어요');
    if (!files.length) { if (room <= 0) toast('사진은 한 항목에 최대 ' + max + '장까지 담을 수 있어요'); return; }
    let added = 0;
    for (const f of files) {
      try {
        toast('사진 저장 중… (' + (added + 1) + '/' + files.length + ')');
        const r = await window.ImjangPhoto.process(f, { maxEdge: photoCfg().maxEdge, quality: photoCfg().jpegQuality });
        const id = newPhotoId();
        await store.putPhoto({ id, zoneId: z.id, itemId, blob: r.blob, w: r.w, h: r.h, bytes: r.bytes, createdAt: Date.now() });
        a.ph.push(id); added++; persist(z);
        if (bannerState.photoQuota) { bannerState.photoQuota = false; renderBanner(); }
      } catch (e) {
        if (e && e.code === 'quota') { bannerState.photoQuota = true; renderBanner(); toast('저장 공간이 부족해서 사진을 저장하지 못했어요'); break; }
        toast('사진을 저장하지 못했어요'); console.error(e);
      }
    }
    if (added) toast('사진 ' + added + '장을 담았어요');
    if (zone() && zone().id === z.id && S.step) redraw(itemId);
  }
  async function removePhoto(itemId, photoId) {
    const z = zone(), a = ensure(itemId);
    a.ph = (a.ph || []).filter((x) => x !== photoId);
    persist(z); // 기록에서 먼저 빼고(글은 안전), 그다음 사진 본체를 지운다
    try { await store.deletePhoto(photoId); } catch (e) { console.error(e); }
    redraw(itemId);
  }
  async function openViewer(itemId, photoId) {
    const p = await store.getPhoto(photoId);
    if (!p) { toast('사진을 불러오지 못했어요'); return; }
    revokeViewer(); viewerUrl = URL.createObjectURL(p.blob);
    openModal(h('img', { src: viewerUrl, alt: '찍어 둔 사진', class: 'viewer-img' }),
      h('div', { class: 'sub', style: 'margin-top:6px' }, p.w + '×' + p.h + ' · ' + Math.round(p.bytes / 1024) + 'KB'),
      h('div', { class: 'stack' }, h('button', { class: 'btn danger', onclick: async () => { const ok = await confirmModal({ title: '이 사진을 지울까요?', yes: '지우기', no: '취소', danger: true }); if (ok) removePhoto(itemId, photoId); } }, '🗑 사진 지우기'), h('button', { class: 'btn ghost', onclick: closeModal }, '닫기')));
  }
  function photoBlock(it, a) {
    const ids = a.ph || [], max = photoCfg().maxPerItem, full = ids.length >= max;
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { addPhotos(it.id, e.target.files); e.target.value = ''; } });
    const alb = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { addPhotos(it.id, e.target.files); e.target.value = ''; } });
    const strip = h('div', { class: 'thumbs' });
    const tok = renderTok;
    ids.forEach((pid) => {
      const img = h('img', { alt: '사진', class: 'thumb-img' });
      strip.append(h('button', { class: 'thumb', 'aria-label': '사진 크게 보기', onclick: () => openViewer(it.id, pid) }, img));
      store.getPhoto(pid).then((p) => {
        if (!p) return;
        const url = URL.createObjectURL(p.blob);
        if (tok !== renderTok) { URL.revokeObjectURL(url); return; } // 그 사이 화면이 바뀜
        liveUrls.push(url); img.src = url;
      }).catch(() => {});
    });
    return h('div', { class: 'photos' }, h('div', { class: 'flab', style: 'margin-top:12px' }, '사진 ' + ids.length + '/' + max),
      ids.length ? strip : null,
      h('div', { class: 'tools' },
        h('button', { disabled: full, onclick: () => cam.click() }, mq('(pointer: fine)').matches ? '📷 사진 추가' : '📷 사진 찍기'),
        h('button', { disabled: full, onclick: () => alb.click() }, '🖼 앨범에서')), cam, alb);
  }

  function flagNode(it, z) {
    const f = R.evalFlag(it, z.ans, D.config);
    if (!f) return null;
    return h('div', { class: 'fbox ' + (f.lv === 2 ? 'r' : f.lv === 1 ? 'y' : 'g') }, (f.lv === 2 ? '🚩 ' : f.lv === 1 ? '⚠ ' : '✔ ') + f.msg);
  }
  function updFlag(id) { const it = D.items.find((x) => x.id === id), b = $('flagbox'); if (b && it) mount(b, flagNode(it, zone())); }

  function fieldNode(it, f, a) {
    const val = a[f.k], out = [];
    if (f.l) out.push(h('div', { class: 'flab' }, f.l));
    if (f.t === 'chips' || f.t === 'multi') {
      const opts = f.from === 'stages' ? D.stages : f.o, multi = f.t === 'multi';
      out.push(h('div', { class: 'chips' },
        opts.map((o) => {
          const on = multi ? (val || []).includes(o) : val === o, bad = on && f.bad && f.bad.includes(o);
          return h('button', { class: 'chip' + (f.sm ? ' sm' : '') + (on ? ' on' : '') + (bad ? ' bad' : ''), 'data-fk': it.id + '|' + f.k + '|' + o, onclick: () => pick(it.id, f.k, o, multi) }, T(o));
        }),
        (a[f.k + 'X'] || []).map((o, i) => h('button', { class: 'chip' + (f.sm ? ' sm' : '') + ' on', onclick: () => delOther(it.id, f.k, i) }, o + ' ✕'))));
      if (f.other) {
        const inp = h('input', { type: 'text', placeholder: '기타 직접 추가 (브랜드·업종 이름)', 'data-fk': it.id + '|' + f.k + '|__other' });
        out.push(h('div', { class: 'numf' }, inp, h('button', { class: 'btn navy xbtn', onclick: () => addOther(it.id, f.k, inp) }, '추가')));
      }
    } else if (f.t === 'num') {
      out.push(h('div', { class: 'numf' }, h('input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: f.ph || '', value: val === undefined ? '' : val, oninput: (e) => typ(it.id, f.k, e.target.value) }), h('span', null, f.u || '')));
    } else if (f.t === 'text') {
      out.push(h('textarea', { placeholder: f.ph || '', value: val || '', oninput: (e) => typ(it.id, f.k, e.target.value) }));
    }
    return out;
  }

  // ───────── 구역 정보 ─────────
  const nf = (v) => Number(v).toLocaleString('ko-KR');
  const fmtArea = (v) => (v >= 10000 ? (Math.round(v / 100) / 100).toFixed(2) + '만㎡' : nf(Math.round(v)) + '㎡');
  const estBadge = () => h('span', { class: 'estbadge', title: '직접 확인된 값이 아니라 목록표가 계산한 추정치예요' }, '추정');
  // 값이 없으면 "정보 없음", 숫자로 못 읽은 글은 원문 그대로
  function infoCell(label, value, text, opts) {
    const o = opts || {}, has = value !== null && value !== undefined && value !== '';
    const val = has ? o.fmt(value) : hasVal(text) ? text : null;
    return h('div', null, label, h('b', has || val ? null : { class: 'none' }, val || NONE, has && o.est ? estBadge() : null, has && o.conv ? h('span', { class: 'badge-conv', title: '분양세대수 − 소유자수로 환산한 값이에요' }, '환산') : null, o.note ? h('small', { class: 'notes' }, o.note) : null));
  }
  function stageBlock(i) {
    const stages = D.stages, rs = R.resolveStage(i, stages), cur = rs.idx, dates = rs.dates;   // 저장된 단계 이름 기준으로 지금 단계 목록에서 찾는다
    if (cur !== null) return h('div', { class: 'tl' }, stages.map((s, n) => h('div', { class: n < cur ? 'done' : n === cur ? 'cur' : 'fut' },
      h('span', { class: 'c' }, n < cur ? '✓' : n === cur ? '●' : ''), s, hasVal(dates[n]) ? h('span', { class: 'dt' }, dates[n]) : null)));
    // 앱 단계에 맞추지 않은 구역: 목록표 원문 단계를 그대로 보여 준다
    const mapped = D.stagesFile && D.stagesFile.sourceMap.mappedSheets.includes(i.sheet);
    return h('div', null,
      h('div', { class: 'kv1' }, '목록표 단계', hasVal(cleanStage(i.stage)) ? h('b', null, cleanStage(i.stage)) : h('b', { class: 'none' }, NONE)),
      h('div', { class: 'sub', style: 'margin-top:6px' }, mapped ? '이 단계는 앱의 ' + D.stages.length + '단계에 딱 맞지 않아 그대로 보여 드려요. 손품 체크의 "사업 단계"에서 직접 골라 주세요.' : i.sheet + ' 구역은 ' + D.stages.length + '단계에 맞추지 않고 목록표 단계 그대로 보여 드려요. 손품 체크의 "사업 단계"에서 직접 골라 주세요.'),
      i.hist && i.hist.length ? h('div', { class: 'tl' }, i.hist.map((x) => h('div', { class: 'done' }, h('span', { class: 'c' }, '✓'), x[0], h('span', { class: 'dt' }, x[1])))) : null);
  }
  function renderInfo(z) {
    const i = z.info, body = $('zBody');
    if (!i) { mount(body, h('div', { class: 'card' }, h('div', { class: 'q' }, '직접 입력한 구역이에요'), h('div', { class: 'why' }, '재개발 목록표에 없는 구역이라 기본 정보를 불러오지 못했어요. 손품 체크에서 사업 단계부터 직접 적어 주세요.'))); return; }
    const est = i.est || [], has = (k) => est.includes(k);
    const conv = i.sheet === '모아타운' && has('general');                                    // 모아타운: 분양세대수 − 소유자수로 환산한 일반분양 → "환산" 배지
    const om = i.sheet === '재건축단독' && typeof i.generalText === 'string' ? i.generalText.match(/\(([\d.]+)%\)/) : null, origPct = om ? om[1] : null;   // 재건축단독 원문 % (전체세대 대비)
    const ratioLabel = () => h('span', null, '일반분양비율', h('small', { class: 'notes' }, '일반분양 ÷ 조합원수'));
    const subline = [i.sheet, i.gu, i.dong].filter(hasVal).join(' · ') || NONE;
    mount(body, h('div', { class: 'card infocard' },
      h('div', { class: 'info-head' }, h('div', { style: 'font-weight:700;font-size:18px' }, shortName(z.name)), h('div', { class: 'sub' }, subline)),
      h('div', { class: 'info-l' }, h('div', { class: 'flab', style: 'margin-top:16px' }, '진행 단계'), stageBlock(i)),
      h('div', { class: 'info-r' },
      h('div', { class: 'flab', style: 'margin-top:16px' }, '핵심 수치'),
      h('div', { class: 'kv' },
        infoCell('전체세대수', i.households, i.householdsText, { fmt: nf, est: has('households') }),
        infoCell('조합원수', i.members, null, { fmt: nf, est: has('members') }),
        infoCell('일반분양수', i.generalUnits, null, { fmt: nf, est: has('general') && !conv, conv }),
        // 비율의 정의를 라벨로 밝힌다: 목록표와 같은 계산(일반분양 ÷ 조합원수). 값은 그대로 두고 표시만 한다.
        i.suspect ? h('div', null, ratioLabel(), h('b', { class: 'none' }, '확인 중')) : infoCell(ratioLabel(), i.generalRatio, null, { fmt: (v) => v + '%', est: has('ratio'), conv }),
        origPct != null ? infoCell(h('span', null, '원문 표기', h('small', { class: 'notes' }, '전체세대 대비')), origPct, null, { fmt: (v) => v + '%' }) : null,
        infoCell('최저초투', i.minInitial, i.minInitialText, { fmt: (v) => v + '억', note: i.minInitialNote }),
        infoCell('사업성등급', i.grade, null, { fmt: (v) => v, est: !!i.gradeEst })),
      h('div', { class: 'flab', style: 'margin-top:16px' }, '기본 정보'),
      h('div', { class: 'kv' },
        infoCell('구역면적', i.area, i.areaText, { fmt: fmtArea }),
        infoCell('평균 대지지분', i.landShare, i.landShareText, { fmt: (v) => v + '평' }))),
      h('div', { class: 'sub', style: 'margin-top:12px' }, '부의 레시피 재개발 목록표 ' + (z.infoAsOf || '') + ' 기준 값을 복사해 둔 기록이에요. 이후 목록표가 바뀌어도 이 기록은 그대로예요.')));
  }

  // PC: 히어로 카드 + 핵심 수치 카드 8개 + 진행 단계 격자. 값·추정/환산 표시·단계 매핑 규칙은 위(renderInfo·infoCell·stageBlock)와 같고 그리는 모양만 다르다.
  const gradeClass = (g) => (g === '매우좋음' ? 'g-best' : g === '좋음' || g === '양호' ? 'g-good' : g === '보통' ? 'g-mid' : g === '나쁨' || g === '주의' ? 'g-bad' : g === '매우 나쁨' ? 'g-worst' : 'g-na');
  const convBadge = () => h('span', { class: 'badge-conv', title: '분양세대수 − 소유자수로 환산한 값이에요' }, '환산');
  function kpiCard(cls, label, value, text, o) {
    o = o || {}; const has = value !== null && value !== undefined && value !== '', val = has ? o.fmt(value) : hasVal(text) ? text : null;
    return h('div', { class: 'kpi ' + cls },
      h('div', { class: 'l' }, label),
      h('div', { class: 'v' + (has || val ? '' : ' none') }, o.node && has ? o.node(value) : (val || NONE), has && o.est ? estBadge() : null, has && o.conv ? convBadge() : null),
      o.sub ? h('div', { class: 's' }, o.sub) : null, o.note ? h('div', { class: 's' }, o.note) : null, o.extra || null);
  }
  function stageGridPC(i) {
    const rs = R.resolveStage(i, D.stages), cur = rs.idx, dates = rs.dates;
    if (cur === null) return h('div', { class: 'st-un' }, stageBlock(i));                       // 앱 단계에 맞추지 않은 구역(모아타운·재건축단독): 목록표 원문 단계와 이력 그대로
    return h('div', { class: 'stg' }, D.stages.map((nm, n) => h('div', { class: 'st ' + (n < cur ? 'done' : n === cur ? 'cur' : 'fut') },
      n === cur ? h('span', { class: 'now' }, '현재') : null, h('div', { class: 'c' }, n < cur ? '✓' : String(n + 1)), h('div', { class: 'n' }, nm), hasVal(dates[n]) ? h('div', { class: 'd' }, dates[n]) : null)));
  }
  function renderInfoPC(z) {
    const i = z.info, body = $('zBody'), go1 = h('div', { class: 'pc-nav' }, h('button', { class: 'btn gold big', onclick: () => nextStep(1) }, '손품 체크 시작 →'));
    if (!i) {
      mount(body, h('section', { class: 'hero' }, h('div', null, h('div', { class: 'kick' }, '구역 정보'), h('h1', null, shortName(z.name)), h('div', { class: 'tags' }, h('span', { class: 'tag' }, '직접 입력한 구역')))),
        h('div', { class: 'empty' }, '재개발 목록표에 없는 구역이라 기본 정보를 불러오지 못했어요. 손품 체크에서 사업 단계부터 직접 적어 주세요.'), go1);
      return;
    }
    const est = i.est || [], has = (k) => est.includes(k), rs = R.resolveStage(i, D.stages), cur = rs.idx;
    const conv = i.sheet === '모아타운' && has('general');
    const om = i.sheet === '재건축단독' && typeof i.generalText === 'string' ? i.generalText.match(/\(([\d.]+)%\)/) : null, origPct = om ? om[1] : null;
    const curName = cur !== null ? D.stages[cur] : cleanStage(i.stage), curDate = cur !== null && hasVal(rs.dates[cur]) ? rs.dates[cur] : null;
    const where = [i.gu, i.dong].filter(hasVal).join(' ');
    const ratio = i.suspect ? kpiCard('k4', '일반분양비율', null, null, { sub: '일반분양 ÷ 조합원수' }) : kpiCard('k4', '일반분양비율', i.generalRatio, null, { fmt: (v) => v + '%', est: has('ratio'), conv, sub: '일반분양 ÷ 조합원수', extra: origPct != null ? h('div', { class: 'orig' }, '원문 표기 ' + origPct + '% ', h('small', null, '(전체세대 대비)')) : null });
    if (i.suspect) ratio.querySelector('.v').replaceChildren('확인 중');
    mount(body,
      h('section', { class: 'hero' },
        h('div', null, h('div', { class: 'kick' }, '구역 정보'), h('h1', null, shortName(z.name)),
          h('div', { class: 'tags' }, hasVal(i.sheet) ? h('span', { class: 'tag' }, i.sheet) : null, where ? h('span', { class: 'tag' }, where) : null,
            hasVal(curName) ? h('span', { class: 'tag gold' }, '현재: ' + curName + (curDate ? ' · ' + curDate : '')) : null)),
        h('div', { class: 'asof' }, '부의 레시피 재개발 목록표', h('br'), (z.infoAsOf || '') + ' 기준')),
      h('div', { class: 'sec' }, '핵심 수치'),
      h('div', { class: 'kpis' },
        kpiCard('k1', '전체세대수', i.households, i.householdsText, { fmt: nf, est: has('households') }),
        kpiCard('k2', '조합원수', i.members, null, { fmt: nf, est: has('members') }),
        kpiCard('k3', '일반분양수', i.generalUnits, null, { fmt: nf, est: has('general') && !conv, conv }),
        ratio,
        kpiCard('k5', '최저초투', i.minInitial, i.minInitialText, { fmt: (v) => v + '억', note: i.minInitialNote }),
        kpiCard('k6', '사업성등급', i.grade, null, { fmt: (v) => v, est: !!i.gradeEst, node: (v) => h('span', { class: 'gbadge ' + gradeClass(v) }, v) }),
        kpiCard('k7', '구역면적', i.area, i.areaText, { fmt: fmtArea }),
        kpiCard('k8', '평균 대지지분', i.landShare, i.landShareText, { fmt: (v) => v + '평' })),
      h('div', { class: 'sec' }, '진행 단계'), stageGridPC(i),
      h('div', { class: 'note' }, '부의 레시피 재개발 목록표 ' + (z.infoAsOf || '') + ' 기준 값을 복사해 둔 기록이에요. 이후 목록표가 바뀌어도 이 기록은 그대로예요.'),
      go1);
  }

  // ───────── 비교단지 ─────────
  function cmpGroups(z) {
    const C = D.items_meta.comparison, g = { up: [], eq: [], dn: [] };
    C.rows.forEach((n) => { const v = (z.cmpRows || {})[n]; if (!v) return; (C.goodGrades.includes(v) ? g.up : C.equalGrades.includes(v) ? g.eq : g.dn).push(n + '(' + v + ')'); });
    return g;
  }
  function cmpSummaryNode(z, solid) {
    const g = cmpGroups(z);
    if (!g.up.length && !g.eq.length && !g.dn.length) return null;
    return h('div', { class: 'hint solid', style: 'margin-top:12px' }, h('b', null, '평가 요소 정리'), ' (비교단지' + (z.cmp ? ' · ' + z.cmp : '') + ' 대비 우리 구역)', h('br'),
      '👍 우위: ' + (g.up.join(', ') || '-'), h('br'), '➖ 비슷: ' + (g.eq.join(', ') || '-'), h('br'), '👎 열위: ' + (g.dn.join(', ') || '-'),
      h('div', { class: 'sub', style: 'margin-top:6px' }, '가격 환산은 시세 보정 기능이 나오면 연동할 예정이에요.'));
  }
  function cmpPickKids(z) {
    const inp = h('input', { type: 'text', placeholder: '비교단지 이름 (예: 옆 동네 대단지)', value: z.cmp || '', oninput: (e) => { z.cmp = e.target.value; persist(z, 300); updTop(); } });
    return [inp,
      h('button', { class: 'btn navy', style: 'margin-top:10px', onclick: openCalcConfirm }, '📊 ' + D.config.calculator.label + '에서 시세 보기'),
      h('div', { class: 'sub', style: 'margin-top:8px' }, '단지 검색과 시세는 계산기에서 확인해요. 이름은 여기에 적어 두세요.')];
  }
  function cmpGridKids(z) {
    const C = D.items_meta.comparison, r = z.cmpRows || {};
    return [C.rows.map((n) => h('div', { class: 'cmprow' }, h('div', { style: 'font-weight:700' }, n),
        h('div', { class: 'chips', style: 'margin:6px 0 0' }, C.grades.map((o) => h('button', { class: 'chip xs' + (r[n] === o ? ' on' : '') + (r[n] === o && (o === '나쁨' || o === '매우 나쁨') ? ' bad' : ''), onclick: () => cmpSet(n, o) }, o))))),
      cmpSummaryNode(z),
      h('textarea', { placeholder: '종합 한 줄: 완공 후 비교단지와 어느 정도 대접받을까?', value: z.cmpNote || '', oninput: (e) => { z.cmpNote = e.target.value; persist(z, 300); } })];
  }
  function renderCmpPick(it, z) { return h('div', { class: 'card' }, h('div', { class: 'q' }, T(it.q)), h('div', { class: 'why' }, T(it.why)), cmpPickKids(z)); }
  function renderCmpGrid(it, z) { return h('div', { class: 'card' }, h('div', { class: 'q' }, T(it.q)), h('div', { class: 'why' }, T(it.why)), cmpGridKids(z)); }
  function cmpSet(n, o) { const z = zone(); z.cmpRows = z.cmpRows || {}; if (z.cmpRows[n] === o) delete z.cmpRows[n]; else z.cmpRows[n] = o; persist(z); redraw('#cmpGrid'); }

  // ───────── 사이트 링크 (이름·주소는 data/sites.json 한 곳에서만 읽는다) ─────────
  // 주소는 sites.json 의 url 그대로 — 임장 기록·입력값을 주소에 붙이지 않는다. 외부(https) 주소는 새 탭 + noopener noreferrer, 이 사이트의 다른 도구(상대경로)는 계산기 이동처럼 같은 탭.
  // 오프라인이면 data-ext 때문에 이동하지 않고 "인터넷이 필요해요"만 보인다(wire() 의 클릭 처리).
  function siteLink(s, text) {
    const ext = window.ImjangSites.linkKind(s.url) === 'ext';
    return h('a', Object.assign({ href: s.url, class: 'xlink', 'data-ext': '1' }, ext ? { target: '_blank', rel: 'noopener noreferrer' } : {}), text);
  }
  function whereKids(it) {
    const kids = [];
    window.ImjangSites.parseWhere(T(it.where), D.sites).forEach((g, i) => { if (i) kids.push(window.ImjangSites.SEP); kids.push(g.site ? siteLink(g.site, g.text) : g.text); });
    return kids;
  }
  function whereNode(it) { return h('div', { class: 'where' }, '🔎 확인할 수 있는 곳: ', h('b', null, whereKids(it))); }

  // ───────── 항목 카드 ─────────
  function itemCard(it, z, its) {
    if (it.type === 'tip') return h('div', { class: 'card' }, h('div', { class: 'sub' }, '💡 질문 요령'), h('div', { class: 'q' }, T(it.q)), it.lines.map((l) => h('p', { style: 'margin:10px 0;line-height:1.6' }, T(l))));
    if (it.custom === 'cmpPick') return renderCmpPick(it, z);
    if (it.custom === 'cmpGrid') return renderCmpGrid(it, z);
    const a = z.ans[it.id] || {};
    return h('div', { class: 'card' }, h('div', { class: 'sub' }, (S.idx + 1) + ' / ' + its.length),
      h('div', { class: 'q' }, T(it.q), it.badge ? h('span', { class: 'badge' }, it.badge) : null),
      h('div', { class: 'why' }, T(it.why || '')),
      it.where ? whereNode(it) : null,
      it.fields.map((f) => fieldNode(it, f, a)),
      h('div', { id: 'flagbox' }, flagNode(it, z)),
      it.photo ? photoBlock(it, a) : null,
      it.guide || it.script ? h('details', null, h('summary', null, '어떻게 확인하나요?'), it.guide ? h('p', null, T(it.guide)) : null, it.script ? h('p', { class: 'script' }, T(it.script)) : null) : null);
  }

  // ───────── 넓은 화면(PC): 한 단계의 보이는 항목을 모두 펼친 목록 ─────────
  // 폰의 카드 한 장 방식(itemCard)은 그대로 두고, PC 는 같은 필드 그리기 함수(fieldNode·photoBlock·flagNode·cmp*Kids·whereKids)를 다시 써서 목록으로 보여 준다.
  // 판정·진행률·노출 조건은 rules.js(R.evalFlag·R.visibleInStep·R.isDone)를 그대로 부른다. 새 계산은 없다.
  const pcStep = () => !!(S.pc && S.pc.step === S.step && isDesk() && $('s-zone').classList.contains('on'));
  const lvClass = (f, done) => (f && f.lv === 2 ? ' lv2' : f && f.lv === 1 ? ' lv1' : done ? ' ok' : '');
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
  function pcCard(it, z) {
    const a = z.ans[it.id] || {}, boxes = [], f = R.evalFlag(it, z.ans, D.config);
    if (it.where) boxes.push(h('div', { class: 'pc-box' }, h('div', { class: 'pc-bt' }, '🔎 확인할 수 있는 곳'), h('div', null, whereKids(it))));
    if (it.guide || it.script) boxes.push(h('div', { class: 'pc-box' }, h('div', { class: 'pc-bt' }, '어떻게 확인하나요?'), it.guide ? h('p', null, T(it.guide)) : null, it.script ? h('p', { class: 'script' }, T(it.script)) : null));
    const photo = it.photo ? photoBlock(it, a) : null, side = boxes.length ? h('aside', { class: 'pc-side' }, boxes, photo) : null;
    const body = it.custom === 'cmpPick' ? cmpPickKids(z) : it.custom === 'cmpGrid' ? cmpGridKids(z) : it.fields.map((fd) => fieldNode(it, fd, a));
    return h('article', { class: 'pcard' + (side ? ' has-side' : '') + lvClass(f, R.isDone(it, z)), 'data-id': it.id },
      h('div', { class: 'pc-main' },
        h('div', { class: 'pc-qrow' }, h('span', { class: 'pc-no' }), h('div', { class: 'pc-qtext' }, h('div', { class: 'q' }, T(it.q), it.badge ? h('span', { class: 'badge' }, it.badge) : null), it.why ? h('div', { class: 'why' }, T(it.why)) : null)),
        body, h('div', { class: 'flagbox' }, flagNode(it, z)), side ? null : photo),
      side);
  }
  // 목록을 지금의 답에 맞춘다: 사라진 항목은 빼고, 새로 생긴 항목은 제자리에 끼우고(잠깐 강조), dirty 로 지정한 카드는 다시 만든다. 나머지 카드는 그대로 둬서 입력 중인 칸이 유지된다.
  function syncPC(dirty, initial) {
    const pc = S.pc; if (!pc || pc.step !== S.step) return;
    const z = zone(), body = $('zBody'), want = stepItems().filter((it) => it.type !== 'tip');
    const dset = new Set(dirty === '#cmpGrid' ? want.filter((i) => i.custom === 'cmpGrid').map((i) => i.id) : dirty ? [dirty] : []);
    // 화면 위치와 포커스를 기억해 두었다가 되돌린다
    const br = body.getBoundingClientRect(), ae = document.activeElement, fk = ae && ae.dataset ? ae.dataset.fk : null;
    let an = ae && ae.closest ? ae.closest('.pcard') : null;
    if (!an || !body.contains(an)) an = [...pc.cards.values()].find((c) => c.getBoundingClientRect().bottom > br.top + 8) || null;
    const anchor = an ? { id: an.dataset.id, top: an.getBoundingClientRect().top - br.top } : null;
    [...pc.cards.keys()].forEach((id) => { if (!want.some((i) => i.id === id)) { pc.cards.get(id).remove(); pc.cards.delete(id); } });
    let prev = null;
    want.forEach((it) => {
      let el = pc.cards.get(it.id), fresh = false;
      if (!el || dset.has(it.id)) { const n = pcCard(it, z); if (el) el.replaceWith(n); else fresh = true; el = n; pc.cards.set(it.id, el); }
      const should = prev ? prev.nextElementSibling : pc.list.firstElementChild;
      if (el !== should) pc.list.insertBefore(el, should);
      if (fresh && !initial) flash(el);
      prev = el;
    });
    want.forEach((it, i) => {
      const el = pc.cards.get(it.id); el.querySelector('.pc-no').textContent = i + 1;
      const f = R.evalFlag(it, z.ans, D.config);                              // 판정이 바뀐 카드의 선·안내 상자만 고친다
      el.classList.toggle('lv2', !!f && f.lv === 2); el.classList.toggle('lv1', !!f && f.lv === 1); el.classList.toggle('ok', !(f && f.lv > 0) && R.isDone(it, z));
      if (!dset.has(it.id)) mount(el.querySelector('.flagbox'), flagNode(it, z));
    });
    const done = want.filter((it) => R.isDone(it, z)).length;
    pc.count.textContent = '항목 ' + want.length + '개' + (want.length ? ' · 답한 항목 ' + done + '개' : '');
    pc.empty.hidden = want.length > 0;
    if (anchor) { const el = pc.cards.get(anchor.id); if (el) body.scrollTop += (el.getBoundingClientRect().top - body.getBoundingClientRect().top) - anchor.top; }
    if (fk && (!document.activeElement || document.activeElement === document.body)) {
      const t = [...pc.list.querySelectorAll('[data-fk]')].find((e) => e.dataset.fk === fk); if (t) t.focus({ preventScroll: true });
    }
  }
  const STEP_ICON = { info: 'ℹ️', pre: '🖥', walk: '🚶', ppl: '🤝', mkt: '💹', cmp: '🏢', wrap: '📝' };
  function renderStepPC(z) {
    const meta = D.items_meta, tips = stepItems().filter((i) => i.type === 'tip');
    const list = h('div', { class: 'pc-list' }), count = h('div', { class: 'sub pc-count' }), empty = h('div', { class: 'empty' }, '이 단계에는 지금 보여 줄 항목이 없어요.');
    S.pc = { step: S.step, list, count, empty, cards: new Map() };
    mount($('zBody'), h('div', { class: 'pc-head' }, h('div', { class: 'bd', 'aria-hidden': 'true' }, STEP_ICON[S.step] || '📋'), h('div', null, h('h1', null, meta.steps[S.step]), count)),
      tips.map((t) => h('div', { class: 'pc-tip' }, h('div', { class: 'pc-bt' }, '💡 질문 요령'), h('div', { class: 'q' }, T(t.q)), t.lines.map((l) => h('p', null, T(l))))),
      empty, list, pcNav());
    mount($('pager'));
    syncPC(undefined, true);
  }
  // 한 단계 목록 맨 아래의 이동 버튼 (손품의 마지막 단계에서는 "현장 임장으로")
  function pcNav() {
    const m = D.items_meta, i = m.order.indexOf(S.step), prev = m.order[i - 1], next = m.order[i + 1];
    const toField = next && m.modes.hand.includes(S.step) && !m.modes.hand.includes(next);
    return h('div', { class: 'pc-nav' }, prev ? h('button', { class: 'btn ghost', onclick: () => nextStep(-1) }, '← 이전 단계') : null,
      next ? h('button', { class: 'btn gold', onclick: () => nextStep(1) }, toField ? '현장 임장으로 →' : '다음 단계: ' + m.steps[next] + ' →') : null);
  }
  // 요약 패널의 위험·주의 항목을 누르면 그 단계의 카드로 이동해서 잠깐 강조한다
  function jumpTo(id) {
    const it = D.items.find((x) => x.id === id); if (!it) return;
    if (S.step !== it.step) { S.step = it.step; S.mode = D.items_meta.modes.hand.includes(it.step) ? 'hand' : 'field'; renderZone(); }
    const el = S.pc && S.pc.cards.get(id); if (!el) return;
    S.idx = Math.max(0, stepItems().findIndex((x) => x.id === id));
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(el);
  }

  function renderZone() {
    const z = zone(), meta = D.items_meta;
    revokeUrls();
    $('zName').textContent = shortName(z.name); updTop();
    $('s-zone').classList.toggle('nopanel', S.step === 'wrap');   // PC: 정리 단계에서는 오른쪽 요약 패널을 숨긴다(내용이 겹침)
    S.pc = null;
    $('segH').classList.toggle('on', S.mode === 'hand'); $('segF').classList.toggle('on', S.mode === 'field');
    $('segHint').textContent = S.mode === 'hand' ? '손품을 이미 끝냈다면 "현장 임장"으로 바로 가셔도 돼요' : '손품이 아직이라면 "손품"으로 돌아가 먼저 채워 보세요';
    mount($('tabs'), meta.modes[S.mode].map((s) => {
      const its = R.visibleInStep(D.items, s, z.ans, D.config).filter(countable), dn = its.filter((i) => R.isDone(i, z)).length;
      return h('button', { class: s === S.step ? 'on' : '', 'data-step': s, onclick: () => setStep(s) }, h('span', { class: 'ic' }, String(meta.modes[S.mode].indexOf(s) + 1)), h('span', { class: 'nm' }, meta.steps[s]), its.length ? h('small', null, dn + '/' + its.length) : null);
    }));
    if (S.step === 'info') {
      if (isDesk()) { renderInfoPC(z); mount($('pager')); return; }
      renderInfo(z); mount($('pager'), h('button', { class: 'btn gold', onclick: () => nextStep(1) }, '손품 체크 시작')); return;
    }
    if (S.step === 'wrap') { renderWrap(); if (isDesk()) $('zBody').append(pcNav()); return; }
    if (isDesk()) { renderStepPC(z); return; }
    const its = stepItems();
    if (!its.length) { mount($('zBody'), h('div', { class: 'empty' }, '이 단계에는 지금 보여 줄 항목이 없어요.')); mount($('pager'), h('button', { class: 'btn ghost', style: 'flex:1', onclick: () => mv(-1) }, '이전'), h('button', { class: 'btn gold', style: 'flex:2', onclick: () => nextStep(1) }, '다음 단계')); return; }
    if (S.idx >= its.length) S.idx = its.length - 1;
    const it = its[S.idx], last = S.idx === its.length - 1;
    mount($('zBody'), h('div', { class: 'dots' }, its.map((_, i) => h('i', { class: i === S.idx ? 'on' : '' }))), itemCard(it, z, its));
    mount($('pager'), h('button', { class: 'btn ghost', style: 'flex:1', onclick: () => mv(-1) }, '이전'), h('button', { class: 'btn gold', style: 'flex:2', onclick: () => mv(1) }, last ? '다음 단계' : '다음'));
  }

  // ───────── 정리 탭 ─────────
  function concNode(z) {
    const c = R.conclusion(z.n), kids = [h('b', null, c.line1), h('br'), c.line2];
    if (c.margin !== null) kids.push(c.margin >= 0 ? h('div', { style: 'margin-top:8px', class: 'good' }, '안전마진 ' + R.fmt(c.margin) + '억') : h('div', { style: 'margin-top:8px', class: 'badtxt' }, '⚠ 사오는 가격이 아파트 가치보다 비싸요'));
    return kids;
  }
  const DISCLAIMER = '이 앱은 판단을 돕는 참고용 도구예요. 투자 결정과 결과에 대한 책임은 본인에게 있어요.';
  function updConc() { const e = $('concPrev'); if (e) mount(e, concNode(zone())); }
  function setN(k, v) { const z = zone(); z.n = z.n || {}; z.n[k] = v; persist(z, 300); updConc(); updPanelConc(); }
  const concInput = (k, ph, suf) => { const n = (zone() && zone().n) || {}; return h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' },
    h('input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: ph, value: n[k] === undefined ? '' : n[k], 'data-nk': k, oninput: (e) => setN(k, e.target.value), style: 'flex:1' }), h('span', { style: 'white-space:nowrap;font-weight:700' }, suf)); };
  function renderWrap() {
    const z = zone(), fl = flagsOf(z), p = prog(z), open = R.openItems(D.items, z, D.config), n = z.n || {};
    const inp = concInput;
    const cs = cmpSummaryNode(z);
    mount($('zBody'), h('div', { class: 'sum' },
      h('div', { class: 'sum-l' }, h('div', { class: 'sumcard' }, h('div', { class: 'dim' }, z.name), h('div', { class: 'big' }, p.pct + '% 확인 완료'),
        h('h3', null, '위험·주의 신호 ' + fl.length + '건'), h('ul', null, fl.length ? fl.map((x) => h('li', null, (x.f.lv === 2 ? '🚩' : '⚠') + ' ' + qText(x.it))) : h('li', null, '아직 없어요')),
        h('h3', null, '아직 못 확인한 것 ' + open.length + '건'), h('ul', null, open.slice(0, 4).map((it) => h('li', null, qText(it))), open.length > 4 ? h('li', null, '외 ' + (open.length - 4) + '건') : null)),
      cs ? [h('h3', null, '비교단지 대비 입지'), cs] : null),
      h('div', { class: 'sum-r' },
      h('h3', null, '내 결론 · 4개 숫자'),
      h('div', { class: 'card' }, inp('y', '2033', '년에'), inp('v', '15', '억짜리 아파트를'), inp('p', '8', '억에 사온다'), inp('i', '500', '만원 필요'),
        h('div', { id: 'concPrev', class: 'hint solid', style: 'margin:6px 0 0;font-size:16px' })),
      h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { style: 'font-weight:700' }, '몇 억짜리가 될지 모르겠다면?'), h('div', { class: 'sub', style: 'margin:4px 0 10px' }, '비교 대상 아파트 시세부터 확인해 보세요.'),
        h('button', { class: 'btn navy', onclick: openCalcConfirm }, '📊 비교대상 아파트 ' + D.config.calculator.label, h('small', null, '계산기에서 단지 이름 검색하기')),
        h('button', { class: 'btn ghost', style: 'margin-top:10px;opacity:.6', onclick: () => toast('시세 보정 기능은 준비 중이에요') }, '🛠 시세 보정하기 ', h('span', { class: 'flagtag mute' }, '준비 중'))),
      ),
      h('div', { class: 'sum-b' },
      h('h3', null, '이 구역, 내 판단은?'),
      h('div', { class: 'chips' }, ['매수 검토', '보류', '패스'].map((o) => h('button', { class: 'chip' + (z.concl === o ? ' on' : ''), onclick: () => { z.concl = z.concl === o ? '' : o; persist(z); keepScroll(renderZone); } }, o))),
      h('textarea', { placeholder: '근거 3줄 + 다음에 다시 가서 확인할 것', value: z.note || '', oninput: (e) => { z.note = e.target.value; persist(z, 300); } }),
      h('button', { class: 'btn gold', style: 'margin-top:14px', onclick: openShare }, '💬 결론만 카톡으로 보내기'),
      h('div', { class: 'sub', style: 'margin:6px 2px 0' }, '결론 한 장을 글이나 이미지로 보내요. 받은 사람은 이 앱에 들어오지 않아도 볼 수 있어요.'),
      backupNoticeNode(true),
      h('button', { class: 'btn ghost', style: 'margin-top:12px', onclick: () => go('s-set') }, '💾 전체 기록 백업 (이어서 쓸 때만)')),
      h('div', { class: 'disclaimer' }, DISCLAIMER)));
    updConc();
    mount($('pager'), h('button', { class: 'btn ghost', onclick: () => mv(-1) }, '이전 단계로'));
  }

  // ───────── 계산기 이동 (확인 팝업 후 단순 이동) ─────────
  function openCalcConfirm() {
    const c = D.config.calculator;
    openModal(h('div', { style: 'font-weight:700;font-size:18px' }, c.confirmTitle), h('div', { class: 'sub', style: 'margin-top:8px' }, c.confirmBody),
      h('div', { class: 'stack' }, h('button', { class: 'btn gold', onclick: () => { closeModal(); if (!window.ImjangPWA.online()) { needInternet('계산기는'); return; } window.location.href = c.url; } }, c.confirmYes), h('button', { class: 'btn ghost', onclick: closeModal }, c.confirmNo)));
  }

  // ───────── 결론 공유 (요약 글 / 전체 내용 / 이미지 카드 / 사진) ─────────
  const SH = window.ImjangShare;
  const share = { tab: 'text', mode: null, sent: new Set(), manual: null, img: null, photos: null, photosOpen: false, urls: [], note: '', tok: 0, batches: 0 };
  function sender() {
    // 로컬 확인용: ?noshare=1 이면 공유·복사가 전혀 안 되는 환경을 흉내 낸다(실서비스 주소에서는 무시)
    if (window.ImjangAuth.isLocalDev() && /[?&]noshare=1\b/.test(location.search)) {
      const fakeDoc = { createElement: () => ({ style: {}, setAttribute() {}, select() {}, setSelectionRange() {}, remove() {}, click() {} }), body: { appendChild() {} }, execCommand: () => false };
      return window.ImjangSend.create({ navigator: {}, document: fakeDoc, URL, isSecureContext: false });
    }
    return window.ImjangSend.create({ navigator: window.navigator, document, URL, isSecureContext: window.isSecureContext });
  }
  const shareCtx = () => ({ zone: zone(), items: D.items, meta: D.items_meta, config: D.config, stages: D.stages });
  const shareText = (tab) => (tab === 'full' ? SH.fullText(shareCtx()) : SH.summaryText(shareCtx()));
  function revokeShare() { share.urls.forEach((u) => URL.revokeObjectURL(u)); share.urls = []; share.img = null; share.photos = null; share.tok++; }
  function resetShare() { share.mode = null; share.sent = new Set(); share.manual = null; share.note = ''; share.batches = 0; }
  function openShare() { share.tab = 'text'; share.photosOpen = false; resetShare(); revokeShare(); renderShare(); $('modal').classList.add('on'); }
  const setShareTab = (t) => { share.tab = t; resetShare(); renderShare(); };
  const fmtN = (n) => Number(n).toLocaleString('ko-KR');

  // 글 보내기. 공유창을 사용자가 닫은 경우(cancel)는 오류가 아니므로 아무 안내도 하지 않는다.
  async function doSendText(text, index) {
    const res = await sender().sendText(text);
    if (res === 'manual') { share.manual = text; share.note = ''; renderShare(); return res; }
    if (res === 'shared') toast('보냈어요');
    else if (res === 'copied') toast('복사했어요. 카톡에 붙여넣기 하세요');
    if (res !== 'cancel' && index !== undefined) { share.sent.add(index); renderShare(); }
    return res;
  }

  // 이미지 카드: canvas 로 직접 그린다 (외부 라이브러리 없음, 폰 기본 한글 폰트). 색은 CSS 변수에서 읽는다.
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  async function renderCard() {
    const sc = D.config.share, family = cssVar('--font') || 'sans-serif';
    const model = SH.cardModel(shareCtx(), { maxRisks: sc.card.maxRisks });
    const probe = document.createElement('canvas').getContext('2d');
    const L = SH.layoutCard(model, (txt, font) => { probe.font = font; return probe.measureText(txt).width; }, { width: sc.card.width, family });
    const cv = document.createElement('canvas'); cv.width = L.width; cv.height = L.height;
    const g = cv.getContext('2d');
    const col = { ink: cssVar('--on-navy'), mute: cssVar('--on-navy-mute'), good: cssVar('--good-on-navy'), bad: cssVar('--bad-on-navy') };
    g.fillStyle = cssVar('--navy'); g.fillRect(0, 0, L.width, L.height);
    L.ops.forEach((o) => {
      if (o.type === 'dot') { g.fillStyle = col[o.color]; g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.fill(); }
      else { g.font = o.font; g.fillStyle = col[o.color]; g.textBaseline = 'alphabetic'; g.fillText(o.text, o.x, o.y); }
    });
    const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 만들지 못했어요'))), 'image/png'));
    return { blob, w: L.width, h: L.height, file: new File([blob], 'imjang_card.png', { type: 'image/png' }) };
  }
  async function ensureCard() {
    const tok = share.tok; share.img = { loading: true }; renderShare();
    try { const r = await renderCard(); if (tok !== share.tok) return; r.url = URL.createObjectURL(r.blob); share.urls.push(r.url); share.img = r; }
    catch (e) { console.error(e); if (tok === share.tok) share.img = { error: true }; }
    renderShare();
  }
  async function sendCard() {
    const r = share.img, S = sender(), res = await S.sendFiles([r.file], { title: '임장 결론' });
    if (res === 'shared') toast('이미지를 보냈어요');
    else if (res === 'unsupported') { S.download(r.blob, 'imjang_card.png'); share.note = '이 브라우저에서는 공유창으로 이미지를 보낼 수 없어서 이미지를 저장했어요. 저장된 이미지를 카톡에서 골라 보내세요. (위 이미지를 길게 눌러 저장해도 돼요)'; renderShare(); }
    else if (res === 'failed') { share.note = '이미지를 보내지 못했어요. "이미지 저장"으로 저장한 뒤 카톡에서 골라 보내세요.'; renderShare(); }
  }
  async function sendTxtFile() {
    const S = sender(), text = shareText(share.tab), file = new File([text], 'imjang_conclusion.txt', { type: 'text/plain' });
    const res = await S.sendFiles([file], { title: '임장 결론' });
    if (res === 'shared') toast('파일을 보냈어요');
    else if (res === 'unsupported' || res === 'failed') { S.download(file, 'imjang_conclusion.txt'); share.note = '이 브라우저에서는 파일을 공유창으로 보낼 수 없어서 파일을 저장했어요. 저장된 .txt 파일을 카톡에서 골라 보내세요.'; renderShare(); }
  }

  // 사진: 구역의 사진 중 보낼 것을 최대 N장 골라 파일로 공유한다. 저장된 사진은 이미 EXIF 가 없지만, 혹시 남아 있으면 다시 인코딩한다.
  async function loadSharePhotos() {
    const list = [], tok = share.tok, out = [];
    Object.entries(zone().ans).forEach(([itemId, a]) => (a.ph || []).forEach((pid) => list.push({ id: pid, itemId })));
    for (const it of list) {
      const p = await store.getPhoto(it.id); if (!p) continue;
      let blob = p.blob;
      if (window.ImjangPhoto.hasExif(new Uint8Array(await blob.slice(0, 65536).arrayBuffer()))) blob = (await window.ImjangPhoto.process(new File([blob], 'x.jpg', { type: blob.type }), { maxEdge: D.config.photos.maxEdge, quality: D.config.photos.jpegQuality })).blob;
      const url = URL.createObjectURL(blob); if (tok !== share.tok) { URL.revokeObjectURL(url); return; }
      share.urls.push(url); out.push({ id: it.id, itemId: it.itemId, blob, url, selected: false });
    }
    share.photos = out; renderShare();
  }
  const pickedPhotos = () => (share.photos || []).filter((x) => x.selected);
  const photoFiles = (arr) => arr.map((x, i) => new File([x.blob], 'imjang_photo_' + (i + 1) + '.jpg', { type: 'image/jpeg' }));
  async function sendPhotos(arr, batchIndex) {
    const S = sender(), res = await S.sendFiles(photoFiles(arr));
    if (res === 'shared') { toast('사진 ' + arr.length + '장을 보냈어요'); if (batchIndex !== undefined) { share.sent.add('p' + batchIndex); renderShare(); } }
    else if (res === 'unsupported') { arr.forEach((x, i) => S.download(x.blob, 'imjang_photo_' + (i + 1) + '.jpg')); share.note = '이 브라우저에서는 사진을 공유창으로 보낼 수 없어서 사진을 저장했어요. 저장된 사진을 카톡에서 골라 보내세요.'; renderShare(); }
    else if (res === 'failed') { share.note = '사진 ' + arr.length + '장을 한 번에 보내지 못했어요. 기기마다 한 번에 보낼 수 있는 개수가 달라서예요. 아래에서 나눠 보내 보세요.'; share.batches = arr.length; renderShare(); }
  }
  function togglePhoto(x) {
    const max = D.config.share.maxPhotos;
    if (!x.selected && pickedPhotos().length >= max) { toast('사진은 한 번에 최대 ' + max + '장까지 골라요'); return; }
    x.selected = !x.selected; share.batches = 0; share.sent = new Set([...share.sent].filter((k) => !String(k).startsWith('p'))); renderShare();
  }
  function photoSection() {
    const n = Object.values(zone().ans).reduce((a, x) => a + ((x && x.ph) || []).length, 0);
    if (!n) return null;
    if (!share.photosOpen) return h('button', { class: 'btn ghost', style: 'margin-top:10px', onclick: () => { share.photosOpen = true; if (!share.photos) loadSharePhotos(); renderShare(); } }, '📷 사진도 같이 보내기 (사진 ' + n + '장 중 고르기)');
    const max = D.config.share.maxPhotos, picked = pickedPhotos(), kids = [h('div', { class: 'flab' }, '보낼 사진 고르기 (최대 ' + max + '장)')];
    if (!share.photos) kids.push(h('div', { class: 'empty' }, '사진을 불러오는 중이에요…'));
    else {
      kids.push(h('div', { class: 'thumbs' }, share.photos.map((x) => h('button', { class: 'thumb pick' + (x.selected ? ' sel' : ''), 'aria-label': '사진 선택', onclick: () => togglePhoto(x) }, h('img', { src: x.url, alt: '사진', class: 'thumb-img' }), x.selected ? h('span', { class: 'chk' }, '✓') : null))));
      kids.push(h('button', { class: 'btn navy', style: 'margin-top:10px', disabled: !picked.length, onclick: () => sendPhotos(picked) }, '선택한 사진 보내기 (' + picked.length + '장)'));
      if (share.batches > 1 && picked.length > 1) {
        const groups = []; for (let i = 0; i < picked.length; i += 2) groups.push(picked.slice(i, i + 2));
        kids.push(h('div', { class: 'sub', style: 'margin:8px 0 4px' }, '나눠 보내기: 순서대로 눌러 주세요.'),
          groups.map((gp, i) => h('button', { class: 'btn ' + (share.sent.has('p' + i) ? 'ghost' : 'navy') + ' chunk-btn', style: 'margin-bottom:6px', onclick: () => sendPhotos(gp, i) }, (share.sent.has('p' + i) ? '✓ ' : '') + (i + 1) + '/' + groups.length + ' · 사진 ' + gp.length + '장 보내기')));
      }
    }
    return h('div', { class: 'photosend' }, kids);
  }

  function shareSheetBody() {
    const caps = sender().caps(), max = D.config.share.splitChars, kids = [];
    if (!caps.share) kids.push(h('div', { class: 'hint', style: 'margin:10px 0' }, caps.secure ? '이 브라우저에서는 공유창을 열 수 없어서, 글은 복사해 드려요.' : '이 주소(HTTP)에서는 공유창이 열리지 않아요. 글은 복사해 드리고, 복사가 안 되면 직접 복사할 수 있게 보여 드려요.'));
    if (share.manual !== null) {
      const ta = h('textarea', { readonly: true, class: 'manual', value: share.manual, onfocus: (e) => { const t = e.target; setTimeout(() => t.select(), 0); } });
      kids.push(h('div', { class: 'fbox y' }, '자동 복사가 안 돼요. 아래 글을 눌러 전체 선택한 뒤 복사해서 카톡에 붙여넣으세요.'), ta,
        h('div', { class: 'stack' }, h('button', { class: 'btn navy', onclick: () => { ta.focus(); ta.select(); } }, '전체 선택'), h('button', { class: 'btn ghost', onclick: () => { share.manual = null; renderShare(); } }, '돌아가기')));
      return kids;
    }
    if (share.tab === 'img') {
      const im = share.img;
      if (!im || im.loading) kids.push(h('div', { class: 'empty' }, '이미지를 만드는 중이에요…'));
      else if (im.error) kids.push(h('div', { class: 'fbox r' }, '이미지를 만들지 못했어요'));
      else kids.push(h('img', { src: im.url, alt: '임장 결론 이미지', class: 'cardimg' }), h('div', { class: 'sub', style: 'margin:6px 0 10px' }, im.w + '×' + im.h + ' · ' + Math.round(im.blob.size / 1024) + 'KB · 길게 눌러 저장할 수도 있어요'),
        h('div', { class: 'stack' }, h('button', { class: 'btn gold', onclick: sendCard }, '💬 이미지로 카톡에 보내기'), h('button', { class: 'btn ghost', onclick: () => { sender().download(im.blob, 'imjang_card.png'); toast('이미지를 저장했어요'); } }, '이미지 저장')));
    } else {
      const text = shareText(share.tab), long = text.length > max;
      kids.push(h('div', { class: 'preview' }, text), h('div', { class: 'sub', style: 'margin:6px 0 10px' }, fmtN(text.length) + '자' + (share.tab === 'full' ? ' · 답한 항목이 모두 들어가요. 사진은 글에 붙지 않아요.' : ' · 결론 위주 요약이에요. 항목별 답변까지 보내려면 "전체 내용"을 고르세요.')));
      if (!long) kids.push(h('button', { class: 'btn gold', onclick: () => doSendText(text) }, caps.share ? '💬 카톡으로 보내기' : '📋 글 복사하기'));
      else if (share.mode === 'chunks') {
        const chunks = SH.numberChunks(SH.splitText(text, max));
        kids.push(h('div', { class: 'fbox y' }, '글이 길어서 ' + chunks.length + '개로 나눴어요. 순서대로 하나씩 보내세요.'),
          chunks.map((c, i) => h('div', { class: 'chunk' }, h('div', null, h('b', null, (i + 1) + '/' + chunks.length), h('span', { class: 'sub' }, ' · ' + fmtN(c.length) + '자')),
            h('button', { class: 'btn ' + (share.sent.has(i) ? 'ghost' : 'navy') + ' chunk-btn', onclick: () => doSendText(c, i) }, share.sent.has(i) ? '✓ 보냈어요 (다시)' : (caps.share ? '보내기' : '복사')))),
          h('button', { class: 'btn ghost', style: 'margin-top:8px', onclick: () => { resetShare(); renderShare(); } }, '← 다른 방법 고르기'));
      } else kids.push(h('div', { class: 'fbox y' }, '글이 ' + fmtN(text.length) + '자로 길어요. 카톡에는 한 번에 붙일 수 있는 글자 수 제한이 있는데 정확한 값은 알 수 없어서, 약 ' + fmtN(max) + '자(추정)를 기준으로 나눠요.'),
        h('div', { class: 'stack' },
          h('button', { class: 'btn gold', onclick: () => { share.mode = 'chunks'; renderShare(); } }, '✂ 나눠 보내기 (' + SH.splitText(text, max).length + '개, 1/… 번호 붙임)'),
          h('button', { class: 'btn navy', onclick: sendTxtFile }, '📄 .txt 파일로 보내기'),
          h('button', { class: 'btn ghost', onclick: () => doSendText(text) }, '그래도 한 번에 보내기 (잘릴 수 있어요)')));
    }
    if (share.note) kids.push(h('div', { class: 'fbox y' }, share.note));
    kids.push(photoSection());
    return kids;
  }
  function renderShare() {
    if (share.tab === 'img' && !share.img && share.manual === null) { ensureCard(); return; }
    const tabs = [['text', '📝 요약 글'], ['full', '📋 전체 내용'], ['img', '🖼 이미지']];
    mount($('sheet'), h('div', { style: 'font-weight:700;font-size:18px' }, '결론만 카톡으로 보내기'), h('div', { class: 'sub', style: 'margin-top:4px' }, '받은 사람은 이 앱에 들어오지 않아도 볼 수 있어요.'),
      h('div', { class: 'chips' }, tabs.map(([k, l]) => h('button', { class: 'chip xs' + (share.tab === k ? ' on' : ''), onclick: () => setShareTab(k) }, l))),
      shareSheetBody(), h('button', { class: 'btn ghost', style: 'margin-top:10px', onclick: closeModal }, '닫기'));
  }

  // ───────── 전체 기록 백업 · 불러오기 (이어서 쓸 때만 쓰는 기능 — 결론 공유와는 별개) ─────────
  const BK = window.ImjangBackup;
  const bcfg = () => D.config.backup;
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtDate = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const fmtBytes = (n) => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + 'KB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + 'MB');
  const FILE_NOTE = '저장한 파일은 보통 휴대폰의 "다운로드" 폴더에 있어요 (Android: 내 파일 → 다운로드 / iPhone: 파일 앱 → 다운로드 또는 "이 iPhone 안"). 이 파일을 카톡 "나에게 보내기"나 드라이브에 올려 두면 폰을 바꿔도 안전해요.';
  const reminderInfo = () => BK.reminder({ zones: S.zones, lastBackupAt: S.lastBackupAt, lastRestoreAt: S.lastRestoreAt, lastDeleteAt: S.lastDeleteAt, now: Date.now(), days: bcfg().reminderDays });
  const daysAgo = (ms) => Math.floor((Date.now() - ms) / 86400000);

  // 가벼운 알림(팝업으로 막지 않는다): 바뀐 내용이 있고 N일이 지났을 때만 보인다
  function backupNoticeNode(inZone) {
    const r = reminderInfo(); if (!r.due) return null;
    const msg = r.never ? '아직 백업한 적이 없어요. 폰을 바꾸거나 기록을 지우면 사라질 수 있어요.' : '마지막 백업(' + daysAgo(S.lastBackupAt) + '일 전) 이후 바뀐 내용이 있어요.';
    return h('div', { class: 'hint backup-hint', style: 'margin:12px 0 0' }, msg + ' ', h('button', { class: 'linkbtn', onclick: () => (inZone ? go('s-set') : openExport()) }, inZone ? '저장하러 가기' : '지금 저장하기'));
  }
  function renderBackupCard() {
    const last = $('backupLast'); if (!last) return;
    last.textContent = S.lastBackupAt ? '마지막 백업: ' + fmtDate(S.lastBackupAt) + ' (' + daysAgo(S.lastBackupAt) + '일 전)' : '아직 백업한 적이 없어요';
    mount($('backupNotice'), backupNoticeNode(false));
  }
  // 정리 탭을 마치고 나갈 때 한 번 물어본다(닫을 수 있고, 나중에 해도 된다)
  const backupAsked = new Set();
  function maybeBackupPrompt(dest) {
    if (!reminderInfo().changed || backupAsked.has(S.cur)) return false;
    backupAsked.add(S.cur);
    openModal(h('div', { style: 'font-weight:700;font-size:18px' }, '지금 저장해 둘까요?'), h('div', { class: 'sub', style: 'margin-top:8px' }, '이 폰의 기록이 사라질 때를 대비해 백업 파일로 저장해 둘 수 있어요. 나중에 해도 괜찮아요.'),
      h('div', { class: 'stack' }, h('button', { class: 'btn gold', onclick: () => { closeModal(); go('s-set'); openExport(); } }, '💾 지금 저장하기'), h('button', { class: 'btn ghost', onclick: () => { closeModal(); go(dest); } }, '나중에')));
    return true;
  }
  const infoSheet = (title, lines, tone) => openModal(h('div', { style: 'font-weight:700;font-size:18px' }, title), lines.map((l) => h('div', { class: 'fbox ' + (tone || 'y'), style: 'font-weight:500' }, l)), h('div', { class: 'stack' }, h('button', { class: 'btn ghost', onclick: closeModal }, '닫기')));

  // ── 내보내기 ──
  const ex = { scope: 'all', picked: new Set(), photos: false, info: null, done: new Set(), note: '', busy: false };
  async function openExport() {
    if (!S.zones.length) { toast('저장할 기록이 없어요'); return; }
    Object.assign(ex, { scope: 'all', picked: new Set(), photos: false, info: null, done: new Set(), note: '', busy: false });
    openModal(h('div', { class: 'empty' }, '저장할 내용을 확인하는 중이에요…'));
    const info = new Map();
    for (const z of S.zones) info.set(z.id, (await store.listPhotos(z.id)).map((p) => (p.blob && p.blob.size) || p.bytes || 0));
    ex.info = info; renderExport();
  }
  const exIds = () => (ex.scope === 'all' ? S.zones.map((z) => z.id) : S.zones.filter((z) => ex.picked.has(z.id)).map((z) => z.id));
  const exBytes = (z) => BK.estimateZone(z, ex.info.get(z.id), ex.photos).total;
  const zoneName = (id) => shortName(S.zones.find((z) => z.id === id).name);
  function renderExport() {
    const ids = exIds(), zs = S.zones.filter((z) => ids.includes(z.id)), limit = bcfg().maxExportMB * 1048576;
    const total = zs.reduce((a, z) => a + exBytes(z), 0), nPhotos = zs.reduce((a, z) => a + ex.info.get(z.id).length, 0), plan = BK.planParts(zs.map((z) => ({ id: z.id, bytes: exBytes(z) })), limit);
    const split = total > limit, kids = [];
    kids.push(h('div', { style: 'font-weight:700;font-size:18px' }, '내 임장 기록 저장하기'), h('div', { class: 'sub', style: 'margin-top:4px' }, '이어서 쓰려고 할 때(폰 교체, 브라우저 기록 삭제 등)를 위한 전체 백업이에요. 결론만 보내는 것과는 달라요.'));
    kids.push(h('div', { class: 'flab' }, '저장할 구역'), h('div', { class: 'chips' },
      h('button', { class: 'chip sm' + (ex.scope === 'all' ? ' on' : ''), onclick: () => { ex.scope = 'all'; renderExport(); } }, '전체 구역 (' + S.zones.length + '개)'),
      h('button', { class: 'chip sm' + (ex.scope === 'pick' ? ' on' : ''), onclick: () => { ex.scope = 'pick'; renderExport(); } }, '구역 선택')));
    if (ex.scope === 'pick') kids.push(h('div', { class: 'picklist' }, S.zones.map((z) => h('label', { class: 'pickrow' }, h('input', { type: 'checkbox', checked: ex.picked.has(z.id), onchange: (e) => { e.target.checked ? ex.picked.add(z.id) : ex.picked.delete(z.id); renderExport(); } }),
      h('span', null, shortName(z.name), h('small', { class: 'sub' }, ' · 사진 ' + ex.info.get(z.id).length + '장 · ' + fmtBytes(exBytes(z))))))));
    kids.push(h('div', { class: 'flab' }, '사진'), h('div', { class: 'chips' },
      h('button', { class: 'chip sm' + (!ex.photos ? ' on' : ''), onclick: () => { ex.photos = false; renderExport(); } }, '글만 (가벼움, 기본)'),
      h('button', { class: 'chip sm' + (ex.photos ? ' on' : ''), onclick: () => { ex.photos = true; renderExport(); } }, '사진 포함 (큼)')));
    kids.push(h('div', { class: 'fbox ' + (split ? 'y' : 'g'), style: 'font-weight:500' }, ids.length ? '예상 파일 크기: 약 ' + fmtBytes(total) + (ex.photos ? ' (사진 ' + nPhotos + '장 포함)' : (nPhotos ? ' · 사진 ' + nPhotos + '장은 들어가지 않아요' : '')) : '저장할 구역을 골라 주세요.'));
    if (ex.photos) kids.push(h('div', { class: 'sub', style: 'margin-top:6px' }, '사진 포함 파일은 크고 카톡으로 보내기 어려울 수 있어요. 사진은 1장에 약 0.1~0.4MB예요.'));
    if (ids.length && (split || plan.oversize.length)) {
      kids.push(h('div', { class: 'fbox y', style: 'margin-top:10px' }, '파일이 ' + bcfg().maxExportMB + 'MB를 넘어서 구역을 나눠 받아야 해요. 아래 묶음을 하나씩 저장하세요.' + (plan.oversize.length ? ' (' + plan.oversize.map(zoneName).join(', ') + ' 구역은 혼자서도 상한을 넘어요 — "글만"으로 바꾸거나 사진을 줄여 주세요.)' : '')));
      plan.parts.forEach((part, i) => kids.push(h('button', { class: 'btn ' + (part.every((id) => ex.done.has(id)) ? 'ghost' : 'navy'), style: 'margin-top:8px', disabled: ex.busy, onclick: () => doExport(part, i + 1, plan.parts.length) },
        (part.every((id) => ex.done.has(id)) ? '✓ ' : '') + (i + 1) + '/' + plan.parts.length + ' 저장하기 · ' + part.map(zoneName).join(', ') + ' (' + fmtBytes(part.reduce((a, id) => a + exBytes(S.zones.find((z) => z.id === id)), 0)) + ')')));
    } else kids.push(h('button', { class: 'btn gold', style: 'margin-top:12px', disabled: !ids.length || ex.busy, onclick: () => doExport(ids, 1, 1) }, ex.busy ? '만드는 중…' : '💾 저장하기'));
    if (ex.note) kids.push(h('div', { class: 'fbox y', style: 'font-weight:500;margin-top:10px' }, ex.note));
    kids.push(h('div', { class: 'sub', style: 'margin-top:10px;line-height:1.6' }, FILE_NOTE), h('button', { class: 'btn ghost', style: 'margin-top:10px', onclick: closeModal }, '닫기'));
    mount($('sheet'), kids);
  }
  async function doExport(ids, part, total) {
    ex.busy = true; ex.note = ''; renderExport();
    try {
      const zs = S.zones.filter((z) => ids.includes(z.id)), photosByZone = {};
      if (ex.photos) for (const z of zs) {
        photosByZone[z.id] = [];
        for (const p of await store.listPhotos(z.id)) photosByZone[z.id].push({ id: p.id, itemId: p.itemId, w: p.w, h: p.h, createdAt: p.createdAt, type: 'image/jpeg', data: BK.bytesToB64(new Uint8Array(await p.blob.arrayBuffer())) });
      }
      const text = JSON.stringify(BK.build({ zones: zs, photosByZone, withPhotos: ex.photos, now: Date.now(), appVersion: D.config.appVersion }));
      const name = BK.fileName(new Date(), ex.photos, part, total), res = await sendBackupFile(text, name);
      if (res === 'shared' || res === 'download') {
        if (res === 'shared') toast('공유창으로 보냈어요'); else ex.note = '파일로 저장했어요. ' + FILE_NOTE;
        ids.forEach((id) => ex.done.add(id));
        if (S.zones.every((z) => ex.done.has(z.id))) { S.lastBackupAt = Date.now(); store.setMeta('lastBackupAt', S.lastBackupAt).catch(() => {}); renderBackupCard(); ex.note = (ex.note ? ex.note + ' ' : '') + '전체 구역을 공유창으로 보내거나 파일로 저장했어요. 마지막 백업 날짜를 갱신했어요.'; }
      }
    } catch (e) { console.error(e); ex.note = '백업 파일을 만들지 못했어요. ' + (e && e.message ? e.message : ''); }
    ex.busy = false; renderExport();
  }
  // 파일 공유 → (안 되면) 파일 저장. 공유창을 닫은 경우는 오류가 아니다.
  async function sendBackupFile(text, name) {
    const S2 = sender(), json = new File([text], name, { type: 'application/json' });
    let res = await S2.sendFiles([json], { title: '임장 기록 백업' });
    if (res === 'unsupported') res = await S2.sendFiles([new File([text], name, { type: 'text/plain' })], { title: '임장 기록 백업' });   // json 은 막고 txt 는 허용하는 기기용
    if (res === 'unsupported' || res === 'failed') { S2.download(new Blob([text], { type: 'application/json' }), name); return 'download'; }
    return res;   // 'shared' | 'cancel'
  }

  // ── 불러오기 ──
  const imp = { clean: null, summary: null, decisions: {}, busy: false };
  async function handleImportFile(file) {
    const lim = BK.limitsFromConfig(bcfg());
    if (file.size > lim.maxImportBytes) { infoSheet('이 파일은 가져올 수 없어요', ['파일이 너무 커요 (' + fmtBytes(file.size) + ' > ' + bcfg().maxImportMB + 'MB). 구역을 나눠 저장한 파일을 하나씩 가져와 주세요.', '지금 이 폰의 기록은 그대로예요.'], 'r'); return; }
    let text; try { text = await file.text(); } catch (e) { infoSheet('이 파일은 가져올 수 없어요', ['파일을 읽지 못했어요.', '지금 이 폰의 기록은 그대로예요.'], 'r'); return; }
    const v = BK.validate(text, lim);
    if (!v.ok) { infoSheet('이 파일은 가져올 수 없어요', v.errors.concat(['지금 이 폰의 기록은 그대로예요.']), 'r'); return; }
    imp.clean = v.backup; imp.summary = v.summary; imp.decisions = {}; imp.busy = false; renderImportPreview();
  }
  const CHOICES = [['overwrite', '덮어쓰기'], ['keep', '둘 다 보관'], ['skip', '건너뛰기']];
  function renderImportPreview() {
    const have = new Set(S.zones.map((z) => z.id)), sm = imp.summary, kids = [];
    kids.push(h('div', { style: 'font-weight:700;font-size:18px' }, '이 백업을 가져올까요?'),
      h('div', { class: 'fbox g', style: 'font-weight:500' }, '백업 날짜 ' + fmtDate(sm.exportedAt) + (sm.appVersion ? ' · 앱 ' + sm.appVersion : ''), h('br'), '구역 ' + sm.zones + '개 · 사진 ' + sm.photos + '장' + (sm.photos ? '' : ' (이 파일은 글만 들어 있어요)')));
    kids.push(h('div', { class: 'flab' }, '구역'));
    imp.clean.zones.forEach((z) => {
      const conflict = have.has(z.id), cur = imp.decisions[z.id] || 'keep';
      kids.push(h('div', { class: 'cmprow' }, h('div', { style: 'font-weight:700' }, shortName(z.name), h('small', { class: 'sub' }, ' · 사진 ' + z.photos.length + '장')),
        conflict ? [h('div', { class: 'sub' }, '이 폰에 같은 구역이 이미 있어요'), h('div', { class: 'chips', style: 'margin:6px 0 0' }, CHOICES.map(([k, l]) => h('button', { class: 'chip xs' + (cur === k ? ' on' : '') + (cur === k && k === 'overwrite' ? ' bad' : ''), onclick: () => { imp.decisions[z.id] = k; renderImportPreview(); } }, l))),
          cur === 'overwrite' ? h('div', { class: 'sub', style: 'color:var(--red)' }, '지금 이 폰의 이 구역 기록(사진 포함)이 백업 내용으로 바뀌어요.') : cur === 'keep' ? h('div', { class: 'sub' }, '이름 뒤에 "(복원)"을 붙여 따로 보관해요.') : h('div', { class: 'sub' }, '이 구역은 가져오지 않아요.')]
          : h('div', { class: 'sub' }, '새로 추가돼요')));
    });
    kids.push(h('div', { class: 'stack' }, h('button', { class: 'btn gold', disabled: imp.busy, onclick: doImport }, imp.busy ? '가져오는 중…' : '가져오기'), h('button', { class: 'btn ghost', disabled: imp.busy, onclick: () => { imp.clean = null; closeModal(); } }, '취소')));
    mount($('sheet'), kids); $('modal').classList.add('on');
  }
  async function doImport() {
    imp.busy = true; renderImportPreview();
    try {
      const plan = BK.planImport(imp.clean, S.zones.map((z) => z.id), imp.decisions, (p) => (p === 'z' ? newId() : newPhotoId()));
      const maxEdge = D.config.photos.maxEdge, st = { reencoded: 0, skipped: 0 }, photos = [];
      // 사진: 가져오기 전에 형식·크기·EXIF 를 다시 확인한다(JPEG 가 아니면 건너뛰고, EXIF 가 있거나 너무 크면 다시 인코딩)
      for (const p of plan.photos) {
        try {
          const bytes = BK.b64ToBytes(p.data), info = window.ImjangPhoto.inspectJpeg(bytes);
          if (!info.isJpeg || info.w * info.h > 50e6) throw new Error('사진 형식');
          let blob, w = info.w, hh = info.h;
          if (info.hasExif || Math.max(info.w, info.h) > maxEdge || !info.w) { const r = await window.ImjangPhoto.process(new File([bytes], 'x.jpg', { type: 'image/jpeg' }), { maxEdge, quality: D.config.photos.jpegQuality }); blob = r.blob; w = r.w; hh = r.h; st.reencoded++; }
          else blob = new Blob([bytes], { type: 'image/jpeg' });
          photos.push({ id: p.id, zoneId: p.zoneId, itemId: p.itemId, w, h: hh, bytes: blob.size, createdAt: p.createdAt, blob });
        } catch (e) {
          st.skipped++;
          const z = plan.zones.find((x) => x.id === p.zoneId);
          if (z) Object.values(z.ans).forEach((a) => { if (a.ph) { a.ph = a.ph.filter((x) => x !== p.id); if (!a.ph.length) delete a.ph; } });
        }
        p.data = null;
      }
      await store.applyImport({ zones: plan.zones, photos, deleteZoneIds: plan.deleteZoneIds });   // 한 번에: 하나라도 실패하면 전부 취소
      plan.deleteZoneIds.concat(plan.zones.map((z) => z.id)).forEach((id) => { clearTimeout(timers.get(id)); timers.delete(id); jDrop(id); });
      S.zones = await store.listZones();
      S.lastRestoreAt = Date.now(); store.setMeta('lastRestoreAt', S.lastRestoreAt).catch(() => {});   // 복원 직후에는 백업 알림을 건너뛴다(기록이 방금 읽은 파일과 같으므로)
      renderHome(); renderBackupCard();
      const s = plan.stats;
      imp.clean = null; imp.busy = false;
      infoSheet('가져오기를 마쳤어요', ['구역 ' + s.zones + '개를 가져왔어요' + ((s.added || s.overwritten || s.keptBoth) ? ' (새로 추가 ' + s.added + ' · 덮어쓰기 ' + s.overwritten + ' · 둘 다 보관 ' + s.keptBoth + ')' : '') + '.', s.skipped ? '건너뛴 구역 ' + s.skipped + '개.' : '건너뛴 구역은 없어요.', '사진 ' + photos.length + '장을 가져왔어요' + (st.reencoded ? ' (그중 ' + st.reencoded + '장은 크기·정보를 정리해 다시 저장)' : '') + (st.skipped ? '. 형식이 맞지 않아 건너뛴 사진 ' + st.skipped + '장' : '') + '.'].concat(s.droppedPhotoRefs ? ['이 파일에는 글만 들어 있어서 사진 ' + s.droppedPhotoRefs + '장은 복원되지 않았어요.'] : []), 'g');
    } catch (e) {
      console.error(e); imp.busy = false;
      infoSheet('가져오기에 실패했어요', [e && e.code === 'quota' ? '저장 공간이 부족해요. 안 쓰는 사진이나 구역을 지운 뒤 다시 시도해 주세요.' : '가져오는 중에 문제가 생겼어요.', '아무것도 바뀌지 않았어요. 지금 이 폰의 기록은 그대로예요.'], 'r');
    }
  }

  // ───────── 설치 · 오프라인 · 새 버전 ─────────
  const PWA = window.ImjangPWA;
  // 인터넷이 필요한 동작(계산기 이동, 외부 사이트 링크)을 오프라인에서 눌렀을 때의 안내
  const needInternet = (subject) => infoSheet('인터넷이 필요해요', [(subject || '이 기능은') + ' 인터넷에 연결되어 있을 때만 열 수 있어요.', '임장 기록·사진·결론 만들기는 인터넷이 없어도 계속 쓸 수 있어요.'], 'y');
  function initPwa() {
    PWA.onUpdate(() => { $('updateBar').hidden = false; });
    PWA.onInstallChange(() => { renderInstallUI(); if ($('s-home').classList.contains('on')) renderHome(); });
    window.addEventListener('appinstalled', () => { insS.installed = true; renderInstallUI(); if ($('s-home').classList.contains('on')) renderHome(); });   // 브라우저가 설치를 마쳤다고 알리면(메뉴로 설치한 경우 포함) 안내를 걷어 낸다
    $('btnUpdate').addEventListener('click', async () => { $('btnUpdate').disabled = true; toast('저장을 마치고 새 버전으로 바꿀게요'); const ok = await PWA.applyUpdate(() => flushAll()); if (!ok) $('btnUpdate').disabled = false; });
    PWA.register();
    window.addEventListener('offline', () => toast('인터넷이 끊겼어요. 기록은 계속 쓸 수 있어요'));
  }

  // ───────── 사이트 모음 ─────────
  function renderSites() {
    const groups = [...new Set(D.sites.map((s) => s.group))], notes = D.siteNotes || {};
    mount($('siteList'), groups.map((g) => {
      const grid = h('div', { class: 'sgrid' }, h('div', { class: 'scol' }), h('div', { class: 'scol' }));
      D.sites.forEach((s, i) => { if (s.group === g) grid.firstChild.append(siteCard(s, i)); });   // 카드는 한 번만 만들고, 열 배치는 layoutSiteCols 가 한다
      return [h('h3', null, g), notes[g] ? h('div', { class: 'sgroup-note' }, notes[g]) : null, grid];
    }));
    layoutSiteCols();
  }
  // 사이트 카드: 이름(링크) · 한 줄 소개 · [상세: 주요 기능 · 이럴 때 써요 · 참고] · "상세 보기 ▾" 버튼. 글은 모두 textContent 로 넣는다. 펼친 상태는 저장하지 않는다(다시 열면 접힘).
  function siteCard(s, n) {
    const ok = window.ImjangSites.linkKind(s.url), feats = Array.isArray(s.features) ? s.features : [], id = 'sd-' + n;
    const more = feats.length || s.useFor || s.note;
    const det = more ? h('div', { class: 'st-more', id, hidden: true },
      feats.length ? h('ul', { class: 'st-feat' }, feats.map((f) => h('li', null, f))) : null,
      s.useFor ? h('div', { class: 'st-use' }, h('b', null, '이럴 때 써요'), ' · ', s.useFor) : null,
      s.note ? h('div', { class: 'st-note' }, h('b', null, '참고'), ' · ', s.note) : null) : null;
    const lab = h('span', { class: 'tg-t' }, '상세 보기');
    const tog = more ? h('button', { type: 'button', class: 'st-tog', 'aria-expanded': 'false', 'aria-controls': id }, lab, h('span', { class: 'tg-a', 'aria-hidden': 'true' }, '▾')) : null;
    if (tog) tog.addEventListener('click', () => { const open = tog.getAttribute('aria-expanded') !== 'true'; tog.setAttribute('aria-expanded', String(open)); det.hidden = !open; lab.textContent = open ? '접기' : '상세 보기'; });
    return h('div', { class: 'card site', 'data-i': n },
      h('div', { class: 'st-name' }, ok ? siteLink(s, s.title) : s.title),
      s.summary ? h('div', { class: 'st-sum' }, s.summary) : null, det, tog,
      ok ? null : h('div', { class: 'sub badtxt' }, '주소 미확인'));
  }
  // 사이트 모음 열 배치: 넓은 화면(SITE2)에서는 한 그룹의 카드를 왼쪽·오른쪽 열에 번갈아(1·3·5… / 2·4·6…) 쌓는다. 각 열은 독립이라 한쪽이 길어도 옆 열에 빈 세로 공간이 생기지 않고,
  // 카드를 펼쳐도 그 열만 밀린다. 좁은 화면에서는 한 열에 원래 순서대로. 열 수가 바뀔 때는 기존 카드 요소를 옮기기만 해서 펼침 상태가 유지되고, 포커스는 되돌려 준다.
  const SITE2 = '(min-width:1180px)';
  function layoutSiteCols() {
    const two = mq(SITE2).matches, act = document.activeElement;
    document.querySelectorAll('#siteList .sgrid').forEach((g) => {
      if (g.dataset.cols === (two ? '2' : '1')) return;
      const cols = [...g.children], cards = [...g.querySelectorAll('.site')].sort((a, b) => a.dataset.i - b.dataset.i);
      cards.forEach((c, k) => cols[two ? k % 2 : 0].append(c));
      g.dataset.cols = two ? '2' : '1';
    });
    if (act && act !== document.activeElement && act.isConnected && act.closest('#siteList')) act.focus({ preventScroll: true });
  }

  // ───────── 사용법 팝업 (내용: data/help.json, 자동 표시 규칙: help.js) ─────────
  // 입장 후 첫 화면(내 구역)이 뜬 직후, 이 기기에서 처음이면(또는 help.json 의 version 이 올라가면) 자동으로 연다. #app 밖(#helpModal)에 두고, 열려 있는 동안 #app 은 inert.
  // 닫을 때 "다시 보지 않기" 체크 → localStorage(imjang_help_seen_v1)에 영구 저장 / 체크 없이 닫기(✕·ESC·바깥·[닫기]) → 이번 세션(sessionStorage)만 자동으로 열지 않음.
  const HELP = window.ImjangHelp, helpS = { open: false, from: null };
  const store1 = (k) => { try { return window[k]; } catch (e) { return null; } };   // 저장소 접근 자체가 막힌 환경 대비
  function renderHelpBody() {
    const H = D.help;
    $('helpTitle').textContent = H.title;
    mount($('helpBody'), H.sections.map((sec) => [h('h3', { class: 'hh' }, sec.heading), (sec.blocks || []).map((b) =>
      b.type === 'ol' ? h('ol', { class: 'hl' }, b.items.map((t) => h('li', null, t))) : b.type === 'ul' ? h('ul', { class: 'hl' }, b.items.map((t) => h('li', null, t)))
      : b.type === 'note' ? h('p', { class: 'hnote' }, b.text) : h('p', { class: 'hp' }, b.text))]), H.closing ? h('p', { class: 'hclose' }, H.closing) : null);
  }
  function openHelp() {
    if (helpS.open || insS.open) return;
    if (!D.help) { toast('사용법을 불러오지 못했어요'); return; }
    renderHelpBody();
    $('helpNever').checked = HELP.isSeen(store1('localStorage'), D.help.version);   // 이미 저장했다면 체크된 채로 열린다
    helpS.from = document.activeElement; helpS.open = true;
    $('helpModal').hidden = false; $('app').setAttribute('inert', ''); document.body.classList.add('help-open');
    $('helpBody').scrollTop = 0; $('helpTitle').focus({ preventScroll: true });
  }
  function closeHelp() {
    if (!helpS.open) return;
    HELP.closeWith(store1('localStorage'), store1('sessionStorage'), D.help.version, $('helpNever').checked);
    helpS.open = false; $('helpModal').hidden = true; $('app').removeAttribute('inert'); document.body.classList.remove('help-open');
    const f = helpS.from; helpS.from = null; if (f && f.isConnected && f !== document.body && f.focus) f.focus({ preventScroll: true });   // 열기 전에 있던 자리로 포커스 복귀
  }
  function maybeAutoHelp() { if (D.help && HELP.shouldAutoOpen(store1('localStorage'), store1('sessionStorage'), D.help.version)) openHelp(); }
  // 팝업 키 처리(사용법 · 설치 안내 시트 공용): ESC 로 닫기, Tab 이 팝업 안에서만 돈다(✕ → 본문 → … → 닫기 → 처음으로)
  function modalKeys(e) {
    const isHelp = helpS.open, root = isHelp ? $('helpSheet') : insS.open ? $('instSheet') : null;
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); if (isHelp) closeHelp(); else closeInst(); return; }
    if (e.key !== 'Tab') return;
    const f = [...root.querySelectorAll('button,input,[tabindex="0"]')].filter((x) => !x.disabled && !x.hidden && x.offsetParent !== null), i = f.indexOf(document.activeElement);
    if (!f.length) return;
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }

  // ───────── 앱 설치 안내 (환경 판별·"나중에" 규칙: install.js / 화면: 여기) ─────────
  // 큰 설치 카드(내 구역 맨 위, 설치 전 방문할 때마다) · 앱 안 브라우저 경고 줄 · 브라우저별 안내 시트 · 설정 카드/PC 사이드바의 "앱 설치 방법" · ?installdebug=1 진단 상자.
  // 설치 자체는 브라우저 기능이라 "큰 버튼 + 안내"까지만 한다. 모든 글은 DOM 요소(textContent)로 만들고, 주소는 서버로 보내지 않는다.
  const INS = window.ImjangInstall, insS = { open: false, from: null, installed: false, promptSeen: false };
  const lsGet = (k) => { const s = store1('localStorage'); try { return s ? s.getItem(k) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { const s = store1('localStorage'); try { if (s) s.setItem(k, v); } catch (e) { /* 저장 불가: 이번 화면에서만 */ } };
  const ssGet = (k) => { const s = store1('sessionStorage'); try { return s ? s.getItem(k) : null; } catch (e) { return null; } };
  const ssSet = (k, v) => { const s = store1('sessionStorage'); try { if (s) s.setItem(k, v); } catch (e) { /* */ } };
  function insEnv() {
    if (PWA.canPrompt()) insS.promptSeen = true;
    const n = window.navigator;
    return INS.detectInstallEnv(n.userAgent, { standalone: insS.installed || PWA.isStandalone(), platform: n.platform, maxTouchPoints: n.maxTouchPoints, hasPrompt: insS.promptSeen });
  }
  const insIcon = (kind) => {   // 글자와 함께 그리는 작은 아이콘(⋮ 메뉴, □↑ 공유, ⊕ 설치) — 인라인 SVG
    const s = svg('svg', { viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': kind === 'menu' ? '3.2' : '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    const add = (tag, a) => s.append(svg(tag, a));
    if (kind === 'menu') add('path', { d: 'M12 5h.01M12 12h.01M12 19h.01' });
    else if (kind === 'share') { add('path', { d: 'M12 15V4' }); add('path', { d: 'M8 8l4-4 4 4' }); add('path', { d: 'M6 11H5v9h14v-9h-1' }); }
    else { add('circle', { cx: '12', cy: '12', r: '9' }); add('path', { d: 'M12 8v8M8 12h8' }); }
    return h('span', { class: 'inschip', 'aria-hidden': 'true' }, s);
  };
  async function doPrompt() {
    const r = await PWA.promptInstall();
    if (r === 'accepted') { insS.installed = true; toast('홈 화면에 추가했어요'); }
    renderInstallUI(); if ($('s-home').classList.contains('on')) renderHome();   // 설치 직후 큰 카드를 걷어 낸다
  }
  const onInstallClick = (opener) => { if (PWA.canPrompt()) doPrompt(); else openInst(opener); };
  // 큰 설치 카드: 설치 전(installed·앱 안 브라우저 아님)이고 "나중에"(7일)를 누르지 않았으면 내 구역 맨 위에 보인다.
  // 삼성 인터넷은 설치가 안 될 수 있어 카드에는 [설치하기](크롬·삼성 인터넷 선택 팝업)만 두고(이벤트가 와도 prompt() 를 부르지 않는다), PC 는 "프로그램" 문구를 쓴다.
  function installCardNode() {
    const e = insEnv().env;
    if (e === 'installed' || e === 'inapp' || INS.laterActive(lsGet(INS.LATER_KEY), Date.now())) return null;
    const sam = e === 'samsung', pc = e === 'desktop';
    const add = h('button', { type: 'button', class: 'insbtn go', onclick: () => (sam ? openInst(add) : onInstallClick(add)) }, sam ? '설치하기' : pc ? '프로그램으로 설치' : '홈 화면에 추가');
    const later = h('button', { type: 'button', class: 'insbtn no', onclick: () => { lsSet(INS.LATER_KEY, String(Date.now())); box.remove(); } }, '나중에');
    const box = h('section', { class: 'inscard', 'data-hint': 'install', 'aria-label': sam ? '앱 설치 안내(삼성 인터넷)' : pc ? '프로그램 설치 안내' : '앱 설치 안내' },
      h('div', { class: 'it' }, sam ? '앱으로 설치하기' : pc ? '💻 프로그램처럼 설치하면 더 편해요' : '📲 이 앱을 홈 화면에 추가하세요'),
      h('div', { class: 'id' }, sam ? '삼성 인터넷에서는 설치가 안 될 수 있어요. 크롬에서 설치하는 게 안전해요.' : pc ? '별도 창으로 바로 열려요. 작업 표시줄에 고정해 두고 쓸 수 있어요.' : '주소창 없이 바로 열려요, 현장에서 더 빨라요.'),
      h('div', { class: 'insrow' }, add, later));
    return box;
  }
  // 설정 화면 카드: 설치 여부와 무관하게 "앱 설치 방법"(설치된 앱에서는 숨김). 설치 이벤트가 있으면 [홈 화면에 추가] 버튼도.
  function renderInstallCard() {
    const host = $('installCard'); if (!host) return;
    const e = insEnv().env; host.hidden = e === 'installed'; if (host.hidden) { mount(host); return; }
    const pc = e === 'desktop', prompt = PWA.canPrompt() && e !== 'samsung';   // 삼성 인터넷은 설치 이벤트가 와도 시트의 "시도" 링크로만 부른다
    mount(host, h('div', { style: 'font-weight:700' }, pc ? '프로그램으로 설치하기' : '앱으로 설치하기'),
      h('div', { class: 'sub', style: 'margin:6px 0 10px' }, e === 'inapp' ? '지금은 앱 안 브라우저예요. 크롬으로 열어야 설치할 수 있어요.' : e === 'samsung' ? '삼성 인터넷에서는 설치가 안 될 수 있어요. 크롬에서 설치하는 게 안전해요.' : pc ? '별도 창으로 바로 열려요. 작업 표시줄에 고정해 두고 쓸 수 있어요.' : '앱처럼 바로 열리고, 인터넷이 없는 현장에서도 쓸 수 있어요.'),
      prompt ? h('button', { type: 'button', class: 'btn gold', onclick: doPrompt }, pc ? '프로그램으로 설치' : '홈 화면에 추가') : null,
      h('button', { type: 'button', class: 'btn ghost', style: prompt ? 'margin-top:10px' : null, onclick: (ev) => openInst(ev.currentTarget) }, pc ? '💻 프로그램 설치 방법' : '📲 앱 설치 방법'));
  }
  // 화면 위 경고 줄(앱 안 브라우저) · PC 사이드바 "앱 설치 방법" · 설정 카드 · 진단 상자를 현재 환경에 맞춘다(입장 화면에서는 경고를 띄우지 않는다)
  function renderInstallUI() {
    const env = insEnv(), box = $('inappWarn'), locked = $('s-lock').classList.contains('on');
    const show = env.env === 'inapp' && !ssGet(INS.WARN_KEY) && !locked;
    box.hidden = !show;
    if (show && !box.firstChild) mount(box, h('span', { class: 'iw-t' }, env.ios ? '앱 안 브라우저예요. 사파리로 열어 주세요.' : '앱 안 브라우저예요. 크롬으로 열어 주세요.'),
      h('button', { type: 'button', class: 'insbtn go', onclick: (e) => openInst(e.currentTarget) }, '방법 보기'),
      h('button', { type: 'button', class: 'insbtn no', onclick: () => { ssSet(INS.WARN_KEY, '1'); renderInstallUI(); } }, '닫기'));
    const nv = $('navInstall'); nv.hidden = env.env === 'installed'; nv.querySelector('b').textContent = env.env === 'desktop' ? '💻' : '📲'; nv.lastChild.textContent = env.env === 'desktop' ? '프로그램 설치 방법' : '앱 설치 방법';
    renderInstallCard(); renderInstallDebug();
  }
  function renderInstallDebug() {
    if (!/[?&]installdebug=1\b/.test(window.location.search)) return;
    let box = $('insDebug'); if (!box) { box = h('div', { id: 'insDebug', class: 'insdebug', role: 'status' }); document.body.append(box); }
    const env = insEnv(), n = window.navigator;
    let lsOk = false; try { window.localStorage.setItem('__imjang_probe__', '1'); window.localStorage.removeItem('__imjang_probe__'); lsOk = true; } catch (e) { /* 불가 */ }
    const idbApi = (() => { try { return !!window.indexedDB; } catch (e) { return false; } })();
    const ls = 'localStorage: ' + (lsOk ? '사용 가능' : '불가') + ' / IndexedDB: ';
    mount(box, ['환경: ' + env.env + (env.app ? ' (' + env.app + ')' : ''), 'standalone: ' + (insS.installed || PWA.isStandalone() ? '예' : '아니오'), 'beforeinstallprompt: ' + (insS.promptSeen ? '발생' : '없음'),
      ls + (idbApi ? '확인 중…' : '불가'), 'UA: ' + String(n.userAgent || '').slice(0, 120), '삼성 인터넷 버전: ' + (INS.samsungVersion(n.userAgent) || '해당 없음')].map((t) => h('div', null, t)));
    if (!idbApi) return;
    const line = box.children[3], set = (t) => { line.textContent = ls + t; };
    try { const rq = window.indexedDB.open('__imjang_probe__'); rq.onsuccess = () => { rq.result.close(); try { window.indexedDB.deleteDatabase('__imjang_probe__'); } catch (e) { /* */ } set('사용 가능'); }; rq.onerror = () => set('불가'); } catch (e) { set('불가'); }
  }
  // 주소 복사(항상 제공) — clipboard 가 막히면 선택된 입력칸으로 대신한다 / 크롬으로 열기(실기기에서 먹는지는 미확인 — 실패해도 [주소 복사]로 해결)
  function copyAddr(statusEl, addrEl) {
    const url = INS.cleanUrl(window.location);
    const fallback = () => { addrEl.value = url; addrEl.hidden = false; try { addrEl.focus(); addrEl.select(); addrEl.setSelectionRange(0, url.length); } catch (e) { /* */ } statusEl.textContent = '자동 복사가 안 돼요. 아래 주소를 길게 눌러 복사해 주세요.'; };
    const done = () => { addrEl.hidden = true; statusEl.textContent = '주소를 복사했어요. 크롬(아이폰은 사파리) 주소창에 붙여 넣어 주세요.'; };
    const legacy = () => { try { addrEl.value = url; addrEl.hidden = false; addrEl.focus(); addrEl.select(); addrEl.setSelectionRange(0, url.length); if (document.execCommand && document.execCommand('copy')) { done(); return; } } catch (e) { /* 아래 대체 */ } fallback(); };
    try { if (window.navigator.clipboard && window.navigator.clipboard.writeText) { window.navigator.clipboard.writeText(url).then(done, legacy); return; } } catch (e) { /* 아래 */ }
    legacy();
  }
  function openInChrome(kakao) {
    const url = INS.cleanUrl(window.location), l = window.location;
    if (kakao) { window.location.href = INS.kakaoExternal(url); setTimeout(() => { if (document.visibilityState === 'visible') window.location.href = INS.chromeIntent(l); }, 900); return; }
    window.location.href = INS.chromeIntent(l);
  }
  function instContent(info) {
    const env = info.env, kids = [], btns = [], steps = (...li) => h('ol', null, li.map((x) => h('li', null, x)));
    let title = '홈 화면에 추가하는 방법', chrome = false, kakao = false, copy = false, prompt = false, inline = false;
    if (env === 'inapp') {
      title = '지금은 앱 안 브라우저예요';
      kids.push(h('p', null, '여기서는 설치할 수 없고, 임장 기록이 따로 저장되거나 사라질 수 있어요. ', info.ios ? '사파리로 열어 주세요.' : '크롬으로 열어 주세요.'));
      kids.push(h('p', { class: 'isnote' }, info.ios ? '아이폰: 화면 오른쪽 아래 ⋯ 를 누르고 "다른 브라우저로 열기"(또는 "Safari로 열기")를 눌러 주세요. 메뉴 이름은 앱마다 다를 수 있어요.' : '[크롬으로 열기]가 안 되면 [주소 복사]를 누른 뒤 크롬 주소창에 붙여 넣어 주세요.'));
      chrome = info.android; kakao = info.app === 'kakao'; copy = true;
    } else if (env === 'ios') {
      kids.push(steps(['사파리 아래의 공유 버튼(', insIcon('share'), ')을 누르세요.'], ['"홈 화면에 추가"를 누르세요.'], ['오른쪽 위 "추가"를 누르세요.']));
      kids.push(h('p', { class: 'isnote' }, '크롬·네이버·카카오톡 등에서 열었다면 사파리로 열어 주세요.')); copy = true;
    } else if (env === 'samsung') {
      title = '어디에서 설치할까요?'; inline = true;
      const sStatus = h('p', { class: 'isstatus', role: 'status', 'aria-live': 'polite' });
      const sAddr = h('input', { class: 'isaddr', type: 'text', readonly: true, hidden: true, 'aria-label': '이 페이지 주소' });
      const tryNote = h('p', { class: 'isnote', role: 'status', 'aria-live': 'polite', hidden: true }, '주소창 오른쪽에 설치 아이콘이 보이면 눌러 보세요. 없다면 메뉴의 "홈 화면에 추가"(이름은 버전에 따라 달라요)를 찾아 보세요.');
      kids.push(h('h3', { class: 'ish' }, '① 크롬에서 설치하기', h('span', { class: 'isbadge' }, '추천')),
        h('p', null, '크롬에서는 설치가 잘 돼요'),
        h('button', { type: 'button', class: 'btn gold', onclick: () => openInChrome(false) }, '크롬에서 설치하기'),
        h('p', { class: 'isnote' }, '크롬이 열리지 않거나 없다면'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => copyAddr(sStatus, sAddr) }, '주소 복사'), sStatus, sAddr,
        h('a', { class: 'insbtn no isplay', href: INS.PLAY_CHROME_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Play 스토어에서 Chrome 받기'),
        h('p', { class: 'isnote' }, '대부분의 갤럭시에는 크롬이 이미 들어 있어요(구글 폴더 안에 있기도 해요).'),
        h('h3', { class: 'ish' }, '② 삼성 인터넷에서 설치하기'),
        h('p', null, '"안전하지 않은 앱 차단됨" 같은 안내가 뜨며 막힐 수 있어요'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (PWA.canPrompt()) { closeInst(); doPrompt(); } else tryNote.hidden = false; } }, '삼성 인터넷에서 설치하기'),
        tryNote,
        h('div', { class: 'isnote ishsm' }, '설치 없이 쓰기'),
        h('p', { class: 'isnote' }, '설치하지 않아도 삼성 인터넷에서 그대로 쓸 수 있어요. 즐겨찾기(★)에 추가하거나 메뉴에서 홈 화면 바로가기를 만들어 두면 한 번에 열려요(메뉴 이름은 버전에 따라 달라요). 기록은 쓰는 브라우저에 저장되니 앞으로도 같은 브라우저로 열어 주세요. 브라우저를 바꿀 때는 [저장·설정]의 저장하기 → 불러오기를 쓰세요.'));
    } else if (env === 'chromium') {
      kids.push(steps(['오른쪽 위 ', insIcon('menu'), ' 메뉴를 누르세요.'], ['"앱 설치" 또는 "홈 화면에 추가"를 누르세요.'], ['"설치" 또는 "추가"를 누르세요.']));
      kids.push(h('p', { class: 'isnote' }, '메뉴 이름은 버전에 따라 다를 수 있어요.')); prompt = PWA.canPrompt();
    } else if (env === 'desktop') {
      title = '프로그램으로 설치하는 방법'; copy = true; prompt = PWA.canPrompt();
      kids.push(h('p', null, '주소창 오른쪽의 설치 아이콘(', insIcon('plus'), ')을 눌러 주세요. 파이어폭스·사파리 등 설치 아이콘이 없는 브라우저는 크롬이나 엣지로 열어 주세요.'));
    } else {
      kids.push(h('p', null, '브라우저 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 찾아 주세요. 안 보이면 크롬(아이폰은 사파리)으로 열어 주세요.')); copy = true;
    }
    const status = h('p', { class: 'isstatus', role: 'status', 'aria-live': 'polite' });
    const addr = h('input', { class: 'isaddr', type: 'text', readonly: true, hidden: true, 'aria-label': '이 페이지 주소' });
    if (prompt) btns.push(h('button', { type: 'button', class: 'btn gold', onclick: () => { closeInst(); doPrompt(); } }, env === 'desktop' ? '프로그램으로 설치' : '홈 화면에 추가'));
    if (chrome) btns.push(h('button', { type: 'button', class: 'btn gold', onclick: () => openInChrome(kakao) }, '크롬으로 열기'));
    if (copy) btns.push(h('button', { type: 'button', class: 'btn ' + (chrome || prompt || env === 'samsung' ? 'ghost' : 'gold'), onclick: () => copyAddr(status, addr) }, '주소 복사'));
    btns.push(h('button', { type: 'button', class: 'btn ghost', onclick: closeInst }, '닫기'));
    return { title, kids: inline ? kids : kids.concat([status, addr]), btns };
  }
  function openInst(opener) {
    if (insS.open || helpS.open) return;
    const c = instContent(insEnv());
    $('instTitle').textContent = c.title; mount($('instBody'), c.kids); mount($('instFoot'), c.btns);
    insS.from = opener || document.activeElement; insS.open = true;
    $('instModal').hidden = false; $('app').setAttribute('inert', ''); $('instBody').scrollTop = 0; $('instTitle').focus({ preventScroll: true });
  }
  function closeInst() {
    if (!insS.open) return;
    insS.open = false; $('instModal').hidden = true; $('app').removeAttribute('inert');
    const f = insS.from; insS.from = null; if (f && f.isConnected && f !== document.body && f.focus) f.focus({ preventScroll: true });
  }

  // ───────── 입장 화면 ─────────
  function showLock(msg, disabled) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    $('s-lock').classList.add('on'); setNav(false); $('lockErr').textContent = msg || '';
    $('lockPw').disabled = !!disabled; $('lockForm').querySelector('button').disabled = !!disabled;
    if (!disabled) $('lockPw').focus();
  }

  // ───────── 시작 ─────────
  async function loadData() {
    const get = (f) => fetch('data/' + f, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
    const [items, config, stages, sites] = await Promise.all([get('items.json'), get('config.json'), get('stages.json'), get('sites.json')]);
    D.items = items.items; D.items_meta = items; D.config = config; D.stages = stages.stages; D.stagesFile = stages; D.sites = sites.sites; D.siteNotes = sites.groupNotes || {};
    D.help = await get('help.json').then((j) => (j && typeof j.version === 'number' && j.title && Array.isArray(j.sections) ? j : null)).catch(() => null);   // 사용법 파일을 못 읽어도 앱은 그대로(버튼만 안내)
    tokens = R.buildTokens(config);
    const errs = R.validate(items, config, D.stages);
    if (errs.length) console.warn('항목 데이터 점검 경고', errs);
  }
  // 저장 공간 카드 (저장·설정 화면)
  async function renderSet() {
    const box = $('storageInfo'); if (!store) return;
    const est = await store.estimate(), persisted = await store.getMeta('persisted');
    const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + 'MB';
    mount(box, h('div', null, '저장 방식: ' + (store.kind === 'indexeddb' ? '이 폰의 브라우저 저장소' : '임시(앱을 닫으면 사라짐)')),
      est && est.quota ? h('div', null, '사용 중 ' + mb(est.usage) + ' / 쓸 수 있는 공간 약 ' + mb(est.quota)) : null,
      h('div', null, '영구 보관: ' + (persisted === true ? '허용됨' : persisted === false ? '아직 허용되지 않았어요 (공간이 부족하면 브라우저가 지울 수 있어요)' : '확인할 수 없어요')));
    renderShareTest(); renderBackupCard(); renderInstallCard();
  }
  // 실기기 확인용: 주소 끝에 ?sharetest=1 을 붙였을 때만 보인다. 길이별 더미 글을 공유창으로 보내서
  // 카톡이 어디까지 한 번에 받는지(config.json 의 share.splitChars 추정값) 확인한다. 글 속 【0500】 같은 표시가 몇 번째 글자까지 왔는지 알려 준다.
  function renderShareTest() {
    const host = $('shareTest'); if (!host) return;
    if (!/[?&]sharetest=1\b/.test(location.search)) { host.hidden = true; return; }
    host.hidden = false;
    const dummy = (n) => { let t = '공유 글자 수 테스트 ' + n + '자\n'; for (let i = 100; t.length < n; i += 100) t += '【' + String(i).padStart(4, '0') + '】' + '가나다라마바사아자차카타파하'.repeat(8).slice(0, 94) + '\n'; return t.slice(0, n); };
    mount(host, h('div', { style: 'font-weight:700' }, '공유 글자 수 테스트 (개발용)'),
      h('div', { class: 'sub', style: 'margin:6px 0 10px' }, '길이별 더미 글을 공유창으로 보내요. 카톡에서 받은 글의 마지막 【숫자】가 잘린 지점이에요.'),
      h('div', { class: 'stack', style: 'margin-top:0' }, [1000, 2000, 3000, 5000, 10000].map((n) => h('button', { class: 'btn ghost', onclick: async () => { const r = await sender().sendText(dummy(n)); if (r === 'manual') toast('이 환경에서는 공유·복사가 안 돼요'); } }, n.toLocaleString('ko-KR') + '자 보내기'))));
  }
  async function enter() {
    $('s-lock').classList.remove('on');
    try {
      await loadData();
      const local = window.ImjangAuth.isLocalDev();
      store = await window.ImjangStore.create('auto', { forceUnavailable: local && /[?&]nostorage=1\b/.test(location.search) });
      await store.init();
      bannerState.degraded = !!store.degraded; renderBanner();
      S.zones = await store.listZones();
      S.lastBackupAt = (await store.getMeta('lastBackupAt')) || 0; S.lastRestoreAt = (await store.getMeta('lastRestoreAt')) || 0; S.lastDeleteAt = (await store.getMeta('lastDeleteAt')) || 0;
      if (await recoverJournal()) toast('저장되지 못한 입력을 복구했어요');
      // 영구 보관 요청: 거절돼도 앱은 그대로 동작한다
      store.persist().then((ok) => store.setMeta('persisted', ok)).catch(() => {});
      if (local) window.__imjang = { store, S, D, bannerState, flushAll };   // 로컬 확인용(실서비스 주소에서는 노출하지 않음)
      go('s-home');
      maybeAutoHelp();
      renderInstallUI();
    } catch (e) {
      console.error(e);
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on')); $('s-home').classList.add('on'); setNav(false);
      mount($('homeList'), h('div', { class: 'empty' }, h('b', null, '데이터를 불러오지 못했어요'), h('br'), '인터넷 연결을 확인하고 새로고침해 주세요.'));
    }
  }
  function wire() {
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      if (b.classList.contains('back') && $('s-zone').classList.contains('on') && S.step === 'wrap' && maybeBackupPrompt(b.dataset.go)) return;
      go(b.dataset.go);
    });
    // 외부 사이트 링크: 인터넷이 없으면 이동하지 않고 안내
    document.body.addEventListener('click', (e) => { const a = e.target.closest('a[data-ext]'); if (a && !PWA.online()) { e.preventDefault(); needInternet('외부 사이트는'); } });
    // 의견 보내기: 사이트 공용 위젯(../feedback-widget.js)을 연다. 오프라인이거나 못 불러왔으면 안내만 한다.
    $('btnFeedback').addEventListener('click', () => { const fab = document.getElementById('fwFabBtn'); if (!PWA.online() || !fab) { needInternet('의견 보내기는'); return; } fab.click(); });
    $('btnExport').addEventListener('click', openExport);
    $('btnImport').addEventListener('click', () => $('fileImport').click());
    $('fileImport').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) handleImportFile(f); });
    $('btnNew').addEventListener('click', () => go('s-pick'));
    $('pickQ').addEventListener('input', renderPick);
    $('btnCustom').addEventListener('click', addCustom);
    $('segH').addEventListener('click', () => setMode('hand'));
    $('segF').addEventListener('click', () => setMode('field'));
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
    document.body.addEventListener('click', (e) => { if (e.target.closest('[data-help]')) openHelp(); });
    $('helpClose').addEventListener('click', closeHelp); $('helpX').addEventListener('click', closeHelp);
    $('helpModal').addEventListener('click', (e) => { if (e.target === $('helpModal')) closeHelp(); });
    document.addEventListener('keydown', modalKeys);
    document.body.addEventListener('click', (e) => { const b = e.target.closest('[data-install]'); if (b) openInst(b); });
    $('instX').addEventListener('click', closeInst);
    $('instModal').addEventListener('click', (e) => { if (e.target === $('instModal')) closeInst(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && $('modal').classList.contains('on')) closeModal();    // 팝업: ESC 로 닫기 (바깥 클릭은 위에서)
    });
    // PC 목록에서 입력칸·카드에 들어가면 지금 보는 항목 번호를 기억한다(창 폭이 바뀌어 폰 카드 방식으로 돌아가도 같은 항목을 보여 주려고)
    $('zBody').addEventListener('focusin', (e) => {
      if (!pcStep()) return; const c = e.target.closest && e.target.closest('.pcard'); if (!c) return;
      const i = stepItems().findIndex((x) => x.id === c.dataset.id); if (i >= 0) S.idx = i;
    });
    const dm = mq(DESK);
    const onDesk = () => {
      const on = document.querySelector('.screen.on'); if (!on || on.id === 's-lock') return;
      setNav(navShown(on.id));
      if (on.id === 's-zone' && S.cur) {                                   // 폭이 1024px 을 넘나들면 같은 단계·같은 항목으로 다시 그린다(값은 이미 기록에 있다)
        renderZone();
        if (isDesk() && S.pc) { const it = stepItems()[S.idx], el = it && S.pc.cards.get(it.id); if (el && S.idx > 0) el.scrollIntoView({ block: 'start' }); }
      }
    };
    if (dm.addEventListener) dm.addEventListener('change', onDesk); else if (dm.addListener) dm.addListener(onDesk);
    const sm = mq(SITE2), onSite = () => { if (document.querySelector('#siteList .sgrid')) layoutSiteCols(); };   // 사이트 모음: 폭이 열 수가 바뀌는 선을 넘나들면 카드 자리만 옮긴다
    if (sm.addEventListener) sm.addEventListener('change', onSite); else if (sm.addListener) sm.addListener(onSite);
    // 화면이 가려지거나 앱이 닫힐 때 아직 저장 안 된 글을 바로 저장
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
    window.addEventListener('pagehide', flushAll);
    $('lockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await window.ImjangAuth.submit($('lockPw').value);
      if (ok) { $('lockPw').value = ''; enter(); }
      else { $('lockErr').textContent = '비밀번호가 올바르지 않아요.'; $('lockPw').value = ''; $('lockPw').focus(); }
    });
  }
  async function boot() {
    if (window.__imjangResetting) { document.body.textContent = '앱 저장본을 정리하는 중이에요…'; return; }   // ?resetsw=1: pwa.js 가 정리한 뒤 다시 연다. 사용자 기록은 건드리지 않는다.
    wire(); initPwa();
    const st = await window.ImjangAuth.check();
    if (st === 'ok') enter();
    else if (st === 'locked') showLock('');
    else showLock('입장 설정을 불러오지 못했어요. 새로고침해 주세요.', true);
  }
  boot();
})();
