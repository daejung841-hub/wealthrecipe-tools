// 시장 42: 시황 분석 [지표 모아 보기] 탭 — 여러 지역의 시계열·기본 지표를 한 화면에서 비교
// 새 계산·새 수집 없음. 시황 분석·지역 분석이 이미 쓰는 data 파일만 읽음(첫 탭 열 때 한 번).
// 1단계: KB 매매·전세지수, 전세수급지수, 전세가율 / 2단계: 전망지수 2, 전환율, 전세대출 금리, 매수 저울, 입주 물량, 거래량, 체력 + [두 지표 같이 보기]
// 시장 43: [그래프 / 표] 전환·CSV 받기, [지역 고르기] 판(표는 16곳), 전세대출 금리는 '전국' 하나, 체력은 매매체력_시장43(단순 평균 · 그래프 ±40% 자름 없음, 지금 값은 시장29와 같음)
(function(){
'use strict';
const DD = n => 'data/' + encodeURIComponent('지역') + '/' + encodeURIComponent(n);
const D0 = n => 'data/' + encodeURIComponent(n);
const $m = s => document.querySelector(s);
let KB = null, JSU = {}, JR = {}, TREE = [], BG = {}, SUP = {}, VOL = {}, BODY = {}, OUT = {}, MOE = {}, LOADED = false, LOADING = null;
const SDN = {'서울특별시':'11', '경기도':'41', '인천광역시':'28'};
// ---- 지표 ----
// get(c) → {YYYYMM:v} 또는 null(그 지역 자료 없음). unit = 숫자 뒤 글자, chg = 1년 변화('pct' 비율 / 'pt' 차이), avg = 평균 점선 켤 수 있음, int = 정수(호·건)
const IND = [
  {k:'buy', g:'가격', name:'KB 매매지수', unit:'', chg:'pct', avg:false, scope:'시도·구·시(수도권 없음)',
   tip:'KB국민은행이 매달 내는 아파트 매매가격 지수(기준 달 = 100). 높을수록 기준 달보다 집값이 많이 오른 상태입니다. 지역마다 기준이 같아 오른 폭을 비교할 수 있습니다.',
   get:c => kbS(c, '매매지수')},
  {k:'jeon', g:'가격', name:'KB 전세지수', unit:'', chg:'pct', avg:false, scope:'시도·구·시(수도권 없음)',
   tip:'KB 아파트 전세가격 지수(기준 달 = 100). 높을수록 전세값이 많이 오른 상태입니다. 전세는 실제로 살려고 내는 값이라 거품이 적습니다.',
   get:c => kbS(c, '전세지수')},
  {k:'jsu', g:'수급', name:'전세수급지수', unit:'', chg:'pt', avg:true, ref:{v:100, lab:'100'}, scope:'서울·경기·인천만(시도 단위)',
   tip:'KB 전세수급지수(0~200). 100보다 높으면 전세를 구하는 사람이 내놓는 사람보다 많다(전세 구하기 어려움), 낮으면 전세가 남는다는 뜻입니다. 회색 점선 = 100 기준선.',
   get:c => String(c).length === 2 ? (JSU['지역'] || {})[c] || null : null},
  {k:'jr', g:'수급', name:'전세가율', unit:'%', chg:'pt', avg:true, scope:'수도권·시도·구·시',
   tip:'전세가 ÷ 매매가(%). 높을수록 매매가가 전세가에 바짝 붙어 매매로 넘어갈 힘이 큰 상태, 낮을수록 전세가 더 올라야 하는(오를 여지가 있는) 상태입니다. 평균 점선 = 그 지역 자료 전체 기간 평균.',
   get:c => c === 'SDK' ? ((JR['수도권'] || {})['월'] || null) : c === '11' && JR['서울'] ? JR['서울']['월'] : kbS(c, '전세가율')},
  {k:'outs', g:'심리', name:'매매 전망지수', unit:'', chg:'pt', avg:true, scope:'서울만',
   tip:'KB 매매가격 전망지수(0~200). 중개업소에 앞으로 매매가가 오를지 물은 값으로, 100보다 높으면 오른다는 답이 많다는 뜻입니다. 이 화면 자료에는 서울만 있습니다.',
   get:c => c === '11' ? OUT.s : null},
  {k:'outj', g:'심리', name:'전세 전망지수', unit:'', chg:'pt', avg:true, scope:'서울만',
   tip:'KB 전세가격 전망지수(0~200). 100보다 높으면 앞으로 전세가가 오른다는 답이 많다는 뜻입니다. 이 화면 자료에는 서울만 있습니다.',
   get:c => c === '11' ? OUT.j : null},
  {k:'cv', g:'금리', name:'전월세 전환율', unit:'%', dp:2, chg:'pt', avg:true, scope:'서울·경기·인천·수도권(시도 단위)',
   tip:'전세를 월세로 바꿀 때 쓰는 연 이율(KB). 높을수록 월세가 비싼 편이라 사람들이 전세를 찾습니다. 수도권 = 세 곳 평균.',
   get:c => rateS(c, '전환율')},
  {k:'ln', g:'금리', name:'전세대출 금리', unit:'%', dp:2, chg:'pt', avg:true, nat:true, scope:'전국 하나의 값(지역 구분 없음)',
   tip:'전세자금대출 평균 금리(%). 높을수록 전세를 얻는 비용(이자)이 커져 전세 수요가 월세로 빠질 수 있습니다. 전환율보다 높으면 "전세대출이 월세보다 비싼" 상태입니다. 자료가 전국 하나의 값이라 고른 지역과 관계없이 "전국" 선 하나로 그립니다.',
   get:c => c === 'KR' ? rateS('11', '대출') : null},
  {k:'scale', g:'금리', name:'매수 저울', unit:'%p', dp:2, chg:'pt', avg:true, scope:'서울·경기·인천(시도 단위)',
   tip:'전월세 전환율 − 주택담보대출 금리(%p). 0보다 크면 월세 내는 것보다 집을 사서 이자 내는 쪽이 싸다(사는 쪽이 유리), 0보다 작으면 사는 쪽 이자 부담이 더 크다는 뜻입니다. 시황 분석의 매수 저울과 같은 값.',
   get:c => MOE[c] || null},
  {k:'sup', g:'공급', name:'입주 물량', unit:'호', int:true, chg:'pct', avg:true, scope:'서울·경기·인천·수도권(시도 단위)',
   tip:'아파트 입주(준공) 물량, 최근 12개월 합(호). 많을수록 새 집이 많이 나와 전세·매매값을 누르는 쪽입니다. 실적 달까지만(추정 빼고). 평균 점선 = 그 지역 자료 기간 평균.',
   get:c => supS(c)},
  {k:'vol', g:'거래', name:'매매 거래량', unit:'건', int:true, chg:'pct', avg:true, ma3:true, scope:'수도권·시도·구·시',
   tip:'한 달 아파트 매매 거래 건수(국토부 실거래, 해제 신고 뺌). 늘면 사려는 사람이 움직이기 시작했다는 뜻입니다. 아직 신고가 덜 들어온 최근 2개월은 뺐습니다. 회색 잔 점선 = 그 지역 최근 3개월 평균(그 달과 앞 2개월, 그리는 선만).',
   get:c => volS(c)},
  {k:'body', g:'저평가', name:'저평가 지수(체력)', unit:'%', chg:'pt', avg:true, ref:{v:5, lab:'+5%'}, now:true, scope:'수도권·시도·구·시',
   tip:'저평가 계산기 값의 지역 평균(준공 25년차 이내 단지의 단순 평균). 높을수록 그 지역 아파트가 기준선보다 싸게(저평가) 거래되고 있다는 뜻입니다. 순위표의 "지금 값"은 지역 분석 매매 탭의 체력(계산기 지금 값)과 같은 값입니다. 그래프 선과 순위표의 "그래프 끝값"은 과거 흐름을 같은 식으로 다시 이은 체력 이력의 마지막 값이라, 지역 분석의 계산기 지금 값과 다를 수 있음. 회색 점선 = +5% 기준선.',
   get:c => bodyS(c)}
];
function kbS(c, k){ const o = ((KB || {})[c] || {})[k]; if (!o) return null; const out = {}; Object.keys(o).forEach(t => { const v = o[t] && o[t][0]; if (v != null && isFinite(v)) out[t] = +v; }); return Object.keys(out).length ? out : null; }
function rateS(c, k){ const o = ((BG['금리'] || {})[c] || {})[k]; if (!o) return null; const out = {}; Object.keys(o).forEach(t => { if (o[t] != null && isFinite(o[t])) out[t] = +o[t]; }); return Object.keys(out).length ? out : null; }
function supS(c){ const e = (SUP['지역'] || {})[c]; if (!e) return null; const end = +((SUP['_설명'] || {})['마지막 실적 달'] || 0), out = {};
  e['월'].forEach((t, i) => { if (+t > end || i < 11) return; let s = 0, ok = true; for (let j = i - 11; j <= i; j++){ const v = e['입주'][j]; if (v == null){ ok = false; break; } s += v; } if (ok) out[t] = s; }); return Object.keys(out).length ? out : null; }
function volS(c){ const o = (VOL['지역'] || {})[c]; if (!o) return null; const skip = new Set(((VOL['_설명'] || {})['덜 센 달'] || []).map(String)), out = {};
  Object.keys(o).forEach(t => { if (!skip.has(t) && o[t] != null) out[t] = +o[t]; }); return Object.keys(out).length ? out : null; }
function bodyS(c){ const e = (BODY['지역'] || {})[c]; const h = e && e['체력 이력']; if (!h || !h.v) return null; const out = {};
  h.v.forEach((v, i) => { if (v != null && isFinite(v)) out[String(mT(mIdx(h.s) + i))] = +v; }); return Object.keys(out).length ? out : null; }
// ---- 지역 ----
const BASE = [{c:'11', n:'서울'}, {c:'41', n:'경기'}, {c:'28', n:'인천'}, {c:'SDK', n:'수도권'}];
const FIXCOL = {'11':'#2F6FE0', '41':'#1E8E5A', '28':'#E8590C', 'SDK':'#6741D9', 'KR':'#343A40'};
const MAXG = 8, MAXT = 16;   // 더할 수 있는 구·시: 그래프 8곳, 표 16곳
const MORECOL = ['#C2255C', '#0C8599', '#A9720E', '#495057', '#9C36B5', '#5C940D', '#D9480F', '#364FC7', '#087F5B', '#862E9C'];
const COLMAP = {};   // 지역 → 색(한 번 정하면 고정: 지역을 빼고 넣어도 같은 색)
let nextCol = 0;
const colOf = c => FIXCOL[c] || COLMAP[c] || (COLMAP[c] = MORECOL[nextCol++ % MORECOL.length]);
const S = {ind:'buy', ind2:'jsu', two:false, regs:BASE.map(r => r.c), extra:[], per:'10', view:'over', avg:true, sortK:null, sortD:-1, tipOpen:null, mode:'chart', pick:false};
const nameOf = c => { if (c === 'KR') return '전국'; const b = BASE.find(r => r.c === c); if (b) return b.n; const r = TREE.find(x => x.c === c); if (!r) return c; const p = TREE.find(x => x.c === r.p);
  return r.lv === '구' && p && p.lv === '시' ? `${p.n.replace(/시$/, '')} ${r.n}` : r.lv === '구' && r.p === '28' ? `인천 ${r.n}` : r.n; };
const hasData = (I, c) => { const o = I.get(c); return !!(o && Object.keys(o).length); };
const okFor = (I, c) => !!I.nat || hasData(I, c);   // 전국 값 하나인 지표는 지역 고르기와 관계없음
const maxX = () => S.mode === 'table' ? MAXT : MAXG;
// 실제로 그릴 지역: 전국 지표면 '전국' 하나, 그래프는 더한 구·시 앞 8곳까지, 표는 16곳까지
const regsFor = I => I.nat ? ['KR'] : S.regs.concat(S.mode === 'table' ? S.extra : S.extra.slice(0, MAXG));
// ---- 시간·숫자 ----
const mIdx = t => { t = +t; return Math.floor(t / 100) * 12 + (t % 100) - 1; };
const mT = i => Math.floor(i / 12) * 100 + (i % 12) + 1;
const ym = t => { t = +t; return `${Math.floor(t / 100)}-${String(t % 100).padStart(2, '0')}`; };
const fmt = (v, I) => v == null || !isFinite(v) ? '—' : I.int ? Math.round(v).toLocaleString('ko-KR') + I.unit : (I.unit === '%p' && v > 0 ? '+' : '') + v.toFixed(I.dp ?? 1) + I.unit;
const axFmt = (v, I) => I.int ? (Math.abs(v) >= 10000 ? +(v / 10000).toFixed(1) + '만' : Math.round(v).toLocaleString('ko-KR')) : +v.toFixed(2) + (I.unit === '%p' ? '' : I.unit);
const chgLab = I => I.chg === 'pct' ? '1년 변화(%)' : `1년 변화(${I.unit === '%' || I.unit === '%p' ? '%p' : 'pt'})`;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
// ---- 자료 불러오기(첫 탭 열 때) ----
function csvRows(txt){ const rows = []; let row = [], cur = '', q = false; txt = txt.replace(/^﻿/, '');
  for (let i = 0; i < txt.length; i++){ const ch = txt[i];
    if (q){ if (ch === '"'){ if (txt[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ','){ row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r'){ if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  if (cur !== '' || row.length){ row.push(cur); rows.push(row); } return rows; }
const J = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(decodeURIComponent(u) + ' ' + r.status));
const T = u => fetch(u).then(r => r.ok ? r.text() : Promise.reject(decodeURIComponent(u) + ' ' + r.status));
function load(){ if (LOADED) return Promise.resolve(); if (LOADING) return LOADING;
  LOADING = Promise.all([J(DD('kb_시구_시장25.json')), J(DD('전세수급_KB.json')), J(DD('전세가율.json')), J(DD('지역트리.json')), J(DD('보강_시장24.json')), J(DD('공급_시장18.json')), J(DD('거래량_시장22.json')), J(DD('매매체력_시장45.json')), T(D0('전망_선도단지_서울_시장32.csv')), T(D0('모음표_화면용.csv'))])
    .then(([k, j, r, t, bg, sp, vo, bd, out, moe]) => { KB = k; JSU = j; JR = r; TREE = t; BG = bg; SUP = sp; VOL = vo; BODY = bd;
      const o = csvRows(out), h = o[0] || [], is = h.findIndex(x => x.startsWith('매매가격전망지수')), ij = h.findIndex(x => x.startsWith('전세가격전망지수')); OUT = {s:{}, j:{}};
      o.slice(1).forEach(r => { if (!/^\d{6}$/.test(r[0])) return; if (is >= 0 && r[is] !== '' && isFinite(r[is])) OUT.s[r[0]] = +r[is]; if (ij >= 0 && r[ij] !== '' && isFinite(r[ij])) OUT.j[r[0]] = +r[ij]; });
      const m = csvRows(moe), mh = m[0] || [], ic = mh.findIndex(x => x.startsWith('스프레드2')); MOE = {};
      if (ic >= 0) m.slice(1).forEach(r => { const c = SDN[r[1]]; if (!c || !/^\d{6}$/.test(r[0]) || r[ic] === '' || !isFinite(r[ic])) return; (MOE[c] = MOE[c] || {})[r[0]] = +r[ic]; });
      LOADED = true; });
  return LOADING; }
// ---- 화면 틀 ----
function frame(){ const box = $m('#mo'); if (box.dataset.built) return; box.dataset.built = '1'; css();
  box.innerHTML = `<h2>지표 모아 보기 <span class="sub">여러 지역의 같은 지표를 한 그림에 겹쳐 비교합니다 · 자료는 시황 분석·지역 분석과 같은 파일</span></h2>
  <div class="mo-row"><span class="mo-lab">지표</span><div class="mo-chips" id="moInd" role="group" aria-label="지표 고르기"></div></div>
  <div class="mo-note" id="moIndNote" hidden></div>
  <div class="mo-row"><span class="mo-lab">지역</span><div class="mo-chips" id="moReg" role="group" aria-label="지역 고르기"></div>
    <span class="mo-srch"><input id="moQ" type="search" placeholder="구·시 이름으로 추가 (최대 8곳)" autocomplete="off" aria-label="구·시 검색"><ul id="moQL" hidden></ul></span>
    <button type="button" class="moxPickB" id="moxPickB" aria-expanded="false" aria-controls="moxPick">지역 고르기 ▾</button></div>
  <div id="moxPick" class="moxPick" hidden></div>
  <div class="mo-row mo-ctl"><span class="seg" id="moxMode" role="group" aria-label="그래프 또는 표"><button data-m="chart">그래프</button><button data-m="table">표</button></span>
    <span class="seg" id="moPer" role="group" aria-label="기간"><button data-p="3">3년</button><button data-p="10">10년</button><button data-p="all">전체</button></span>
    <span class="seg" id="moView" role="group" aria-label="표시 방식"><button data-v="over">겹쳐 보기</button><button data-v="small">지역별 작은 그래프</button></span>
    <span class="seg" id="moTwo" role="group" aria-label="두 지표"><button data-two="1">두 지표 같이 보기</button></span>
    <label class="mo-avg" id="moAvgL"><input type="checkbox" id="moAvg"> 지역별 평균 점선</label></div>
  <div id="moxNote" class="mo-miss"></div>
  <div id="moMiss" class="mo-miss"></div>
  <div id="moxRd"></div>
  <div id="moPlot" class="mo-plot"></div>
  <div id="moTwoBox" class="mo-two" hidden><div class="mo-row"><span class="mo-lab">지표 2</span><div class="mo-chips" id="moInd2" role="group" aria-label="두 번째 지표"></div></div><div id="moMiss2" class="mo-miss"></div><div id="moxRd2"></div><div id="moPlot2" class="mo-plot"></div></div>
  <h3 class="mo-h3">지금 순위표 <span class="sub" id="moTsub"></span></h3>
  <div class="mo-tw"><table class="mo-t" id="moT"></table></div>
  <div class="mo-foot">자료: KB 아파트 매매·전세지수·전세가율·전세수급·전망지수, KB 전월세 전환율·전세대출 금리·주담대 금리(모음표), 국토부 입주(준공)·실거래 거래량, 저평가 계산기 체력 — 시황 분석·지역 분석과 같은 파일.<br>과거 평균 대비 위치 = 지금 값이 그 지역 자료 전체 평균보다 표준편차의 0.5배 넘게 낮으면 낮음, 높으면 높음, 그 사이는 보통. [표]의 칸 색도 같은 기준(그 달 값 기준)입니다.</div>`;
  $m('#moPer').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.per = b.dataset.p; draw(); };
  $m('#moxMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.mode = b.dataset.m; draw(); };
  $m('#moxPickB').onclick = () => { S.pick = !S.pick; draw(); };
  $m('#moxPick').onchange = e => { const x = e.target.closest('input[data-c]'); if (!x) return; const c = x.dataset.c;
    if (x.checked){ if (S.extra.length >= maxX()){ x.checked = false; return; } if (!S.extra.includes(c)){ S.extra.push(c); colOf(c); } }
    else S.extra = S.extra.filter(v => v !== c);
    draw(); };
  $m('#moxPick').onclick = e => { const b = e.target.closest('button[data-a]'); if (!b) return;
    if (b.dataset.a === 'close') S.pick = false; else if (b.dataset.a === 'clear') S.extra = []; draw(); };
  $m('#moView').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.view = b.dataset.v; draw(); };
  $m('#moTwo').onclick = () => { S.two = !S.two; if (S.two && S.ind2 === S.ind) S.ind2 = IND.find(x => x.k !== S.ind).k; draw(); };
  $m('#moAvg').onchange = e => { S.avg = e.target.checked; draw(); };
  const q = $m('#moQ'), ul = $m('#moQL');
  q.oninput = () => { const s = q.value.trim(); if (!s){ ul.hidden = true; return; } const I = IND.find(x => x.k === S.ind);
    const hits = TREE.filter(r => r.c.length > 2 && (r.n.includes(s) || nameOf(r.c).includes(s)) && !S.extra.includes(r.c)).slice(0, 10);
    ul.innerHTML = hits.length ? hits.map(r => { const ok = okFor(I, r.c); return `<li><button type="button" data-c="${r.c}"${ok ? '' : ' disabled'}>${esc(nameOf(r.c))}<small>${esc(r.kb.replace(/>/g, ' › '))}${ok ? '' : ` · ${esc(I.name)} 자료 없음(${esc(I.scope)})`}</small></button></li>`; }).join('') : '<li class="none">맞는 구·시가 없습니다</li>';
    ul.hidden = false; };
  ul.onpointerdown = e => { const b = e.target.closest('button[data-c]'); if (!b || b.disabled) return; e.preventDefault();
    if (S.extra.length >= maxX()){ ul.innerHTML = `<li class="none">구·시는 ${S.mode === 'table' ? '표에서 16곳' : '그래프에서 8곳(표에서는 16곳)'}까지 더할 수 있습니다</li>`; return; }
    S.extra.push(b.dataset.c); colOf(b.dataset.c); q.value = ''; ul.hidden = true; draw(); };
  q.onblur = () => setTimeout(() => ul.hidden = true, 150);
  let rz = 0, lw = innerWidth; addEventListener('resize', () => { if (innerWidth === lw) return; lw = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (document.body.classList.contains('moMode') && LOADED) draw(); }, 200); });
}
function chipsInd(id, cur, other){ let g0 = null;
  return IND.map(x => { const sep = x.g !== g0 ? `<span class="mo-grp">${x.g}</span>` : ''; g0 = x.g;
    return `${sep}<span class="mo-ic"><button data-k="${x.k}" aria-pressed="${x.k === cur}"${x.k === other ? ' disabled title="위 그래프에서 고른 지표"' : ''}>${x.name}</button>${id === 'moInd' ? `<button class="mo-i" data-i="${x.k}" aria-label="${x.name} 설명" aria-expanded="${S.tipOpen === x.k}">ⓘ</button>` : ''}</span>`; }).join(''); }
// ---- 계열 ----
function buildSer(I, regs){ const all = regs.map(c => ({c, name:nameOf(c), col:colOf(c), o:I.get(c)}));
  return {has:all.filter(s => s.o && Object.keys(s.o).length), miss:all.filter(s => !(s.o && Object.keys(s.o).length))}; }
function withPts(has, i0, i1){ return has.map(s => { const vals = Object.values(s.o).map(Number), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length);
  const pts = []; for (let i = i0; i <= i1; i++){ const v = s.o[String(mT(i))]; pts.push(v == null ? null : +v); } return {...s, pts, mean, sd}; }); }
function yRange(ser, avgOn, I){ let lo = Infinity, hi = -Infinity; ser.forEach(s => { s.pts.forEach(v => { if (v != null){ lo = Math.min(lo, v); hi = Math.max(hi, v); } }); if (avgOn){ lo = Math.min(lo, s.mean); hi = Math.max(hi, s.mean); } });
  if (I && I.ref && isFinite(lo)){ lo = Math.min(lo, I.ref.v); hi = Math.max(hi, I.ref.v); }   // 시장 45(8번): 기준선(+5%·100)이 늘 그림 안에 들어오게
  if (!isFinite(lo)){ lo = 0; hi = 1; } if (!(hi > lo)) hi = lo + 1; const pad = (hi - lo) * .06; return [lo - pad, hi + pad]; }
const missTxt = (miss, I) => miss.length ? `자료 없음: ${miss.map(s => esc(s.name)).join(', ')} <small>(${I.name}의 지역 범위: ${I.scope})</small>` : '';
// ---- 그리기 ----
function draw(){
  const I = IND.find(x => x.k === S.ind), regs = regsFor(I), tbl = S.mode === 'table';
  saveUrl();   // 시장 45(9c)
  $m('#moInd').innerHTML = indPicker('moInd', S.ind);
  $m('#moInd').onchange = e => { const sl = e.target.closest('select'); if (!sl) return; S.ind = sl.value; if (S.ind2 === S.ind) S.ind2 = IND.find(x => x.k !== S.ind).k; S.sortK = null; if (S.tipOpen) S.tipOpen = S.ind; draw(); };
  $m('#moInd').onclick = e => { const i = e.target.closest('button.mo-i'); if (i){ S.tipOpen = S.tipOpen === i.dataset.i ? null : i.dataset.i; draw(); return; }
    const b = e.target.closest('button[data-k]'); if (b){ S.ind = b.dataset.k; if (S.ind2 === S.ind) S.ind2 = IND.find(x => x.k !== S.ind).k; S.sortK = null; draw(); } };
  const TI = IND.find(x => x.k === S.tipOpen);
  $m('#moIndNote').innerHTML = TI ? `<b>${TI.name}</b> · ${TI.tip} <span class="mo-sc">고를 수 있는 지역: ${TI.scope}</span>` : '';
  $m('#moIndNote').hidden = !TI;
  // 지역 칩: 기본 4곳(켜고 끔, 이 지표 자료 없으면 흐리게) + 더한 구·시(×로 뺌)
  $m('#moReg').innerHTML = BASE.map(r => { const ok = !I.nat && hasData(I, r.c); return `<button data-c="${r.c}" aria-pressed="${ok && S.regs.includes(r.c)}"${ok ? '' : ` disabled title="${I.nat ? `${esc(I.name)}는 전국 값 하나라 지역과 관계없음` : `${esc(I.name)} 자료 없음(${esc(I.scope)})`}"`}><i style="background:${colOf(r.c)}"></i>${r.n}</button>`; }).join('') +
    S.extra.map((c, j) => { const inG = tbl || j < MAXG; return `<span class="mo-x${okFor(I, c) && inG && !I.nat ? '' : ' off'}"${inG ? '' : ' title="그래프에는 앞의 8곳만 그립니다(표에서는 보임)"'}><i style="background:${colOf(c)}"></i>${esc(nameOf(c))}<button data-x="${c}" aria-label="${esc(nameOf(c))} 빼기">×</button></span>`; }).join('');
  $m('#moReg').onclick = e => { const x = e.target.closest('button[data-x]'); if (x){ S.extra = S.extra.filter(c => c !== x.dataset.x); draw(); return; }
    const b = e.target.closest('button[data-c]'); if (b && !b.disabled){ const c = b.dataset.c; S.regs = S.regs.includes(c) ? S.regs.filter(v => v !== c) : BASE.map(r => r.c).filter(v => v === c || S.regs.includes(v)); draw(); } };
  $m('#moPer').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === S.per));
  $m('#moView').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.view));
  $m('#moTwo').querySelector('button').setAttribute('aria-pressed', S.two);
  $m('#moxMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === S.mode));
  $m('#moView').hidden = tbl; $m('#moTwo').hidden = tbl;
  const I2 = S.two && !tbl ? IND.find(x => x.k === S.ind2) : null;
  $m('#moAvgL').hidden = tbl || !(I.avg || (I2 && I2.avg)); $m('#moAvg').checked = S.avg;
  $m('#moQ').placeholder = `구·시 이름으로 추가 (최대 ${maxX()}곳)`;
  $m('#moxPickB').setAttribute('aria-expanded', S.pick); const pk = $m('#moxPick'); pk.hidden = !S.pick; if (S.pick) pk.innerHTML = pickHtml(I);
  $m('#moxNote').innerHTML = I.nat ? '전세대출 금리는 전국 하나의 값이라 고른 지역과 관계없이 "전국" 하나로 보여 줍니다.'
    : !tbl && S.extra.length > MAXG ? `그래프에는 더한 구·시 ${S.extra.length}곳 중 앞의 ${MAXG}곳만 그립니다(흐린 칩은 빠짐). 모두 보려면 [표]를 누르세요.` : '';
  const tp = $m('#moTip'); if (tp) tp.style.display = 'none';
  const {has, miss} = buildSer(I, regs);
  $m('#moMiss').innerHTML = missTxt(miss, I); $m('#moxRd').innerHTML = ''; $m('#moxRd2').innerHTML = '';
  const plot = $m('#moPlot'), W = plot.clientWidth || 900, mob = W < 560;
  if (!has.length){ plot.className = 'mo-plot'; plot.innerHTML = `<div class="mo-empty">고른 지역에 ${esc(I.name)} 자료가 없습니다. 고를 수 있는 지역: ${esc(I.scope)}</div>`; $m('#moT').innerHTML = ''; $m('#moTwoBox').hidden = true; $m('#moTsub').textContent = ''; LASTT = null; return; }
  const last = Math.max(...has.map(s => Math.max(...Object.keys(s.o).map(mIdx)))), first = Math.min(...has.map(s => Math.min(...Object.keys(s.o).map(mIdx))));
  const i1 = last, i0 = S.per === 'all' ? first : Math.max(first, last - (+S.per * 12) + 1), N = i1 - i0 + 1;
  const ser = withPts(has, i0, i1), avgOn = I.avg && S.avg, [lo, hi] = yRange(ser, avgOn, I);
  if (!tbl) $m('#moxRd').innerHTML = rdHtml(I, ser[0].col, avgOn, lo, hi);   // 시장 43 추가4
  if (tbl){ plot.className = 'mo-plot moxTM'; plot.innerHTML = tableView(ser, I, i0, i1); $m('#moTwoBox').hidden = true;
    $m('#moxCsv').onclick = () => { const f = csvOf(); if (!f) return; const a = document.createElement('a'), u = URL.createObjectURL(new Blob(['﻿' + f.text], {type:'text/csv;charset=utf-8'}));
      a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
    table(ser, I); return; }
  const groups = []; let T2 = null;   // 시장 45(9b): 두 지표 같이 보기면 순위표에 둘째 지표 칸
  if (S.view === 'over' || S.two){
    plot.className = 'mo-plot';
    plot.innerHTML = (S.two ? `<div class="mo-ch2h">① ${esc(I.name)}</div>` : '') + legend(ser, avgOn, I) + chart(ser, {W, H:mob ? (S.two ? 210 : 260) : (S.two ? 260 : 340), lo, hi, i0, N, I, avgOn, mob, id:'moc0'});
  } else {
    plot.className = 'mo-plot mo-grid';
    const cols = mob ? 2 : 4, cw = Math.floor((W - (cols - 1) * 10) / cols) - 2;
    plot.innerHTML = (I.ma3 || I.ref ? legend([], false, I) : '') + ser.map((s, j) => `<div class="mo-sm"><div class="mo-smh"><i style="background:${s.col}"></i>${esc(s.name)}<b>${fmt(lastV(s.pts), I)}</b></div>${chart([s], {W:cw, H:mob ? 130 : 150, lo, hi, i0, N, I, avgOn, mob, small:true, id:'moc' + j})}</div>`).join('');
  }
  groups.push({box:plot, ser, I, i0, each:S.view !== 'over' && !S.two});
  // 두 지표 같이 보기: 같은 지역·같은 기간, 위아래, 마우스 함께
  $m('#moTwoBox').hidden = !S.two;
  if (S.two){ $m('#moInd2').innerHTML = indPicker('moInd2', S.ind2, S.ind);
    $m('#moInd2').onclick = e => { const b = e.target.closest('button[data-k]'); if (b && !b.disabled){ S.ind2 = b.dataset.k; draw(); } };
    $m('#moInd2').onchange = e => { const sl = e.target.closest('select'); if (sl && sl.value !== S.ind){ S.ind2 = sl.value; draw(); } };
    const b2 = buildSer(I2, regs), p2 = $m('#moPlot2'); $m('#moMiss2').innerHTML = missTxt(b2.miss, I2);
    if (!b2.has.length) p2.innerHTML = `<div class="mo-empty">고른 지역에 ${esc(I2.name)} 자료가 없습니다. 고를 수 있는 지역: ${esc(I2.scope)}</div>`;
    else { const s2 = withPts(b2.has, i0, i1), av2 = I2.avg && S.avg, [l2, h2] = yRange(s2, av2, I2);
      $m('#moxRd2').innerHTML = rdHtml(I2, s2[0].col, av2, l2, h2);
      p2.innerHTML = `<div class="mo-ch2h">② ${esc(I2.name)}</div>` + legend(s2, av2, I2) + chart(s2, {W, H:mob ? 210 : 260, lo:l2, hi:h2, i0, N, I:I2, avgOn:av2, mob, id:'moc2'});
      groups.push({box:p2, ser:s2, I:I2, i0, each:false}); T2 = {ser:s2, I:I2}; } }
  bindHover(groups);
  table(ser, I, T2);
}
// ---- 시장 45(9a): 휴대폰(폭 < 768)에서는 지표 고르기를 펼침 목록(select)으로, PC는 칩 그대로 ----
const MOBW = 768;
function indPicker(id, cur, other){ if (innerWidth >= MOBW) return chipsInd(id, cur, other);
  const gs = [...new Set(IND.map(x => x.g))];
  return `<select class="moxSel" id="${id}Sel" aria-label="${id === 'moInd' ? '지표 고르기' : '두 번째 지표 고르기'}">` + gs.map(g => `<optgroup label="${esc(g)}">` +
    IND.filter(x => x.g === g).map(x => `<option value="${x.k}"${x.k === cur ? ' selected' : ''}${x.k === other ? ' disabled' : ''}>${esc(x.name)}${x.k === other ? ' (위 그래프 지표)' : ''}</option>`).join('') + '</optgroup>').join('') + '</select>' +
    (id === 'moInd' ? `<button class="mo-i" data-i="${cur}" aria-label="${esc((IND.find(x => x.k === cur) || {}).name || '')} 설명" aria-expanded="${S.tipOpen === cur}">ⓘ</button>` : ''); }
// ---- 시장 45(9c): 고른 지표·지역·기간을 주소 ?쿼리에 남김(기존 tab=mo와 함께, 이름은 m 으로 시작) ----
// mi=지표 · mi2=둘째 지표(있으면 [두 지표 같이 보기] 켬) · mp=기간(3|10|all) · mr=기본 지역(11.41.28.SDK, 비면 모두 끔) · mx=더한 구·시 코드(.로 이음)
const UQ = ['mi', 'mi2', 'mp', 'mr', 'mx'];
function saveUrl(){ try { const P = new URLSearchParams(location.search);
  P.set('mi', S.ind); if (S.two) P.set('mi2', S.ind2); else P.delete('mi2'); P.set('mp', S.per); P.set('mr', S.regs.join('.'));
  if (S.extra.length) P.set('mx', S.extra.join('.')); else P.delete('mx');
  const q = P.toString(); if ('?' + q !== location.search) history.replaceState(null, '', (q ? '?' + q : location.pathname) + location.hash); } catch (e){} }
let URLREAD = false;
function readUrl(){ if (URLREAD) return; URLREAD = true; try { const P = new URLSearchParams(location.search), has = k => IND.some(x => x.k === k);
  const mi = P.get('mi'); if (mi && has(mi)) S.ind = mi;
  const mi2 = P.get('mi2'); if (mi2 && has(mi2) && mi2 !== S.ind){ S.two = true; S.ind2 = mi2; } else if (S.ind2 === S.ind) S.ind2 = IND.find(x => x.k !== S.ind).k;
  const mp = P.get('mp'); if (['3', '10', 'all'].includes(mp)) S.per = mp;
  if (P.has('mr')){ const r = (P.get('mr') || '').split('.'), ok = BASE.map(b => b.c).filter(c => r.includes(c)); if (ok.length || !P.get('mr')) S.regs = ok; }   // 'mr=' = 모두 끔, 알 수 없는 값만 있으면 기본 4곳
  if (P.has('mx')){ const seen = new Set(); S.extra = (P.get('mx') || '').split('.').filter(c => c && !seen.has(c) && seen.add(c) && TREE.some(t => t.c === c) && !BASE.some(b => b.c === c)).slice(0, MAXT); S.extra.forEach(colOf); }
} catch (e){} }
// ---- 시장 43 추가4: "읽는 법" 그림 카드(시황 분석 .rdk = 지역분석.html 매물 칸 .lsread 모양) ----
// 그래프에 실제로 그려진 기준선만 씀: 평균 점선(지역별 평균 점선을 켰을 때) · 매수 저울의 0선(그림에 0이 들어올 때).
// 그림 색 = 그래프 맨 앞 지역 선 색(실선 굵기 2 · 같은 색 점선 5 4 · 0선 #61707D, 그래프와 같은 값). KB 매매·전세지수는 기준선이 없어 카드 없음
const RDM = {
  jsu:['평균 점선 위 → 평소보다 전세 구하기 어려움', '100 위면 전세 구하는 사람이 더 많음', '평균 점선 아래 → 평소보다 전세 여유', '100 아래면 전세가 남음'],
  jr:['평균 점선 위 → 전세가 매매가를 받치는 힘 큼', '매매가가 전세가에 바짝 붙은 상태', '평균 점선 아래 → 매매·전세 차이 큼', '전세가 더 올라야 매매를 받침'],
  outs:['평균 점선 위 → 평소보다 오른다는 답 많음', '100 위면 오른다는 답이 더 많음', '평균 점선 아래 → 평소보다 오른다는 답 적음', '현장 분위기가 식은 쪽'],
  outj:['평균 점선 위 → 평소보다 전세가 오른다는 답 많음', '100 위면 오른다는 답이 더 많음', '평균 점선 아래 → 평소보다 전세 오름 기대 적음', '전세 분위기가 식은 쪽'],
  cv:['평균 점선 위 → 월세가 평소보다 비쌈', '사람들이 전세를 찾는 쪽', '평균 점선 아래 → 월세가 평소보다 쌈', '월세로 옮기기 쉬운 쪽'],
  ln:['평균 점선 위 → 전세 이자 부담이 평소보다 큼', '전세 수요가 월세로 빠질 수 있음', '평균 점선 아래 → 전세 이자 부담이 평소보다 작음', '전세 얻기 쉬움 → 전세 수요를 받침'],
  scale:['평균 점선 위 → 평소보다 사는 쪽이 유리', '월세 대비 이자 부담이 평소보다 작음', '평균 점선 아래 → 평소보다 이자 부담 큼', '사서 세 놓기가 평소보다 불리'],
  scale0:['0선 위 → 사는 쪽이 유리', '집 사서 내는 이자가 월세보다 쌈(매수 여유)', '0선 아래 → 매수 이자 부담 큼', '사서 세 놓으면 이자가 월세보다 큼'],
  sup:['평균 점선 위 → 입주 많음(공급 많음)', '새 집이 많이 나와 전세값을 누르는 쪽(전세 약세)', '평균 점선 아래 → 입주 적음(공급 부족)', '전세값이 오를 압력'],
  vol:['평균 점선 위 → 거래가 살아남', '사려는 사람이 움직이기 시작 → 가격이 움직일 방아쇠', '평균 점선 아래 → 거래가 식음', '사려는 사람이 기다리는 중(대기)'],
  body:['평균 점선 위 → 평소보다 저평가 큼', '기준선보다 더 싸게 거래되는 중', '평균 점선 아래 → 평소보다 저평가 작음', '평소보다 덜 싸게 거래되는 중']};
function rdHtml(I, col, avgOn, lo, hi){
  const zero = I.k === 'scale' && lo < 0 && hi > 0, R = zero ? RDM.scale0 : avgOn ? RDM[I.k] : null; if (!R) return '';
  const V = b => `<svg width="46" height="30" viewBox="0 0 46 30" aria-hidden="true">${b}</svg>`;
  const ln = (d, w, da, op) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"${da ? ` stroke-dasharray="${da}"` : ''}${op ? ` opacity="${op}"` : ''}/>`;
  const base = zero ? '<path d="M2,15 L44,15" stroke="#61707D" stroke-width="1.5"/>' : ln('M2,15 L44,15', 1.6, '5 4', '.75');
  const dot = c => `<circle cx="23" cy="15" r="4" fill="#fff" stroke="${c}" stroke-width="2"/>`;
  const rc = (up, t, s) => `<div class="rc" role="listitem">${V(base + ln(up ? 'M2,22 C14,20 26,15 44,6' : 'M2,8 C14,10 26,15 44,24', 2.4) + dot(up ? '#C2410C' : '#1E8E5A'))}<div><b class="${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${esc(t)}</b>${esc(s)}</div></div>`;
  return `<div class="rdk" role="list" aria-label="${esc(I.name)} 그래프 읽는 법">${rc(true, R[0], R[1])}${rc(false, R[2], R[3])}</div>`; }
const lastV = p => { for (let i = p.length - 1; i >= 0; i--) if (p[i] != null) return p[i]; return null; };
const legend = (ser, avgOn, I) => `<div class="mo-lg">${ser.map(s => `<span><i style="background:${s.col}"></i>${esc(s.name)}</span>`).join('')}${avgOn ? '<span class="dl"><i></i>지역별 평균(점선)</span>' : ''}${I && I.ma3 ? '<span class="moxMa"><i></i>3개월 평균(회색 잔 점선)</span>' : ''}${I && I.ref ? `<span class="moxMa"><i></i>${esc(I.ref.lab)} 기준선(회색 점선)</span>` : ''}</div>`;
// 시장 45(8번): 기준선 색 = 시황 분석 100선과 같은 회색(#9AA8B4, 점선 3 3) · 글자 #61707D. 계산 바뀜 없음(그리는 선만)
const REFC = '#9AA8B4', REFT = '#61707D';
// 3개월 평균선: 그 달과 앞 2개월이 모두 있는 달만(원래 자료 s.o에서 읽어 기간 첫 두 달도 이어짐)
const ma3Pts = (s, i0, N) => { const out = []; for (let i = 0; i < N; i++){ const a = [0, 1, 2].map(k => s.o[String(mT(i0 + i - k))]); out.push(a.every(v => v != null && isFinite(v)) ? (+a[0] + +a[1] + +a[2]) / 3 : null); } return out; };
function chart(ser, o){ const {W, H, lo, hi, i0, N, I, avgOn, mob, small} = o;
  const ml = small ? 34 : mob ? 42 : 52, mr = small ? 6 : mob ? 8 : 14, mt = 8, mb = small ? 18 : 24, pw = W - ml - mr, ph = H - mt - mb;
  const X = i => ml + (N <= 1 ? pw / 2 : i / (N - 1) * pw), Y = v => mt + (1 - (v - lo) / (hi - lo)) * ph;
  const step = niceStep((hi - lo) / (small ? 3 : 5)); let g = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="mo-gl"/><text x="${ml - 4}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="mo-ax">${axFmt(v, I)}</text>`;
  if (I.unit === '%p' && lo < 0 && hi > 0) g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#61707D" stroke-width="1"/>`;
  if (I.ref && I.ref.v >= lo && I.ref.v <= hi){ const ry = Y(I.ref.v).toFixed(1);   // 시장 45(8번): +5%·100 가로 점선 + 오른쪽 끝 라벨
    g += `<line x1="${ml}" x2="${W - mr}" y1="${ry}" y2="${ry}" stroke="${REFC}" stroke-width="1.3" stroke-dasharray="3 3" class="moxRef"/><text x="${ml + 4}" y="${(+ry - 4).toFixed(1)}" text-anchor="start" font-size="${small ? 9.5 : 10.5}" font-weight="700" fill="${REFT}" stroke="#fff" stroke-width="3" paint-order="stroke" class="moxRefT">${esc(I.ref.lab)}</text>`; }
  const y0 = Math.floor(mT(i0) / 100), y1 = Math.floor(mT(i0 + N - 1) / 100), ys = Math.max(1, Math.ceil((y1 - y0 + 1) / (small ? 3 : mob ? 4 : 8)));
  for (let y = y0; y <= y1; y++){ if ((y - y0) % ys) continue; const i = y * 12 - i0; if (i < 0 || i >= N) continue; g += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="mo-ax">${small ? "'" + String(y).slice(2) : y}</text>`; }
  let lines = '';
  ser.forEach(s => { let d = '', pen = false; s.pts.forEach((v, i) => { if (v == null){ pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
    if (avgOn) lines += `<line x1="${ml}" x2="${W - mr}" y1="${Y(s.mean).toFixed(1)}" y2="${Y(s.mean).toFixed(1)}" stroke="${s.col}" stroke-width="1.3" stroke-dasharray="5 4" opacity=".75"/>`;
    lines += `<path d="${d}" fill="none" stroke="${s.col}" stroke-width="${small ? 1.8 : 2}" stroke-linejoin="round"/>`;
    if (I.ma3 && s.o){ let m = '', p2 = false; ma3Pts(s, i0, N).forEach((v, i) => { if (v == null){ p2 = false; return; } m += (p2 ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); p2 = true; });   // 시장 45(8번): 3개월 평균선
      if (m) lines += `<path d="${m}" fill="none" stroke="${REFC}" stroke-width="1.6" stroke-dasharray="2 3" stroke-linejoin="round" class="moxMa3"/>`; } });
  return `<svg class="mo-svg" id="${o.id}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-ml="${ml}" data-pw="${pw}" data-n="${N}" data-mt="${mt}" data-ph="${ph}" data-lo="${lo}" data-hi="${hi}" role="img" aria-label="${esc(I.name)} ${ser.map(s => esc(s.name)).join(', ')}">${g}${lines}<line class="mo-xh" y1="${mt}" y2="${mt + ph}" style="display:none"/><g class="mo-dots"></g></svg>`; }
function niceStep(r){ const p = Math.pow(10, Math.floor(Math.log10(r || 1))), f = r / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
// 마우스·손가락: 같은 달 값을 모든 지역(두 지표면 두 그래프 모두)에 함께
function bindHover(groups){
  let tip = $m('#moTip'); if (!tip){ tip = document.createElement('div'); tip.id = 'moTip'; tip.className = 'mo-tip'; document.body.appendChild(tip); }
  const all = groups.flatMap(G => [...G.box.querySelectorAll('svg.mo-svg')].map((svg, j) => ({svg, G, ss:G.each ? [G.ser[j]] : G.ser})));
  const i0 = groups[0].i0;
  const at = (svg, e) => { const r = svg.getBoundingClientRect(), ml = +svg.dataset.ml, pw = +svg.dataset.pw, n = +svg.dataset.n; return Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - ml) / pw * (n - 1)))); };
  const show = (i, e) => {
    all.forEach(({svg, ss}) => { const ml = +svg.dataset.ml, pw = +svg.dataset.pw, n = +svg.dataset.n, mt = +svg.dataset.mt, ph = +svg.dataset.ph, lo = +svg.dataset.lo, hi = +svg.dataset.hi;
      const x = ml + (n <= 1 ? pw / 2 : i / (n - 1) * pw), xh = svg.querySelector('.mo-xh'); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.style.display = '';
      svg.querySelector('.mo-dots').innerHTML = ss.map(s => s.pts[i] == null ? '' : `<circle cx="${x.toFixed(1)}" cy="${(mt + (1 - (s.pts[i] - lo) / (hi - lo)) * ph).toFixed(1)}" r="4" fill="${s.col}" stroke="#fff" stroke-width="1.5"/>`).join(''); });
    const sec = G => G.ser.slice().sort((a, b) => (b.pts[i] ?? -1e15) - (a.pts[i] ?? -1e15)).map(s => `<div class="r"><span><i style="background:${s.col}"></i>${esc(s.name)}</span><b>${fmt(s.pts[i], G.I)}</b>${G.I.avg && S.avg ? `<small>평균 ${fmt(s.mean, G.I)}</small>` : ''}</div>`).join('');
    tip.innerHTML = `<div class="h">${ym(mT(i0 + i))}${groups.length > 1 ? '' : ' · ' + esc(groups[0].I.name)}</div>` + groups.map(G => (groups.length > 1 ? `<div class="sec">${esc(G.I.name)}</div>` : '') + sec(G)).join('');
    tip.style.display = 'block';
    const tw = tip.offsetWidth, th = tip.offsetHeight; let x = e.clientX + 14, y = e.clientY + 12; if (x + tw > innerWidth - 6) x = e.clientX - tw - 14; if (x < 6) x = 6; if (y + th > innerHeight - 6) y = Math.max(6, innerHeight - th - 6);
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; };
  const hide = () => { tip.style.display = 'none'; all.forEach(({svg}) => { svg.querySelector('.mo-xh').style.display = 'none'; svg.querySelector('.mo-dots').innerHTML = ''; }); };
  all.forEach(({svg}) => { svg.onpointermove = e => show(at(svg, e), e); svg.onpointerdown = e => show(at(svg, e), e); svg.onpointerleave = e => { if (e.pointerType === 'mouse') hide(); }; });
  $m('#moPlot')._show = show; $m('#moPlot')._hide = hide;
}
// ---- 표 보기(시장 43): 행 = 달(최근이 위), 열 = 고른 지역, 칸 색 = 그 지역 전체 기간 평균 대비(±0.5 표준편차) ----
let LASTT = null;   // 지금 화면의 표(CSV가 같은 자료를 씀)
const PERN = {'3':'3년', '10':'10년', 'all':'전체'};
const numTxt = (v, I) => v == null || !isFinite(v) ? '' : I.int ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(I.dp ?? 1);
function tblRows(ser, i0, i1){ const rows = [];
  for (let i = i1; i >= i0; i--){ const vals = ser.map(s => s.pts[i - i0]); if (vals.some(v => v != null)) rows.push({t:mT(i), vals}); } return rows; }
