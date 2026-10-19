// 목록표에 들어 있는 NEARBY(주변 아파트)가 지금 시세보정 원본과 맞는지 점검. 맞지 않으면 "재생성 필요"로 실패(exit 1).
// 사용: node check_nearby.js <배포 저장소 폴더> <목록표 HTML>
//  ① 원본 4개(price-correction/index.html·complex_index.json·좌표 파일 2개) 해시 = NEARBY.meta.src
//  ② 같은 원본으로 다시 계산한 c·z = 목록표에 들어 있는 c·z (규칙·플래그가 바뀌어도 잡힘)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const REPO = process.argv[2], LIST = process.argv[3];
const html = fs.readFileSync(LIST, 'utf8').replace(/\r\n/g, '\n'); const m = /\n  const NEARBY = (\{.*?\});   \/\//.exec(html);
if (!m) { console.log('✗ 목록표에 NEARBY 줄이 없음'); process.exit(1); }
const cur = JSON.parse(m[1]);
const tmp = path.join(os.tmpdir(), 'nearby_check_' + process.pid + '.json');
const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'build_nearby.js'), REPO, LIST, tmp], { encoding: 'utf8', env: Object.assign({}, process.env, { THIS_YEAR: String(cur.meta.thisYear), OV_NO_WRITE: '1' }, String(cur.meta.age || '').startsWith('17-14 모의') ? { AGE_1714: 'sim' } : {}) });   // 목록-3 6차: 넣을 때와 같은 연식 방식으로
if (r.status !== 0) { console.log('✗ 다시 계산 실패:', (r.stderr || '').slice(0, 300)); process.exit(1); }
if (String(cur.meta.age || '').startsWith('17-14 모의')) console.log('  (주의) NEARBY는 17-14 연식 모의 빌드 — 17-14가 origin에 오면 AGE_1714 없이 다시 빌드해 같은지 확인');
const now = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
const bad = [];
for (const k of Object.keys(now.meta.src)) if (now.meta.src[k] !== cur.meta.src[k]) bad.push(`원본 ${k} 해시 ${cur.meta.src[k]} → ${now.meta.src[k]}`);
if (JSON.stringify(now.meta.flags) !== JSON.stringify(cur.meta.flags)) bad.push('시세보정 플래그가 바뀜');
if (JSON.stringify(now.c) !== JSON.stringify(cur.c) || JSON.stringify(now.z) !== JSON.stringify(cur.z)) bad.push('다시 계산한 주변 단지 목록이 다름');
if (JSON.stringify(now.g) !== JSON.stringify(cur.g) || JSON.stringify(now.grade) !== JSON.stringify(cur.grade) || JSON.stringify(now.st || {}) !== JSON.stringify(cur.st || {}) || JSON.stringify(now.w || {}) !== JSON.stringify(cur.w || {}) || JSON.stringify(now.meta.leader) !== JSON.stringify(cur.meta.leader) || JSON.stringify(now.meta.override || null) !== JSON.stringify(cur.meta.override || null)) bad.push('다시 계산한 급지·마진표가 다름(시세보정 급지 규칙·대장 설정·대표님 지정 급지 파일 변경 포함)');   // 목록-3-1
// 목록-3 8차: 공개용 지정 파일에 메모가 섞이지 않았는지(열 4개 그대로 + 원본이 옆에 있으면 원본 메모 글자가 공개용에 없는지)
{ const pub = path.join(__dirname, '급지_대표님지정_공개.csv'), src = path.join(__dirname, '급지_대표님지정.csv');
  if (fs.existsSync(pub)) {
    const pt = fs.readFileSync(pub, 'utf8').replace(/^﻿/, ''), head = pt.split(/\r?\n/)[0];
    if (head !== '구역명,시트,지정 급지,지정일') bad.push('공개용 지정 파일 열이 다름(메모 열이 있으면 안 됨): ' + head);
    if (fs.existsSync(src)) { const st = fs.readFileSync(src, 'utf8').replace(/^﻿/, '').split(/\r?\n/); const H = st[0].split(','), iM = H.indexOf('메모');
      const cells = (l) => { const o = []; let f = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { o.push(f); f = ''; } else f += c; } o.push(f); return o; };   // 메모 안 쉼표(따옴표) 처리
      const memos = iM < 0 ? [] : st.slice(1).map((l) => (cells(l)[iM] || '').trim()).filter(Boolean), leak = memos.filter((m) => pt.includes(m));
      if (leak.length) bad.push('공개용 지정 파일에 메모가 섞임: ' + leak.join(' / ')); else console.log(`  공개용 지정 파일 메모 없음(원본 메모 ${memos.length}건 대조)`); }
  } else if (cur.meta.override && cur.meta.override.n) bad.push('공개용 지정 파일이 없음'); }
if (bad.length) { console.log('✗ 재생성 필요 — ' + bad.join(' · ')); console.log('  node build_nearby.js <저장소> <목록표 HTML> nearby.json 으로 다시 만든 뒤 목록표의 NEARBY 줄만 바꾸세요.'); process.exit(1); }
console.log(`✓ NEARBY 최신(원본 해시 ${Object.values(cur.meta.src).join('·')}, 구역 ${cur.meta.withList}/${cur.meta.zones}, 단지 ${cur.c.length}, 기준월 ${cur.meta.month})`);
