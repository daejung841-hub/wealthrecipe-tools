// 계산기 묶음 L75(156단계) 적정가 보정 표 만들기 — seed(KB 시세)·좌표 파일이 바뀌면 다시 돌린다.
//
// 사용: node tools/fair_l75/build_l75_table.js <계산기 폴더> [--write <HTML> ...] [--out <표 JSON>] [--coords <좌표 폴더>]
//   <계산기 폴더>: 벤치마크_배율_계산기.html + shared.js·seedComplexes.js·seedComplexes25.js·seedChips.js·m2Series.js (보통 benchmark-calculator/)
//   --write: 그 HTML의 /*L75_TABLE*/…/*END_L75_TABLE*/ 와 /*L75_META*/…/*END_L75_META*/ 사이를 새 표로 바꾼다(개발본·배포본 둘 다 줄 수 있음).
//   --coords: 좌표 폴더(기본 price-correction/data — 저장소 루트 기준). seoul_coords_v3.json·gi_coords_v1.json을 쓴다.
//   걸리는 시간 약 2~3분(6,326칸을 계산기 함수로 계산).
//
// 규칙(152~154단계 체감 시험 → 156단계 결정, 배수·기준값은 잠정). 먼저 L75를 끄고 배율 모델(L71) 적정가를 낸 뒤:
//  ① 보조 1(전고점 회복): 현재 배율 ÷ 평균 배율(L71 기준) < 0.85이고 현재가 ÷ 2021~22 매매 고점 ≥ 0.70인 칸에
//     전고점 × (1 + 선도단지 전고 대비 초과율 × β)를 미회복 정도만큼 섞는다: 비중 = (0.85 − 비율) ÷ 0.25(0~1).
//     β = 동조율 등급 상수(아주나쁨 0.3·나쁨 0.4·보통 0.5·좋음 0.6·아주좋음 0.75), 준공 28년 이상 +0.1.
//  ② 보조 2(인근 서열): 이력 96개월 미만 칸은 같은 시·구 3km 안 이력 긴 단지(변동계수 ≤ 9%, 평소 비율 0.8~1.25) 적정가 × 평소 비율(상한 1.10)을
//     이력 짧을수록 크게 섞는다(비중 (96 − 개월) ÷ 60). 같은 시·구 현재가 상위 30% 단지끼리 평소 비율 0.95~1.10이면 낮은 쪽을 올린다.
//  ③ 원칙 6(서열 유지): 3km 안, 최근 8년 매매 비율 변동계수 ≤ 9%, 평소 비율 1.02~1.15, 전세도 높은 쌍에서 높은 쪽은
//     상대 적정가 × 평소 비율 아래로 내려가지 않는다(한 번만, 올리기만). 기준 쪽 이력 96개월 이상·겹친 달 60개월 이상인 쌍만.
//     시·구 경계를 넘는 쌍은 서울 밖(경기·인천)끼리만, 서울이 끼면 같은 구 안만.
//  ④ 올림 상한: 배율 모델 대비 +20%.
//  ⑤ 원칙 7(전세가율 상한, 서울 밖): 보조로 올린 몫을 최근(2023-01 이후) 전세 고점 × 1.05 ÷ 2021~22 매매 고점 달 전세가율까지만 인정.
//  서울 선도단지 구성원은 모든 단계에서 뺀다. 이력 부족(L28) 칸도 뺀다.
// 표 한 줄: "평형|seed id": [배율 모델 목표 배율(만들 때), 보정 배수, 근거 코드(1 전고점·2 주변 단지·3 전세 상한), 근거 상대 seed id]
// 메타: 만들 때 seed·좌표 파일 해시(줄바꿈을 LF로 맞춘 md5 앞 8자리) — build_l52_versions.py --check가 지금 seed와 비교해 경고한다.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { loadApp } = require('./load_app.js');
const args = process.argv.slice(2);
const DIR = path.resolve(args[0] || '');
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const writes = []; args.forEach((a, i) => { if (a === '--write') writes.push(args[i + 1]); });
const REPO = path.resolve(__dirname, '..', '..');
const COORDS = path.resolve(opt('--coords') || path.join(REPO, 'price-correction', 'data'));
const CROSS_SEOUL = args.includes('--cross-seoul');   // 156 첫 판(서울도 시·구 경계 넘는 쌍 허용) 재현용 — 평소에는 쓰지 않는다
if (!fs.existsSync(path.join(DIR, '벤치마크_배율_계산기.html'))) { console.error('사용: node build_l75_table.js <계산기 폴더> [--write <HTML>] [--out <JSON>]'); process.exit(2); }
const hash8 = (f) => crypto.createHash('md5').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
const CFG = { U: 0.85, W: 0.70, capUp: 1.20, delta: 0.1, beta: { veryLow: 0.3, low: 0.4, mid: 0.5, high: 0.6, veryHigh: 0.75 }, mCap: 1.10, leadQ: 0.3, km: 3, cv: 0.09 };
const t0 = Date.now();

