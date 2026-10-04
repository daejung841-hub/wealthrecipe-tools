/*
 * 저장 어댑터 — 앱은 이 인터페이스로만 기록을 읽고 쓴다. (M2: IndexedDB 구현 + 메모리 대체 구현)
 *
 * 인터페이스 (모든 메서드는 Promise)
 *   init()                       준비
 *   listZones()                  → zone[]  (만든 순서)
 *   getZone(id) / putZone(zone)  putZone 은 zone.updatedAt 을 갱신
 *   deleteZone(id)               구역과 그 구역의 사진을 한 번에 지운다
 *   applyImport(plan)            백업 가져오기를 한 번에(전부 반영되거나 전부 취소). plan={zones[], photos[], deleteZoneIds[]}
 *   putPhoto(photo)              photo = {id, zoneId, itemId, blob, w, h, bytes, createdAt}
 *   getPhoto(id) / deletePhoto(id) / listPhotos(zoneId)
 *   getMeta(key) / setMeta(key, value)
 *   estimate()                   → {usage, quota} | null      persist() → true|false|null
 *   kind                         'indexeddb' | 'memory'
 *   degraded                     true 면 저장이 안 되는 환경(메모리로 동작 중)
 *
 * 오류: 용량 초과는 err.code === 'quota', 그 밖의 저장 실패는 'io'.
 * IndexedDB 스키마: DB 'imjang' / 버전 DB_VERSION / 스토어 zones(id), photos(id; 인덱스 zoneId), meta(key).
 *   버전을 올릴 때는 onupgradeneeded 의 MIGRATIONS 에 한 단계씩 추가한다(이전 버전 데이터를 지우지 않는다).
 * 브라우저 localStorage 키는 반드시 "imjang_" 로 시작한다(다른 도구와 충돌 방지).
 */
