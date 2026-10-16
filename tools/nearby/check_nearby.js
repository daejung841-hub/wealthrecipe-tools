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
const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'build_nearby.js'), REPO, LIST, tmp], { encoding: 'utf8', env: Object.assign({}, process.env, { THIS_YEAR: String(cur.meta.thisYear) }) });
if (r.status !== 0) { console.log('✗ 다시 계산 실패:', (r.stderr || '').slice(0, 300)); process.exit(1); }
const now = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
const bad = [];
for (const k of Object.keys(now.meta.src)) if (now.meta.src[k] !== cur.meta.src[k]) bad.push(`원본 ${k} 해시 ${cur.meta.src[k]} → ${now.meta.src[k]}`);
if (JSON.stringify(now.meta.flags) !== JSON.stringify(cur.meta.flags)) bad.push('시세보정 플래그가 바뀜');
if (JSON.stringify(now.c) !== JSON.stringify(cur.c) || JSON.stringify(now.z) !== JSON.stringify(cur.z)) bad.push('다시 계산한 주변 단지 목록이 다름');
if (bad.length) { console.log('✗ 재생성 필요 — ' + bad.join(' · ')); console.log('  node build_nearby.js <저장소> <목록표 HTML> nearby.json 으로 다시 만든 뒤 목록표의 NEARBY 줄만 바꾸세요.'); process.exit(1); }
console.log(`✓ NEARBY 최신(원본 해시 ${Object.values(cur.meta.src).join('·')}, 구역 ${cur.meta.withList}/${cur.meta.zones}, 단지 ${cur.c.length}, 기준월 ${cur.meta.month})`);