function tableView(ser, I, i0, i1){
  const rows = tblRows(ser, i0, i1); LASTT = {I, ser, rows, per:S.per};
  const cls = (s, v) => { if (v == null || !(s.sd > 0)) return ''; const z = (v - s.mean) / s.sd; return z > .5 ? ' class="hi"' : z < -.5 ? ' class="lo"' : ''; };
  const unit = I.unit ? `단위: ${I.unit}` : '단위: 지수';
  return `<div class="moxTbar"><span class="moxLg">칸 색: <i class="hi"></i>그 지역 과거 평균보다 높음 <i class="lo"></i>낮음 <i></i>보통</span><span class="moxWk" title="이 화면 자료(data 폴더)에 이 탭 지표의 주간 값이 없습니다. 부동산원 매매수급은 주간을 월 평균으로 바꾼 값만 있습니다.">주간 자료 없음 — 월간만</span><span>${esc(unit)} · ${rows.length}개월</span><button type="button" id="moxCsv">엑셀로 받기(CSV)</button></div>
  <div class="moxTB" tabindex="0" aria-label="${esc(I.name)} 달별 표"><table class="moxT"><thead><tr><th scope="col">달</th>${ser.map(s => `<th scope="col"><i style="background:${s.col}"></i>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(r => `<tr${r.t % 100 === 12 ? ' class="y"' : ''}><th scope="row">${ym(r.t)}</th>${r.vals.map((v, j) => `<td${cls(ser[j], v)}>${v == null ? '—' : numTxt(v, I)}</td>`).join('')}</tr>`).join('') +
    `</tbody></table></div>`; }
