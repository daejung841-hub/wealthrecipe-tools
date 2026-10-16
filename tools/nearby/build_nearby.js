// 목록표 구역별 '주변 아파트' 목록 미리 만들기(2026-10-16 대표님 승인 B안). 시세보정 코드·데이터는 읽기만 한다.
// 시세보정 화면과 같은 경로: 목록표에서 불러온 구역(좌표·세대수, 준공연도 없음) → 임대 필터 기본 켬 → 추천 6곳(base6).
//   경기·인천 구역(시트 '경기인천')은 서울 + 경기·인천 좌표(LS56), 그 밖은 서울 좌표만.
// 사용: node build_nearby.js <배포 저장소 폴더> <목록표 HTML> [출력 JSON]
//   출력: {"meta":{...해시...},"c":[[단지명, 34평 현재가(만원), 준공연도, 주의 배지 0/1], ...],"z":{"시트|구역명|세부":[[단지 번호(c), 직선거리 m], ...]}}  (추천 순서 그대로, 최대 6곳)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const REPO = process.argv[2], LIST = process.argv[3], OUT = process.argv[4];
const SRC = { pc: 'price-correction/index.html', idx: 'benchmark-calculator/complex_index.json', seoul: 'price-correction/data/seoul_coords_v3.json', gi: 'price-correction/data/gi_coords_v1.json' };
const read = (rel) => fs.readFileSync(path.join(REPO, rel));
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
const lf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');   // 줄바꿈 차이(CRLF 작업 사본)를 해시에서 무시
const hashes = Object.fromEntries(Object.entries(SRC).map(([k, rel]) => [k, sha(lf(read(rel)))]));
// ── 시세보정 함수 블록(이름으로 찾기: root.SBJPick / SBJPick7 / SBJGrade11, window.SBJ_NON34 / SBJ_RENT16) ──
const L = read(SRC.pc).toString('utf8').replace(/\r\n/g, '\n').split('\n');
function block(apiName) {
  const e = L.findIndex((l) => l.trim() === 'root.' + apiName + ' = api;'); if (e < 0) throw new Error('블록 없음 ' + apiName);
  let s = e; while (s >= 0 && L[s].trim() !== '(function (root) {') s--; if (s < 0) throw new Error('블록 시작 없음 ' + apiName);
  let t = e; while (t < L.length && !/^\}\)\(typeof window/.test(L[t])) t++; return L.slice(s, t + 1).join('\n');
}
const line = (pre) => { const x = L.find((l) => l.startsWith(pre)); if (!x) throw new Error('줄 없음 ' + pre); return x; };
const ctx = { console, URLSearchParams, location: { search: '' } }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
['SBJPick', 'SBJPick7', 'SBJGrade11'].forEach((n) => vm.runInContext(block(n), ctx));
vm.runInContext(line('window.SBJ_NON34 = ') + '\n' + line('window.SBJ_RENT16 = '), ctx);
const P = ctx.SBJPick, P7 = ctx.SBJPick7, GR = ctx.SBJGrade11;
// 시세보정 화면 플래그와 같은 값(읽은 줄 그대로 확인): LS17 연식, LS18 34평 아님, LS21 계열 상한, LS22 nearAll, LS26·LS30 임대 필터 기본 켬
const flag = (name, key) => { const m = new RegExp('const ' + name + ' = \\{[^}]*' + key + ': (true|false)').exec(L.join('\n')); if (!m) throw new Error('플래그 없음 ' + name + '.' + key); return m[1] === 'true'; };
const F = { LS17: flag('SBJ12', 'LS17'), LS18: flag('SBJ12', 'LS18'), LS21: flag('SBJ13', 'LS21'), LS22: flag('SBJ13', 'LS22'), LS26: flag('SBJ16', 'LS26'), LS30: flag('SBJ17', 'LS30'), LS56: flag('SBJ179G', 'LS56') };
const GRU = F.LS22 ? Object.assign({}, GR.SBJ_GRADE_RULES, { nearAll: true }) : GR.SBJ_GRADE_RULES;
const NON34 = new Set(ctx.SBJ_NON34.ids || []), RENT = ctx.SBJ_RENT16.ids || {};
const ropt = { non34: F.LS18 ? NON34 : null, ageRule: F.LS17, familyCap: F.LS21 ? GR.SBJ_GRADE_RULES.familyCap : null };
// ── 데이터 ──
const seoul = P.parseCoords(JSON.parse(read(SRC.seoul))).items, gi = P.parseCoords(JSON.parse(read(SRC.gi))).items;
const sids = new Set(seoul.map((x) => x.id)), all = seoul.concat(gi.filter((x) => !sids.has(x.id)));
const IJ = JSON.parse(read(SRC.idx)), IF = IJ._meta.fields, pi = IF.indexOf('현재가'), bi = IF.indexOf('배지');
const idx = P7.parsePriceIndex(IJ); if (!idx || !idx.ok) throw new Error('현재가 인덱스 읽기 실패');
const price = (id) => idx.get(id), warn = (id) => ((IJ[id] || [])[bi] === '주의' ? 1 : 0);
const THIS_YEAR = Number((process.env.THIS_YEAR || new Date().getFullYear()));
// ── 목록표 구역 ──
const html = fs.readFileSync(LIST, 'utf8').replace(/\r\n/g, '\n');   // 작업 사본이 CRLF여도 같은 결과
const a = html.indexOf('const REDEV_DATA = ') + 19; const ROWS = JSON.parse(html.slice(a, html.indexOf(';\n', a)));
const C = [], CI = new Map();
const cix = (x) => { if (!CI.has(x.id)) { CI.set(x.id, C.length); C.push([x.name, x.price, x.builtYear, warn(x.id)]); } return CI.get(x.id); };
const uid = (r) => [r.sheet || '', r.name || '', r.subCode === null || r.subCode === undefined ? '' : String(r.subCode)].join('|');
function base6(r) {
  if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return null;
  const items = r.sheet === '경기인천' && F.LS56 ? all : seoul;
  const c = { center: { lat: r.lat, lng: r.lng }, radiusKm: 5, targetYear: null, targetUnits: Number.isInteger(r.households) && r.households > 0 ? r.households : null, thisYear: THIS_YEAR };
  let pool = items;
  if (F.LS26 && F.LS30) { const fOn = GR.rentFilterList(items, price, c, P7, P, GRU, ropt, (id) => RENT[id] || null, new Set()); const sk = new Set(fOn.skip); pool = items.filter((it) => !sk.has(it.id)); }
  return GR.recommendList(pool, price, c, P7, P, Object.assign({}, GRU, { sampleN: 6 }), ropt).map((x) => [cix(x), Math.round(P.haversineKm(c.center, x) * 1000)]);
}
const z = {}; let n = 0, none = 0;
for (const r of ROWS) { const k = uid(r); if (k in z) continue; const v = base6(r); n++; if (v && v.length) z[k] = v; else none++; }
const pad = (v) => String(v).padStart(2, '0'), d0 = new Date();
const meta = { made: d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate()) + ' ' + pad(d0.getHours()) + ':' + pad(d0.getMinutes()), month: idx.month, thisYear: THIS_YEAR, rule: 'radius 5km · 준공 3~15년(부족하면 2~15) · 34평 KB 현재가 · 34평 아님 제외 · 계열 상한 · 임대 필터 기본 켬 · 추천 6곳(시세보정 base6)', flags: F, src: hashes, zones: n, withList: n - none, complexes: 0 };
meta.complexes = C.length;
const out = JSON.stringify({ meta, c: C, z });
if (OUT) fs.writeFileSync(OUT, out, 'utf8');
console.log(JSON.stringify({ meta, bytes: Buffer.byteLength(out) }, null, 1));