// ---- 1. 계산기로 칸마다 배율 모델(L71) 값과 재료 ----
const A = loadApp(DIR);
vm.runInContext(fs.readFileSync(path.join(DIR, 'seedComplexes25.js'), 'utf8'), A);
vm.runInContext(fs.readFileSync(path.join(DIR, 'seedChips.js'), 'utf8'), A);
vm.runInContext('SEED25_BY_ID = new Map(window.SEED_COMPLEXES_25.map(e => [e.id, e])); _seed25IdByText = new Map(window.SEED_COMPLEXES_25.map(e => [e.text, e.id])); seed25State = "loaded";', A);
const P = JSON.parse(vm.runInContext(`JSON.stringify((() => {
  if (!BUNDLES.L71) throw new Error('L71 꺼짐 — L75 표는 L71 위에서 만든다');
  if ('L75' in BUNDLES) setBundles({ L75: false });   // 보정 전(배율 모델) 값
  const ORIG = fairTargetL71; let CAP = null;
  fairTargetL71 = function(base, comp, full, saleYms, avgFull, factorInfo){ const o = ORIG(base, comp, full, saleYms, avgFull, factorInfo);
    const seed = seedEntryByName(stripPyeongSuffix(comp.name)); const outside = !!(seed && seed.regionCity && seed.regionCity !== '서울');
    const ratioAt = ym => comp.rowMap.get(ym).saleMid / base.rowMap.get(ym).saleMid * 100;
    const avg8 = outside ? yearlyAvg(saleYms.slice(-L71_WINDOW_MONTHS), ratioAt) : null; CAP = avg8 != null ? avg8 : avgFull; return o; };
  const byId = new Map(window.SEED_COMPLEXES.map(e => [e.id, e])); const leaders = new Set(BENCHMARK_GROUPS.seoul.members);
  const cells = []; window.SEED_COMPLEXES.forEach(e => { if (e.text) cells.push([e, 34, e.text, e.name]); });
  window.SEED_COMPLEXES_25.forEach(x => { const e = byId.get(x.id); if (e && x.text) cells.push([e, 25, x.text, e.name + '(25평)']); });
  const peakOf = (rowMap, f) => { let m = null, at = null; rowMap.forEach((v, ym) => { if (ym >= 202101 && ym <= 202212 && v[f] != null && (m == null || v[f] > m)){ m = v[f]; at = ym; } }); return [m, at]; };
  const rows = [];
  cells.forEach(([e, p, text, nm]) => {
    const comp = buildComplex(text, nm, nm); comp._pyeong = p; if (!comp.rows.length) return;
    const g = pickBenchGroupForTarget(e.name).groupKey; const base = getVirtualBenchmarkComplex(g);
    CAP = null; const r = computeSlot(base, comp); if (!r || r.error) return;
    const full = commonYms(base.rowMap, comp.rowMap); const cur = latestWithField(full, base.rowMap, comp.rowMap, 'saleMid', 'saleMid');
    const real = computeSyncRate(base, comp); let rise = real ? real.compCycle.rise : null, tier = real ? real.calcTier : null;
    if (tier == null){ const est = findSyncRateEstimate(comp); if (est){ tier = est.tier; if (rise == null && est.avgRawRise != null) rise = est.avgRawRise; } }
    const [peak, peakYm] = peakOf(comp.rowMap, 'saleMid');
    const yms = [...comp.rowMap.keys()].sort((a, b) => a - b).slice(-96); const ser = {}; yms.forEach(ym => { const v = comp.rowMap.get(ym); ser[ym] = [v.saleMid, v.jeonseMid]; });
    rows.push({ k: p + '|' + e.id, id: e.id, p, name: e.name, rc: e.regionCity, di: e.district || '', g, leader: leaders.has(e.name), age: complexAge(e.builtYear),
      cur: cur ? cur.c : null, curB: cur ? cur.b : null, fair: r.fairSale, avgT: CAP, short: !!(r.diag && r.diag.shortL28),
      months: full.filter(ym => base.rowMap.get(ym).saleMid != null && comp.rowMap.get(ym).saleMid != null).length, rise, tier, peak, peakYm, ser });
  });
  fairTargetL71 = ORIG;
  const bs = getVirtualBenchmarkComplex('seoul'); const bpk = peakOf(bs.rowMap, 'saleMid');
  const bys = [...bs.rowMap.keys()].filter(ym => bs.rowMap.get(ym).saleMid != null).sort((a, b) => a - b);
  return { rows, bench: { peak: bpk[0], last: bs.rowMap.get(bys[bys.length - 1]).saleMid } };
})())`, A));
const t1 = Date.now();