// 지금 표를 CSV 글자로(내려받기와 시험에 같이 씀). 숫자는 천 단위 쉼표 없이.
function csvOf(){ if (!LASTT) return null; const {I, ser, rows, per} = LASTT, q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const raw = v => v == null || !isFinite(v) ? '' : I.int ? String(Math.round(v)) : v.toFixed(I.dp ?? 1);
  const lines = [['달'].concat(ser.map(s => s.name + (I.unit ? `(${I.unit})` : ''))).map(q).join(',')].concat(rows.map(r => [ym(r.t)].concat(r.vals.map(raw)).join(',')));
  return {name:`지표모아보기_${I.name.replace(/[\s\\/:*?"<>|]/g, '')}_${PERN[per] || per}.csv`, text:lines.join('\r\n') + '\r\n'}; }
// ---- 지역 고르기 판: 시도 → 구·시(경기는 시 아래 구를 들여서) ----
function pickHtml(I){ const n = S.extra.length, mx = maxX();
  const item = (r, sub) => { const on = S.extra.includes(r.c), ok = okFor(I, r.c), full = !on && n >= mx, dis = (!ok && !on) || full;
    const t = !ok ? `${I.name} 자료 없음` : full ? `최대 ${mx}곳까지` : '';
    return `<label class="moxPi${sub ? ' sub' : ''}${dis ? ' off' : ''}"${t ? ` title="${esc(t)}"` : ''}><input type="checkbox" data-c="${r.c}"${on ? ' checked' : ''}${dis ? ' disabled' : ''}>${esc(r.n)}</label>`; };
  const grp = (p, t) => `<div class="moxPh">${t} <small>(${t} 전체는 위 '${t}' 칩)</small></div><div class="moxPl">` +
    TREE.filter(r => r.p === p).map(r => `<div class="moxPs">${item(r)}${TREE.filter(k => k.p === r.c).map(k => item(k, true)).join('')}</div>`).join('') + '</div>';
  return `<div class="moxPt"><b>구·시 고르기</b><span>${S.mode === 'table' ? `${n}/${mx}곳` : n > mx ? `${n}곳 골랐음 (그래프는 앞 ${mx}곳만 · 표에서는 ${MAXT}곳까지)` : `${n}/${mx}곳 (표에서는 ${MAXT}곳까지)`}</span>${I.nat ? '<span>전세대출 금리는 전국 값 하나라 지역과 관계없음</span>' : '<span>흐린 곳 = 이 지표 자료 없음</span>'}<button type="button" data-a="clear">모두 빼기</button><button type="button" data-a="close">닫기</button></div>` +
    grp('11', '서울') + grp('41', '경기') + grp('28', '인천'); }
