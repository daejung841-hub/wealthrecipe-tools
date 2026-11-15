/* 46차 개발 호재 층 v2 — 재개발 지도·계산기 지도 공용(같은 파일). 자료는 같은 폴더 개발호재_v2.js(window.DEV_HOJAE2). 44차 dev_hojae.js는 그대로 둠
 *  쓰는 법: const dh = DevHojae2(map, { base: "../map-shared/", v: "…", card: 창 요소, legend: 범례 요소, phone: () => 휴대폰?, onState: on => {…}, onOverlay: () => {…} })
 *    dh.toggle(true/false) · dh.draw()(지도 idle 때) · dh.click(coord)(지도 빈 곳 누름 — 선 가까이면 창 열고 true) · dh.close() · dh.on
 *  보이는 모양(46차 대표님 요청 — 잘 보이게)
 *    선: 노선마다 서로 다른 진한 색, 흰 테두리(아래 깐 흰 선), 투명도 1, 서울 전체 5px·확대할수록 굵게. 모든 선 실선, '구상'만 점선
 *    이름표: 노선 색 둥근 상자·흰 테두리·흰 굵은 글씨, 첫 줄 노선 이름, 둘째 줄 '단계말 · 목표 연도'. 노선마다 1개(긴 노선 2개), 겹치면 공사 중 > 계획 확정 > 구상
 *    마우스 올리기: 선·이름표에 올리면 창과 같은 내용 툴팁. 누르면 창(휴대폰은 누르면 창)
 *    범례: 단계 3가지 + 그린 노선 목록 + '선 자료 준비 중 N개'와 이름 목록(지어 그리지 않음)
 */
