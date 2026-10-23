// 급지 1차 판 NEARBY 점검(53차 · 배포용: 1028 빌드 결과 — 신월동 안 B). 51차판(_1026)은 26차용.
// (51차 · 26차용: 1026 빌드 결과·구역 지정 포함 위치 zi까지 대조). 49차판(check_nearby_1차.js)은 1025 결과용.
// 급지 1차 판 NEARBY 점검(49차). 기존 check_nearby.js는 옛 빌더(build_nearby.js)로 다시 계산해 비교하므로 급지 1차 판에는 맞지 않음.
// 사용: node check_nearby_1차.js <배포 저장소 폴더> <목록표 HTML> <tools 폴더>
//  ① 목록표 NEARBY.meta.basis = '급지1차'
//  ② 입력 파일 해시(meta.src1) = 지금 파일 해시 — 원본 4개(저장소) + 급지 1차 입력(입력목록_1025.json에 적힌 tools 기준 경로). 다르면 '재생성 필요'
//  ③ 목록표 NEARBY = 급지 1차 빌드 결과 파일(nearby_급지1차_1025.js)의 c·z·g·st·w·grade
//  ④ 공개용 지정 파일 열 4개(메모 열 없음)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [REPO, LIST, TOOLS] = process.argv.slice(2);
const HERE = __dirname, bad = [];
const html = fs.readFileSync(LIST, 'utf8').replace(/\r\n/g, '\n'); const m = /\n  const NEARBY = (\{.*?\});   \/\//.exec(html);
if (!m) { console.log('✗ 목록표에 NEARBY 줄이 없음'); process.exit(1); }
const cur = JSON.parse(m[1]);
if (cur.meta.basis !== '급지1차') { console.log('✗ 급지 1차 판이 아님(meta.basis = ' + cur.meta.basis + ') — 기존 check_nearby.js로 점검'); process.exit(1); }
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('')).digest('hex').slice(0, 8);
const M = JSON.parse(fs.readFileSync(path.join(HERE, '입력목록_1028.json'), 'utf8'));
for (const [k, where, rel] of M) {
  const f = where === 'repo' ? path.join(REPO, rel) : path.join(TOOLS, rel);
  if (!fs.existsSync(f)) { bad.push(`입력 파일 없음 ${k}: ${rel}`); continue; }
  const h = sha(f); if (!cur.meta.src1 || cur.meta.src1[k] !== h) bad.push(`입력 ${k} 해시 ${cur.meta.src1 && cur.meta.src1[k]} → ${h}`);
}
const t = fs.readFileSync(path.join(HERE, 'nearby_급지1차_1028.js'), 'utf8'); const B = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
for (const k of ['c', 'z', 'g', 'st', 'w', 'zi', 'grade']) if (JSON.stringify(cur[k] || {}) !== JSON.stringify(B[k] || {})) bad.push(`목록표 NEARBY.${k} ≠ 빌드 결과 파일`);
const pub = path.join(TOOLS, 'nearby', '급지_대표님지정_공개.csv');
if (fs.existsSync(pub)) { const head = fs.readFileSync(pub, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0]; if (head !== '구역명,시트,지정 급지,지정일') bad.push('공개용 지정 파일 열이 다름: ' + head); }
if (bad.length) { console.log('✗ 재생성 필요 — ' + bad.join(' · ')); process.exit(1); }
console.log(`✓ NEARBY 급지 1차 최신(입력 ${Object.keys(cur.meta.src1).length}개 해시 같음, 구역 ${Object.keys(cur.z).length}, 단지 ${cur.c.length}, 지정 ${cur.meta.overrides}, 기준월 ${cur.meta.month})`);