function css(){ if (document.getElementById('moxCss')) return; const st = document.createElement('style'); st.id = 'moxCss';
  st.textContent = `#mo [hidden]{display:none!important}
.moxPickB{height:32px;padding:0 12px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.moxPickB[aria-expanded=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.moxPick{border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);padding:0 10px 8px;margin:4px 0 8px;max-height:380px;overflow:auto}
.moxPt{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:13px;position:sticky;top:0;background:var(--surface);padding:8px 0 6px;z-index:1;border-bottom:1px solid var(--border)}
.moxPt span{color:var(--ink-muted);font-size:12px}
.moxPt button{height:28px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:var(--surface-alt);color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
.moxPt button[data-a=clear]{margin-left:auto}
.moxPh{font-size:12.5px;font-weight:700;margin:8px 0 3px;color:var(--ink)}.moxPh small{font-weight:400;color:var(--ink-muted)}
.moxPl{column-width:118px;column-gap:10px}
.moxPs{break-inside:avoid}
.moxPi{display:flex;align-items:center;gap:6px;font-size:13px;padding:3px 2px;cursor:pointer;line-height:1.3}
.moxPi.sub{padding-left:20px;font-size:12.5px;color:var(--ink-muted)}
.moxPi.off{opacity:.4;cursor:not-allowed}
.moxPi input{margin:0;width:15px;height:15px;flex:none}
.mo-plot.moxTM{touch-action:auto}
.moxTbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:12px;color:var(--ink-muted);margin:4px 0 6px}
.moxLg{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap}
.moxLg i{display:inline-block;width:14px;height:11px;border-radius:3px;border:1px solid var(--border);margin-left:5px}
.moxLg i.hi,.moxT td.hi{background:rgba(255,140,40,.17)}
.moxLg i.lo,.moxT td.lo{background:rgba(51,140,240,.15)}
#moxCsv{margin-left:auto;height:30px;padding:0 12px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.moxTB{overflow:auto;max-height:min(560px,70vh);max-width:100%;border:1px solid var(--border);border-radius:9px;overscroll-behavior-x:contain}
.moxT{border-collapse:separate;border-spacing:0;font-size:12.5px;font-variant-numeric:tabular-nums;min-width:100%}
.moxT th,.moxT td{padding:5px 10px;white-space:nowrap;border-bottom:1px solid var(--border);text-align:right}
.moxT thead th{position:sticky;top:0;background:var(--surface-alt);z-index:2;font-size:12px;font-weight:700;color:var(--ink)}
.moxT thead th i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
.moxT tbody th{position:sticky;left:0;background:var(--surface);z-index:1;text-align:left;font-weight:600;color:var(--ink-muted);border-right:1px solid var(--border)}
.moxT thead th:first-child{left:0;z-index:3;text-align:left;border-right:1px solid var(--border)}
.moxT tr.y th,.moxT tr.y td{border-top:1px solid var(--border-strong)}
.moxSel{height:38px;min-width:0;flex:1 1 auto;max-width:calc(100% - 44px);padding:0 10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:14px;font-weight:600}
#moInd:has(.moxSel),#moInd2:has(.moxSel){display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0;flex:1 1 auto}
.mo-lg .moxMa i{width:16px;height:0;border-radius:0;border-top:2px dotted #9AA8B4;background:none}
.mo-grid > .mo-lg{grid-column:1/-1}
.mo-t td.moxGe{color:var(--ink-muted)}`;
  document.head.appendChild(st); }
