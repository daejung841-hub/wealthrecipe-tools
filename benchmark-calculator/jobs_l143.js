/* 구현39 ①②④ 4판: 말풍선 막대 3개(17곳 최저·평균·최고 눈금)·역노선 1126, 단지 카드 업무지구 2곳 + ⓘ, 고교 7단계 한 안. patch_sian_l143.py로 만듦
 * 구현38 ①⑥ 3판: 업무지구 말풍선 대표 역·수도권 평균 비교, 고교 종합 등급 두 안(?안=나). patch_sian_l142.py로 만듦
 * 구현37 ② 일자리 시안 2판(8885 미리보기 전용) — "시안". 판정·계산 없음(표시만). 1판(구현34 ③)은 sian_l140_s140판.js
 *  지도: 오른쪽 [일자리] 단추(기본 꺼짐) → 업무지구 원(크기 = 일자리 수, 색 = 평균 연봉 5구간), 누르면 말풍선
 *        말풍선: 접근 노선 배지 · 대표 기업 5곳(직원·사업장 평균 연봉 추정) · [더 보기] 1,000명 이상 기업 전체 · 상위 5개 업무지구와 비교(탭)
 *  단지 정보 카드: "일자리" 한 줄(접근 가능 일자리 · 연봉 구간 배지 · 가까운 업무지구 약 ○분(경로)) — 업무지구 이름을 누르면 같은 내용 창
 *                  "통학권 고교" 줄 → 학교 창(구현34 ③ 그대로)
 *  자료: sian_l140_data.js(build_sian_l141.py, 분석 30 확정). 숫자만, 투자 권유 문구 없음.
 */
