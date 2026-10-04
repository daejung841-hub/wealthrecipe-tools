/*
 * 전체 기록 백업 — 파일 만들기 · 검증 · 가져오기 계획 · 알림 판단 (화면·저장소와 무관한 순수 함수, node 에서 테스트)
 *
 * 파일 형식 (JSON 한 개)
 *   { schema:'imjang-backup', version:1, exportedAt:<ms>, appVersion:'…', withPhotos:bool,
 *     zones:[ {id, name, info, infoAsOf, ans, cmp, cmpRows, cmpNote, concl, note, n, createdAt, updatedAt, photos?:[{id,itemId,w,h,createdAt,type,data(base64)}]} ] }
 *
 * 안전 원칙: 파일의 내용은 "허용 목록"에 있는 필드·형식만 골라 새 객체로 다시 만든다(알 수 없는 필드는 버림).
 *            모든 글은 화면에 넣을 때 textContent 로만 쓰이므로, 파일에 스크립트·HTML 이 있어도 글자로만 보인다.
 */
(function (root) {
  'use strict';
  const SCHEMA = 'imjang-backup', VERSION = 2, ZONE_SCHEMA = 2;
const rulesApi = () => ((typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./rules.js') : root.ImjangRules);

  // 이전 version 파일을 지금 형식으로 올리는 자리. MIGRATIONS[n] 은 version n 파일을 n+1 로 바꾼다.
  // 지금은 version 1 만 있어서 비어 있다. (새 version 을 만들 때: VERSION 을 올리고 MIGRATIONS[이전 번호] 를 추가)
  // version 2: 목록표 정보(info)에 단계 이름 목록(stageNames)이 함께 저장된다. version 1 파일은 번호만 있어서 그때의 12단계 이름을 채워 넣는다.
  const fillNames = (R2) => (obj) => Object.assign({}, obj, { version: 2, zones: (obj.zones || []).map((z) => { if (z && typeof z === 'object' && z.info && typeof z.info === 'object') { z.info = Object.assign({}, z.info); R2.fillStageNames(z.info); } return z; }) });
  const MIGRATIONS = { 1: (obj) => fillNames(rulesApi())(obj) };

  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/, KEY_RE = /^[A-Za-z0-9_]{1,24}$/, B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
  const DEFAULT_LIMITS = { maxImportBytes: 60 * 1048576, zones: 200, itemsPerZone: 200, fieldsPerItem: 40, listItems: 100, str: 5000, shortStr: 200, photosPerZone: 150, photoBytes: 5 * 1048576 };

  // ───────── 옛 version 올리기 ─────────
  function upgrade(obj, migrations) {
    const M = migrations || MIGRATIONS, cur = VERSION;
    let v = obj.version, guard = 0;
    while (v < cur) {
      if (!M[v]) throw new Error('이 백업 파일(version ' + v + ')은 지금 앱에서 읽을 수 없어요.');
      obj = M[v](obj); v = obj.version; if (++guard > 20) throw new Error('백업 파일 변환이 끝나지 않아요.');
    }
    return obj;
  }

  // ───────── 허용 목록으로 걸러 내기 ─────────
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const fail = (errs, where, msg) => { errs.push(where + ': ' + msg); return undefined; };
  function str(v, max, errs, where, allowNull) {
    if (v === null || v === undefined) return allowNull ? null : fail(errs, where, '글이 없어요');
    if (typeof v !== 'string') return fail(errs, where, '글이어야 해요');
    if (v.length > max) return fail(errs, where, '너무 길어요(' + max + '자 초과)');
    return v.replace(/\u0000/g, '');
  }
  const numOr = (v, errs, where, allowNull) => (v === null || v === undefined ? (allowNull ? null : fail(errs, where, '숫자가 없어요')) : typeof v === 'number' && Number.isFinite(v) ? v : fail(errs, where, '숫자여야 해요'));

  // 목록표 값 복사본(info) — 앱이 쓰는 필드만
  const INFO_SPEC = { id: 'n', sheet: 's', name: 's', subCode: 's', gu: 's', jibun: 's', dong: 's', stage: 's', stageIdx: 'n', stageNames: 'sa', stageDates: 'dates', hist: 'hist', area: 'n', areaText: 's', landShare: 'n', landShareText: 's', landShareRaw: 's',
    households: 'n', householdsText: 's', members: 'n', generalUnits: 'n', generalRatio: 'n', generalText: 's', est: 'sa', minInitial: 'n', minInitialText: 's', minInitialNote: 's', grade: 's', gradeEst: 'b', estFlag: 's', suspect: 'b' };
  function cleanInfo(raw, L, errs, where) {
    if (raw === null || raw === undefined) return null;
    if (!isObj(raw)) return fail(errs, where, '구역 정보 형식이 아니에요');
    const out = {};
    Object.entries(INFO_SPEC).forEach(([k, t]) => {
      const v = raw[k]; if (v === undefined) return;
      if (v === null) { out[k] = null; return; }
      if (t === 's') { const s = str(v, L.shortStr, errs, where + '.' + k); if (s !== undefined) out[k] = s; }
      else if (t === 'n') { const n = numOr(v, errs, where + '.' + k); if (n !== undefined) out[k] = n; }
      else if (t === 'b') out[k] = !!v;
      else if (t === 'sa') { if (Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === 'string' && x.length <= 40)) out[k] = v.slice(); else fail(errs, where + '.' + k, '목록 형식이 아니에요'); }
      else if (t === 'dates') { if (Array.isArray(v) && v.length <= 30 && v.every((x) => x === null || (typeof x === 'string' && x.length <= 12))) out[k] = v.slice(); else fail(errs, where + '.' + k, '날짜 목록 형식이 아니에요'); }
      else if (t === 'hist') { if (Array.isArray(v) && v.length <= 40 && v.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && x[0].length <= 60 && typeof x[1] === 'string' && x[1].length <= 12)) out[k] = v.map((x) => [x[0], x[1]]); else fail(errs, where + '.' + k, '이력 형식이 아니에요'); }
    });
    return out;
  }

  // 답 모음: ans[항목id][필드키] — 글/숫자/참거짓/글 목록만 허용
  function cleanAns(raw, L, errs, where) {
    if (!isObj(raw)) return fail(errs, where, '답 모음이 없어요');
    const out = {}, items = Object.keys(raw);
    if (items.length > L.itemsPerZone) return fail(errs, where, '항목이 너무 많아요');
    items.forEach((id) => {
      if (!KEY_RE.test(id) || !isObj(raw[id])) return fail(errs, where + '.' + id, '항목 형식이 아니에요');
      const a = {}, keys = Object.keys(raw[id]);
      if (keys.length > L.fieldsPerItem) return fail(errs, where + '.' + id, '필드가 너무 많아요');
      keys.forEach((k) => {
        const v = raw[id][k], w = where + '.' + id + '.' + k;
        if (!KEY_RE.test(k)) return fail(errs, w, '필드 이름이 올바르지 않아요');
        if (typeof v === 'string') { const s = str(v, L.str, errs, w); if (s !== undefined) a[k] = s; }
        else if (typeof v === 'number') { if (Number.isFinite(v)) a[k] = v; else fail(errs, w, '숫자가 올바르지 않아요'); }
        else if (typeof v === 'boolean') a[k] = v;
        else if (Array.isArray(v)) {
          if (v.length > L.listItems) return fail(errs, w, '목록이 너무 길어요');
          const list = []; v.forEach((x) => { if (typeof x === 'string' && x.length <= (k === 'ph' ? 64 : L.shortStr)) list.push(x); else fail(errs, w, '목록 값이 올바르지 않아요'); });
          a[k] = list;
        } else if (v !== null && v !== undefined) fail(errs, w, '지원하지 않는 값 형식이에요');
      });
      out[id] = a;
    });
    return out;
  }

  function cleanZone(raw, i, L, errs, withPhotosAllowed) {
    const where = '구역 ' + (i + 1);
    if (!isObj(raw)) { errs.push(where + ': 구역 형식이 아니에요'); return null; }
    const before = errs.length, z = {};
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errs.push(where + '.id: 구역 번호(id)가 올바르지 않아요'); else z.id = raw.id;
    z.name = str(raw.name, L.shortStr, errs, where + '.name');
    z.info = cleanInfo(raw.info, L, errs, where + '.info');
    z.infoAsOf = raw.infoAsOf == null ? null : str(raw.infoAsOf, 20, errs, where + '.infoAsOf');
    z.ans = cleanAns(raw.ans, L, errs, where + '.ans');
    z.cmp = raw.cmp == null ? '' : str(raw.cmp, L.shortStr, errs, where + '.cmp');
    z.cmpNote = raw.cmpNote == null ? '' : str(raw.cmpNote, L.str, errs, where + '.cmpNote');
    z.concl = raw.concl == null ? '' : str(raw.concl, 20, errs, where + '.concl');
    z.note = raw.note == null ? '' : str(raw.note, L.str, errs, where + '.note');
    z.cmpRows = {};
    if (raw.cmpRows != null) {
      if (!isObj(raw.cmpRows) || Object.keys(raw.cmpRows).length > 30) errs.push(where + '.cmpRows: 형식이 아니에요');
      else Object.entries(raw.cmpRows).forEach(([k, v]) => { if (typeof k === 'string' && k.length <= 60 && typeof v === 'string' && v.length <= 20) z.cmpRows[k] = v; else errs.push(where + '.cmpRows: 값이 올바르지 않아요'); });
    }
    z.n = {};
    if (raw.n != null) {
      if (!isObj(raw.n)) errs.push(where + '.n: 형식이 아니에요');
      else ['y', 'v', 'p', 'i'].forEach((k) => { if (raw.n[k] === undefined || raw.n[k] === null) return; const v = typeof raw.n[k] === 'number' ? String(raw.n[k]) : raw.n[k]; const s = str(v, 30, errs, where + '.n.' + k); if (s !== undefined) z.n[k] = s; });
    }
    z.createdAt = raw.createdAt == null ? null : numOr(raw.createdAt, errs, where + '.createdAt', true);
    z.updatedAt = raw.updatedAt == null ? null : numOr(raw.updatedAt, errs, where + '.updatedAt', true);
    z.photos = [];
    if (raw.photos != null) {
      if (!Array.isArray(raw.photos) || raw.photos.length > L.photosPerZone) errs.push(where + '.photos: 사진 목록이 너무 길거나 형식이 아니에요');
      else raw.photos.forEach((p, j) => {
        const w = where + '.사진' + (j + 1);
        if (!isObj(p)) return errs.push(w + ': 사진 형식이 아니에요');
        if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return errs.push(w + '.id: 올바르지 않아요');
        if (typeof p.itemId !== 'string' || !KEY_RE.test(p.itemId)) return errs.push(w + '.itemId: 올바르지 않아요');
        if (p.type !== 'image/jpeg') return errs.push(w + '.type: JPEG 사진만 가져올 수 있어요');
        if (typeof p.data !== 'string' || !p.data || !B64_RE.test(p.data) || p.data.length % 4 !== 0) return errs.push(w + '.data: 사진 데이터 형식이 아니에요');
        if (p.data.length > Math.ceil(L.photoBytes / 3) * 4) return errs.push(w + '.data: 사진이 너무 커요');
        z.photos.push({ id: p.id, itemId: p.itemId, w: Number.isFinite(p.w) ? p.w : 0, h: Number.isFinite(p.h) ? p.h : 0, createdAt: Number.isFinite(p.createdAt) ? p.createdAt : null, type: 'image/jpeg', data: p.data });
      });
    }
    return errs.length > before ? null : z;
  }

  // ───────── 파일 전체 검증 ─────────
  // text: 파일 내용(글) 또는 이미 읽은 객체. 반환 {ok, errors[], backup, summary}
  function validate(input, limits, migrations) {
    const L = Object.assign({}, DEFAULT_LIMITS, limits || {}), errs = [];
    let obj = input;
    if (typeof input === 'string') {
      if (input.length > L.maxImportBytes) return { ok: false, errors: ['파일이 너무 커요(' + Math.round(L.maxImportBytes / 1048576) + 'MB 초과).'] };
      try { obj = JSON.parse(input); } catch (e) { return { ok: false, errors: ['임장 백업 파일이 아니에요. (JSON 형식이 아니에요)'] }; }
    }
    if (!isObj(obj)) return { ok: false, errors: ['임장 백업 파일이 아니에요.'] };
    if (obj.schema !== SCHEMA) return { ok: false, errors: ['임장 백업 파일이 아니에요. (schema가 "' + SCHEMA + '"가 아니에요)'] };
    if (!Number.isInteger(obj.version) || obj.version < 1) return { ok: false, errors: ['백업 파일의 version이 올바르지 않아요.'] };
    if (obj.version > VERSION) return { ok: false, errors: ['이 백업 파일은 더 새로운 앱(version ' + obj.version + ')에서 만들어졌어요. 이 앱은 version ' + VERSION + '까지 읽을 수 있어요. 앱을 새로 고친 뒤 다시 시도해 주세요.'] };
    try { obj = upgrade(obj, migrations); } catch (e) { return { ok: false, errors: [e.message] }; }
    if (!Array.isArray(obj.zones)) return { ok: false, errors: ['백업 파일에 구역 목록(zones)이 없어요.'] };
    if (obj.zones.length > L.zones) return { ok: false, errors: ['구역이 너무 많아요(' + L.zones + '개 초과).'] };
    if (!Number.isFinite(obj.exportedAt)) return { ok: false, errors: ['백업 날짜(exportedAt)가 없어요.'] };
    const zones = [], seen = new Set();
    obj.zones.forEach((zr, i) => { const z = cleanZone(zr, i, L, errs); if (z) { if (seen.has(z.id)) errs.push('구역 ' + (i + 1) + ': 같은 구역 번호가 두 번 들어 있어요'); seen.add(z.id); zones.push(z); } });
    if (errs.length) return { ok: false, errors: errs.slice(0, 8).concat(errs.length > 8 ? ['…외 ' + (errs.length - 8) + '건'] : []) };
    const photos = zones.reduce((n, z) => n + z.photos.length, 0);
    return { ok: true, errors: [], backup: { schema: SCHEMA, version: VERSION, exportedAt: obj.exportedAt, appVersion: typeof obj.appVersion === 'string' ? obj.appVersion.slice(0, 40) : '', withPhotos: !!obj.withPhotos, zones },
      summary: { zones: zones.length, photos, exportedAt: obj.exportedAt, appVersion: typeof obj.appVersion === 'string' ? obj.appVersion.slice(0, 40) : '', withPhotos: photos > 0 } };
  }

  // ───────── 내보내기 ─────────
  const copyZone = (z) => ({ id: z.id, name: z.name, info: z.info === undefined ? null : z.info, infoAsOf: z.infoAsOf == null ? null : z.infoAsOf, ans: z.ans || {}, cmp: z.cmp || '', cmpRows: z.cmpRows || {}, cmpNote: z.cmpNote || '', concl: z.concl || '', note: z.note || '', n: z.n || {}, createdAt: z.createdAt == null ? null : z.createdAt, updatedAt: z.updatedAt == null ? null : z.updatedAt });
  // photosByZone: {구역id: [{id,itemId,w,h,createdAt,type,data}]}  (사진 포함일 때만 넣는다)
  function build(opts) {
    const o = Object.assign({ zones: [], photosByZone: null, withPhotos: false, now: Date.now(), appVersion: '' }, opts);
    return { schema: SCHEMA, version: VERSION, exportedAt: o.now, appVersion: o.appVersion, withPhotos: !!o.withPhotos,
      zones: o.zones.map((z) => { const c = copyZone(z); if (o.withPhotos) c.photos = (o.photosByZone && o.photosByZone[z.id]) || []; return c; }) };
  }
  const textBytes = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : Buffer.byteLength(s));
  // 구역 하나의 예상 크기(바이트): 글은 JSON 길이, 사진은 base64 부풀림(4/3) + 항목당 약 200바이트
  function estimateZone(z, photoBytesList, withPhotos) {
    const text = textBytes(JSON.stringify(copyZone(z)));
    const photos = withPhotos ? (photoBytesList || []).reduce((a, b) => a + Math.ceil(b / 3) * 4 + 200, 0) : 0;
    return { text, photos, total: text + photos };
  }
  // 상한을 넘으면 구역을 나눠 받을 묶음을 짠다. 한 구역이 혼자 상한을 넘으면 oversize 에 담는다.
  function planParts(items, limit) {
    const parts = [], oversize = []; let cur = [], size = 0;
    items.forEach((it) => {
      if (it.bytes > limit) { oversize.push(it.id); return; }
      if (cur.length && size + it.bytes > limit) { parts.push(cur); cur = []; size = 0; }
      cur.push(it.id); size += it.bytes;
    });
    if (cur.length) parts.push(cur);
    return { parts, oversize };
  }
  const pad = (n) => String(n).padStart(2, '0');
  function fileName(date, withPhotos, part, total) {
    const d = new Date(date), ymd = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return 'imjang_backup_' + (withPhotos ? 'photos_' : '') + ymd + (total > 1 ? '_' + part + 'of' + total : '') + '.json';
  }

  // ───────── 가져오기 계획 ─────────
  // clean: validate 가 돌려준 backup. existingIds: 지금 있는 구역 id 들. decisions: {구역id: 'overwrite'|'keep'|'skip'} (충돌 구역만 의미 있음, 기본 keep)
  // 반환 plan = { zones:[새로 저장할 구역], photos:[{id,zoneId,itemId,w,h,createdAt,data}], deleteZoneIds:[덮어쓸 구역 id], stats }
  function planImport(clean, existingIds, decisions, makeId) {
    const exist = new Set(existingIds), dec = decisions || {}, mk = makeId || ((p) => p + Math.random().toString(36).slice(2, 10));
    const plan = { zones: [], photos: [], deleteZoneIds: [], stats: { zones: 0, added: 0, overwritten: 0, keptBoth: 0, skipped: 0, photos: 0, droppedPhotoRefs: 0 } };
    clean.zones.forEach((z) => {
      const conflict = exist.has(z.id), choice = conflict ? (dec[z.id] || 'keep') : 'add';
      if (choice === 'skip') { plan.stats.skipped++; return; }
      const nz = JSON.parse(JSON.stringify(z)); delete nz.photos;
      if (choice === 'keep') { nz.id = mk('z'); nz.name = String(z.name).replace(/ \(복원\)$/, '') + ' (복원)'; plan.stats.keptBoth++; }
      else if (choice === 'overwrite') { plan.deleteZoneIds.push(z.id); plan.stats.overwritten++; } else plan.stats.added++;
      // 사진 id 는 항상 새로 매겨서 다른 구역과 겹치지 않게 한다. 사진 데이터가 없는 ph 참조는 지운다.
      const idMap = {};
      z.photos.forEach((p) => { const nid = mk('ph'); idMap[p.id] = nid; plan.photos.push({ id: nid, zoneId: nz.id, itemId: p.itemId, w: p.w, h: p.h, createdAt: p.createdAt || Date.now(), data: p.data }); plan.stats.photos++; });
      Object.values(nz.ans).forEach((a) => { if (Array.isArray(a.ph)) { const kept = a.ph.filter((x) => idMap[x]).map((x) => idMap[x]); plan.stats.droppedPhotoRefs += a.ph.length - kept.length; if (kept.length) a.ph = kept; else delete a.ph; } });
      plan.zones.push(nz);
    });
    plan.stats.zones = plan.zones.length;
    return plan;
  }

  // ───────── 백업 알림 판단 ─────────
  // zones: 지금 구역들(updatedAt/createdAt 있음), lastBackupAt: 마지막 백업 시각(없으면 0/null), lastDeleteAt: 마지막 구역 삭제 시각
  function reminder(o) {
    // lastRestoreAt: 백업 파일로 복원한 시각. 복원 직후의 기록은 그 파일과 같으므로 "백업 이후 바뀐 내용"으로 보지 않는다.
    const zones = o.zones || [], now = o.now || Date.now(), days = o.days || 7, last = Math.max(o.lastBackupAt || 0, o.lastRestoreAt || 0);
    if (!zones.length) return { due: false, never: !last, changed: false, daysSince: null };
    const lastChange = Math.max(o.lastDeleteAt || 0, ...zones.map((z) => z.updatedAt || z.createdAt || 0));
    const changed = lastChange > last;
    // 한 번도 백업 안 했으면, 가장 오래된 기록을 만든 날부터 센다
    const base = last || Math.min(...zones.map((z) => z.createdAt || z.updatedAt || now));
    const daysSince = Math.floor((now - base) / 86400000);
    return { due: changed && daysSince >= days, never: !last, changed, daysSince };
  }

  // ───────── base64 ─────────
  function bytesToB64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // config.json 의 backup 설정(MB 단위) → validate 가 쓰는 상한(바이트)
  function limitsFromConfig(b) {
    const l = (b && b.limits) || {};
    return Object.assign({}, DEFAULT_LIMITS, l, { maxImportBytes: ((b && b.maxImportMB) || 60) * 1048576, photoBytes: (l.photoMB || 5) * 1048576 });
  }

  const api = { limitsFromConfig, SCHEMA, VERSION, MIGRATIONS, DEFAULT_LIMITS, upgrade, validate, build, estimateZone, planParts, fileName, planImport, reminder, bytesToB64, b64ToBytes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
