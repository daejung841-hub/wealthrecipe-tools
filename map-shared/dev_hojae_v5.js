/* 49차 개발 호재 층 v5 — v4(48차)에서: 검증 상태 '수정 필요'·'근거 부족' 노선은 그리지 않음(자료에서 빠지지만 한 번 더 막음), 역 툴팁은 자료의 화면용 표기('역 위치'·'대략 위치') 그대로,
 *   범례 맨 위 안내 한 줄(설정.안내, 대표님 결정 대기), '선 자료 준비 중'에 숨긴 까닭, 노선 창에 '기존 선로 공용' 줄(자료에 공용 글이 있을 때), cfg.fold면 범례 접힌 채 시작. v4 파일은 그대로 둠
 * (아래는 v4 설명)
 * 48차 개발 호재 층 v4 — 재개발 지도·계산기 지도 공용(같은 파일). 47차 dev_hojae_v3.js·46차 v2·44차 v1은 그대로 둠
 *  자료: 같은 폴더 개발호재_v5_geo.js(window.MAP_HOJAE — 계산기 지도 모양 기준 8-6절 GeoJSON 꼴)를 기본으로 읽음.
 *        cfg.fmt = "v5"이면 개발호재_v5.js(window.DEV_HOJAE5 — 46·47차와 같은 꼴). 두 파일은 같은 도구(hojae48_build.py)로 만든 같은 내용
 *  쓰는 법: const dh = DevHojae5(map, { base: "../map-shared/", v: "…", card, legend, host(단추 붙일 곳), phone: () => 휴대폰?, onState: on => {…}, onOverlay: () => {…} })
 *    dh.toggle(true/false) · dh.draw()(지도 idle 때) · dh.click(coord)(지도 빈 곳 누름) · dh.close() · dh.solo(id|null) · dh.on
 *  48차 대표님 의견
 *    실선: 47차 그대로(서울 전체 3px, 확대 4·5·6px, 흰 테두리 1px, 투명도 0.85)
 *    점선(가능성 있는 노선): 굵기 실선과 같게, 투명도 1, 마디 길게(선 10px·빈칸 6px), 밑에 흰 테두리(실선)
 *    켜면 바탕을 연하게: 바탕 지도 그림을 반쯤 흐리고 회색 톤, 구역 칠·테두리도 옅게(누르기는 그대로). 끄면 원래대로
 *    역 원 약 1.5배(갈아타는 역은 더 크게, 테두리 조금 굵게), 역 이름 13px 굵게·흰 외곽선, 서울 전체 다음 단계(12)부터. 겹치면 공사 중 노선 역부터
 *    노선 하나만 보기: 선·이름표(범례 노선 이름 포함)를 누르면 그 노선과 그 역만 남김. 위쪽 [전체 노선 보기] 또는 지도 빈 곳 누르면 전체로
 *    역 위치가 대략 좌표인 역은 툴팁에 '대략 위치'만 적음
 */