(function (root) {
  'use strict';
  const DB_NAME = 'imjang', DB_VERSION = 1, ZONE_SCHEMA = 2;   // 구역 기록 형식: 2 = 목록표 정보에 단계 이름(stageNames)이 함께 저장됨
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

  function storeError(e) {
    const err = new Error(e && e.message ? e.message : '저장 실패');
    const name = e && e.name;
    err.code = name === 'QuotaExceededError' || (e && e.code === 22) || /quota/i.test(String(name)) ? 'quota' : 'io';
    err.cause = e; return err;
  }
  // 오류 흉내(테스트 전용): store.__inject = {putZone:'quota'} 처럼 두면 그 메서드가 한 번 그 오류로 실패한다.
  function injected(store, method) {
    const code = store.__inject && store.__inject[method];
    if (!code) return null;
    delete store.__inject[method];
    const e = new Error('주입된 오류'); e.name = code === 'quota' ? 'QuotaExceededError' : 'InjectedError'; return e;
  }

  // ───────── 메모리 구현 (IndexedDB 를 못 쓸 때의 대체 / 테스트용) ─────────
  function createMemoryStore(opts) {
    const zones = new Map(), photos = new Map(), meta = new Map();
    const st = {
      kind: 'memory', degraded: !!(opts && opts.degraded), reason: (opts && opts.reason) || null,
      init: () => Promise.resolve(),
      listZones: () => Promise.resolve([...zones.values()].map(clone)),
      getZone: (id) => Promise.resolve(zones.has(id) ? clone(zones.get(id)) : null),
      putZone(zone) {
        const e = injected(st, 'putZone'); if (e) return Promise.reject(storeError(e));
        const z = clone(zone); z.updatedAt = Date.now(); if (!z.createdAt) z.createdAt = z.updatedAt; z.schema = ZONE_SCHEMA;
        zones.set(z.id, z); return Promise.resolve();
      },
      deleteZone(id) { zones.delete(id); [...photos.values()].filter((p) => p.zoneId === id).forEach((p) => photos.delete(p.id)); return Promise.resolve(); },
      // 가져오기: 전부 반영되거나 전부 취소(실패하면 시작 전 상태로 되돌린다)
      applyImport(plan) {
        const e = injected(st, 'applyImport'); if (e) return Promise.reject(storeError(e));
        const snap = { z: new Map(zones), p: new Map(photos) };
        try {
          plan.deleteZoneIds.forEach((id) => { zones.delete(id); [...photos.values()].filter((p) => p.zoneId === id).forEach((p) => photos.delete(p.id)); });
          const now = Date.now();
          plan.zones.forEach((zone) => { const z = clone(zone); z.updatedAt = now; if (!z.createdAt) z.createdAt = now; z.schema = ZONE_SCHEMA; zones.set(z.id, z); });
          plan.photos.forEach((p) => { if (!p || !p.id) throw new Error('사진 기록이 올바르지 않아요'); photos.set(p.id, Object.assign({}, p)); });
          if (st.__inject && st.__inject.importMidway) { delete st.__inject.importMidway; throw new Error('주입된 중간 실패'); }
          return Promise.resolve();
        } catch (err) { zones.clear(); snap.z.forEach((v, k) => zones.set(k, v)); photos.clear(); snap.p.forEach((v, k) => photos.set(k, v)); return Promise.reject(storeError(err)); }
      },
      putPhoto(p) { const e = injected(st, 'putPhoto'); if (e) return Promise.reject(storeError(e)); photos.set(p.id, Object.assign({}, p)); return Promise.resolve(); },
      getPhoto: (id) => Promise.resolve(photos.has(id) ? Object.assign({}, photos.get(id)) : null),
      deletePhoto: (id) => { photos.delete(id); return Promise.resolve(); },
      listPhotos: (zoneId) => Promise.resolve([...photos.values()].filter((p) => p.zoneId === zoneId).map((p) => Object.assign({}, p))),
      getMeta: (k) => Promise.resolve(meta.has(k) ? clone(meta.get(k)) : undefined),
      setMeta: (k, v) => { meta.set(k, clone(v)); return Promise.resolve(); },
      estimate: () => Promise.resolve(null),
      persist: () => Promise.resolve(null),
    };
    return st;
  }

  // ───────── IndexedDB 구현 ─────────
  const MIGRATIONS = {
    // 버전 1: 처음 만들기
    1(db) {
      db.createObjectStore('zones', { keyPath: 'id' });
      const ph = db.createObjectStore('photos', { keyPath: 'id' }); ph.createIndex('zoneId', 'zoneId', { unique: false });
      db.createObjectStore('meta', { keyPath: 'key' });
    },
    // 버전 2 이상이 필요해지면 여기에 2(db, tx) {...} 를 추가한다. 기존 스토어는 지우지 않는다.
  };
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(storeError(r.error)); });
  const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(storeError(tx.error)); tx.onabort = () => rej(storeError(tx.error)); });

  function openDb() {
    return new Promise((resolve, reject) => {
      const idb = root.indexedDB;
      if (!idb) return reject(new Error('indexedDB 없음'));
      let r; try { r = idb.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      r.onupgradeneeded = (ev) => {
        const db = r.result, tx = r.transaction;
        for (let v = (ev.oldVersion || 0) + 1; v <= (ev.newVersion || DB_VERSION); v++) if (MIGRATIONS[v]) MIGRATIONS[v](db, tx);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('indexedDB 열기 실패'));
      r.onblocked = () => reject(new Error('indexedDB 가 다른 탭에 막혀 있음'));
    });
  }
  // 옛 형식 구역 기록을 지금 형식으로 올린다(스키마 번호가 올라갈 때 여기에 추가).
  const RR = (typeof require !== 'undefined') ? require('./rules.js') : root.ImjangRules;
  function upgradeZone(z) {
    if (!z.schema || z.schema < 2) { if (RR && z.info) RR.fillStageNames(z.info); z.schema = ZONE_SCHEMA; }   // 1 → 2: 번호만 저장된 단계에 이름을 채운다
    return z;
  }

  async function createIdbStore() {
    const db = await openDb();
    // 사용 중 다른 탭이 버전을 올리면 닫아 준다
    db.onversionchange = () => db.close();
    const st = {
      kind: 'indexeddb', degraded: false,
      init: () => Promise.resolve(),
      async listZones() { const tx = db.transaction('zones'); const all = await req(tx.objectStore('zones').getAll()); return all.map(upgradeZone).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
      async getZone(id) { const z = await req(db.transaction('zones').objectStore('zones').get(id)); return z ? upgradeZone(z) : null; },
      async putZone(zone) {
        const e = injected(st, 'putZone'); if (e) throw storeError(e);
        const z = clone(zone); z.updatedAt = Date.now(); if (!z.createdAt) z.createdAt = z.updatedAt; z.schema = ZONE_SCHEMA;
        const tx = db.transaction('zones', 'readwrite'); tx.objectStore('zones').put(z); await done(tx);
      },
      async deleteZone(id) {
        const tx = db.transaction(['zones', 'photos'], 'readwrite');
        tx.objectStore('zones').delete(id);
        const idx = tx.objectStore('photos').index('zoneId');
        const keys = await req(idx.getAllKeys(id)); keys.forEach((k) => tx.objectStore('photos').delete(k));
        await done(tx);
      },
      // 한 번의 트랜잭션으로 처리해서, 중간에 하나라도 실패하면 브라우저가 전체를 되돌린다(부분 반영 없음)
      applyImport(plan) {
        return new Promise((resolve, reject) => {
          const e = injected(st, 'applyImport'); if (e) return reject(storeError(e));
          let tx;
          try {
            tx = db.transaction(['zones', 'photos'], 'readwrite');
            tx.oncomplete = () => resolve(); tx.onabort = () => reject(storeError(tx.error || new Error('가져오기가 취소됐어요'))); tx.onerror = () => {};
            const zs = tx.objectStore('zones'), ps = tx.objectStore('photos'), now = Date.now();
            plan.deleteZoneIds.forEach((id) => { const r = ps.index('zoneId').getAllKeys(id); r.onsuccess = () => r.result.forEach((k) => ps.delete(k)); });
            plan.zones.forEach((zone) => { const z = clone(zone); z.updatedAt = now; if (!z.createdAt) z.createdAt = now; z.schema = ZONE_SCHEMA; zs.put(z); });
            plan.photos.forEach((p) => ps.put(p));
            if (st.__inject && st.__inject.importMidway) { delete st.__inject.importMidway; throw new Error('주입된 중간 실패'); }
          } catch (err) { try { tx && tx.abort(); } catch (x) { /* 이미 끝남 */ } reject(storeError(err)); }
        });
      },
      async putPhoto(p) {
        const e = injected(st, 'putPhoto'); if (e) throw storeError(e);
        const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(p); await done(tx);
      },
      getPhoto: async (id) => (await req(db.transaction('photos').objectStore('photos').get(id))) || null,
      async deletePhoto(id) { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').delete(id); await done(tx); },
      listPhotos: (zoneId) => req(db.transaction('photos').objectStore('photos').index('zoneId').getAll(zoneId)),
      async getMeta(k) { const r = await req(db.transaction('meta').objectStore('meta').get(k)); return r ? r.value : undefined; },
      async setMeta(k, v) { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: k, value: v }); await done(tx); },
      async estimate() { try { return root.navigator.storage && root.navigator.storage.estimate ? await root.navigator.storage.estimate() : null; } catch (e) { return null; } },
      async persist() { try { return root.navigator.storage && root.navigator.storage.persist ? await root.navigator.storage.persist() : null; } catch (e) { return null; } },
    };
    // 실제로 쓸 수 있는지 한 번 확인(일부 사생활 보호 모드는 열리지만 쓰기가 막힌다)
    await st.setMeta('schemaVersion', DB_VERSION);
    return st;
  }

  // kind: 'auto'(기본) | 'memory'. auto 는 IndexedDB 를 시도하고 안 되면 degraded 메모리로 물러난다.
  async function create(kind, opts) {
    if (kind === 'memory') return createMemoryStore();
    const forceOff = opts && opts.forceUnavailable;
    try {
      if (forceOff) throw new Error('테스트: IndexedDB 불가');
      // 일부 환경(사생활 보호 모드)에서는 열기가 응답 없이 멈추기도 해서 시간 제한을 둔다
      return await Promise.race([createIdbStore(), new Promise((_, rej) => setTimeout(() => rej(new Error('IndexedDB 응답 없음')), (opts && opts.timeoutMs) || 5000))]);
    } catch (e) {
      return createMemoryStore({ degraded: true, reason: String((e && e.message) || e) });
    }
  }

  const api = { create, createMemoryStore, DB_NAME, DB_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
