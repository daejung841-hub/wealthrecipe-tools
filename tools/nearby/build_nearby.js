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
// 목록-3 6차: 시세보정 17-14 연식 기준(준공 2~11년 → 2~15년 → 3곳 미만 빈 목록)이 origin에 오기 전에는 AGE_1714=sim 으로
//   메모리 안 사본의 recommendList 연식 두 줄만 바꿔 실행(원본 파일은 그대로). 17-14 원본이 오면 AGE_1714 없이 다시 빌드해 같은지 확인.
const AGE_OLD = "    const a3 = pick(R.ageMin); if (a3.length >= R.sampleN) return tag(a3, '3~15');\n    const a2 = pick(R.ageMinWide); if (a2.length >= R.ageMinKeep) return tag(a2, '2~15');";
const AGE_SIM = "    const a11 = sel(cand.filter((x) => { const a = age(x); return a !== null && a >= R.ageMinWide && a <= 11; })); if (a11.length >= R.sampleN) return tag(a11, '2~11');\n    const a2 = pick(R.ageMinWide); if (a2.length >= R.ageMinKeep) return tag(a2, '2~15');";
const AGE_MODE = process.env.AGE_1714 === 'sim' ? '17-14 모의(메모리 안에서 연식 두 줄만 바꿔 실행)' : '원본 그대로';
['SBJPick', 'SBJPick7', 'SBJGrade11'].forEach((n) => {
  let src = block(n);
  if (n === 'SBJGrade11' && process.env.AGE_1714 === 'sim') { if (!src.includes(AGE_OLD)) throw new Error('AGE_1714=sim: 원본 연식 줄이 없음(17-14가 이미 들어왔으면 AGE_1714 없이 빌드)'); src = src.replace(AGE_OLD, AGE_SIM); }
  vm.runInContext(src, ctx);
});
vm.runInContext(line('window.SBJ_NON34 = ') + '\n' + line('window.SBJ_RENT16 = '), ctx);
const P = ctx.SBJPick, P7 = ctx.SBJPick7, GR = ctx.SBJGrade11;
// 시세보정 화면 플래그와 같은 값(읽은 줄 그대로 확인): LS17 연식, LS18 34평 아님, LS21 계열 상한, LS22 nearAll, LS26·LS30 임대 필터 기본 켬
const flag = (name, key) => { const m = new RegExp('const ' + name + ' = \\{[^}]*' + key + ': (true|false)').exec(L.join('\n')); if (!m) throw new Error('플래그 없음 ' + name + '.' + key); return m[1] === 'true'; };
const F = { LS17: flag('SBJ12', 'LS17'), LS18: flag('SBJ12', 'LS18'), LS21: flag('SBJ13', 'LS21'), LS22: flag('SBJ13', 'LS22'), LS26: flag('SBJ16', 'LS26'), LS30: flag('SBJ17', 'LS30'), LS56: flag('SBJ179G', 'LS56') };
const GRU = Object.assign({}, GR.SBJ_GRADE_RULES, F.LS22 ? { nearAll: true } : {}, (() => { const m = /const SBJ1714 = \{[^}]*LS63: true/.test(L.join('\n')) && /function GRU\(\)[^\n]*SBJ1714\.LS63[^\n]*ageMax1: (\d+)/.exec(L.join('\n')); return m ? { ageMax1: Number(m[1]) } : {}; })());   // 목록-3 배포: 시세보정 17-14(LS63) 화면처럼 1단계 준공 2~ageMax1년(화면 GRU()의 숫자를 그대로 읽음)
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
  const rec = GR.recommendList(pool, price, c, P7, P, Object.assign({}, GRU, { sampleN: 6 }), ropt);
  return { v: rec.map((x) => [cix(x), Math.round(P.haversineKm(c.center, x) * 1000)]), stage: rec.ageStage };
}
const z = {}, stg = {}, stCnt = {}; let n = 0, none = 0;
for (const r of ROWS) { const k = uid(r); if (k in z) continue; const b = base6(r); n++; if (b && b.v.length) { z[k] = b.v; stg[k] = b.stage; stCnt[b.stage] = (stCnt[b.stage] || 0) + 1; } else none++; }
// 목록-3 6차: 17-14 연식 기준에서 2단계(준공 15년까지)로 넓힌 구역 = st[구역] = 1. 1단계 이름 '2~11'이 하나라도 있을 때만(옛 기준 빌드에서는 비움)
const st = {}; if (stCnt['2~11']) for (const [k, s] of Object.entries(stg)) if (s !== '2~11') st[k] = 1;
// ── 목록-3-1: 급지(시세보정 SBJ_GRADE_RULES·gradeOf·judgeBases를 그대로 실행, 규칙 숫자는 여기서 쓰지 않음) ──
//   grade.rows = 급지 구간표(투자 제외 → 최하(6~8억) → … → 최상) + 급지별 적정 마진 비율(초기·중기·후기, judgeBases = base × 배수)
//   목록-3 4차: 급지·범위·편차에 쓰는 단지(계산 단지) — 5곳이면 최고가 1곳(대장)·최저가 1곳을 뺀 가운데 3곳, 대장이 5곳 중 거리 1위면 대장은 남기고 최저가만 뺌, 3~4곳이면 전체
//   g[구역] = [주의 포함(mark) 목록, 주의 제외(exclude) 목록] 각각 [대장 위치, 대장이 거리 1위 0/1, 급지(mid3·대장 유지), 뺀 위치 비트(mid3·대장 유지), 급지(mid3·대장도 뺌), 뺀 위치 비트(mid3·대장도 뺌), 급지(all5)]
//     위치 = 그 목록(상위 5곳) 안 순서 0~4, 급지 = grade.rows 번호. 목록이 비면 []. 목록표는 이 값만 읽는다(단지 고르기·급지 계산을 다시 하지 않음)
const RU = GR.SBJ_GRADE_RULES, rows = [];
rows.push({ name: '투자 제외', label: '투자 제외', range: [null, RU.excludeAtOrBelow], mult: null, excluded: true });
if (RU.lowSub) rows.push({ name: RU.bands[0].name, label: RU.lowSub.label, range: [RU.excludeAtOrBelow, RU.lowSub.below], mult: RU.lowSub.mult, lowSub: true });   // lowSub = 위 경계 미만(8억은 다음 칸)
RU.bands.forEach((b, i) => rows.push({ name: b.name, label: b.label || b.name, range: [i === 0 ? (RU.lowSub ? RU.lowSub.below : RU.excludeAtOrBelow) : RU.bands[i - 1].upTo, b.upTo], mult: b.mult }));
rows.forEach((r) => { if (r.mult !== null) Object.assign(r, { margin: GR.judgeBases(r.mult, RU) }); });
const rowOf = (g) => (!g ? -1 : g.excluded ? 0 : rows.findIndex((r) => !r.excluded && r.label === (g.label || g.name)));
const gradeIdx = (list) => { if (!list.length) return -1; const avg = list.reduce((s, x) => s + x, 0) / list.length; return rowOf(GR.gradeOf(avg / 10000, GRU)); };
const NMAX = 5, g = {};
// 목록-3 6차(대장 규칙 확정): 5곳이면 — 대장(최고가)이 구역 중심 LEADER_DIST_KM 이내: 최저가만 빼고 대장 가중 LEADER_WEIGHT(4곳 가중 평균)
//   / 그 밖이지만 5곳 중 거리 1위: 최저가만 빼고 4곳 단순 평균 / 그 밖: 가운데 3곳. 3~4곳: 전체 단순 평균.
//   g[구역] = [mark, exclude] 각각 [대장 위치, 방식(0 가운데 3곳·1 거리 1위 포함·2 거리 이내 가중·3 전체), 급지(grade.rows 번호), 뺀 위치 비트, 대장 가중]
const LEADER_DIST_KM = 1.5, LEADER_WEIGHT = 1.5;   // 바꾸면 다시 빌드(급지는 빌드 때 시세보정 gradeOf로 계산)
function pickSet(list) {   // list = [[단지 번호, 거리 m], ...] 상위 5곳
  const n = list.length; if (!n) return [];
  const p = list.map(([ci, d], i) => ({ i, price: C[ci][1], d }));
  const minD = Math.min(...p.map((x) => x.d));
  const lead = p.slice().sort((a, b) => b.price - a.price || a.d - b.d || a.i - b.i)[0];   // 최고가(같으면 가까운 곳 → 추천 순서 앞)
  const low = p.filter((x) => x !== lead).sort((a, b) => a.price - b.price || b.d - a.d || b.i - a.i)[0];   // 최저가(같으면 먼 곳 → 추천 순서 뒤)
  const mode = n < 5 ? 3 : lead.d <= LEADER_DIST_KM * 1000 ? 2 : lead.d === minD ? 1 : 0;
  const cut = mode === 3 ? 0 : mode === 0 ? (1 << low.i) | (1 << lead.i) : 1 << low.i, w = mode === 2 ? LEADER_WEIGHT : 1;
  const use = p.filter((x) => !(cut >> x.i & 1)), sw = use.reduce((s, x) => s + (x === lead ? w : 1), 0);
  const avg = use.reduce((s, x) => s + x.price * (x === lead ? w : 1), 0) / sw;
  return [lead.i, mode, rowOf(GR.gradeOf(avg / 10000, GRU)), cut, w];
}
for (const [k, v] of Object.entries(z)) g[k] = [pickSet(v.slice(0, NMAX)), pickSet(v.filter(([ci]) => !C[ci][3]).slice(0, NMAX))];
// ── 목록-3 8차: 대표님 지정 급지(덮어쓰기). 급지_대표님지정.csv(구역명·시트·지정 급지·지정일·메모) — 구역명 = 목록표 이름(모아타운 하위구역은 "이름 하위구역").
//   자동 급지 계산 뒤 지정 구역만 급지를 바꾸고, 자동 급지는 g 배열 끝(6번째 값)에 남긴다. 이름이 정확히 맞지 않거나 겹치면 멈춘다(비슷한 이름 연결 안 함). 메모는 화면 데이터에 넣지 않는다.
//   파일 두 개: 원본 급지_대표님지정.csv(메모 포함, 작업 폴더에만·배포 안 함) / 공개용 급지_대표님지정_공개.csv(구역명·시트·지정 급지·지정일, 배포 포함).
//   원본이 있으면 원본을 읽고 공개용을 다시 만든다(손으로 고치지 않음). 원본이 없으면(배포 저장소) 공개용만 읽는다. 해시는 공개용 내용 기준이라 어느 쪽에서 돌려도 같다.
const OV_SRC = process.env.OVERRIDE_CSV || path.join(__dirname, '급지_대표님지정.csv');
const OV_PUB = path.join(__dirname, '급지_대표님지정_공개.csv');
const OV_FILE = fs.existsSync(OV_SRC) ? OV_SRC : fs.existsSync(OV_PUB) ? OV_PUB : null;
let ovHash = null, ovN = 0, ovFrom = null;
if (OV_FILE) {
  const raw = fs.readFileSync(OV_FILE, 'utf8').replace(/^﻿/, '');
  const recs = []; let row = [], f = '', q = false;
  for (let i = 0; i < raw.length; i++) { const ch = raw[i]; if (q) { if (ch === '"') { if (raw[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; } if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); recs.push(row); row = []; f = ''; } else if (ch !== '\r') f += ch; }
  if (f || row.length) { row.push(f); recs.push(row); }
  const H = recs[0].map((x) => x.trim()), ci = (h) => { const i = H.indexOf(h); if (i < 0) throw new Error('지정 급지 파일 열 없음: ' + h); return i; };
  const [iN, iS, iG, iD] = [ci('구역명'), ci('시트'), ci('지정 급지'), ci('지정일')];
  const cq = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const live = recs.slice(1).filter((r) => r.some((x) => x.trim()));
  const pubTxt = [['구역명', '시트', '지정 급지', '지정일']].concat(live.map((r) => [iN, iS, iG, iD].map((i) => (r[i] || '').trim()))).map((r) => r.map(cq).join(',')).join('\r\n') + '\r\n';
  ovHash = sha(Buffer.from(pubTxt.replace(/\r\n/g, '\n'), 'utf8'));
  ovFrom = OV_FILE === OV_SRC ? '원본' : '공개용';
  if (ovFrom === '원본' && !process.env.OVERRIDE_CSV && process.env.OV_NO_WRITE !== '1') {
    const iM = H.indexOf('메모'), memos = iM < 0 ? [] : live.map((r) => (r[iM] || '').trim()).filter(Boolean);
    const leak = memos.filter((m) => pubTxt.includes(m)); if (leak.length) throw new Error('공개용 지정 파일에 메모가 섞임 — 멈춤: ' + leak.join(' / '));
    fs.writeFileSync(OV_PUB, '﻿' + pubTxt, 'utf8');
  }
  const disp = (k) => { const [, nm, sub] = k.split('|'); return sub ? nm + ' ' + sub : nm; };
  const byKey = new Map(), problems = [];
  for (const r of recs.slice(1)) {
    if (!r.some((x) => x.trim())) continue;
    const nm = r[iN].trim(), sh = r[iS].trim(), gl = r[iG].trim();
    const keys = Object.keys(g).filter((k) => k.startsWith(sh + '|') && disp(k) === nm);
    const gi = rows.findIndex((x) => !x.excluded && x.label === gl);
    if (keys.length !== 1) problems.push(`${sh} ${nm}: 목록표 구역 ${keys.length}곳과 맞음(정확히 1곳이어야 함)`);
    else if (gi < 0) problems.push(`${sh} ${nm}: 지정 급지 '${gl}'가 급지표에 없음`);
    else if (byKey.has(keys[0])) problems.push(`${sh} ${nm}: 두 번 지정됨`);
    else byKey.set(keys[0], gi);
  }
  if (problems.length) throw new Error('대표님 지정 급지 연결 실패 — 멈춤:\n  ' + problems.join('\n  '));
  for (const [k, gi] of byKey) g[k] = g[k].map((P) => (P.length ? [P[0], P[1], gi, P[3], P[4], P[2]] : P));   // [..., 최종(지정) 급지, ..., 자동 급지]
  ovN = byKey.size;
}
// ── 목록-3 13·14차: 비교 단지 주의(※). 급지 계산에 쓴 단지(주의 포함 목록 기준) 기준 ──
//   (a) 계산 단지 중 구역과 다른 구(경기·인천은 시·군/구) 단지가 절반 초과 → 가장 많은 다른 구 이름
//   (b) 계산 단지 평균 직선거리 > CHK_FAR_KM → 평균 km
//   (c) 구역 중심 CHK_OLD_KM 안에 CHK_OLD_UNITS 세대 이상·준공 CHK_OLD_AGE 년 초과 단지가 추천 목록(6곳)에 없고, 그 단지 34평 현재가가 급지 계산 평균보다 높음
//       → 그중 세대수가 가장 큰 단지 이름. 화면의 메인 ※는 (c)만, (a)(b)는 상세 '자세히 보기' 안 문구로만 씀(14차)
//   w[구역] = [a 다른 구 이름 또는 0, b 평균 km 또는 0, c 단지 이름 또는 0] (하나라도 해당할 때만)
const CHK_FAR_KM = 2, CHK_OLD_KM = 1, CHK_OLD_UNITS = 1000, CHK_OLD_AGE = 25;
const RAW = new Map(); for (const rel of [SRC.seoul, SRC.gi]) { const o = JSON.parse(read(rel)); for (const [k, v] of Object.entries(o)) { if (k === '_meta' || !Array.isArray(v)) continue; const e = { name: v[2] || k, lat: v[0], lng: v[1], units: v[3], by: v[4], gu: v[5] }; for (const n of [k, v[2]]) if (n && !RAW.has(n)) RAW.set(n, e); } }
const RAWL = [...new Set(RAW.values())];
const NAME_ID = new Map(); for (const it of all) if (!NAME_ID.has(it.name)) NAME_ID.set(it.name, it.id);
const zoneOf = {}; for (const r of ROWS) { const k = uid(r); if (!zoneOf[k]) zoneOf[k] = r; }
const w = {};
for (const [k, v] of Object.entries(z)) {
  const P0 = (g[k] || [])[0]; if (!P0 || !P0.length) continue; const r = zoneOf[k];
  const list = v.slice(0, NMAX).map(([ci, d], i) => ({ i, name: C[ci][0], d, p: C[ci][1], gu: (RAW.get(C[ci][0]) || {}).gu }));
  const use = list.filter((x) => !(P0[3] >> x.i & 1));
  const other = use.filter((x) => x.gu && x.gu !== r.gu), cnt = {}; other.forEach((x) => { cnt[x.gu] = (cnt[x.gu] || 0) + 1; });
  const a = other.length * 2 > use.length ? Object.entries(cnt).sort((p, q) => q[1] - p[1])[0][0] : 0;
  const avgKm = use.reduce((s, x) => s + x.d, 0) / use.length / 1000, b = avgKm > CHK_FAR_KM ? Math.round(avgKm * 10) / 10 : 0;
  const inList = new Set(v.map(([ci]) => C[ci][0])), c0 = { lat: r.lat, lng: r.lng };
  const lw = (x) => (x.i === P0[0] && P0[1] === 2 ? P0[4] : 1), calcAvg = use.reduce((s, x) => s + x.p * lw(x), 0) / use.reduce((s, x) => s + lw(x), 0);   // 급지 계산 평균(만원)
  const olds = RAWL.filter((e) => Number.isInteger(e.by) && THIS_YEAR - e.by > CHK_OLD_AGE && (e.units || 0) >= CHK_OLD_UNITS && !inList.has(e.name) && typeof e.lat === 'number' && P.haversineKm(c0, e) <= CHK_OLD_KM && (price(NAME_ID.get(e.name)) || 0) > calcAvg).sort((p, q) => q.units - p.units);
  const c = olds.length ? olds[0].name : 0;
  if (a || b || c) w[k] = [a, b, c];
}
if (rows.some((r, i) => i > 0 && r.mult !== null && !r.margin)) throw new Error('마진표 계산 실패');
const grade = { rows, base: RU.base, note: '경계값과 같으면 아래 급지(시세보정 gradeOf "이하" 규칙)', top: NMAX, src: 'price-correction SBJ_GRADE_RULES · gradeOf · judgeBases' };
const pad = (v) => String(v).padStart(2, '0'), d0 = new Date();
const meta = { made: d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate()) + ' ' + pad(d0.getHours()) + ':' + pad(d0.getMinutes()), month: idx.month, thisYear: THIS_YEAR, rule: 'radius 5km · 준공 연식(시세보정 recommendList) · 34평 KB 현재가 · 34평 아님 제외 · 계열 상한 · 임대 필터 기본 켬 · 추천 6곳(시세보정 base6)', age: AGE_MODE, ageStages: stCnt, check: { farKm: CHK_FAR_KM, oldKm: CHK_OLD_KM, oldUnits: CHK_OLD_UNITS, oldAge: CHK_OLD_AGE }, override: { n: ovN, hash: ovHash }, leader: { distKm: LEADER_DIST_KM, weight: LEADER_WEIGHT }, flags: F, src: hashes, zones: n, withList: n - none, complexes: 0 };
meta.complexes = C.length;
const out = JSON.stringify({ meta, c: C, z, g, st, w, grade });
if (OUT) fs.writeFileSync(OUT, out, 'utf8');
console.log(JSON.stringify({ meta, bytes: Buffer.byteLength(out), overrideFrom: ovFrom }, null, 1));