(function () {
 "use strict";
 const ORDER = [ "공사 중", "계획 확정", "구상" ];
 const SHOW = st => st === "구상" ? "가능성 있는 노선" : st;
 const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
 const W = zm => zm <= 11 ? 3 : zm <= 12 ? 4 : zm <= 14 ? 5 : 6;
 const OP = .85, NAME_ZOOM = 12, DASH = "10,6";
 const lum = h => { const v = [ 1, 3, 5 ].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4)); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
 const ink = h => lum(h) > .33 ? "#1F2937" : "#fff";
 const CSS = `
 .dh4-lb{position:absolute;left:0;top:0;transform:translate(-50%,-50%);background:var(--c);color:var(--t);border:2px solid #fff;border-radius:10px;padding:3px 9px 4px;white-space:nowrap;text-align:center;line-height:1.2;box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer;opacity:.94}
 .dh4-lb b{display:block;font-size:13px;font-weight:800;letter-spacing:-.2px}.dh4-lb small{display:block;font-size:10.5px;font-weight:700;opacity:.95}
 .dh4-lb.s b{font-size:12px}.dh4-lb.s small{font-size:10px}
 .dh4-st{position:absolute;left:0;top:0;width:9px;height:9px;border-radius:50%;background:#fff;border:2.5px solid var(--c);transform:translate(-50%,-50%);cursor:pointer;box-shadow:0 0 0 1.5px rgba(255,255,255,.95)}
 .dh4-st.tr{width:13px;height:13px;border-width:3px}
 .dh4-sn{position:absolute;left:0;top:0;font-size:13px;font-weight:800;color:#111827;white-space:nowrap;transform:translate(10px,-50%);pointer-events:none;text-shadow:-1.5px -1.5px 0 #fff,1.5px -1.5px 0 #fff,-1.5px 1.5px 0 #fff,1.5px 1.5px 0 #fff,0 0 3px #fff,0 0 4px #fff}
 .dh4-tip{position:fixed;z-index:2000;pointer-events:none;background:#fff;border:1px solid #D1D5DB;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:8px 10px;font-size:12.5px;line-height:1.5;max-width:340px;display:none;color:#1F2937}
 .dh4-tip.on{display:block}.dh4-tip .scs{margin:2px 0}.dh4-tip .scn{margin-top:4px;font-size:10.5px;color:#6B7280}
 .dh4-chip{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:1px;color:#fff;background:var(--c)}
 .dh4-k{display:inline-block;min-width:58px;color:#6B7280}
 .dh4-h{display:flex;align-items:center;gap:4px;padding-right:40px;font-size:14px;font-weight:800;flex-wrap:wrap}.dh4-h i{width:12px;height:12px;border-radius:3px;background:var(--c);flex:none;border:1.5px solid #fff;box-shadow:0 0 0 1px var(--c)}
 .dh4-approx{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;margin-left:4px;color:#92400E;background:#FEF3C7}
 .dh4-lg .row{display:flex;gap:6px;align-items:center;margin:2px 0}.dh4-lg svg{flex:none}
 .dh4-lg ul{list-style:none;margin:3px 0 0;padding:0}.dh4-lg li{margin:2px 0;display:flex;gap:5px;align-items:center;flex-wrap:wrap}
 .dh4-lg li button{border:0;background:none;padding:0;font:inherit;font-weight:700;color:#1F2937;cursor:pointer;text-align:left}.dh4-lg li button:hover{text-decoration:underline}
 .dh4-lg li i{width:18px;height:4px;border-radius:2px;background:var(--c);flex:none;opacity:.85}
 .dh4-lg .prep{margin-top:6px;color:#4B5563}.dh4-lg .prep b{color:#1F2937}
 .dh4-lg .t{font-weight:700;font-size:12px;border:0;background:none;padding:0;cursor:pointer;color:inherit;font-family:inherit;text-align:left;width:100%}
 .dh4-lg.fold .dh4-b{display:none}
 .dh4-note{margin:3px 0 6px;padding:5px 7px;border-radius:7px;background:#FEF3C7;color:#78350F;font-weight:700}
 .dh4-why{color:#92400E}
 .dh4-all{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:1060;border:2px solid #0B7285;background:#fff;color:#0B7285;font:inherit;font-size:13px;font-weight:800;border-radius:999px;padding:6px 14px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);white-space:nowrap}
 .dh4-all[hidden]{display:none}
 .dh4-all small{font-weight:700;color:#374151;margin-left:6px}
 @media (max-width:767px){.dh4-all{top:auto;bottom:150px;font-size:12.5px;padding:7px 12px}}
 /* 켜면 바탕을 연하게: 바탕 지도 그림(네이버 지도 타일)·구역 칠·테두리. 개발 호재 선(.dh4p)·거리 재기 선(.msk)은 그대로 */
 .dh4-dim img[src*="map.naver.net"],.dh4-dim img[src*="pstatic.net"]{opacity:.5!important;filter:saturate(.3)}
 .dh4-dim svg path:not(.dh4p):not(.msk){fill-opacity:.04!important;stroke-opacity:.3!important}`;
 function addCss() { if (document.getElementById("dh4Css")) return; const s = document.createElement("style"); s.id = "dh4Css"; s.textContent = CSS; document.head.appendChild(s); }
 const stCol = st => st === "공사 중" ? "#C2410C" : st === "계획 확정" ? "#1D4ED8" : "#6B7280";
 const sub = L => [ L.단계말 || SHOW(L.st), L.목표 ].filter(Boolean).join(" · ");
 const approxChip = L => L.모양 === "도면" ? `<span class="dh4-approx">${(L.대략글 || "").startsWith("노선 미정") ? "노선 미정 · 대략 방향" : "대략 위치"}</span>` : "";
 function fromGeo(G) {
  const m = G.meta || {}, 노선 = [], 역 = [];
  for (const f of G.features || []) {
   const p = f.properties || {}, g = f.geometry || {};
   if (p.kind === "line") {
    const cs = g.type === "LineString" ? [ g.coordinates ] : g.coordinates || [];
    const L = { id: p.line_id, n: p.노선명, 짧은: p.짧은이름 || p.노선명, c: p.색, st: p.단계 || (p.상태 === "공사" ? "공사 중" : "계획 확정"), 단계말: p.단계말, 단계글: p.단계글, 목표: p.목표 || (p.개통예정연도 ? p.개통예정연도 + " 목표" : ""),
     개통: p.개통, 구간: p.구간, 근거: p.근거, 주소: p.주소, 근거종류: p.근거종류, 기준일: p.기준일, 모양: p.모양, 모양출처: p.모양출처, km: p.km, p: cs.map(s => s.map(q => [ q[1], q[0] ])) };
    if (p.서울3차) L.p3 = 1; if (p.원래노선) L.원래노선 = p.원래노선; if (p.잇기) L.잇기 = p.잇기; if (p.대략글) L.대략글 = p.대략글; L.검증 = p.검증 || "검증 전"; if (p.공용) L.공용 = p.공용; if (p.공용구간) L.pk = p.공용구간;
    노선.push(L);
   } else if (p.kind === "station") {
    const c = g.coordinates; 역.push([ c[1], c[0], p.역명, Array.isArray(p.line_id) ? p.line_id : [ p.line_id ], p.환승 ? 1 : 0, p.위치출처 || "", p.표기 || "" ]);
   }
  }
  const ok = L => !/수정 필요|근거 부족/.test(L.검증 || "");   // v5: 검증 통과 전 숨김 노선은 그리지 않음
  const ids = new Set(노선.filter(ok).map(L => L.id));
  return { 설정: m.설정 || {}, 노선: 노선.filter(ok), 역: 역.filter(st => st[3].some(id => ids.has(id))), 목록만: (m.목록만 || []).concat(노선.filter(L => !ok(L)).map(L => ({ 짧은: L.짧은, 숨김: "검증 " + L.검증 }))) };
 }

 window.DevHojae5 = function (map, cfg) {
  const NV = naver.maps, S = { on: false, D: null, p: null, polys: [], labels: [], marks: [], seq: 0, zw: 0, mx: 0, my: 0, solo: null };
  addCss();
  const mapEl = map.getElement ? map.getElement() : null;
  const tip = document.createElement("div"); tip.className = "dh4-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
  const allBtn = document.createElement("button"); allBtn.type = "button"; allBtn.className = "dh4-all"; allBtn.hidden = true;
  (cfg.host || (mapEl && mapEl.parentNode) || document.body).appendChild(allBtn);
  allBtn.addEventListener("click", e => { e.stopPropagation(); solo(null); });
  document.addEventListener("mousemove", e => { S.mx = e.clientX; S.my = e.clientY; if (tip.classList.contains("on")) placeTip(); }, { passive: true });
  document.addEventListener("mouseover", e => {
   if (!S.on || !S.D || !e.target || !e.target.closest) return;
   const el = e.target.closest(".dh4-lb"); if (el) { const L = S.D.노선.find(x => x.id === el.dataset.id); if (L) showTip(lineHtml(L, true)); return; }
   const se = e.target.closest(".dh4-st"); if (se) { const st = S.D.역[+se.dataset.i]; if (st) showTip(stHtml(st, true)); }
  }, { passive: true });
  document.addEventListener("mouseout", e => { const el = e.target && e.target.closest && e.target.closest(".dh4-lb,.dh4-st"); if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hideTip(); }, { passive: true });
  function placeTip() { const w = tip.offsetWidth, h = tip.offsetHeight; let x = S.mx + 14, y = S.my + 14; if (x + w > innerWidth - 6) x = S.mx - w - 14; if (y + h > innerHeight - 6) y = S.my - h - 14; tip.style.left = Math.max(6, x) + "px"; tip.style.top = Math.max(6, y) + "px"; }
  function showTip(html) { if (cfg.phone && cfg.phone()) return; tip.innerHTML = html; tip.classList.add("on"); placeTip(); }
  function hideTip() { tip.classList.remove("on"); }
  function load() {
   if (S.D) return Promise.resolve(S.D);
   const geo = (cfg.fmt || "geo") === "geo";   // v5: cfg.fmt "v5"면 46 꼴 파일
   if (geo && window.MAP_HOJAE && window.MAP_HOJAE.meta && String(window.MAP_HOJAE.meta.v || "").startsWith("49")) return Promise.resolve(S.D = fromGeo(window.MAP_HOJAE));
   if (!geo && window.DEV_HOJAE5) return Promise.resolve(S.D = window.DEV_HOJAE5);
   if (!S.p) S.p = new Promise(res => { const t = document.createElement("script"); t.src = cfg.base + (geo ? "개발호재_v5_geo.js" : "개발호재_v5.js") + (cfg.v ? "?v=" + cfg.v : "");
    t.onload = () => res(S.D = geo ? (window.MAP_HOJAE ? fromGeo(window.MAP_HOJAE) : null) : (window.DEV_HOJAE5 || null)); t.onerror = () => res(null); document.head.appendChild(t); });
   return S.p;
  }
  const LL = (y, x) => new NV.LatLng(y, x);
  function pick(L) { if (cfg.onOverlay) cfg.onOverlay(); hideTip(); solo(L.id, true); lineCard(L); }
  function hook(ov, L, si) {   // si: 선 조각 번호(기존 선로 공용 구간이면 툴팁에 적음)
   NV.Event.addListener(ov, "mouseover", () => showTip(lineHtml(L, true, si))); NV.Event.addListener(ov, "mouseout", hideTip);
   NV.Event.addListener(ov, "click", e => { if (cfg.take && cfg.take(e, null)) return; pick(L); });
  }
  function buildPolys() {
   if (S.polys.length) return;
   const lines = S.D.노선.slice().sort((a, c) => ORDER.indexOf(c.st) - ORDER.indexOf(a.st));
   lines.forEach(L => L.p.forEach((seg, si) => {
    const path = seg.map(q => LL(q[0], q[1])), z = 40 + (ORDER.length - ORDER.indexOf(L.st)) * 2, dot = L.st === "구상";
    const w0 = new NV.Polyline({ path, strokeColor: "#FFFFFF", strokeOpacity: dot ? 1 : OP, strokeWeight: 5, strokeStyle: "solid", strokeLineCap: "round", strokeLineJoin: "round", clickable: false, zIndex: z });
    const w1 = new NV.Polyline({ path, strokeColor: L.c, strokeOpacity: dot ? 1 : OP, strokeWeight: 3, strokeStyle: dot ? "shortdash" : "solid", strokeLineCap: dot ? "butt" : "round", strokeLineJoin: "round", clickable: true, zIndex: z + 1 });
    w0.__k = "w"; w1.__k = "c"; w1.__L = L; w0.__L = L; w1.__dot = dot; hook(w1, L, si); S.polys.push(w0, w1);
   }));
  }
  function setW(zm) {
   const w = W(zm); if (S.zw === w) return; S.zw = w;
   S.polys.forEach(p => p.setOptions({ strokeWeight: p.__k === "w" ? w + 2 : w }));
  }
  // 선 화면 요소에 표시(바탕 연하게에서 빼기)·점선 마디(선 10px·빈칸 6px)
  function styleEls() {
   S.polys.forEach(p => { const el = p.getElement && p.getElement(); if (!el) return; el.classList.add("dh4p"); if (p.__dot) el.style.strokeDasharray = DASH; });
  }
  const shown = L => !S.solo || L.id === S.solo;
  function clearMarks() { S.labels.forEach(m => m.setMap(null)); S.marks.forEach(m => m.setMap(null)); S.labels = []; S.marks = []; }
  function placeLabels(zm, placed) {
   const pr = map.getProjection(), bb = map.getBounds(), b = { s: bb.getMin().y, w: bb.getMin().x, n: bb.getMax().y, e: bb.getMax().x };
   const dy = (b.n - b.s) * .06, dx = (b.e - b.w) * .06, inb = q => q[0] > b.s + dy && q[0] < b.n - dy && q[1] > b.w + dx && q[1] < b.e - dx;
   const small = zm <= 11, fs1 = small ? 12 : 13, fs2 = small ? 10 : 10.5, out = [];
   const hit = r => placed.some(q => !(r.x2 < q.x1 || r.x1 > q.x2 || r.y2 < q.y1 || r.y1 > q.y2));
   const lines = S.D.노선.filter(shown).sort((a, c) => ORDER.indexOf(a.st) - ORDER.indexOf(c.st) || (c.km || 0) - (a.km || 0));
   const FR = [ .5, .42, .58, .34, .66, .26, .74, .18, .82, .1, .9 ];
   for (const L of lines) {
    const tw = Math.max(L.짧은.length * fs1 * .95, sub(L).length * fs2 * .8) + 22, th = small ? 36 : 38;
    const segs = L.p.map(sq => { const P = sq.map(q => pr.fromCoordToOffset(LL(q[0], q[1]))), cum = [ 0 ]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y)); return { sq, P, cum, len: cum[cum.length - 1] }; }).sort((a, c) => c.len - a.len);
    const total = segs.reduce((a, s) => a + s.len, 0), want = total > 900 ? 2 : 1; let got = [];
    for (const s of segs) {
     for (const f of FR) {
      if (got.length >= want) break;
      const d = s.len * f; let i = 1; while (i < s.cum.length - 1 && s.cum[i] < d) i++;
      const t = (d - s.cum[i - 1]) / ((s.cum[i] - s.cum[i - 1]) || 1), x = s.P[i - 1].x + (s.P[i].x - s.P[i - 1].x) * t, y = s.P[i - 1].y + (s.P[i].y - s.P[i - 1].y) * t;
      const pos = pr.fromOffsetToCoord(new NV.Point(x, y)); if (!inb([ pos.lat(), pos.lng() ])) continue;
      if (got.some(g => Math.hypot(g.x - x, g.y - y) < 420)) continue;
      const r = { x1: x - tw / 2 - 4, x2: x + tw / 2 + 4, y1: y - th / 2 - 4, y2: y + th / 2 + 4 }; if (hit(r)) continue;
      placed.push(r); got.push({ x, y });
      const m = new NV.Marker({ position: pos, zIndex: 60 + (ORDER.length - ORDER.indexOf(L.st)), icon: { content: `<div class="dh4-lb${small ? " s" : ""}" data-id="${L.id}" style="--c:${L.c};--t:${ink(L.c)}"><b>${esc(L.짧은)}</b><small>${esc(sub(L))}</small></div>`, anchor: new NV.Point(0, 0) } });
      hook(m, L); out.push(m);
     }
     if (got.length >= want) break;
    }
   }
   return out;
  }
  async function draw() {
   const seq = ++S.seq; if (!S.on) { clearMarks(); return; }
   const D = await load(); if (!D || seq !== S.seq || !S.on) return;
   buildPolys(); const zm = map.getZoom(); setW(zm);
   S.polys.forEach(p => { const want = shown(p.__L); if (want && !p.getMap()) p.setMap(map); else if (!want && p.getMap()) p.setMap(null); });
   clearMarks(); hideTip(); styleEls(); setTimeout(styleEls, 120);
   const bb = map.getBounds(), b = { s: bb.getMin().y, w: bb.getMin().x, n: bb.getMax().y, e: bb.getMax().x }, byId = new Map(D.노선.map(L => [ L.id, L ])), pr = map.getProjection();
   const vis = [];
   D.역.forEach((st, i) => {
    if (st[0] < b.s || st[0] > b.n || st[1] < b.w || st[1] > b.e) return;
    const ids = S.solo ? st[3].filter(id => id === S.solo) : st[3]; if (!ids.length) return;
    const L0 = byId.get(ids[0]); if (!L0) return;
    vis.push({ st, i, L0, pri: ORDER.indexOf(L0.st) * 2 + (st[4] ? 0 : 1) });
   });
   const placed = [];
   vis.forEach(({ st, i, L0 }) => {
    const m = new NV.Marker({ position: LL(st[0], st[1]), zIndex: 56 + (st[4] ? 1 : 0), title: "", icon: { content: `<div class="dh4-st${st[4] ? " tr" : ""}" data-i="${i}" style="--c:${L0.c}"></div>`, anchor: new NV.Point(0, 0) } });
    NV.Event.addListener(m, "click", e => { if (cfg.take && cfg.take(e, m.getPosition())) return; if (cfg.onOverlay) cfg.onOverlay(); hideTip(); open(stHtml(st)); }); m.setMap(map); S.marks.push(m);
    const o = pr.fromCoordToOffset(LL(st[0], st[1])), r = st[4] ? 8 : 6; placed.push({ x1: o.x - r, x2: o.x + r, y1: o.y - r, y2: o.y + r });
   });
   S.labels = placeLabels(zm, placed); S.labels.forEach(m => m.setMap(map));
   if (zm >= NAME_ZOOM) {   // 역 이름: 겹치면 공사 중 노선·갈아타는 역부터
    vis.slice().sort((a, c) => a.pri - c.pri).forEach(({ st }) => {
     const o = pr.fromCoordToOffset(LL(st[0], st[1])), w = st[2].length * 13 + 6, r = { x1: o.x + 8, x2: o.x + 10 + w, y1: o.y - 9, y2: o.y + 9 };
     if (placed.some(q => !(r.x2 < q.x1 || r.x1 > q.x2 || r.y2 < q.y1 || r.y1 > q.y2) && !(q.x1 < o.x && q.x2 > o.x && q.y1 < o.y && q.y2 > o.y && q.x2 - q.x1 < 20))) return;
     placed.push(r);
     const t = new NV.Marker({ position: LL(st[0], st[1]), clickable: false, zIndex: 54, icon: { content: `<div class="dh4-sn">${esc(st[2])}</div>`, anchor: new NV.Point(0, 0) } }); t.setMap(map); S.marks.push(t);
    });
   }
  }
  function solo(id, keep) {
   S.solo = id || null; const L = id && S.D && S.D.노선.find(x => x.id === id);
   allBtn.hidden = !S.solo; allBtn.innerHTML = S.solo ? `전체 노선 보기<small>${esc(L ? L.짧은 : "")}만 보는 중</small>` : "";
   if (!S.solo && !keep) close();
   if (S.on) draw();
  }
  function chip(st) { return `<span class="dh4-chip" style="--c:${stCol(st)}">${esc(SHOW(st))}</span>`; }
  function open(html) { const c = cfg.card; c.innerHTML = '<button type="button" class="scx" aria-label="닫기">✕</button>' + html; c.hidden = false; c.classList.add("on"); c.querySelector(".scx").onclick = close; }
  function close() { const c = cfg.card; if (!c) return; c.classList.remove("on"); c.innerHTML = ""; }
  function shapeNote(L) {
   const C = S.D.설정;
   if (L.모양 === "도면") return (L.p3 ? (C.서울3차 || "국토부 승인 전 계획안(2026.6 발표), 대략 위치") : (L.대략글 || C.도면 || "대략 위치(기본계획 도면 기준)")) + (L.모양출처 ? " · 출처: " + L.모양출처 : "");
   return "선 모양: " + (C.모양_OSM || "") + (L.p3 ? " · " + (C.서울3차 || "") : "");
  }
  function lineHtml(L, isTip, si) {
   const row = (k, v) => v ? `<div class="scs"><span class="dh4-k">${k}</span>${v}</div>` : "";
   const pk = si != null && L.pk ? L.pk[si] : "";
   return `<div class="dh4-h"${isTip ? ' style="padding-right:0"' : ""}><i style="--c:${L.c || "#D1D5DB"}"></i>${esc(L.n)}${chip(L.st)}${approxChip(L)}</div>` +
    (pk ? `<div class="scs"><span class="dh4-approx" style="margin-left:0">기존 선로 공용</span> ${esc(pk)}</div>` : "") +
    row("단계", esc(L.단계말 || SHOW(L.st)) + (L.단계글 && L.단계글 !== L.단계말 ? ` <small>(${esc(L.단계글.slice(0, 70))}${L.단계글.length > 70 ? "…" : ""})</small>` : "")) +
    row("개통 목표", esc(L.목표 || "미확인")) + row("구간", esc(L.구간)) +
    row("근거", esc(L.근거 || L.근거종류) + (L.근거종류 ? ` <small>(${esc(L.근거종류)})</small>` : "") + (!isTip && L.주소 ? ` <a href="${esc(L.주소)}" target="_blank" rel="noopener">원문 보기</a>` : "")) +
    row("기존 선로 공용", esc(L.공용 || "")) + row("기준일", esc(L.기준일)) +
    `<div class="scn">${L.p ? esc(shapeNote(L)) : "선 자료 준비 중 — 지도에 선을 긋지 않았어요."}<br>단계·개통 목표는 참고용이에요.</div>`;
  }
  function lineCard(L) { open(lineHtml(L)); }
  function stHtml(st, isTip) {
   const Ls = st[3].map(id => S.D.노선.find(L => L.id === id)).filter(Boolean), pyo = st[6] || (st[5] === "기존역" ? "역 위치" : "대략 위치"), apx = pyo === "대략 위치";
   return `<div class="dh4-h"${isTip ? ' style="padding-right:0"' : ""}>${esc(st[2])}역 <small style="font-weight:600;color:#6B7280">(${st[4] ? "갈아타는 역" : "새 역"})</small>${apx ? '<span class="dh4-approx">대략 위치</span>' : ""}</div>` +
    Ls.map(L => `<div class="scs"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;border:2.5px solid ${L.c};margin-right:4px;vertical-align:-1px"></i>${esc(L.짧은)} · ${esc(L.단계말 || SHOW(L.st))} · ${esc(L.목표 || "목표 미확인")}</div>`).join("") +
    `<div class="scn">${apx ? "대략 위치" : "역 위치"} · 이름·위치는 바뀔 수 있어요.</div>`;
  }
  function near(coord) {
   const pr = map.getProjection(), p0 = pr.fromCoordToOffset(coord), lim = 14; let best = null;
   for (const L of S.D.노선) { if (!shown(L)) continue; for (const sq of L.p) for (let i = 1; i < sq.length; i++) {
    const a = pr.fromCoordToOffset(LL(sq[i - 1][0], sq[i - 1][1])), c = pr.fromCoordToOffset(LL(sq[i][0], sq[i][1]));
    if (Math.min(a.x, c.x) - lim > p0.x || Math.max(a.x, c.x) + lim < p0.x || Math.min(a.y, c.y) - lim > p0.y || Math.max(a.y, c.y) + lim < p0.y) continue;
    const dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p0.x - a.x) * dx + (p0.y - a.y) * dy) / L2)) : 0, d = Math.hypot(a.x + t * dx - p0.x, a.y + t * dy - p0.y);
    if (d < lim && (!best || d < best[0])) best = [ d, L ];
   } }
   return best && best[1];
  }
  function click(coord) {   // 지도 빈 곳 누름: 선 가까이(화면 14px)면 그 노선 하나만 + 창, 하나만 보는 중이면 전체로
   if (!S.on || !S.D || !coord) return false;
   const L = near(coord); if (L) { pick(L); return true; }
   if (S.solo) { solo(null); return true; }
   return false;
  }
  function fitLine(L) {
   let s = 90, n = -90, w = 999, e = -999; L.p.forEach(sq => sq.forEach(q => { s = Math.min(s, q[0]); n = Math.max(n, q[0]); w = Math.min(w, q[1]); e = Math.max(e, q[1]); }));
   map.fitBounds(new NV.LatLngBounds(LL(s, w), LL(n, e)), { top: 60, right: 90, bottom: 60, left: 60 });
  }
  function legend() {
   const el = cfg.legend; if (!el) return; const D = S.D, C = D.설정;
   const sw = st => `<svg width="34" height="10" aria-hidden="true"><line x1="2" y1="5" x2="32" y2="5" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="2" y1="5" x2="32" y2="5" stroke="#374151" stroke-width="3" ${st === "구상" || st === "가능성 있는 노선" ? 'stroke-dasharray="7 4"' : 'stroke-linecap="round"'}/></svg>`;
   const rows = (C.단계 || []).map(([st, how, mean]) => `<div class="row">${sw(st)}<div><b>${esc(st)}</b> <small>${esc(how)}</small><br><small>${esc(mean)}</small></div></div>`).join("") +
    `<div class="row"><svg width="34" height="16" aria-hidden="true"><circle cx="10" cy="8" r="4.5" fill="#fff" stroke="#374151" stroke-width="2.5"/><circle cx="25" cy="8" r="6.5" fill="#fff" stroke="#374151" stroke-width="3"/></svg><div><b>새 역 · 갈아타는 역</b><br><small>공사 중·계획 확정(기본계획 고시·승인 이상) 노선만</small></div></div>`;
   const grp = ORDER.map(st => { const xs = D.노선.filter(L => L.st === st); if (!xs.length) return "";
    return `<div style="margin-top:6px"><b>${esc(SHOW(st))}</b> <small>${xs.length}개</small><ul>${xs.map(L => `<li><i style="--c:${L.c}"></i><button type="button" data-id="${L.id}">${esc(L.짧은)}</button><small>${esc(sub(L))}${L.모양 === "도면" ? " · 대략 위치" : ""}</small></li>`).join("")}</ul></div>`; }).join("");
   const prep = D.목록만;
   el.innerHTML = `<button type="button" class="t" aria-expanded="true">개발 호재 (참고용) <span>▾</span></button><div class="dh4-b">${C.안내 ? `<div class="dh4-note">${esc(C.안내)}</div>` : ""}${rows}<div style="margin-top:4px"><small>선이나 이름표를 누르면 그 노선만 보여요. 선·이름표·역 원에 마우스를 올리면 자세히 보여요.</small></div>${grp}` +
    `<div class="prep"><b>선 자료 준비 중 ${prep.length}개</b> <small>— 위치 자료가 아직 없어 선을 긋지 않았어요</small><br><small>${prep.map(o => esc(o.짧은) + (o.숨김 ? `<span class="dh4-why" title="${esc(o.숨김)}"> (자료 확인 중)</span>` : "")).join(" · ")}</small></div><div style="margin-top:6px"><small>${esc(C.출처)}</small></div></div>`;
   el.classList.add("dh4-lg"); el.hidden = false;
   const tb = el.querySelector(".t"), setF = f => { el.classList.toggle("fold", f); tb.setAttribute("aria-expanded", String(!f)); tb.querySelector("span").textContent = f ? "▸" : "▾"; };
   setF(!!(cfg.phone && cfg.phone()) || !!cfg.fold); tb.onclick = () => setF(!el.classList.contains("fold"));
   el.querySelectorAll("li button").forEach(b => b.onclick = () => { const L = D.노선.find(x => x.id === b.dataset.id); fitLine(L); solo(L.id, true); lineCard(L); if (cfg.phone && cfg.phone()) setF(true); });
  }
  function toggle(on) {
   S.on = !!on; if (cfg.onState) cfg.onState(S.on); if (mapEl) mapEl.classList.toggle("dh4-dim", S.on);
   if (!S.on) { S.seq++; S.solo = null; allBtn.hidden = true; clearMarks(); hideTip(); S.polys.forEach(p => p.setMap(null)); close(); if (cfg.legend) cfg.legend.hidden = true; return Promise.resolve(); }
   return load().then(D => { if (D && S.on) { legend(); return draw(); } });
  }
  return { toggle, draw, click, close, load, solo, get on() { return S.on; }, get data() { return S.D; }, get soloId() { return S.solo; } };
 };
 window.DevHojae5.fromGeo = fromGeo;
})();