// 지금 순위표(위 그래프 지표 기준)
// 시장 45(3번): 체력은 "지금 값" = 지역 분석과 같은 계산기 지금 값(매매체력 파일의 '체력(%)'·'달'), "그래프 끝값" = 그래프 선(체력 이력)의 마지막 값.
// 1년 변화·과거 평균 대비는 전과 같이 그래프 선 기준(숫자 바뀜 없음). 계산기 값이 없는 지역은 그래프 끝값을 그대로 씀.
function nowOf(s, I){ const ks = Object.keys(s.o).sort(), tl = ks[ks.length - 1], gv = +s.o[tl];
  if (I.now){ const e = (BODY['지역'] || {})[s.c], cv = e && e['체력(%)'], ct = e && e['달']; if (cv != null && isFinite(cv) && ct) return {v:+cv, t:String(ct), gv, gt:tl, ks}; }
  return {v:gv, t:tl, gv, gt:tl, ks}; }
function table(ser, I, T2){
  const s2m = {}; if (T2) T2.ser.forEach(s => { s2m[s.c] = nowOf(s, T2.I); });
  const rows = ser.map(s => { const nw = nowOf(s, I), ks = nw.ks, tl = nw.gt, gv = nw.gv, v = nw.v, tp = String(mT(mIdx(tl) - 12)), p = s.o[tp] != null ? +s.o[tp] : null;
    const ch = p == null || (I.chg === 'pct' && !p) ? null : I.chg === 'pct' ? (gv / p - 1) * 100 : gv - p, z = s.sd > 0 ? (gv - s.mean) / s.sd : 0;
    return {s, tl:nw.t, v, gv, gt:tl, v2:s2m[s.c] || null, ch, z, pos:z < -.5 ? '낮음' : z > .5 ? '높음' : '보통', first:ks[0]}; });
  const K = S.sortK === 'v2' && !T2 ? 'v' : S.sortK || 'v', Dd = S.sortK ? S.sortD : -1, val = r => K === 'n' ? r.s.name : K === 'ch' ? (r.ch ?? -1e15) : K === 'z' ? r.z : K === 'gv' ? r.gv : K === 'v2' ? (r.v2 ? r.v2.v : -1e15) : r.v;
  rows.sort((a, b) => { const x = val(a), y = val(b); return Dd * (typeof x === 'string' ? x.localeCompare(y, 'ko') : x - y); });   // Dd = 1 오름, −1 내림
  const th = (k, t) => `<th data-s="${k}" class="${k === 'n' ? '' : 'num'}${S.sortK === k ? ' on' : ''}" aria-sort="${S.sortK === k ? (S.sortD < 0 ? 'descending' : 'ascending') : 'none'}">${t}${S.sortK === k ? (S.sortD < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const GE = !!I.now;   // 그래프 끝값 칸(체력)
  $m('#moT').innerHTML = `<thead><tr><th class="rk">순위</th>${th('n', '지역')}${th('v', '지금 값')}${GE ? th('gv', '그래프 끝값') : ''}${T2 ? th('v2', `② ${esc(T2.I.name)}`) : ''}${th('ch', chgLab(I))}${th('z', '과거 평균 대비')}</tr></thead><tbody>` +
    rows.map((r, j) => `<tr><td class="rk">${j + 1}</td><td><i style="background:${r.s.col}"></i>${esc(r.s.name)}</td><td class="num">${fmt(r.v, I)} <small>${ym(r.tl)}</small></td>` +
      (GE ? `<td class="num moxGe">${fmt(r.gv, I)} <small>${ym(r.gt)}</small></td>` : '') +
      (T2 ? `<td class="num moxV2">${r.v2 ? `${fmt(r.v2.v, T2.I)} <small>${ym(r.v2.t)}</small>` : '—'}</td>` : '') +
      `<td class="num">${r.ch == null ? '—' : (r.ch > 0 ? '+' : '') + r.ch.toFixed(1)}</td><td class="num"><span class="mo-b ${r.pos === '높음' ? 'hi' : r.pos === '낮음' ? 'lo' : 'md'}">${r.pos}</span> <small>평균 ${fmt(r.s.mean, I)} · ${ym(r.first).slice(0, 4)}~</small></td></tr>`).join('') + '</tbody>';
  $m('#moT').querySelectorAll('th[data-s]').forEach(h => h.onclick = () => { const k = h.dataset.s; if (S.sortK === k) S.sortD = -S.sortD; else { S.sortK = k; S.sortD = k === 'n' ? 1 : -1; } table(ser, I, T2); });
  $m('#moTsub').textContent = `${I.name}${T2 ? ` · ② ${T2.I.name} 칸 같이` : ''} · 칸 머리를 누르면 정렬` +
    (GE ? ' · 지금 값 = 지역 분석과 같은 계산기 지금 값, 그래프 끝값 = 그래프 선의 마지막 값(지역 분석의 계산기 지금 값과 다를 수 있음, 지표 ⓘ 설명 참고), 1년 변화·과거 평균 대비는 그래프 선 기준' : '');
}
// ---- 탭 ----
function setTab(t){ const mo = t === 'mo'; document.body.classList.toggle('moMode', mo);
  document.querySelectorAll('#mktTabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
  try { const P = new URLSearchParams(location.search); if (mo) P.set('tab', 'mo'); else P.delete('tab'); const q = P.toString(); history.replaceState(null, '', (q ? '?' + q : location.pathname) + location.hash); } catch (e){}
  if (!mo) try { const P = new URLSearchParams(location.search); if (UQ.some(k => P.has(k))){ UQ.forEach(k => P.delete(k)); const q = P.toString(); history.replaceState(null, '', (q ? '?' + q : location.pathname) + location.hash); } } catch (e){}   // 시장 45(9c): 지금 시황으로 돌아가면 모아 보기 주소 칸은 뺌
  if (mo){ frame(); if (!LOADED) $m('#moPlot').innerHTML = '<div class="mo-empty">자료를 읽는 중…</div>'; load().then(() => { readUrl(); draw(); }).catch(err => { $m('#moPlot').innerHTML = `<div class="mo-empty">자료를 읽지 못했습니다(${esc(err)}).</div>`; }); } }
window.MOX = {setTab, S, draw, IND, hasData, csv:csvOf, get loaded(){ return LOADED; }, get tree(){ return TREE; }};
document.addEventListener('DOMContentLoaded', () => {
  const tb = $m('#mktTabs'); if (!tb) return;
  tb.onclick = e => { const b = e.target.closest('button[data-t]'); if (b) setTab(b.dataset.t); };
  if (new URLSearchParams(location.search).get('tab') === 'mo') setTab('mo');
});
})();
