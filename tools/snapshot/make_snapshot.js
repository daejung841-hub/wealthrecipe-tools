// 계산기 적정가 스냅샷 만들기(161단계) — 시세를 갱신하기 전에 "지금 화면에 보이는 값"을 한 칸(34평·25평)씩 남긴다.
//
// 사용: node tools/snapshot/make_snapshot.js <계산기 폴더> --out <스냅샷 JSON> --commit <계산기 커밋 sha> [--date YYYY-MM-DD]
//   <계산기 폴더>: 벤치마크_배율_계산기.html + shared.js·seedComplexes.js·seedComplexes25.js·seedChips.js·m2Series.js (보통 benchmark-calculator/)
//   --commit: 계산기 HTML·seed가 마지막으로 바뀐 커밋(스냅샷을 올리는 커밋이 아님)
//   걸리는 시간 약 2~3분(6,326칸).
// 계산은 tools/fair_l75와 같은 방식(계산기 HTML의 함수를 그대로 부름, 기본 설정·기본 묶음). 화면과 다른 계산을 새로 만들지 않는다.
// 한 번 올린 스냅샷 파일은 고치지 않는다. 지문(sha256)은 snapshots/SHA256SUMS.txt에 적는다.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), zlib = require('zlib');
const { loadApp } = require('../fair_l75/load_app.js');
const args = process.argv.slice(2);
const DIR = path.resolve(args[0] || '');
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const OUT = opt('--out'), COMMIT = opt('--commit'), DATE = opt('--date') || new Date().toISOString().slice(0, 10);
if (!OUT || !COMMIT) { console.error('사용: node make_snapshot.js <계산기 폴더> --out <JSON> --commit <sha> [--date YYYY-MM-DD]'); process.exit(1); }
const H = '벤치마크_배율_계산기.html';
const md5lf = f => crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
const md5raw = f => crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, f))).digest('hex').slice(0, 8);

const A = loadApp(DIR);
vm.runInContext(fs.readFileSync(path.join(DIR, 'seedComplexes25.js'), 'utf8'), A);
vm.runInContext(fs.readFileSync(path.join(DIR, 'seedChips.js'), 'utf8'), A);
vm.runInContext('SEED25_BY_ID = new Map(window.SEED_COMPLEXES_25.map(e => [e.id, e])); _seed25IdByText = new Map(window.SEED_COMPLEXES_25.map(e => [e.text, e.id])); seed25State = "loaded";', A);

const COLS = ['칸', 'id', 'complexId', '이름', '시', '구', '동', '평형칸', '전용㎡', '면적표기', '준공', '세대수', '풀제외',
  '현재가', '현재가월', '현재전세', '적정가', '적정가하단', '적정가상단', '상승여력%', '배지', '근거코드', '근거', '규칙',
  '동조율', '선도그룹', '선도현재가', '최근12개월변경', '매매시세개월', '이력부족'];