(function () {
 "use strict";
 const ORDER = [ "공사 중", "계획 확정", "구상" ];
 const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
 const W = zm => zm <= 11 ? 5 : zm <= 12 ? 6 : zm <= 14 ? 7 : 9;   // 선 굵기(px)
 const CSS = `
 .dh2-lb{position:absolute;left:0;top:0;transform:translate(-50%,-50%);background:var(--c);color:#fff;border:2px solid #fff;border-radius:10px;padding:3px 9px 4px;white-space:nowrap;text-align:center;line-height:1.2;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer}
 .dh2-lb b{display:block;font-size:13px;font-weight:800;letter-spacing:-.2px}.dh2-lb small{display:block;font-size:10.5px;font-weight:700;opacity:.95}
 .dh2-lb.s b{font-size:12px}.dh2-lb.s small{font-size:10px}
 .dh2-st{position:absolute;left:0;top:0;width:9px;height:9px;border-radius:50%;background:#fff;border:3px solid var(--c);transform:translate(-50%,-50%);cursor:pointer}
 .dh2-sn{position:absolute;left:0;top:0;font-size:11px;font-weight:800;color:#111827;white-space:nowrap;transform:translate(9px,-50%);pointer-events:none;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff,0 0 4px #fff}
 .dh2-tip{position:fixed;z-index:2000;pointer-events:none;background:#fff;border:1px solid #D1D5DB;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:8px 10px;font-size:12.5px;line-height:1.5;max-width:340px;display:none;color:#1F2937}
 .dh2-tip.on{display:block}.dh2-tip .scs{margin:2px 0}.dh2-tip .scn{margin-top:4px;font-size:10.5px;color:#6B7280}
 .dh2-chip{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:1px;color:#fff;background:var(--c)}
 .dh2-k{display:inline-block;min-width:58px;color:#6B7280}
 .dh2-h{display:flex;align-items:center;gap:4px;padding-right:40px;font-size:14px;font-weight:800}.dh2-h i{width:12px;height:12px;border-radius:3px;background:var(--c);flex:none;border:1.5px solid #fff;box-shadow:0 0 0 1px var(--c)}
 .dh2-lg .row{display:flex;gap:6px;align-items:center;margin:2px 0}.dh2-lg svg{flex:none}
 .dh2-lg ul{list-style:none;margin:3px 0 0;padding:0}.dh2-lg li{margin:2px 0;display:flex;gap:5px;align-items:center;flex-wrap:wrap}
 .dh2-lg li button{border:0;background:none;padding:0;font:inherit;font-weight:700;color:#1F2937;cursor:pointer;text-align:left}.dh2-lg li button:hover{text-decoration:underline}
 .dh2-lg li i{width:18px;height:6px;border-radius:3px;background:var(--c);flex:none}
 .dh2-lg .prep{margin-top:6px;color:#4B5563}.dh2-lg .prep b{color:#1F2937}
 .dh2-lg .t{font-weight:700;font-size:12px;border:0;background:none;padding:0;cursor:pointer;color:inherit;font-family:inherit;text-align:left;width:100%}
 .dh2-lg.fold .dh2-b{display:none}`;
 function addCss() { if (document.getElementById("dh2Css")) return; const s = document.createElement("style"); s.id = "dh2Css"; s.textContent = CSS; document.head.appendChild(s); }
 const stCol = st => st === "공사 중" ? "#C2410C" : st === "계획 확정" ? "#1D4ED8" : "#6B7280";
 const sub = L => [ L.단계말 || L.st, L.목표 ].filter(Boolean).join(" · ");

 window.DevHojae2 = function (map, cfg) {
  const NV = naver.maps, S = { on: false, D: null, p: null, polys: [], labels: [], marks: [], seq: 0, zw: 0, mx: 0, my: 0 };
  addCss();
  const tip = document.createElement("div"); tip.className = "dh2-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
  document.addEventListener("mousemove", e => { S.mx = e.clientX; S.my = e.clientY; if (tip.classList.contains("on")) placeTip(); }, { passive: true });
  // 이름표는 화면 요소에 직접(마커 마우스 이벤트가 안 오는 경우가 있어 문서에서 받음)
  document.addEventListener("mouseover", e => { const el = e.target && e.target.closest && e.target.closest(".dh2-lb"); if (!el || !S.on || !S.D) return; const L = S.D.노선.find(x => x.id === el.dataset.id); if (L) showTip(L); }, { passive: true });
  document.addEventListener("mouseout", e => { const el = e.target && e.target.closest && e.target.closest(".dh2-lb"); if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hideTip(); }, { passive: true });
  function placeTip() { const w = tip.offsetWidth, h = tip.offsetHeight; let x = S.mx + 14, y = S.my + 14; if (x + w > innerWidth - 6) x = S.mx - w - 14; if (y + h > innerHeight - 6) y = S.my - h - 14; tip.style.left = Math.max(6, x) + "px"; tip.style.top = Math.max(6, y) + "px"; }
  function showTip(L) { if (cfg.phone && cfg.phone()) return; tip.innerHTML = lineHtml(L, true); tip.classList.add("on"); placeTip(); }
  function hideTip() { tip.classList.remove("on"); }
  function load() {
   if (window.DEV_HOJAE2) return Promise.resolve(S.D = window.DEV_HOJAE2);
   if (!S.p) S.p = new Promise(res => { const t = document.createElement("script"); t.src = cfg.base + "개발호재_v2.js" + (cfg.v ? "?v=" + cfg.v : ""); t.onload = () => res(S.D = window.DEV_HOJAE2 || null); t.onerror = () => res(null); document.head.appendChild(t); });
   return S.p;
  }
  const LL = (y, x) => new NV.LatLng(y, x);
  function hook(ov, L) {
   NV.Event.addListener(ov, "mouseover", () => showTip(L)); NV.Event.addListener(ov, "mouseout", hideTip);
   NV.Event.addListener(ov, "click", () => { if (cfg.onOverlay) cfg.onOverlay(); hideTip(); lineCard(L); });
  }
  function buildPolys() {
   if (S.polys.length) return;
   const lines = S.D.노선.slice().sort((a, c) => ORDER.indexOf(c.st) - ORDER.indexOf(a.st));   // 공사 중이 맨 위
   lines.forEach((L, k) => L.p.forEach(seg => {
    const path = seg.map(q => LL(q[0], q[1])), z = 40 + (ORDER.length - ORDER.indexOf(L.st)) * 2;
    const w0 = new NV.Polyline({ path, strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: 9, strokeLineCap: "round", strokeLineJoin: "round", clickable: false, zIndex: z });
    const w1 = new NV.Polyline({ path, strokeColor: L.c, strokeOpacity: 1, strokeWeight: 5, strokeStyle: L.st === "구상" ? "shortdot" : "solid", strokeLineCap: L.st === "구상" ? "butt" : "round", strokeLineJoin: "round", clickable: true, zIndex: z + 1 });
    w0.__k = "w"; w1.__k = "c"; w1.__L = L; hook(w1, L); S.polys.push(w0, w1);
   }));
  }
  function setW(zm) {
   const w = W(zm); if (S.zw === w) return; S.zw = w;
   S.polys.forEach(p => p.setOptions({ strokeWeight: p.__k === "w" ? w + 4 : w }));
  }
  function clearMarks() { S.labels.forEach(m => m.setMap(null)); S.marks.forEach(m => m.setMap(null)); S.labels = []; S.marks = []; }
  // 이름표: 노선마다 선 위 후보 자리(길이 비율 .5 .4 .6 .3 .7 …) 가운데 화면 안·안 겹치는 첫 자리. 긴 노선(화면에서 길게 보이는 것)은 멀리 떨어진 둘째 자리 하나 더
  function placeLabels(zm) {
   const pr = map.getProjection(), bb = map.getBounds(), b = { s: bb.getMin().y, w: bb.getMin().x, n: bb.getMax().y, e: bb.getMax().x };
   const dy = (b.n - b.s) * .06, dx = (b.e - b.w) * .06, inb = q => q[0] > b.s + dy && q[0] < b.n - dy && q[1] > b.w + dx && q[1] < b.e - dx;
   const small = zm <= 11, fs1 = small ? 12 : 13, fs2 = small ? 10 : 10.5, placed = [], out = [];
   const hit = r => placed.some(q => !(r.x2 < q.x1 || r.x1 > q.x2 || r.y2 < q.y1 || r.y1 > q.y2));
   const lines = S.D.노선.slice().sort((a, c) => ORDER.indexOf(a.st) - ORDER.indexOf(c.st) || (c.km || 0) - (a.km || 0));
   const FR = [ .5, .42, .58, .34, .66, .26, .74, .18, .82, .1, .9 ];
   for (const L of lines) {
    const tw = Math.max(L.짧은.length * fs1 * .95, sub(L).length * fs2 * .8) + 22, th = small ? 36 : 38;
    // 선 전체를 한 줄로 이어 길이 비율 자리를 잡음(조각마다)
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
      const m = new NV.Marker({ position: pos, zIndex: 60 + (ORDER.length - ORDER.indexOf(L.st)), icon: { content: `<div class="dh2-lb${small ? " s" : ""}" data-id="${L.id}" style="--c:${L.c}"><b>${esc(L.짧은)}</b><small>${esc(sub(L))}</small></div>`, anchor: new NV.Point(0, 0) } });
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
   buildPolys(); const zm = map.getZoom(); setW(zm); S.polys.forEach(p => { if (!p.getMap()) p.setMap(map); });
   clearMarks(); hideTip();
   S.labels = placeLabels(zm); S.labels.forEach(m => m.setMap(map));
   if (zm >= 12) {
    const bb = map.getBounds(), b = { s: bb.getMin().y, w: bb.getMin().x, n: bb.getMax().y, e: bb.getMax().x }, byId = new Map(D.노선.map(L => [ L.id, L ]));
    for (const st of D.역) {
     if (st[0] < b.s || st[0] > b.n || st[1] < b.w || st[1] > b.e) continue;
     const L0 = byId.get(st[3][0]); if (!L0) continue;
     const m = new NV.Marker({ position: LL(st[0], st[1]), zIndex: 55, title: st[2] + "역(예정)", icon: { content: `<div class="dh2-st" style="--c:${L0.c}"></div>`, anchor: new NV.Point(0, 0) } });
     NV.Event.addListener(m, "click", () => { if (cfg.onOverlay) cfg.onOverlay(); stCard(st); }); m.setMap(map); S.marks.push(m);
     if (zm >= 14) { const t = new NV.Marker({ position: LL(st[0], st[1]), clickable: false, zIndex: 54, icon: { content: `<div class="dh2-sn">${esc(st[2])}</div>`, anchor: new NV.Point(0, 0) } }); t.setMap(map); S.marks.push(t); }
    }
   }
  }
  function chip(st) { return `<span class="dh2-chip" style="--c:${stCol(st)}">${esc(st)}</span>`; }
  function open(html) { const c = cfg.card; c.innerHTML = '<button type="button" class="scx" aria-label="닫기">✕</button>' + html; c.hidden = false; c.classList.add("on"); c.querySelector(".scx").onclick = close; }
  function close() { const c = cfg.card; if (!c) return; c.classList.remove("on"); c.innerHTML = ""; }
  function lineHtml(L, isTip) {
   const C = S.D.설정, row = (k, v) => v ? `<div class="scs"><span class="dh2-k">${k}</span>${v}</div>` : "";
   return `<div class="dh2-h"${isTip ? ' style="padding-right:0"' : ""}><i style="--c:${L.c || "#D1D5DB"}"></i>${esc(L.n)}${chip(L.st)}</div>` +
    row("단계", esc(L.단계말 || L.st) + (L.단계글 && L.단계글 !== L.단계말 ? ` <small>(${esc(L.단계글.slice(0, 70))}${L.단계글.length > 70 ? "…" : ""})</small>` : "")) +
    row("개통 목표", esc(L.목표 || "미확인")) + row("구간", esc(L.구간)) +
    row("근거", esc(L.근거 || L.근거종류) + (L.근거종류 ? ` <small>(${esc(L.근거종류)})</small>` : "") + (!isTip && L.주소 ? ` <a href="${esc(L.주소)}" target="_blank" rel="noopener">원문 보기</a>` : "")) +
    row("기준일", esc(L.기준일)) +
    `<div class="scn">${L.p ? "선 모양: " + esc(C.모양_OSM) : "선 자료 준비 중 — 지도에 선을 긋지 않았어요."}<br>단계·개통 목표는 참고용이에요.</div>`;
  }
  function lineCard(L) { open(lineHtml(L)); }
  function stCard(st) {
   const Ls = st[3].map(id => S.D.노선.find(L => L.id === id)).filter(Boolean);
   open(`<div class="dh2-h">${esc(st[2])}역 <small style="font-weight:600;color:#6B7280">(예정)</small></div>` + Ls.map(L => `<div class="scs"><span class="dh2-k">노선</span>${esc(L.n)}${chip(L.st)}</div><div class="scs"><span class="dh2-k">개통 목표</span>${esc(L.목표 || "미확인")}</div>`).join("") +
    `<div class="scn">역 위치: OpenStreetMap 공사·계획 역 정보(2026-11-10 받음) · 이름·위치는 바뀔 수 있어요.</div>`);
  }
  function click(coord) {   // 휴대폰 등에서 선 가까이(화면 14px) 누름
   if (!S.on || !S.D || !coord) return false;
   const pr = map.getProjection(), p0 = pr.fromCoordToOffset(coord), lim = 14; let best = null;
   for (const L of S.D.노선) for (const sq of L.p) for (let i = 1; i < sq.length; i++) {
    const a = pr.fromCoordToOffset(LL(sq[i - 1][0], sq[i - 1][1])), c = pr.fromCoordToOffset(LL(sq[i][0], sq[i][1]));
    if (Math.min(a.x, c.x) - lim > p0.x || Math.max(a.x, c.x) + lim < p0.x || Math.min(a.y, c.y) - lim > p0.y || Math.max(a.y, c.y) + lim < p0.y) continue;
    const dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p0.x - a.x) * dx + (p0.y - a.y) * dy) / L2)) : 0, d = Math.hypot(a.x + t * dx - p0.x, a.y + t * dy - p0.y);
    if (d < lim && (!best || d < best[0])) best = [ d, L ];
   }
   if (best) { lineCard(best[1]); return true; }
   return false;
  }
  function fitLine(L) {
   let s = 90, n = -90, w = 999, e = -999; L.p.forEach(sq => sq.forEach(q => { s = Math.min(s, q[0]); n = Math.max(n, q[0]); w = Math.min(w, q[1]); e = Math.max(e, q[1]); }));
   map.fitBounds(new NV.LatLngBounds(LL(s, w), LL(n, e)), { top: 60, right: 90, bottom: 60, left: 60 });
  }
  function legend() {
   const el = cfg.legend; if (!el) return; const D = S.D, C = D.설정;
   const sw = st => `<svg width="34" height="12" aria-hidden="true"><line x1="2" y1="6" x2="32" y2="6" stroke="#fff" stroke-width="8" stroke-linecap="round"/><line x1="2" y1="6" x2="32" y2="6" stroke="#374151" stroke-width="4" ${st === "구상" ? 'stroke-dasharray="1 4"' : ""} stroke-linecap="round"/></svg>`;
   const rows = C.단계.map(([st, how, mean]) => `<div class="row">${sw(st)}<div><b>${esc(st)}</b> <small>${esc(how)}</small><br><small>${esc(mean)}</small></div></div>`).join("");
   const grp = ORDER.map(st => { const xs = D.노선.filter(L => L.st === st); if (!xs.length) return "";
    return `<div style="margin-top:6px"><b>${esc(st)}</b> <small>${xs.length}개</small><ul>${xs.map(L => `<li><i style="--c:${L.c}"></i><button type="button" data-id="${L.id}">${esc(L.짧은)}</button><small>${esc(sub(L))}</small></li>`).join("")}</ul></div>`; }).join("");
   const prep = D.목록만;
   el.innerHTML = `<button type="button" class="t" aria-expanded="true">개발 호재 (참고용) <span>▾</span></button><div class="dh2-b">${rows}<div style="margin-top:4px"><small>단계는 선 위 이름표 둘째 줄에 적었어요. 선이나 이름표에 마우스를 올리면 자세히 보여요.</small></div>${grp}` +
    `<div class="prep"><b>선 자료 준비 중 ${prep.length}개</b> <small>— 위치 자료가 아직 없어 선을 긋지 않았어요</small><br><small>${prep.map(o => esc(o.짧은)).join(" · ")}</small></div><div style="margin-top:6px"><small>${esc(C.출처)}</small></div></div>`;
   el.classList.add("dh2-lg"); el.hidden = false;
   const tb = el.querySelector(".t"), setF = f => { el.classList.toggle("fold", f); tb.setAttribute("aria-expanded", String(!f)); tb.querySelector("span").textContent = f ? "▸" : "▾"; };
   setF(!!(cfg.phone && cfg.phone())); tb.onclick = () => setF(!el.classList.contains("fold"));
   el.querySelectorAll("li button").forEach(b => b.onclick = () => { const L = D.노선.find(x => x.id === b.dataset.id); fitLine(L); lineCard(L); if (cfg.phone && cfg.phone()) setF(true); });
  }
  function toggle(on) {
   S.on = !!on; if (cfg.onState) cfg.onState(S.on);
   if (!S.on) { S.seq++; clearMarks(); hideTip(); S.polys.forEach(p => p.setMap(null)); close(); if (cfg.legend) cfg.legend.hidden = true; return Promise.resolve(); }
   return load().then(D => { if (D && S.on) { legend(); return draw(); } });
  }
  return { toggle, draw, click, close, load, get on() { return S.on; }, get data() { return S.D; } };
 };
})();