// ---- 2. 규칙 ----
const rows = P.rows; const byK = new Map(rows.map(r => [r.k, r])); const E = P.bench.last / P.bench.peak - 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
rows.forEach(r => { r.curR = r.cur && r.curB ? r.cur / r.curB * 100 : null; r.rr = r.curR != null && r.avgT ? r.curR / r.avgT : null; r.rec = r.peak && r.cur ? r.cur / r.peak : null;
  r.tierUse = r.tier; if (!r.tierUse && r.p === 25){ const s = byK.get('34|' + r.id); if (s) r.tierUse = s.tier; } r.old = r.age != null && r.age >= 28;
  let jp = null; for (const [ym, v] of Object.entries(r.ser)) if (+ym >= 202301 && v[1] && (jp == null || v[1] > jp)) jp = v[1];
  let jr = null; if (r.peakYm){ for (const dd of [0, -1, 1, -2, 2]){ let ym = r.peakYm + dd; if (ym % 100 === 0) ym -= 88; if (ym % 100 === 13) ym += 88; const v = r.ser[ym]; if (v && v[0] && v[1]){ jr = v[1] / v[0]; break; } } }
  r.cap7 = jp && jr ? jp * 1.05 / jr : null; });
const coords = {}; for (const f of ['seoul_coords_v3.json', 'gi_coords_v1.json']){ const o = JSON.parse(fs.readFileSync(path.join(COORDS, f), 'utf8')); for (const [k, v] of Object.entries(o)) if (k !== '_meta' && Array.isArray(v)) coords[k] = [v[0], v[1]]; }
const hav = (a, b) => { const R = 6371, d2r = Math.PI / 180; const x = Math.sin((b[0] - a[0]) * d2r / 2) ** 2 + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin((b[1] - a[1]) * d2r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const pairStat = (a, b) => { const rs = [], js = []; for (const ym of Object.keys(a.ser)){ const x = a.ser[ym], y = b.ser[ym]; if (!y) continue; if (x[0] && y[0]) rs.push(x[0] / y[0]); if (x[1] && y[1]) js.push(x[1] / y[1]); }
  if (rs.length < 12) return null; const m = rs.reduce((s, v) => s + v, 0) / rs.length; const sd = Math.sqrt(rs.reduce((s, v) => s + (v - m) ** 2, 0) / (rs.length - 1)); const mj = js.length ? js.reduce((s, v) => s + v, 0) / js.length : null; return { n: rs.length, m, cv: sd / m, mj }; };
const cand = r => !(r.short || !r.fair || !coords[r.id] || r.g !== 'seoul' || r.leader);
const groups = {}; rows.forEach(r => { if (!cand(r)) return; const key = r.p + '|' + r.rc + '|' + r.di; (groups[key] = groups[key] || []).push(r); });
const riseOf = r => r.rise != null ? r.rise : (r.p === 25 && byK.get('34|' + r.id) ? byK.get('34|' + r.id).rise : null);
const okShort = (a, b) => { if (b === a || b.months < 96) return null; const ra = riseOf(a), rb = riseOf(b); if (ra != null && rb != null && rb < ra - 5) return null;
  const d = hav(coords[a.id], coords[b.id]); if (d > CFG.km) return null; const s = pairStat(a, b); if (!s || s.cv > CFG.cv || s.mj == null || (s.m - 1) * (s.mj - 1) < 0 || s.m < 0.8 || s.m > 1.25) return null; return Object.assign({ base: b.k, d }, s); };
const shortPairs = {};
for (const p of [34, 25]) for (const list of Object.values(groups)) for (const a of list){ if (a.months >= 96 || a.p !== p) continue; let pick = null;
  if (p === 25){ const p34 = shortPairs['34|' + a.id]; if (p34){ const b = byK.get('25|' + p34.base.slice(3)); if (b && list.includes(b)) pick = okShort(a, b); } }
  if (!pick) for (const b of list){ const q = okShort(a, b); if (q && (!pick || q.cv < pick.cv)) pick = q; }
  if (pick) shortPairs[a.k] = pick; }
const leadPairs = {}; for (const list of Object.values(groups)){ const L = list.filter(r => r.months >= 96).sort((a, b) => b.cur - a.cur); const lead = L.slice(0, Math.max(2, Math.ceil(L.length * CFG.leadQ)));
  for (const a of lead){ let pick = null; for (const b of lead){ if (b === a) continue; const d = hav(coords[a.id], coords[b.id]); if (d > CFG.km) continue; const s = pairStat(a, b);
      if (!s || s.cv > CFG.cv || s.mj == null || (s.m - 1) * (s.mj - 1) < 0 || s.m < 0.95 || s.m > 1.10) continue; if (!pick || s.cv < pick.cv) pick = Object.assign({ base: b.k, d }, s); }
    if (pick) leadPairs[a.k] = pick; } }
const orderPairs = []; { const byP = {}; rows.forEach(r => { if (cand(r)) (byP[r.p] = byP[r.p] || []).push(r); });
  for (const list of Object.values(byP)) for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++){ if (i === j) continue; const hi = list[i], lo = list[j];
    if (Math.abs(coords[hi.id][0] - coords[lo.id][0]) > 0.03) continue;
    const same = hi.rc === lo.rc && hi.di === lo.di; if (!same && !CROSS_SEOUL && (hi.rc === '서울' || lo.rc === '서울')) continue;   // 서울이 끼면 같은 구 안만
    const d = hav(coords[hi.id], coords[lo.id]); if (d > CFG.km) continue; const s = pairStat(hi, lo); if (!s || s.cv > CFG.cv || s.m < 1.02 || s.m > 1.15 || s.mj == null || s.mj < 1) continue;
    if (lo.months < 96 || s.n < 60) continue;   // 확실한 쌍
    orderPairs.push(Object.assign({ hi: hi.k, lo: lo.k, d, cross: !same }, s)); } }
const F = {}, CODE = {}, PART = {};
rows.forEach(r => { let v = r.fair; F[r.k] = v; if (r.leader || r.short || !r.peak || r.rr == null) return; if (r.rec != null && r.rec < CFG.W) return;
  if (r.rr < CFG.U){ const b = (CFG.beta[r.tierUse] != null ? CFG.beta[r.tierUse] : CFG.beta.mid) + (r.old ? CFG.delta : 0); const a = r.peak * (1 + E * b); const w = clamp((CFG.U - r.rr) / (CFG.U - 0.6), 0, 1); F[r.k] = (1 - w) * v + w * a; } });
const G = Object.assign({}, F);
rows.forEach(r => { const q = shortPairs[r.k]; if (!q) return; const w = clamp((96 - r.months) / 60, 0, 1); const v = (1 - w) * F[r.k] + w * F[q.base] * Math.min(q.m, CFG.mCap); if (Math.abs(v - F[r.k]) > 1){ G[r.k] = v; PART[r.k] = q.base; } });
rows.forEach(r => { const q = leadPairs[r.k]; if (!q) return; const v = F[q.base] * q.m; if (v > G[r.k] + 1){ G[r.k] = v; PART[r.k] = q.base; } });
{ const H = Object.assign({}, G); let n6 = 0, n6x = 0; for (const q of orderPairs){ const need = H[q.lo] * q.m; if (G[q.hi] < need - 1){ G[q.hi] = need; PART[q.hi] = q.lo; } } }
rows.forEach(r => { if (r.leader) return; const lim = r.fair * CFG.capUp; if (G[r.k] > lim + 1) G[r.k] = lim; });
const CUT7 = {}; rows.forEach(r => { if (r.leader || r.cap7 == null || r.rc === '서울') return; const before = G[r.k]; if (before > r.fair){ const v = Math.max(r.fair, Math.min(before, r.cap7)); if (v < before - 1){ G[r.k] = v; CUT7[r.k] = 1; } } });

// ---- 3. 표 ----
const table = {}; const cnt = { 1: 0, 2: 0, 3: 0 };
rows.forEach(r => { const f = G[r.k]; if (Math.abs(f - r.fair) <= 1) return;
  const code = CUT7[r.k] ? 3 : PART[r.k] ? 2 : 1; cnt[code]++;
  const row = [+(r.fair / r.curB * 100).toFixed(6), +(f / r.fair).toFixed(7), code]; if (code === 2) row.push(PART[r.k].slice(3)); table[r.k] = row; });
const meta = { 단계: 156, 칸: Object.keys(table).length, 코드: cnt, 전체칸: rows.length, seed: { 'seedComplexes.js': hash8(path.join(DIR, 'seedComplexes.js')), 'seedComplexes25.js': hash8(path.join(DIR, 'seedComplexes25.js')) },
  좌표: { 'seoul_coords_v3.json': hash8(path.join(COORDS, 'seoul_coords_v3.json')), 'gi_coords_v1.json': hash8(path.join(COORDS, 'gi_coords_v1.json')) }, 원칙6쌍: orderPairs.length, 원칙6경계쌍: orderPairs.filter(q => q.cross).length };
const tblText = JSON.stringify(table), metaText = JSON.stringify(meta);
if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify({ meta, table, expect: Object.fromEntries(rows.map(r => [r.k, [r.fair, G[r.k]]])) }));
for (const h of writes){ let s = fs.readFileSync(h, 'utf8');
  const re1 = /\/\*L75_TABLE\*\/[\s\S]*?\/\*END_L75_TABLE\*\//, re2 = /\/\*L75_META\*\/[\s\S]*?\/\*END_L75_META\*\//;
  if (!re1.test(s) || !re2.test(s)) { console.error('표 자리(L75_TABLE·L75_META)가 없음: ' + h); process.exit(1); }
  s = s.replace(re1, () => '/*L75_TABLE*/' + tblText + '/*END_L75_TABLE*/').replace(re2, () => '/*L75_META*/' + metaText + '/*END_L75_META*/');
  fs.writeFileSync(h, s); }
console.log(JSON.stringify({ meta, 쓴파일: writes, 초: [Math.round((t1 - t0) / 1000), Math.round((Date.now() - t1) / 1000)] }));