(function(){
  'use strict';
  const D = window.SIAN_L140_DATA; if (!D) return;
  const JOBS_ONLY = !!(D._meta && D._meta.모드 === '일자리');   // 구현38: g31b(일자리만) — 고교 줄·시안 꼬리표 없음
  const TAG = JOBS_ONLY ? '' : '시안';
  const tagHtml = () => TAG ? '<span class="s140-tag">' + TAG + '</span>' : '';
  // 구현38 ①: 고교 종합 등급 두 안 — 주소 ?안=나(기본 가)
  const PLAN = (() => { let q = ''; try { q = window.top.location.search; } catch (e) { q = location.search; } return new URLSearchParams(q).get('안') === '나' ? '나' : '가'; })();
  const PLAN_TXT = { 가: '서울대+연세대+고려대', 나: 'SKY+의치한약수+카이스트·포스텍' };
  const MET = (D._meta && D._meta.수도권) || null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const man = v => Math.round(v / 10000).toLocaleString('ko-KR');           // 원 → 만
  const manJobs = n => (n >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString('ko-KR') + '만' : n.toLocaleString('ko-KR'));
  const top = p => p < 0.1 ? '상위 0.1% 안' : '상위 ' + p + '%';
  const eok = v => { if (v == null) return '—'; const e = v / 10000; return (e >= 10 ? String(Math.round(e * 10) / 10) : String(Math.round(e * 100) / 100)) + '억'; };
  const dist = m => m >= 1000 ? (Math.round(m / 100) / 10) + 'km' : m + 'm';
  const badgeCls = b => /^저평가/.test(b || '') ? 'lo' : /^고평가/.test(b || '') ? 'hi' : 'nt';
  // 연봉 5구간 색(1구간 = 상위 20%) — 서로 확실히 다른 색, 흰 글씨가 어두운 화면에서도 읽힘
  const BAND = { 1: '#1f3c88', 2: '#2f7fe0', 3: '#22964a', 4: '#ee8a1c', 5: '#d63b3b' };
  const BANDS = D.BANDS || [];   // 구간 아래 경계(연, 원)
  const bandRange = k => k === 1 ? '연 ' + man(BANDS[0]) + '만 이상' : k === 5 ? '연 ' + man(BANDS[3]) + '만 미만' : '연 ' + man(BANDS[k - 1]) + '만~' + man(BANDS[k - 2]) + '만';
  const bandBadge = (k, pre) => k ? '<span class="s141-bd" style="background:' + BAND[k] + '" title="' + esc(bandRange(k) + ' (추정)') + '">' + (pre || '') + k + '구간</span>' : '';
  // 지하철 노선 색(공식 노선 색에 가깝게, 없으면 회색)
  const LINE = { '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE', '5호선': '#996CAC', '6호선': '#CD7C2F', '7호선': '#747F00', '8호선': '#E6186C', '9호선': '#BDB092',
    '신분당선': '#D4003B', '수인·분당선': '#F5A200', '경의·중앙선': '#77C4A3', '공항철도': '#0090D2', '공항철도(직통)': '#0090D2', '경춘선': '#0C8E72', '경강선': '#003DA5', '서해선': '#8FC31F',
    '인천1호선': '#7CA8D5', '인천2호선': '#ED8B00', '우이신설선': '#B0CE18', '신림선': '#6789CA', '김포 골드라인': '#A17800', '용인선': '#56AD2D', '의정부경전철': '#FDA600', 'GTX-A': '#9A6292' };
  const lineBadge = n => '<span class="s141-ln" style="background:' + (LINE[n] || '#6b7280') + '">' + esc(n) + '</span>';
  const CSS = `
.s140-tag{display:inline-block;font-size:10.5px;font-weight:700;color:#9a5b00;background:#fff3d6;border-radius:4px;padding:0 5px;margin-left:5px;vertical-align:1px;white-space:nowrap;}
.s140-sm{font-size:11px;color:var(--ink-muted,#667);font-weight:500;}
.s140-row b{font-weight:700;}
.s140-pop{display:block!important;flex:1 0 100%;width:100%;box-sizing:border-box;grid-column:1 / -1;margin-top:4px;padding:7px 9px;border:1px solid var(--border,#ddd);border-radius:8px;background:var(--surface,#fff);font-size:12px;line-height:1.55;color:var(--ink,#111);}
.s140-pop[hidden]{display:none!important;}.s140-pop>p{display:block!important;margin:0 0 3px;}
.s140-link{border:0;background:transparent;padding:0;color:var(--info,#1c64d8);font-weight:700;cursor:pointer;font-size:inherit;text-decoration:underline;text-underline-offset:2px;}
.s141-bd{display:inline-block;color:#fff;font-size:11px;font-weight:800;border-radius:5px;padding:0 6px;line-height:18px;white-space:nowrap;vertical-align:1px;}
.s141-ln{display:inline-block;color:#fff;font-size:10.5px;font-weight:800;border-radius:9px;padding:0 7px;line-height:17px;margin:0 3px 3px 0;white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,.35);}
.s140-bub{min-width:240px;max-width:300px;max-height:420px;overflow:auto;background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--border,#ddd);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.55;box-shadow:0 6px 18px rgba(0,0,0,.18);}
.s140-bub h4,.s141-win h3{margin:0 0 4px;font-size:15px;padding-right:18px;}
.s140-bub .rk{font-size:12px;font-weight:700;color:var(--accent,#0b5e6b);}
.s140-bub .big{font-size:13.5px;font-weight:700;margin:3px 0 1px;}
.s140-bub .x{position:absolute;right:8px;top:6px;border:0;background:transparent;font-size:15px;cursor:pointer;color:var(--ink-muted,#667);}
.s141-sec{margin-top:8px;}.s141-sec>b{display:block;font-size:12px;margin-bottom:2px;}
.s141-ft{width:100%!important;min-width:0!important;max-width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed!important;}.s141-ft td,.s141-ft th{padding:3px 2px;border-top:1px solid var(--border,#eee);vertical-align:top;white-space:normal!important;overflow-wrap:anywhere;text-align:left;}.s141-ft th{font-size:10.5px;color:var(--ink-muted,#667);font-weight:700;}
.s141-ft td.n,.s141-ft th.n{text-align:right;white-space:nowrap!important;}.s141-ft .up{display:block;font-size:10.5px;color:var(--ink-muted,#667);}
.s141-more{margin-top:5px;border:1px solid var(--border,#ccc);background:var(--surface-alt,#f5f6f7);color:var(--ink,#111);border-radius:7px;font:inherit;font-size:11.5px;font-weight:700;padding:3px 9px;cursor:pointer;}
.s141-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:2px 0 5px;}.s141-tabs button{border:1px solid var(--border,#ccc);background:var(--surface,#fff);color:var(--ink,#111);border-radius:999px;font:inherit;font-size:11px;font-weight:700;padding:2px 8px;cursor:pointer;}
.s141-tabs button.on{background:var(--accent,#0b5e6b);border-color:var(--accent,#0b5e6b);color:#fff;}
.s141-bars .r{display:grid;grid-template-columns:62px 1fr 58px;gap:5px;align-items:center;font-size:11px;margin:2px 0;}.s141-bars .r.me{font-weight:800;}
.s141-bars .t{height:10px;border-radius:3px;background:#9aa4b2;}.s141-bars .r.me .t{background:var(--accent,#0b5e6b);}.s141-bars .v{text-align:right;white-space:nowrap;}
.s141-note{font-size:10.5px;color:var(--ink-muted,#667);line-height:1.45;margin-top:2px;}
.s140-lg{position:absolute;left:10px;bottom:78px;z-index:60;background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--border,#ddd);border-radius:8px;padding:6px 9px;font-size:11px;line-height:1.6;box-shadow:0 2px 8px rgba(0,0,0,.12);}
.s140-lg .li{display:flex;align-items:center;gap:5px;white-space:nowrap;}.s140-lg i{display:inline-block;width:11px;height:11px;border-radius:50%;flex:0 0 11px;border:1px solid rgba(0,0,0,.15);}
.s140-ov{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 12px;}
.s140-win{background:var(--surface,#fff);color:var(--ink,#111);border-radius:14px;max-width:640px;width:100%;padding:16px 18px 20px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:13px;line-height:1.55;position:relative;}
.s141-win{max-width:520px;}
.s140-win h3{margin:0 0 2px;font-size:18px;}
.s140-win .x{position:absolute;right:12px;top:10px;border:0;background:transparent;font-size:20px;cursor:pointer;color:var(--ink-muted,#667);}
.s140-win .sec{margin-top:14px;}.s140-win .sec h5{margin:0 0 6px;font-size:13px;color:var(--ink-muted,#667);}
.s140-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
.s140-card{border:1px solid var(--border,#ddd);border-radius:10px;padding:8px 9px;}
.s140-card .k{font-size:11.5px;color:var(--ink-muted,#667);font-weight:700;}.s140-card .v{font-size:20px;font-weight:800;}.s140-card .v.sm{font-size:15px;line-height:1.35;padding-top:3px;}.s140-card .n{font-size:10.5px;color:var(--ink-faint,#999);}
.s140-bars{display:flex;align-items:flex-end;gap:10px;height:150px;border-bottom:1px solid var(--border,#ddd);padding:0 4px;}
.s140-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:11px;}
.s140-bar .b{width:70%;max-width:42px;background:var(--accent,#0b5e6b);border-radius:4px 4px 0 0;}
.s140-bar .b.na{background:transparent;border:1px dashed var(--border,#ccc);height:18px;}
.s140-bar .val{font-weight:800;font-size:12px;}
.s140-blab{display:flex;gap:10px;padding:0 4px;}.s140-blab div{flex:1;text-align:center;font-size:10.5px;color:var(--ink-muted,#667);line-height:1.35;}
.s140-blab b{display:block;color:var(--ink,#111);font-size:11.5px;}
.s140-kt{display:inline-block;font-size:10.5px;font-weight:700;border-radius:4px;padding:0 5px;margin-left:4px;}
.s140-kt.a{color:#0b5e6b;background:#dff1f3;}.s140-kt.b{color:#6b3fa0;background:#efe6fa;}
.s140-t{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}.s140-t{width:100%!important;max-width:100%;table-layout:fixed!important;}.s140-t td,.s140-t th{overflow-wrap:anywhere;word-break:break-all;white-space:normal!important;min-width:0!important;}.s140-t col.c1{width:13%}.s140-t col.c2{width:15%}.s140-t col.c3{width:28%}.s140-t col.c4{width:16%}.s140-t th,.s140-t td{border-top:1px solid var(--border,#eee);padding:5px 6px;text-align:left;vertical-align:top;}.s140-t th{color:var(--ink-muted,#667);font-weight:700;}
.s140-apt{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--border,#eee);padding:6px 2px;}
.s140-apt .nm{font-weight:700;}.s140-apt .r{text-align:right;white-space:nowrap;}
.s140-bd{display:inline-block;font-size:11.5px;font-weight:800;border-radius:5px;padding:0 6px;}
.s140-bd.lo{color:var(--good,#1e8e5a);background:var(--good-bg,#e5f5ec);}.s140-bd.hi{color:var(--bad,#c63f3f);background:var(--bad-bg,#fbeaea);}.s140-bd.nt{color:var(--ink-muted,#667);background:var(--surface-alt,#f1f3f5);}
.s140-note{margin-top:10px;font-size:12px;color:var(--ink-muted,#667);background:var(--surface-alt,#f5f6f7);border-radius:8px;padding:7px 9px;}
.s142-st{display:flex;flex-wrap:wrap;gap:3px 8px;margin-top:3px;font-size:11.5px;}.s142-st span{white-space:nowrap;}.s142-st i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:2px;vertical-align:0;}
.s142-cmp{font-size:11.5px;color:var(--ink,#111);margin-top:1px;}.s142-cmp .m{color:var(--ink-muted,#667);}
.s142-hi{margin-top:6px;}.s142-hi .t{font-size:12.5px;font-weight:700;}.s142-i{border:1px solid var(--border,#ccc);background:var(--surface,#fff);color:var(--ink-muted,#667);border-radius:50%;width:17px;height:17px;line-height:15px;padding:0;font-size:10.5px;font-weight:800;cursor:pointer;margin-left:4px;vertical-align:1px;}
.s142-def{font-size:11px;color:var(--ink-muted,#667);background:var(--surface-alt,#f5f6f7);border-radius:6px;padding:4px 7px;margin-top:3px;line-height:1.45;}
.s142-bar{position:relative;height:22px;margin:4px 0 2px;}.s142-bar .tr{position:absolute;left:0;right:0;top:8px;height:6px;border-radius:3px;background:linear-gradient(90deg,#dfe6ee,#9fb3c8);}
.s142-bar .avg{position:absolute;top:2px;width:2px;height:18px;background:var(--ink,#111);}.s142-bar .me{position:absolute;top:4px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--accent,#0b5e6b);border:2px solid #fff;box-shadow:0 0 0 1px var(--accent,#0b5e6b);}
.s142-bl{display:flex;justify-content:space-between;font-size:10px;color:var(--ink-faint,#999);}
.s142-plan{position:fixed;right:8px;bottom:8px;z-index:10060;background:#9a5b00;color:#fff;font-size:12px;font-weight:800;border-radius:6px;padding:3px 9px;box-shadow:0 2px 6px rgba(0,0,0,.25);pointer-events:none;}
.s142-gd{display:inline-block;color:#fff;background:#0b5e6b;font-size:11px;font-weight:800;border-radius:5px;padding:0 6px;line-height:18px;white-space:nowrap;vertical-align:1px;}.s142-gd.na{background:#8a94a3;}
.s142-kt{display:inline-block;font-size:10.5px;font-weight:700;color:#6b3fa0;background:#efe6fa;border-radius:4px;padding:0 5px;margin-left:4px;white-space:nowrap;}
.s142-top{border:2px solid var(--accent,#0b5e6b);border-radius:12px;padding:10px 12px;margin-top:10px;}.s142-top .k{font-size:12px;color:var(--ink-muted,#667);font-weight:700;}.s142-top .v{font-size:24px;font-weight:800;line-height:1.3;}.s142-top .v small{font-size:13px;font-weight:600;color:var(--ink-muted,#667);}
.s143-bars{margin-top:6px;}.s143-b{margin:5px 0 2px;}.s143-b .h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:12px;}.s143-b .h b{font-size:12.5px;}.s143-b .rk{font-size:11px;font-weight:700;color:var(--accent,#0b5e6b);white-space:nowrap;}
.s143-tr{position:relative;height:20px;margin:2px 0 0;}.s143-tr .ln{position:absolute;left:0;right:0;top:8px;height:5px;border-radius:3px;background:linear-gradient(90deg,#e4e8ee,#c6d0dc 50%,#7f97b2);}
.s143-tr .av{position:absolute;left:50%;top:3px;width:2px;height:15px;margin-left:-1px;background:var(--ink-muted,#667);}.s143-tr .me{position:absolute;top:4px;width:13px;height:13px;margin-left:-6.5px;border-radius:50%;background:var(--accent,#0b5e6b);border:2px solid #fff;box-shadow:0 0 0 1px var(--accent,#0b5e6b);}
.s143-bl{display:grid;grid-template-columns:1fr auto 1fr;font-size:10px;color:var(--ink-faint,#999);line-height:1.3;}.s143-bl span:nth-child(2){text-align:center;}.s143-bl span:last-child{text-align:right;}.s143-bl .hi{color:var(--accent,#0b5e6b);font-weight:800;}
.s143-row .zs{white-space:nowrap;}.s143-i{border:1px solid var(--border,#ccc);background:var(--surface,#fff);color:var(--ink-muted,#667);border-radius:50%;width:18px;height:18px;line-height:16px;padding:0;font-size:10.5px;font-weight:800;cursor:pointer;margin-left:4px;vertical-align:1px;}
.s143-tip{display:block;margin-top:4px;font-size:11.5px;color:var(--ink,#111);background:var(--surface-alt,#f5f6f7);border-radius:7px;padding:5px 8px;line-height:1.5;}.s143-tip[hidden]{display:none;}
.s143-g7{display:inline-block;color:#fff;font-size:11px;font-weight:800;border-radius:5px;padding:0 7px;line-height:18px;white-space:nowrap;vertical-align:1px;}
@media (max-width:767px){.s140-t col:last-child,.s140-t th:last-child,.s140-t td:last-child{display:none;}.s140-t col.c3{width:40%}.s140-t col.c4{width:24%}.s140-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.s140-ov{padding:0;}.s140-win{border-radius:0;min-height:100%;padding:14px 14px 24px;}.s140-lg{left:6px;bottom:74px;max-width:230px;}.s140-bub{max-width:260px;max-height:360px;}}
`;
  function addCss(doc){ if (doc.getElementById('s140css')) return; const st = doc.createElement('style'); st.id = 's140css'; st.textContent = CSS; doc.head.appendChild(st); }
  addCss(document);

  // ---------- 업무지구 내용(말풍선·창 공통) ----------
  const TOP5 = D.JOBS.slice().sort((a, b) => b.일자리 - a.일자리).slice(0, 5);
  const CMP = [['jobs', '일자리 수', j => j.비교 ? j.비교.일자리[0] : j.일자리, v => manJobs(v)], ['wage', '평균 연봉', j => j.비교 ? j.비교.연봉[0] * 10000 : j.연봉, v => man(v) + '만'], ['hi', '고소득 비중', j => j.고소득, v => Math.round(v * 1000) / 10 + '%']];
  function cmpBars(j, key){
    const m = CMP.find(c => c[0] === key) || CMP[0]; const list = TOP5.some(x => x.이름 === j.이름) ? TOP5 : TOP5.concat([j]);
    const mx = Math.max(...list.map(m[2]));
    return list.map(x => '<div class="r' + (x.이름 === j.이름 ? ' me' : '') + '"><span>' + esc(x.이름) + '</span><div class="t" style="width:' + Math.max(3, Math.round(m[2](x) / mx * 100)) + '%"></div><span class="v">' + esc(m[3](m[2](x))) + '</span></div>').join('');
  }
  const wageTxt = w => w ? '연 ' + man(w) + '만' : '<span class="s140-sm">자료 없음</span>';
  function firmRows(list, wide){
    return '<table class="s141-ft"><colgroup><col><col style="width:' + (wide ? '18%' : '22%') + '"><col style="width:' + (wide ? '20%' : '26%') + '"></colgroup><thead><tr><th>기업(사업장)</th><th class="n">직원</th><th class="n">연봉(추정)</th></tr></thead><tbody>'
      + list.map(f => '<tr><td>' + esc(f.이름) + (wide && f.업종 ? '<span class="up">' + esc(f.업종) + '</span>' : '') + '</td><td class="n">' + f.직원.toLocaleString('ko-KR') + '명</td><td class="n">' + wageTxt(f.연봉) + '</td></tr>').join('') + '</tbody></table>';
  }
  const WAGE_NOTE = '<div class="s141-note">국민연금 신고 소득 기준 사업장 평균 추정, 상한 때문에 고연봉은 낮게</div>';
  // 구현38 ⑥: 대표 역 · 수도권 평균 비교
  const pct1 = v => Math.round(v * 1000) / 10;
  const RANK_HI = D.JOBS.slice().sort((a, b) => b.고소득 - a.고소득).map(x => x.이름);
  const REF3 = ['강남', '여의도', '광교'];
  function stationRow(j){
    const st = j.역 || []; if (!st.length) return '';
    return '<div class="s142-st"><span class="s140-sm">대표 역</span>' + st.map(x => '<span>' + (x[1] || []).map(l => '<i style="background:' + (LINE[l] || '#6b7280') + '" title="' + esc(l) + '"></i>').join('') + esc(x[0]) + '</span>').join('') + '</div>';
  }
  function hiBlock(j){
    const v = pct1(j.고소득), rk = RANK_HI.indexOf(j.이름) + 1;
    const refs = REF3.filter(n => n !== j.이름).map(n => { const x = D.JOBS.find(y => y.이름 === n); return x ? esc(n) + ' ' + pct1(x.고소득) + '%' : ''; }).filter(Boolean).join('·');
    const avg = MET ? pct1(MET.고소득) : null, mx = 100;
    const bar = avg != null ? '<div class="s142-bar" aria-hidden="true"><div class="tr"></div><div class="avg" style="left:' + avg / mx * 100 + '%"></div><div class="me" style="left:' + Math.min(100, v / mx * 100) + '%"></div></div>'
      + '<div class="s142-bl"><span>0%</span><span>▲ 수도권 평균 ' + avg + '%</span><span>100%</span></div>' : '';
    return '<div class="s142-hi"><div class="t">고소득 비중 ' + v + '%' + (D._meta && D._meta.고소득정의 ? '<button type="button" class="s142-i" data-s142-i aria-expanded="false" aria-label="고소득 뜻">i</button>' : '') + '</div>'
      + (D._meta && D._meta.고소득정의 ? '<div class="s142-def" data-s142-def hidden>고소득 = ' + esc(D._meta.고소득정의) + '. 개인 소득이 아니라 사업장 평균 기준이에요.</div>' : '')
      + '<div class="s142-cmp">' + (avg != null ? '<span class="m">수도권 평균</span> ' + avg + '% · ' : '') + '<span class="m">17곳 중</span> ' + rk + '위' + (refs ? ' · ' + refs : '') + '</div>' + bar + '</div>';
  }
  function wageCmp(j){ return '<div class="s142-cmp">' + (MET ? '<span class="m">평균 연봉 수도권 평균</span> ' + man(MET.연봉) + '만 · ' : '') + '<span class="m">17곳 중</span> ' + j.연봉등수 + '위</div>'; }
  // 구현39 ①: 막대 3개 — 눈금 17곳 최저·평균·최고(평균은 늘 가운데, 왼쪽·오른쪽 따로 늘림)
  const RG = (D._meta && D._meta.비교범위) || null;
  function posOf(v, r){ if (!r) return 50; const [lo, av, hi] = r; if (v <= av) return av > lo ? Math.max(0, 50 * (v - lo) / (av - lo)) : 50; return hi > av ? Math.min(100, 50 + 50 * (v - av) / (hi - av)) : 50; }
  const fmtJobs = n => manJobs(Math.round(n)), fmtWage = v => Math.round(v).toLocaleString('ko-KR') + '만', fmtPct = v => (Math.round(v * 10) / 10) + '%';
  function bars3(j){
    const b = j.비교; if (!b || !RG) return '';
    const one = (label, key, f, info) => { const v = b[key][0], rk = b[key][1], r = RG[key];
      return '<div class="s143-b"><div class="h"><span>' + label + ' <b>' + esc(f(v)) + '</b>' + (info || '') + '</span><span class="rk">17곳 중 ' + rk + '위</span></div>'
        + '<div class="s143-tr" aria-hidden="true"><div class="ln"></div><div class="av"></div><div class="me" style="left:' + posOf(v, r).toFixed(1) + '%"></div></div>'
        + '<div class="s143-bl"><span>최저 ' + esc(f(r[0])) + '</span><span>평균 ' + esc(f(r[1])) + '</span><span><span class="hi">높음 ▶</span> ' + esc(f(r[2])) + '</span></div></div>'; };
    const info = D._meta && D._meta.고소득정의 ? '<button type="button" class="s142-i" data-s142-i aria-expanded="false" aria-label="고소득 뜻">i</button>' : '';
    return '<div class="s143-bars s142-hi">'
      + one('고소득 비중', '고소득', fmtPct, info)
      + (D._meta && D._meta.고소득정의 ? '<div class="s142-def" data-s142-def hidden>고소득 = ' + esc(D._meta.고소득정의) + '. 개인 소득이 아니라 사업장 평균 기준이에요.</div>' : '')
      + one('일자리 수', '일자리', fmtJobs) + one('평균 연봉', '연봉', fmtWage) + '</div>';
  }
  function jobTail(j, lines, n1k){
    return '<div class="s141-sec"><b>접근 노선</b>' + lines + stationRow(j) + '</div>'
      + '<div class="s141-sec"><b>대표 기업 5곳</b>' + firmRows(j.기업, false) + WAGE_NOTE + '</div>'
      + (n1k ? '<div class="s141-sec"><button type="button" class="s141-more" data-s141-more aria-expanded="false">더 보기 — 직원 1,000명 이상 ' + n1k + '곳</button><div data-s141-list hidden>' + firmRows(j.천명, true) + WAGE_NOTE + '</div></div>' : '<div class="s141-note">직원 1,000명 이상 기업 없음</div>')
      + '<div class="s141-sec"><b>상위 5개 업무지구와 비교</b><div class="s141-tabs">' + CMP.map((c, i) => '<button type="button" data-s141-cmp="' + c[0] + '" data-s141-j="' + esc(j.이름) + '"' + (i === 0 ? ' class="on"' : '') + '>' + c[1] + '</button>').join('') + '</div><div class="s141-bars" data-s141-bars>' + cmpBars(j, 'jobs') + '</div>'
      + '<div class="s141-note">비슷한 수준: ' + j.비슷.map(esc).join(' · ') + '</div></div>';
  }
  function jobHtml(j, mode){   // mode: 'bub'(말풍선) | 'win'(창)
    const lines = (j.노선 || []).length ? j.노선.map(lineBadge).join('') : '<span class="s140-sm">업무지구 안·중심 10분 안 역 없음' + (j.노선메모 ? ' · ' + esc(j.노선메모) : '') + '</span>';
    const n1k = (j.천명 || []).length;
    if (j.비교) return '<div class="big">일자리 ' + esc(manJobs(j.비교.일자리[0])) + ' · 평균 연봉 약 ' + esc(fmtWage(j.비교.연봉[0])) + ' ' + bandBadge(j.구간) + '</div>'   // 구현39 ①: 상위 % 뺌, 막대 3개
      + bars3(j) + '<div class="s141-note">국민연금 신고 소득 기준 추정, 상한 때문에 고연봉은 낮게</div>' + jobTail(j, lines, n1k);
    return '<div class="rk">수도권 일자리 ' + esc(top(j.일자리상위)) + ' · 17곳 중 ' + j.일자리등수 + '위</div>'
      + '<div class="big">일자리 ' + esc(manJobs(j.일자리)) + ' · 평균 연봉 약 ' + esc(man(j.연봉)) + '만 ' + bandBadge(j.구간) + '</div>'
      + wageCmp(j) + hiBlock(j) + '<div class="s141-note">국민연금 신고 소득 기준 추정, 상한 때문에 고연봉은 낮게</div>'
      + '<div class="s141-sec"><b>접근 노선</b>' + lines + stationRow(j) + '</div>'
      + '<div class="s141-sec"><b>대표 기업 5곳</b>' + firmRows(j.기업, false) + WAGE_NOTE + '</div>'
      + (n1k ? '<div class="s141-sec"><button type="button" class="s141-more" data-s141-more aria-expanded="false">더 보기 — 직원 1,000명 이상 ' + n1k + '곳</button><div data-s141-list hidden>' + firmRows(j.천명, true) + WAGE_NOTE + '</div></div>' : '<div class="s141-note">직원 1,000명 이상 기업 없음</div>')
      + '<div class="s141-sec"><b>상위 5개 업무지구와 비교</b><div class="s141-tabs">' + CMP.map((c, i) => '<button type="button" data-s141-cmp="' + c[0] + '" data-s141-j="' + esc(j.이름) + '"' + (i === 0 ? ' class="on"' : '') + '>' + c[1] + '</button>').join('') + '</div><div class="s141-bars" data-s141-bars>' + cmpBars(j, 'jobs') + '</div>'
      + '<div class="s141-note">비슷한 수준: ' + j.비슷.map(esc).join(' · ') + '</div></div>';
  }
  function onJobClick(e){   // 말풍선·창 안 단추(어느 문서든)
    const tb = e.target.closest && e.target.closest('[data-s143-i]');
    if (tb){ e.preventDefault(); e.stopPropagation(); const tp = tb.closest('.s140-row').querySelector('[data-s143-tip]'); tp.hidden = !tp.hidden; tb.setAttribute('aria-expanded', String(!tp.hidden)); return true; }
    const ib = e.target.closest && e.target.closest('[data-s142-i]');
    if (ib){ e.preventDefault(); e.stopPropagation(); const df = ib.closest('.s142-hi').querySelector('[data-s142-def]'); df.hidden = !df.hidden; ib.setAttribute('aria-expanded', String(!df.hidden)); return true; }
    const mo = e.target.closest && e.target.closest('[data-s141-more]');
    if (mo){ e.preventDefault(); e.stopPropagation(); const box = mo.parentElement.querySelector('[data-s141-list]'); box.hidden = !box.hidden; mo.setAttribute('aria-expanded', String(!box.hidden)); mo.textContent = (box.hidden ? '더 보기' : '접기') + ' — 직원 1,000명 이상 ' + box.querySelectorAll('tbody tr').length + '곳'; return true; }
    const cb = e.target.closest && e.target.closest('[data-s141-cmp]');
    if (cb){ e.preventDefault(); e.stopPropagation(); const j = D.JOBS.find(x => x.이름 === cb.dataset.s141J); const sec = cb.closest('.s141-sec'); sec.querySelectorAll('[data-s141-cmp]').forEach(b => b.classList.toggle('on', b === cb)); sec.querySelector('[data-s141-bars]').innerHTML = cmpBars(j, cb.dataset.s141Cmp); return true; }
    return false;
  }
  function openJobWin(name){   // 단지 카드에서 업무지구 이름을 누르면 여는 창(말풍선과 같은 내용)
    const j = D.JOBS.find(x => x.이름 === name); if (!j) return;
    const old = document.getElementById('s140ov'); if (old) old.remove();
    const ov = document.createElement('div'); ov.className = 's140-ov'; ov.id = 's140ov';
    ov.innerHTML = '<div class="s140-win s141-win s140-bub" style="max-height:none;max-width:520px;overflow:visible" role="dialog" aria-label="' + esc(j.이름) + ' 업무지구"><button type="button" class="x" aria-label="닫기">×</button><h3>' + esc(j.이름) + ' 업무지구' + tagHtml() + '</h3>' + jobHtml(j, 'win') + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (onJobClick(e)) return; if (e.target === ov || e.target.closest('.x')) ov.remove(); });
  }

  // ---------- 단지 카드 줄 ----------
  // 구현39 ②: 가까운 업무지구 2곳 — "여의도 36분 (접근경로: 5호선) / 마곡 41분 (접근경로: 5호선·9호선)", 숫자 셋은 ⓘ
  function jobRow2(id, c2){
    const c = D.CJ && D.CJ[id];
    const part = z => { const how = z[1] === 0 ? '걸어서' : z[1] != null ? z[1] + '분' : ''; const rt = z[1] === 0 ? '' : '(접근경로: ' + (z[2].length ? z[2].join('·') : '버스·도보') + ')'; return [z[0] + ' ' + how + (rt ? ' ' + rt : ''), '<span class="zs"><button type="button" class="s140-link" data-s141-job="' + esc(z[0]) + '">' + esc(z[0]) + '</button> ' + esc(how) + '</span>' + (rt ? ' <span class="s140-sm">' + esc(rt) + '</span>' : '')]; };
    const ps = c2.map(part);
    const tip = c ? '30분 안 일자리 <b>' + esc(manJobs(c[0])) + '</b> · 수도권 ' + esc(top(c[1])) + ' · 연봉 ' + (c[3] ? bandBadge(c[3]) : '—') + '<br><span class="s140-sm">국민연금 2026-10 사업장 자료로 낸 추정, 통근 분은 대중교통 근사</span>' : '<span class="s140-sm">30분 안 일자리 자료 없음</span>';
    const txt = '접근 가능 일자리 ' + ps.map(p => p[0]).join(' / ');
    const html = '<span class="s140-row s143-row">접근 가능 일자리 ' + ps.map(p => p[1]).join(' <span class="s140-sm">/</span> ') + '<button type="button" class="s143-i" data-s143-i aria-expanded="false" aria-label="일자리 수·연봉 구간 보기">i</button>' + tagHtml()
      + '<span class="s143-tip" data-s143-tip hidden>' + tip + '</span></span>';
    return ['일자리', txt, '', true, html];
  }
  function jobRow(id){
    const c2 = D.CJ2 && D.CJ2[id]; if (c2) return jobRow2(id, c2);   // 구현39 ②
    const c = D.CJ && D.CJ[id]; if (!c) return null;
    const [n30, pct, w, bn, zone, mins, route] = c;
    const how = mins === 0 ? '걸어서 닿는 거리' : mins != null ? '약 ' + mins + '분' : '';
    const rt = mins ? (route.length ? '경로: ' + route.join('→') : '경로: 버스·도보') : '';
    const txt = '접근 가능 일자리 ' + manJobs(n30) + ' · 연봉 ' + (bn ? bn + '구간' : '—') + ' · 가까운 업무지구 ' + zone + ' ' + how + (rt ? '(' + rt + ')' : '');
    const html = '<span class="s140-row">접근 가능 일자리 <b>' + esc(manJobs(n30)) + '</b> <span class="s140-sm">30분 안 · ' + esc(top(pct)) + '</span> · ' + bandBadge(bn, '연봉 ')
      + ' · 가까운 업무지구 <button type="button" class="s140-link" data-s141-job="' + esc(zone) + '">' + esc(zone) + '</button> ' + esc(how) + (rt ? ' <span class="s140-sm">(' + esc(rt) + ')</span>' : '') + tagHtml() + '</span>';
    return ['일자리', txt, '', true, html];
  }

  // ---------- 통학권 고교(구현38 ①: 종합 등급 두 안) ----------
  const G7C = { 최상: '#0b5e6b', 상: '#2f7fe0', 중상: '#4f9a6a', 중: '#8a94a3', 중하: '#c08a2e', 하: '#d06a3a', 최하: '#b8474b' };   // 구현39 ④: 7단계 색
  const gradeBadge = p => p && p.단계 ? '<span class="s143-g7" style="background:' + (G7C[p.단계] || '#8a94a3') + '">종합 ' + p.단계 + '</span>' : '<span class="s142-gd na">등급 없음</span>';
  const basisTag = p => !p ? '' : p.기준 === '진학률' ? '<span class="s142-kt">진학률 기준</span>' : p.기준 === '빈칸' ? '<span class="s142-kt">자료 없음</span>' : '';
  function schoolRow(id){
    if (JOBS_ONLY) return null;
    const n = D.SN[id]; if (!n) return null; const s = D.SCHOOLS[n[0]], p = s.g7;   // 구현39 ④: 한 안(7단계)
    const txt = '통학권 고교: ' + s.짧은 + ' 종합 ' + (p && p.단계 ? p.단계 : '등급 없음') + (p && p.상위 != null ? ' 상위 ' + p.상위 + '%' : '') + (p && p.기준 === '진학률' ? ' (진학률 기준)' : '') + ' ' + dist(n[1]);
    const html = '<span class="s140-row">통학권 고교: <button type="button" class="s140-link" data-s140-school="' + n[0] + '">' + esc(s.짧은) + '</button> ' + gradeBadge(p)
      + (p && p.상위 != null ? ' <span class="s140-sm">수도권 상위 ' + p.상위 + '%</span>' : '') + basisTag(p) + ' · ' + esc(dist(n[1])) + ' <span class="s140-sm">' + esc(s.유형) + '</span>' + tagHtml() + '</span>';
    return ['고교', txt, '', true, html];
  }
  function rows(id){ return [jobRow(id), schoolRow(id)].filter(Boolean); }

  // ---------- 학교 창 ----------
  function shortBasis(b){ b = b || ''; return /최초합/.test(b) ? '최초합' : /추합 포함/.test(b) ? '합격(추합 포함)' : /최종/.test(b) ? '최종합격' : /등록/.test(b) ? '등록' : '합격'; }
  function openSchool(k){
    k = +k; const s = D.SCHOOLS[k]; if (!s) return;
    const old = document.getElementById('s140ov'); if (old) old.remove();
    const yrs = ['2021', '2022', '2023', '2024', '2025', '2026'];
    const byY = {}; (s.막대 || []).forEach(b => { if (!byY[b.학년도]) byY[b.학년도] = b; });
    const mx = Math.max(1, ...Object.values(byY).map(b => b.값));
    const bars = '<div class="s140-bars">' + yrs.map(y => { const b = byY[y]; return '<div class="s140-bar">' + (b ? '<span class="val">' + b.값 + '</span><div class="b" style="height:' + Math.max(6, Math.round(b.값 / mx * 120)) + 'px"></div>' : '<span class="val s140-sm">—</span><div class="b na"></div>') + '</div>'; }).join('') + '</div>'
      + '<div class="s140-blab">' + yrs.map(y => '<div><b>' + y + '</b>' + (byY[y] ? esc(shortBasis(byY[y].기준)) : '자료 없음') + '</div>').join('') + '</div>';
    const card = (k_, v, n) => '<div class="s140-card"><div class="k">' + k_ + '</div><div class="v' + (String(v).length > 6 ? ' sm' : '') + '">' + v + '</div><div class="n">' + n + '</div></div>';
    const cv = (v, u) => v != null ? v + u : '—';
    const cards = '<div class="s140-cards">'
      + card('서울대', cv(s.서울대, '명'), s.서울대 != null ? '2026 중심(학교·언론 표)' : '찾은 표에 없음')
      + card('연세대·고려대', s.연세대 != null || s.고려대 != null ? (s.연세대 || 0) + '·' + (s.고려대 || 0) : '—', s.연세대 != null || s.고려대 != null ? '학교 공개 집계' : '찾은 표에 없음')
      + card('의치한약수', cv(s.의치한약수, '건'), s.의치한약수 != null ? '합격 건수(중복 가능)' : '찾은 표에 없음')
      + card('4년제 진학', s['4년제비중'] != null ? s['4년제비중'] + '%' : '—', '2025 졸업생 대비') + '</div>'
      + (s.자료 ? '<div class="s140-sm" style="margin-top:4px">자료: ' + esc(s.자료) + '</div>' : '');
    const gp = s.g7;   // 구현39 ④: 한 안·7단계
    const top = '<div class="s142-top"><div class="k">종합 등급(서울대 + 의치한약수 ÷ 졸업생, 실적 없는 학교는 4년제 진학 비중)</div>'
      + '<div class="v">' + (gp && gp.단계 ? '<span class="s143-g7" style="font-size:20px;line-height:32px;padding:0 12px;background:' + (G7C[gp.단계] || '#8a94a3') + '">' + esc(gp.단계) + '</span> <small>(최상·상·중상·중·중하·하·최하)</small>' : '등급 없음') + '</div>'
      + '<div>' + (gp && gp.상위 != null ? '수도권 상위 <b>' + gp.상위 + '%</b>' : '') + basisTag(gp) + '</div>'
      + (gp && gp.기준 === '실적' && gp.지표 != null ? '<div class="s140-sm">(서울대 ' + (s.서울대 != null ? s.서울대 : 0) + '명 + 의치한약수 ' + (s.의치한약수 != null ? s.의치한약수 : 0) + '건) ÷ 2025 졸업생 ' + s.졸업자 + '명 = ' + gp.지표 + '%</div>'
        : gp && gp.기준 === '진학률' ? '<div class="s140-sm">실적 자료가 없어 4년제 진학 비중으로 매겼어요</div>' : '') + '</div>';
    const tbl = (s.실적 || []).length ? '<table class="s140-t"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col></colgroup><thead><tr><th>학년도</th><th>구분</th><th>기준</th><th>값</th><th>출처</th></tr></thead><tbody>' + s.실적.map(a => '<tr><td>' + esc(a.학년도) + '</td><td>' + esc(a.구분) + '</td><td>' + esc(a.기준) + '</td><td><b>' + esc(a.값) + '</b></td><td class="s140-sm">' + esc(a.출처) + '</td></tr>').join('') + '</tbody></table>'
      + '<div class="s140-sm" style="margin-top:4px">출처: ' + esc([...new Set(s.실적.map(a => a.출처))].join(' / ')) + '</div><div class="s140-sm" style="margin-top:4px">"없음"은 찾은 공개 표에 그 학교 값이 없다는 뜻이에요(추측으로 채우지 않음). 의대는 합격 건수라 한 학생의 중복 합격이 들어갈 수 있어요.</div>'
      : '';
    const apts = (s.통학권 || []).length ? s.통학권.map(a => { const j = a[3]; return '<div class="s140-apt"><div><span class="nm">' + esc(a[1]) + '</span> <span class="s140-sm">' + esc(dist(a[2])) + '</span></div><div class="r">' + (j ? '<span class="s140-bd ' + badgeCls(j.배지) + '">' + esc(j.배지) + '</span> <span class="s140-sm">' + esc(j.칸) + '평 칸</span><br><span class="s140-sm">현재 ' + eok(j.현재가) + ' · 적정 </span><b>' + eok(j.적정가) + '</b>' : '<span class="s140-sm">판정 없음</span>') + '</div></div>'; }).join('')
      : '<div class="s140-sm">같은 학교군 · 1km 안에 좌표 있는 단지가 없어요.</div>';
    const seoul = /^서울/.test(s.주소);
    const ov = document.createElement('div'); ov.className = 's140-ov'; ov.id = 's140ov';
    ov.innerHTML = '<div class="s140-win" role="dialog" aria-label="' + esc(s.이름) + '"><button type="button" class="x" aria-label="닫기">×</button>'
      + '<h3>' + esc(s.이름) + '</h3><div class="s140-sm">' + esc(s.유형) + ' · ' + esc(s.설립) + ' · ' + esc(s.주소) + ' · ' + esc(s.학교군 || '') + '' + tagHtml() + '</div>'
      + top
      + '<div class="sec"><h5>진학 실적</h5>' + cards + '</div>'
      + ((s.막대 || []).length ? '<div class="sec"><h5>서울대 연도별(학년도 · 기준)</h5>' + bars + '</div>' : '')
      + ((s.실적 || []).length ? '<div class="sec"><h5>실적 표와 출처</h5>' + tbl + '</div>' : '')
      + '<div class="sec"><h5>통학권 아파트(같은 학교군 + 1km, 거리순) · 우리 판정</h5>' + apts + '</div>'
      + '<div class="s140-note">' + (seoul ? '서울은 지원 후 추첨 배정이라 통학권은 배정 확정이 아닙니다.' : '고교 배정 방식은 지역마다 달라 통학권은 배정 확정이 아닙니다.') + ' 판정은 계산기 기준이며 투자 권유가 아니에요.</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.x')) ov.remove(); });
  }

  function rows(id){ return [jobRow(id), schoolRow(id)].filter(Boolean); }

  // ---------- 클릭(카드 안·말풍선 안) ----------
  const hostApi = () => { try { return window.top !== window && window.top.SIAN_L140 ? window.top.SIAN_L140 : null; } catch (er) { return null; } };
  document.addEventListener('click', e => {
    if (onJobClick(e)) return;
    const jb = e.target.closest && e.target.closest('[data-s141-job]');
    if (jb){ e.preventDefault(); e.stopPropagation(); (hostApi() || api).openJobWin(jb.dataset.s141Job); return; }
    const sc = e.target.closest && e.target.closest('[data-s140-school]');
    if (sc){ e.preventDefault(); e.stopPropagation(); (hostApi() || api).openSchool(sc.dataset.s140School); }
  }, true);

  // ---------- 지도 층 [일자리] ----------
  const L = { on: false, circles: [], bub: null, lg: null };
  function bubHtml(j){
    return '<div class="s140-bub" style="position:relative"><button type="button" class="x" data-s140-x aria-label="닫기">×</button><h4>' + esc(j.이름) + '' + tagHtml() + '</h4>' + jobHtml(j, 'bub') + '</div>';
  }
  function openJob(name){
    const map = window.MAP_L140, NV = window.naver && naver.maps; if (!map || !NV) return false;
    const j = D.JOBS.find(x => x.이름 === name); if (!j) return false;
    if (!L.on) setOn(true);
    if (L.bub) L.bub.close();
    L.bub = new NV.InfoWindow({ content: bubHtml(j), borderWidth: 0, backgroundColor: 'transparent', disableAnchor: false, anchorSize: new NV.Size(10, 8), anchorColor: '#fff', pixelOffset: new NV.Point(0, -6) });
    L.bub.open(map, new NV.LatLng(j.lat, j.lng));
    return true;
  }
  function draw(){
    const map = window.MAP_L140, NV = window.naver && naver.maps; if (!map || !NV) return;
    const maxJ = Math.max(...D.JOBS.map(j => j.일자리));
    D.JOBS.forEach(j => {
      const col = BAND[j.구간] || '#6b7280';
      const c = new NV.Circle({ map, center: new NV.LatLng(j.lat, j.lng), radius: Math.round(800 + 4500 * Math.sqrt(j.일자리 / maxJ)), fillColor: col, fillOpacity: 0.42, strokeColor: col, strokeOpacity: 0.95, strokeWeight: 2, clickable: true, zIndex: 40 });
      NV.Event.addListener(c, 'click', () => openJob(j.이름));
      L.circles.push(c);
    });
  }
  function setOn(on){
    L.on = on; const b = document.getElementById('s140JobBtn'); if (b){ b.setAttribute('aria-pressed', String(on)); b.classList.toggle('active', on); }
    if (on){ if (!L.circles.length) draw(); else L.circles.forEach(c => c.setMap(window.MAP_L140)); if (L.lg) L.lg.hidden = false; }
    else { L.circles.forEach(c => c.setMap(null)); if (L.bub) L.bub.close(); if (L.lg) L.lg.hidden = true; }
  }
  function wireMap(){
    const vb = document.querySelector('.cm84-vbtns'); if (!vb || !window.MAP_L140 || document.getElementById('s140JobBtn')) return !!document.getElementById('s140JobBtn');
    vb.insertAdjacentHTML('beforeend', '<button type="button" id="s140JobBtn" aria-pressed="false" title="일자리(업무지구) — ' + TAG + '">일자리</button>');
    document.getElementById('s140JobBtn').addEventListener('click', () => setOn(!L.on));
    const me = document.querySelector('.cm84-map') || (vb.closest('section') || document.body);
    const lg = document.createElement('div'); lg.className = 's140-lg'; lg.hidden = true;
    lg.innerHTML = '<b>일자리</b>' + tagHtml() + '<br>원 크기 = 일자리 수 · 색 = 평균 연봉 구간(추정)'
      + [1, 2, 3, 4, 5].map(k => '<div class="li"><i style="background:' + BAND[k] + '"></i>' + k + '구간 <span class="s140-sm">' + esc(bandRange(k)) + '</span></div>').join('');
    (window.MAP_L140.getElement ? window.MAP_L140.getElement() : me).appendChild(lg); L.lg = lg;
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-s140-x]') && L.bub) L.bub.close(); }, true);
    return true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { addCss(document); });
  // 구현38 ①: 화면 구석 꼬리표(맨 위 문서만)
  if (false && !JOBS_ONLY && window.top === window){ const put = () => {   // 구현39 ④: 시안 가/나 꼬리표 없앰
 if (document.getElementById('s142plan')) return; const t = document.createElement('div'); t.id = 's142plan'; t.className = 's142-plan'; t.textContent = '시안 ' + PLAN; document.body.appendChild(t); }; if (document.body) put(); else document.addEventListener('DOMContentLoaded', put); }
  let tries = 0; const iv = setInterval(() => { if (wireMap() || ++tries > 120) clearInterval(iv); }, 500);
  const findSchool = name => D.SCHOOLS.findIndex(x => x.짧은 === name || x.이름 === name);
  const api = { rows, openSchool, openJob, openJobWin, setOn, data: D, plan: PLAN, findSchool };
  window.SIAN_L140 = api;
})();