const res = JSON.parse(vm.runInContext(`JSON.stringify((() => {
  const byId = new Map(window.SEED_COMPLEXES.map(e => [e.id, e])); const rows = [];
  const cells = [];
  window.SEED_COMPLEXES.forEach(e => { if (e.text) cells.push([e, e.text, e.name, 34, +e.exclusiveArea || null]); });
  window.SEED_COMPLEXES_25.forEach(x => { const e = byId.get(x.id); if (e && x.text) cells.push([e, x.text, e.name + '(25평)', 25, x.exclusiveM2]); });
  const R = v => v == null || !isFinite(v) ? null : Math.round(v);
  cells.forEach(([e, text, nm, p, m2]) => {
    const c = buildComplex(text, nm, nm); c._pyeong = p; if (!c.rows.length) return;
    const g = pickBenchGroupForTarget(stripPyeongSuffix(nm)).groupKey, base = getVirtualBenchmarkComplex(g);
    const r = computeSlot(base, c); if (!r || r.error) return;
    const sr = computeSyncRate(base, c), est = sr ? null : findSyncRateEstimate(c);
    const tier = sr ? sr.calcTier : (est ? est.tier : null);
    const yms = [...c.rowMap.keys()].filter(ym => c.rowMap.get(ym).saleMid != null && (r.curSaleYm == null || ym <= r.curSaleYm)).sort((a, b) => a - b).slice(-13);
    let chg = 0; for (let i = 1; i < yms.length; i++) if (c.rowMap.get(yms[i]).saleMid !== c.rowMap.get(yms[i - 1]).saleMid) chg++;
    const bl = base.rows.filter(x => x.saleMid != null); const bCur = bl.length ? bl[bl.length - 1].saleMid : null;
    const a = slotAreaL69(e.id, p);
    const cur = r.curSalePrice, fair = r.fairSale;
    rows.push([p + '|' + e.id, e.id, e.complexId != null ? String(e.complexId) : null, e.name, e.regionCity || null, e.district || null, e.dong || null, p, m2, a ? slotAreaTextL69(e.id, p) : null,
      e.builtYear || null, e.units != null ? +e.units : null, isPoolExcludedSeed(e) ? 1 : 0,
      R(cur), r.curSaleYm, R(r.curJeonsePrice), R(fair), R(r.fairSaleLow), R(r.fairSaleHigh),
      cur && fair != null ? Math.round((fair - cur) / cur * 1000) / 10 : null,
      r.diag ? r.diag.badge : null, r.fairBasisL75 ? r.fairBasisL75.code : null, fairBasisTextL75(r) || null, (r.diag && r.diag.l75Rule) || null,
      tier, g, R(bCur), chg, c.rows.filter(x => x.saleMid != null).length, isShortHistoryL28(r) ? 1 : 0]);
  });
  rows.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  return { rows, asOf: computeDataAsOfRange(), bundles: Object.keys(BUNDLES).filter(k => BUNDLES[k]).join(',') };
})())`, A));
const asOf = String(res.asOf.max), ym = asOf.slice(0, 4) + '-' + asOf.slice(4, 6);
const snap = {
  meta: {
    형식: 2, 시세기준월: ym, 만든날짜: DATE, 칸: res.rows.length,
    계산버전: { 계산기HTML_md5: md5raw(H), 계산기커밋: COMMIT, 켜진묶음: res.bundles },
    seed: Object.fromEntries(['seedComplexes.js', 'seedComplexes25.js', 'seedChips.js', 'shared.js', 'm2Series.js'].map(f => [f, md5lf(f)])),
    단위: '가격은 만원(매매·전세 일반평균가, KB). 상승여력% = (적정가 − 현재가) ÷ 현재가 × 100',
    열설명: {
      칸: '평형칸|단지 id', complexId: 'KB 단지 번호(형식 2부터 — seed id는 정정 때 다른 단지로 바뀔 수 있어 평가 때 함께 대조)', 면적표기: '실제 면적이 칸 기준과 다를 때 화면 표기(묶음 L69), 같으면 null', 풀제외: '1이면 비교 풀 밖(신축 등)',
      근거코드: '묶음 L75 적정가 근거 0 기본·1 전고점·2 주변 단지·3 전세 상한, null이면 보정 표 밖', 규칙: '배지 규칙(묶음 L75)',
      동조율: 'veryHigh 아주좋음·high 좋음·mid 보통·low 나쁨·veryLow 아주나쁨(계산용 등급, 없으면 추정 등급)',
      선도현재가: '같은 선도 그룹 가상 단지의 마지막 매매가', 최근12개월변경: '현재가월까지 최근 13개 달 사이 매매가가 바뀐 횟수(최대 12)',
      이력부족: '1이면 화면에서 적정가 대신 이력 부족 안내(묶음 L28)'
    }
  },
  cols: COLS,
  rows: res.rows
};
const body = JSON.stringify(snap).replace(/\],\[/g, '],\n[') + '\n';
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
if (fs.existsSync(OUT)) { console.error('이미 있는 스냅샷은 덮어쓰지 않습니다: ' + OUT); process.exit(1); }
fs.writeFileSync(OUT, body, 'utf8');
const sha = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
console.log(JSON.stringify({ 파일: OUT, 칸: res.rows.length, 시세기준월: ym, 바이트: Buffer.byteLength(body), gzip: zlib.gzipSync(body, { level: 9 }).length, sha256: sha, 계산기HTML_md5: snap.meta.계산버전.계산기HTML_md5 }));
