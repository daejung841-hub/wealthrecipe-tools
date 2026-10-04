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

  // ───────── 상태 ─────────
  const D = {};                        // 불러온 데이터: items, config, stages, sites, zonesSample
  const S = { zones: [], cur: null, step: 'info', idx: 0, mode: 'hand' };
  let store, tokens;
  const zone = () => S.zones.find((z) => z.id === S.cur);
  const T = (s) => R.interp(s, tokens);                    // {토큰} → config 값
  const shortName = (n) => String(n).replace(/ \([^)]*\)/, '');   // 첫 괄호("(구 동)")만 뗀다 — 뒤의 "(복원)"은 남긴다
  const NONE = '정보 없음';
  const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== '';

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
  function go(id) {
    if (id !== 's-zone') revokeUrls();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    $(id).classList.add('on');
    const main = ['s-home', 's-sites', 's-set'].includes(id);
    $('nav').hidden = !main;
    $('nav').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === id));
    if (id === 's-home') renderHome();
    if (id === 's-pick') renderPick();
    if (id === 's-sites') renderSites();
    if (id === 's-set') renderSet();
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
    const hint = installHintNode();
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
  function setMode(m) { S.mode = m; S.step = D.items_meta.modes[m][0]; S.idx = 0; renderZone(); }
  function setStep(s) { S.step = s; S.idx = 0; renderZone(); }
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
  function updTop() { const z = zone(), p = prog(z); $('zCount').textContent = p.done + ' / ' + p.total + ' 완료'; $('zBar').style.width = p.pct + '%'; }

  // ───────── 입력 처리 ─────────
  function ensure(id) { const z = zone(); z.ans[id] = z.ans[id] || {}; return z.ans[id]; }
  function pick(id, k, o, multi) {
    const a = ensure(id);
    if (multi) { a[k] = a[k] || []; const i = a[k].indexOf(o); i >= 0 ? a[k].splice(i, 1) : a[k].push(o); }
    else a[k] = a[k] === o ? '' : o;
    persist(zone()); keepScroll(renderZone);
  }
  function addOther(id, k, input) {
    const v = (input.value || '').trim(); if (!v) return;
    const a = ensure(id); a[k + 'X'] = a[k + 'X'] || []; if (!a[k + 'X'].includes(v)) a[k + 'X'].push(v);
    persist(zone()); keepScroll(renderZone);
  }
  function delOther(id, k, i) { (ensure(id)[k + 'X'] || []).splice(i, 1); persist(zone()); keepScroll(renderZone); }
  function typ(id, k, v) { ensure(id)[k] = v; persist(zone(), 300); updTop(); updFlag(id); }

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
    if (zone() && zone().id === z.id && S.step) keepScroll(renderZone);
  }
  async function removePhoto(itemId, photoId) {
    const z = zone(), a = ensure(itemId);
    a.ph = (a.ph || []).filter((x) => x !== photoId);
    persist(z); // 기록에서 먼저 빼고(글은 안전), 그다음 사진 본체를 지운다
    try { await store.deletePhoto(photoId); } catch (e) { console.error(e); }
    keepScroll(renderZone);
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
        h('button', { disabled: full, onclick: () => cam.click() }, '📷 사진 찍기'),
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
          return h('button', { class: 'chip' + (f.sm ? ' sm' : '') + (on ? ' on' : '') + (bad ? ' bad' : ''), onclick: () => pick(it.id, f.k, o, multi) }, T(o));
        }),
        (a[f.k + 'X'] || []).map((o, i) => h('button', { class: 'chip' + (f.sm ? ' sm' : '') + ' on', onclick: () => delOther(it.id, f.k, i) }, o + ' ✕'))));
      if (f.other) {
        const inp = h('input', { type: 'text', placeholder: '기타 직접 추가 (브랜드·업종 이름)' });
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
    mount(body, h('div', { class: 'card' },
      h('div', { style: 'font-weight:700;font-size:18px' }, shortName(z.name)), h('div', { class: 'sub' }, subline),
      h('div', { class: 'flab', style: 'margin-top:16px' }, '진행 단계'), stageBlock(i),
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
        infoCell('평균 대지지분', i.landShare, i.landShareText, { fmt: (v) => v + '평' })),
      h('div', { class: 'sub', style: 'margin-top:12px' }, '부의 레시피 재개발 목록표 ' + (z.infoAsOf || '') + ' 기준 값을 복사해 둔 기록이에요. 이후 목록표가 바뀌어도 이 기록은 그대로예요.')));
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
  function renderCmpPick(it, z) {
    const inp = h('input', { type: 'text', placeholder: '비교단지 이름 (예: 옆 동네 대단지)', value: z.cmp || '', oninput: (e) => { z.cmp = e.target.value; persist(z, 300); updTop(); } });
    return h('div', { class: 'card' }, h('div', { class: 'q' }, T(it.q)), h('div', { class: 'why' }, T(it.why)), inp,
      h('button', { class: 'btn navy', style: 'margin-top:10px', onclick: openCalcConfirm }, '📊 ' + D.config.calculator.label + '에서 시세 보기'),
      h('div', { class: 'sub', style: 'margin-top:8px' }, '단지 검색과 시세는 계산기에서 확인해요. 이름은 여기에 적어 두세요.'));
  }
  function renderCmpGrid(it, z) {
    const C = D.items_meta.comparison, r = z.cmpRows || {};
    return h('div', { class: 'card' }, h('div', { class: 'q' }, T(it.q)), h('div', { class: 'why' }, T(it.why)),
      C.rows.map((n) => h('div', { class: 'cmprow' }, h('div', { style: 'font-weight:700' }, n),
        h('div', { class: 'chips', style: 'margin:6px 0 0' }, C.grades.map((o) => h('button', { class: 'chip xs' + (r[n] === o ? ' on' : '') + (r[n] === o && (o === '나쁨' || o === '매우 나쁨') ? ' bad' : ''), onclick: () => cmpSet(n, o) }, o))))),
      cmpSummaryNode(z),
      h('textarea', { placeholder: '종합 한 줄: 완공 후 비교단지와 어느 정도 대접받을까?', value: z.cmpNote || '', oninput: (e) => { z.cmpNote = e.target.value; persist(z, 300); } }));
  }
  function cmpSet(n, o) { const z = zone(); z.cmpRows = z.cmpRows || {}; if (z.cmpRows[n] === o) delete z.cmpRows[n]; else z.cmpRows[n] = o; persist(z); keepScroll(renderZone); }

  // ───────── 항목 카드 ─────────
  function itemCard(it, z, its) {
    if (it.type === 'tip') return h('div', { class: 'card' }, h('div', { class: 'sub' }, '💡 질문 요령'), h('div', { class: 'q' }, T(it.q)), it.lines.map((l) => h('p', { style: 'margin:10px 0;line-height:1.6' }, T(l))));
    if (it.custom === 'cmpPick') return renderCmpPick(it, z);
    if (it.custom === 'cmpGrid') return renderCmpGrid(it, z);
    const a = z.ans[it.id] || {};
    return h('div', { class: 'card' }, h('div', { class: 'sub' }, (S.idx + 1) + ' / ' + its.length),
      h('div', { class: 'q' }, T(it.q), it.badge ? h('span', { class: 'badge' }, it.badge) : null),
      h('div', { class: 'why' }, T(it.why || '')),
      it.where ? h('div', { class: 'where' }, '🔎 확인할 수 있는 곳: ', h('b', null, T(it.where))) : null,
      it.fields.map((f) => fieldNode(it, f, a)),
      h('div', { id: 'flagbox' }, flagNode(it, z)),
      it.photo ? photoBlock(it, a) : null,
      it.guide || it.script ? h('details', null, h('summary', null, '어떻게 확인하나요?'), it.guide ? h('p', null, T(it.guide)) : null, it.script ? h('p', { class: 'script' }, T(it.script)) : null) : null);
  }

  function renderZone() {
    const z = zone(), meta = D.items_meta;
    revokeUrls();
    $('zName').textContent = shortName(z.name); updTop();
    $('segH').classList.toggle('on', S.mode === 'hand'); $('segF').classList.toggle('on', S.mode === 'field');
    $('segHint').textContent = S.mode === 'hand' ? '손품을 이미 끝냈다면 "현장 임장"으로 바로 가셔도 돼요' : '손품이 아직이라면 "손품"으로 돌아가 먼저 채워 보세요';
    mount($('tabs'), meta.modes[S.mode].map((s) => {
      const its = R.visibleInStep(D.items, s, z.ans, D.config).filter(countable), dn = its.filter((i) => R.isDone(i, z)).length;
      return h('button', { class: s === S.step ? 'on' : '', onclick: () => setStep(s) }, meta.steps[s], its.length ? h('small', null, dn + '/' + its.length) : null);
    }));
    if (S.step === 'info') { renderInfo(z); mount($('pager'), h('button', { class: 'btn gold', onclick: () => nextStep(1) }, '손품 체크 시작')); return; }
    if (S.step === 'wrap') { renderWrap(); return; }
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
  function updConc() { const e = $('concPrev'); if (e) mount(e, concNode(zone())); }
  function setN(k, v) { const z = zone(); z.n = z.n || {}; z.n[k] = v; persist(z, 300); updConc(); }
  function renderWrap() {
    const z = zone(), fl = flagsOf(z), p = prog(z), open = R.openItems(D.items, z, D.config), n = z.n || {};
    const inp = (k, ph, suf) => h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' },
      h('input', { type: 'number', inputmode: 'decimal', step: 'any', placeholder: ph, value: n[k] === undefined ? '' : n[k], oninput: (e) => setN(k, e.target.value), style: 'flex:1' }), h('span', { style: 'white-space:nowrap;font-weight:700' }, suf));
    const cs = cmpSummaryNode(z), qText = (it) => T(it.q).replace(/\?$/, '');
    mount($('zBody'), h('div', { class: 'sum' },
      h('div', { class: 'sumcard' }, h('div', { class: 'dim' }, z.name), h('div', { class: 'big' }, p.pct + '% 확인 완료'),
        h('h3', null, '위험·주의 신호 ' + fl.length + '건'), h('ul', null, fl.length ? fl.map((x) => h('li', null, (x.f.lv === 2 ? '🚩' : '⚠') + ' ' + qText(x.it))) : h('li', null, '아직 없어요')),
        h('h3', null, '아직 못 확인한 것 ' + open.length + '건'), h('ul', null, open.slice(0, 4).map((it) => h('li', null, qText(it))), open.length > 4 ? h('li', null, '외 ' + (open.length - 4) + '건') : null)),
      cs ? [h('h3', null, '비교단지 대비 입지'), cs] : null,
      h('h3', null, '내 결론 · 4개 숫자'),
      h('div', { class: 'card' }, inp('y', '2033', '년에'), inp('v', '15', '억짜리 아파트를'), inp('p', '8', '억에 사온다'), inp('i', '500', '만원 필요'),
        h('div', { id: 'concPrev', class: 'hint solid', style: 'margin:6px 0 0;font-size:16px' })),
      h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { style: 'font-weight:700' }, '몇 억짜리가 될지 모르겠다면?'), h('div', { class: 'sub', style: 'margin:4px 0 10px' }, '비교 대상 아파트 시세부터 확인해 보세요.'),
        h('button', { class: 'btn navy', onclick: openCalcConfirm }, '📊 비교대상 아파트 ' + D.config.calculator.label, h('small', null, '계산기에서 단지 이름 검색하기')),
        h('button', { class: 'btn ghost', style: 'margin-top:10px;opacity:.6', onclick: () => toast('시세 보정 기능은 준비 중이에요') }, '🛠 시세 보정하기 ', h('span', { class: 'flagtag mute' }, '준비 중'))),
      h('h3', null, '이 구역, 내 판단은?'),
      h('div', { class: 'chips' }, ['매수 검토', '보류', '패스'].map((o) => h('button', { class: 'chip' + (z.concl === o ? ' on' : ''), onclick: () => { z.concl = z.concl === o ? '' : o; persist(z); keepScroll(renderZone); } }, o))),
      h('textarea', { placeholder: '근거 3줄 + 다음에 다시 가서 확인할 것', value: z.note || '', oninput: (e) => { z.note = e.target.value; persist(z, 300); } }),
      h('button', { class: 'btn gold', style: 'margin-top:14px', onclick: openShare }, '💬 결론만 카톡으로 보내기'),
      h('div', { class: 'sub', style: 'margin:6px 2px 0' }, '결론 한 장을 글이나 이미지로 보내요. 받은 사람은 이 앱에 들어오지 않아도 볼 수 있어요.'),
      backupNoticeNode(true),
      h('button', { class: 'btn ghost', style: 'margin-top:12px', onclick: () => go('s-set') }, '💾 전체 기록 백업 (이어서 쓸 때만)')));
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
  const HINT_KEY = 'imjang_pwa_hint_v1';
  const installPlatform = () => (PWA.isStandalone() ? null : PWA.canPrompt() ? 'prompt' : PWA.isIOS() ? 'ios' : PWA.isAndroid() ? 'android' : null);
  function installCardNodes() {
    const p = installPlatform(); if (!p) return null;
    const title = h('div', { style: 'font-weight:700' }, '홈 화면에 추가하기');
    if (p === 'prompt') return [title, h('div', { class: 'sub', style: 'margin:6px 0 10px' }, '앱처럼 바로 열리고, 인터넷이 없는 현장에서도 쓸 수 있어요.'), h('button', { class: 'btn gold', onclick: async () => { const r = await PWA.promptInstall(); if (r === 'accepted') toast('홈 화면에 추가했어요'); renderInstallCard(); } }, '홈 화면에 추가')];
    if (p === 'ios') return [title, h('div', { class: 'sub', style: 'margin-top:6px;line-height:1.7' }, 'Safari 아래의 공유 버튼(□에 ↑) → "홈 화면에 추가"를 누르세요. 홈 화면의 아이콘으로 열면 주소창 없이 앱처럼 열려요.'), h('div', { class: 'sub', style: 'margin-top:6px;line-height:1.7;font-weight:700' }, '홈 화면에 추가한 뒤에는 그 아이콘으로만 쓰세요. 브라우저와 기록이 따로 저장될 수 있어요.')];
    return [title, h('div', { class: 'sub', style: 'margin-top:6px;line-height:1.7' }, 'Chrome 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"를 누르세요.')];
  }
  function renderInstallCard() {
    const host = $('installCard'); if (!host) return;
    const n = installCardNodes(); host.hidden = !n; mount(host, n);
  }
  // 첫 방문 때 한 번만 가볍게(홈 맨 위): 한 번 보여 주면 다음부터는 설정 화면에서만 안내한다
  function installHintNode() {
    if (!installPlatform()) return null;
    try { if (localStorage.getItem(HINT_KEY)) return null; localStorage.setItem(HINT_KEY, '1'); } catch (e) { return null; }
    const box = h('div', { class: 'hint', style: 'margin-bottom:12px' }, '💡 홈 화면에 추가하면 앱처럼 바로 열리고 인터넷이 없어도 쓸 수 있어요. ',
      h('button', { class: 'linkbtn', onclick: () => go('s-set') }, '방법 보기'), ' · ', h('button', { class: 'linkbtn', onclick: () => box.remove() }, '닫기'));
    return box;
  }
  function initPwa() {
    PWA.onUpdate(() => { $('updateBar').hidden = false; });
    PWA.onInstallChange(() => { renderInstallCard(); });
    $('btnUpdate').addEventListener('click', async () => { $('btnUpdate').disabled = true; toast('저장을 마치고 새 버전으로 바꿀게요'); const ok = await PWA.applyUpdate(() => flushAll()); if (!ok) $('btnUpdate').disabled = false; });
    PWA.register();
    window.addEventListener('offline', () => toast('인터넷이 끊겼어요. 기록은 계속 쓸 수 있어요'));
  }

  // ───────── 사이트 모음 ─────────
  function renderSites() {
    const groups = [...new Set(D.sites.map((s) => s.group))];
    mount($('siteList'), groups.map((g) => [h('h3', { style: 'margin:14px 0 8px' }, g), D.sites.filter((s) => s.group === g).map((s) =>
      h('div', { class: 'card site' }, h('span', { class: 'tag' }, g), h('div', null,
        h('div', { style: 'font-weight:700' }, s.url ? h('a', { href: s.url, 'data-ext': '1' }, s.title) : s.title),
        h('div', { class: 'sub' }, s.desc), s.url ? null : h('div', { class: 'sub badtxt' }, '주소 미확인'))))]));
  }

  // ───────── 입장 화면 ─────────
  function showLock(msg, disabled) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    $('s-lock').classList.add('on'); $('nav').hidden = true; $('lockErr').textContent = msg || '';
    $('lockPw').disabled = !!disabled; $('lockForm').querySelector('button').disabled = !!disabled;
    if (!disabled) $('lockPw').focus();
  }

  // ───────── 시작 ─────────
  async function loadData() {
    const get = (f) => fetch('data/' + f, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
    const [items, config, stages, sites] = await Promise.all([get('items.json'), get('config.json'), get('stages.json'), get('sites.json')]);
    D.items = items.items; D.items_meta = items; D.config = config; D.stages = stages.stages; D.stagesFile = stages; D.sites = sites.sites;
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
    } catch (e) {
      console.error(e);
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on')); $('s-home').classList.add('on'); $('nav').hidden = true;
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
    $('btnExport').addEventListener('click', openExport);
    $('btnImport').addEventListener('click', () => $('fileImport').click());
    $('fileImport').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) handleImportFile(f); });
    $('btnNew').addEventListener('click', () => go('s-pick'));
    $('pickQ').addEventListener('input', renderPick);
    $('btnCustom').addEventListener('click', addCustom);
    $('segH').addEventListener('click', () => setMode('hand'));
    $('segF').addEventListener('click', () => setMode('field'));
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
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
