/* 44차 개발 호재 층 — 재개발 지도·계산기 지도 공용(같은 파일). 자료는 같은 폴더 개발호재.js(window.DEV_HOJAE)
 *  쓰는 법: const dh = DevHojae(map, { base: "../map-shared/", v: "…", card: 창 요소, legend: 범례 요소, phone: () => 휴대폰?, onState: on => {…}, onOverlay: () => {…} })
 *    dh.toggle(true/false) · dh.draw()(지도 idle 때) · dh.click(coord) → 선 가까이(화면 12px) 눌렀으면 창 열고 true · dh.close() · dh.on
 *  그리는 것: 새로 생기는 노선만(운행 노선 없음). 공사 중 = 굵은 점선, 계획 확정 = 가는 점선, 구상 = 아주 연한 점선, 색은 노선 고유색을 연하게
 *            선을 따라 노선 이름(확대에 맞춰 글자 크기, 겹치면 하나만) · 확정된 역(공사 중·계획 확정 노선)만 작은 점과 이름
 *  창: 노선 이름 · 단계 · 개통 예정 · 근거 문서 · 기준일 (+구간·선 모양 출처)
 */
(function () {
 "use strict";
 const STY = { "공사 중": { w: 3, op: .6, dash: "dash", lw: 3, la: "7 4" }, "계획 확정": { w: 2, op: .55, dash: "shortdash", lw: 2, la: "4 3" }, "구상": { w: 2, op: .3, dash: "shortdot", lw: 2, la: "1 3" } };
 const ORDER = [ "공사 중", "계획 확정", "구상" ];
 const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
 const CSS = `
 .dh-lb{position:absolute;left:0;top:0;white-space:nowrap;font-weight:800;letter-spacing:-.2px;pointer-events:none;color:var(--c);text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff,0 0 4px #fff;opacity:.92}
 .dh-st{position:absolute;left:0;top:0;width:7px;height:7px;border-radius:50%;background:#fff;border:2px solid var(--c);transform:translate(-50%,-50%);cursor:pointer;opacity:.95}
 .dh-sn{position:absolute;left:0;top:0;font-size:10.5px;font-weight:700;color:#374151;white-space:nowrap;transform:translate(7px,-50%);pointer-events:none;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff}
 .dh-chip{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:1px;color:#fff;background:var(--c)}
 .dh-k{display:inline-block;min-width:58px;color:#6B7280}
 .dh-lg .row{display:flex;gap:6px;align-items:center;margin:2px 0}.dh-lg svg{flex:none}
 .dh-lg ul{list-style:none;margin:3px 0 0;padding:0}.dh-lg li{margin:1px 0;display:flex;gap:5px;align-items:baseline;flex-wrap:wrap}
 .dh-lg li button{border:0;background:none;padding:0;font:inherit;color:#1E3A8A;cursor:pointer;text-align:left}.dh-lg li button:hover{text-decoration:underline}
 .dh-lg li i{font-style:normal;width:9px;height:9px;border-radius:50%;background:var(--c);opacity:.7;flex:none;align-self:center}
 .dh-lg li .no{color:#9CA3AF}
 .dh-lg .t{font-weight:700;font-size:12px;border:0;background:none;padding:0;cursor:pointer;color:inherit;font-family:inherit;text-align:left;width:100%}
 .dh-lg.fold .dh-b{display:none}`;
 function addCss() { if (document.getElementById("dhCss")) return; const s = document.createElement("style"); s.id = "dhCss"; s.textContent = CSS; document.head.appendChild(s); }
 function svgLine(st, c) { const y = STY[st]; return `<svg width="34" height="10" aria-hidden="true"><line x1="1" y1="5" x2="33" y2="5" stroke="${c || "#374151"}" stroke-width="${y.lw}" stroke-dasharray="${y.la}" opacity="${Math.min(1, y.op + .25)}"/></svg>`; }

 window.DevHojae = function (map, cfg) {
  const NV = naver.maps, S = { on: false, D: null, p: null, polys: [], marks: [], labels: [], seq: 0 };
  addCss();
  function load() {
   if (window.DEV_HOJAE) return Promise.resolve(S.D = window.DEV_HOJAE);
   if (!S.p) S.p = new Promise(res => { const t = document.createElement("script"); t.src = cfg.base + "개발호재.js" + (cfg.v ? "?v=" + cfg.v : ""); t.onload = () => res(S.D = window.DEV_HOJAE || null); t.onerror = () => res(null); document.head.appendChild(t); });
   return S.p;
  }
  const LL = (y, x) => new NV.LatLng(y, x);
  function buildPolys() {
   if (S.polys.length) return;
   S.D.노선.forEach(L => { const y = STY[L.st]; L.p.forEach(seg => { const pl = new NV.Polyline({ path: seg.map(q => LL(q[0], q[1])), strokeColor: L.c, strokeOpacity: y.op, strokeWeight: y.w, strokeStyle: y.dash, strokeLineCap: "butt", clickable: false, zIndex: 4 }); pl.__L = L; S.polys.push(pl); }); });
  }
  function clearMarks() { S.marks.forEach(m => m.setMap(null)); S.labels.forEach(m => m.setMap(null)); S.marks = []; S.labels = []; }
  // 선을 따라 노선 이름: 화면 좌표로 선을 걸어 step마다 한 자리, 그 자리 앞뒤(글자 길이 반)로 기울기를 잼. 너무 굽은 곳·다른 이름과 겹치는 곳은 건너뜀
  function placeLabels(zm) {
   const pr = map.getProjection(), bb = map.getBounds(), size = map.getSize(), fs = zm <= 10 ? 10.5 : zm <= 12 ? 11.5 : zm <= 14 ? 12.5 : 13.5, step = Math.max(320, Math.min(size.width, size.height) * .7);
   const placed = [], out = [], pad = .02, b = { s: bb.getMin().y - pad, w: bb.getMin().x - pad, n: bb.getMax().y + pad, e: bb.getMax().x + pad };
   const hit = r => placed.some(q => !(r.x2 < q.x1 || r.x1 > q.x2 || r.y2 < q.y1 || r.y1 > q.y2));
   const vis = new NV.LatLngBounds(bb.getMin(), bb.getMax());
   const lines = S.D.노선.slice().sort((a, c) => ORDER.indexOf(a.st) - ORDER.indexOf(c.st));
   for (const L of lines) {
    const tw = (L.짧은.length * fs * .92) + 8, th = fs + 6; let n = 0;
    for (const seg of L.p) {
     if (n >= 6) break;
     const P = []; let inb = false;
     for (const q of seg) { if (q[0] >= b.s && q[0] <= b.n && q[1] >= b.w && q[1] <= b.e) inb = true; P.push(pr.fromCoordToOffset(LL(q[0], q[1]))); }
     if (!inb || P.length < 2) continue;
     const cum = [ 0 ]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
     const total = cum[cum.length - 1]; if (total < tw * 1.2) continue;
     const at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * t, y: P[i - 1].y + (P[i].y - P[i - 1].y) * t }; };
     for (let d = Math.min(step * .5, total / 2); d <= total - tw / 2; d += step) {
      if (d < tw / 2) continue;
      const m = at(d), a = at(d - tw / 2), c = at(d + tw / 2), chord = Math.hypot(c.x - a.x, c.y - a.y);
      if (chord < tw * .85) continue;   // 많이 굽은 곳
      const pos = pr.fromOffsetToCoord(new NV.Point(m.x, m.y)); if (!vis.hasLatLng(pos)) continue;
      let ang = Math.atan2(c.y - a.y, c.x - a.x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const rad = Math.abs(ang) * Math.PI / 180, hw = (tw * Math.cos(rad) + th * Math.sin(rad)) / 2 + 3, hh = (tw * Math.sin(rad) + th * Math.cos(rad)) / 2 + 3;
      const r = { x1: m.x - hw, x2: m.x + hw, y1: m.y - hh, y2: m.y + hh }; if (hit(r)) continue;
      placed.push(r); n++;
      out.push(new NV.Marker({ position: pos, clickable: false, zIndex: 6, icon: { content: `<div class="dh-lb" style="--c:${L.c};font-size:${fs}px;transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)">${esc(L.짧은)}</div>`, anchor: new NV.Point(0, 0) } }));
      if (n >= 6) break;
     }
    }
   }
   return out;
  }
  async function draw() {
   const seq = ++S.seq; if (!S.on) { clearMarks(); return; }
   const D = await load(); if (!D || seq !== S.seq || !S.on) return;
   buildPolys(); S.polys.forEach(p => { if (!p.getMap()) p.setMap(map); });
   const zm = map.getZoom(), bb = map.getBounds(), b = { s: bb.getMin().y, w: bb.getMin().x, n: bb.getMax().y, e: bb.getMax().x };
   clearMarks();
   S.labels = placeLabels(zm); S.labels.forEach(m => m.setMap(map));
   if (zm >= 12) {
    const byId = new Map(D.노선.map(L => [ L.id, L ]));
    for (const st of D.역) {
     if (st[0] < b.s || st[0] > b.n || st[1] < b.w || st[1] > b.e) continue;
     const L0 = byId.get(st[3][0]), c = L0 ? L0.c : "#6B7280";
     const m = new NV.Marker({ position: LL(st[0], st[1]), zIndex: 30, title: st[2] + "역(예정)", icon: { content: `<div class="dh-st" style="--c:${c}"></div>`, anchor: new NV.Point(0, 0) } });
     NV.Event.addListener(m, "click", () => { if (cfg.onOverlay) cfg.onOverlay(); stCard(st); }); m.setMap(map); S.marks.push(m);
     if (zm >= 14) { const t = new NV.Marker({ position: LL(st[0], st[1]), clickable: false, zIndex: 29, icon: { content: `<div class="dh-sn">${esc(st[2])}</div>`, anchor: new NV.Point(0, 0) } }); t.setMap(map); S.marks.push(t); }
    }
   }
  }
  function chip(st) { return `<span class="dh-chip" style="--c:${st === "공사 중" ? "#C2410C" : st === "계획 확정" ? "#1D4ED8" : "#6B7280"}">${esc(st)}</span>`; }
  function open(html) { const c = cfg.card; c.innerHTML = '<button type="button" class="scx" aria-label="닫기">✕</button>' + html; c.hidden = false; c.classList.add("on"); c.querySelector(".scx").onclick = close; }
  function close() { const c = cfg.card; if (!c) return; c.classList.remove("on"); c.innerHTML = ""; }
  function lineHtml(L) {
   const C = S.D.설정, row = (k, v) => v ? `<div class="scs"><span class="dh-k">${k}</span>${v}</div>` : "";
   return `<div class="h97b">${esc(L.n)}${chip(L.st)}</div>` +
    row("단계", esc(L.단계글 || L.st)) + row("개통 예정", esc(L.개통 || "미확인")) + row("구간", esc(L.구간)) +
    row("근거", esc(L.근거 || L.근거종류) + (L.근거종류 ? ` <small>(${esc(L.근거종류)})</small>` : "") + (L.주소 ? ` <a href="${esc(L.주소)}" target="_blank" rel="noopener">원문 보기</a>` : "")) +
    row("기준일", esc(L.기준일)) +
    `<div class="scn">${L.p ? esc(L.모양 === "대략" ? "대략 위치 — " + C.모양_대략 : "선 모양: " + C.모양_OSM) : "지도에 그릴 위치 자료가 아직 없어 선을 긋지 않았어요."}<br>단계·개통은 기사·발표 조사라 참고용이에요.</div>`;
  }
  function lineCard(L) { open(lineHtml(L)); }
  function stCard(st) {
   const Ls = st[3].map(id => S.D.노선.find(L => L.id === id)).filter(Boolean);
   open(`<div class="h97b">${esc(st[2])}역 <small style="font-weight:600;color:#6B7280">(예정)</small></div>` + Ls.map(L => `<div class="scs"><span class="dh-k">노선</span>${esc(L.n)}${chip(L.st)}</div><div class="scs"><span class="dh-k">개통 예정</span>${esc(L.개통 || "미확인")}</div>`).join("") +
    `<div class="scn">역 위치: OpenStreetMap 공사·계획 역 정보(2026-11-10 받음) · 이름·위치는 바뀔 수 있어요.</div>`);
  }
  function click(coord) {
   if (!S.on || !S.D || !coord) return false;
   const pr = map.getProjection(), p0 = pr.fromCoordToOffset(coord), lim = 12; let best = null;
   for (const L of S.D.노선) for (const sq of L.p) for (let i = 1; i < sq.length; i++) {
    const A = sq[i - 1], B = sq[i];
    const a = pr.fromCoordToOffset(LL(A[0], A[1])), c = pr.fromCoordToOffset(LL(B[0], B[1])), dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy;
    if (Math.min(a.x, c.x) - lim > p0.x || Math.max(a.x, c.x) + lim < p0.x || Math.min(a.y, c.y) - lim > p0.y || Math.max(a.y, c.y) + lim < p0.y) continue;
    const t = L2 ? Math.max(0, Math.min(1, ((p0.x - a.x) * dx + (p0.y - a.y) * dy) / L2)) : 0, d = Math.hypot(a.x + t * dx - p0.x, a.y + t * dy - p0.y);
    if (d < lim && (!best || d < best[0])) best = [ d, L ];
   }
   if (best) { lineCard(best[1]); return true; }
   return false;
  }
  function fitLine(L) {
   let s = 90, n = -90, w = 999, e = -999; L.p.forEach(sq => sq.forEach(q => { s = Math.min(s, q[0]); n = Math.max(n, q[0]); w = Math.min(w, q[1]); e = Math.max(e, q[1]); }));
   map.fitBounds(new NV.LatLngBounds(LL(s, w), LL(n, e)), { top: 60, right: 90, bottom: 60, left: 60 });
  }
  function openTxt(t) {   // 범례 한 줄용 개통 예정: '미확인·없음'은 비움, '당초 A -> B'는 B만, 앞쪽 연도 덩어리('2031 목표'·'2027-11'·'2032년 상반기')만
   t = String(t || ""); if (/^(미확인|없음|해당없음|미정)/.test(t)) return "";
   const ar = t.split(/->|→/); if (ar.length > 1) t = ar[ar.length - 1].slice(0, 16);   // 화살표 뒤 앞부분에 연도가 없으면 비움
   const m = t.match(/20\d\d(?:[-.]\d{1,2})?(?:~20\d\d)?년?(?:\s*(?:상반기|하반기|말|초))?(?:\s*(?:목표|예정|준공|개통))?/);
   return m ? m[0].trim() : "";
  }
  function legend() {
   const el = cfg.legend; if (!el) return; const D = S.D, C = D.설정;
   const rows = C.단계.map(([st, how, mean]) => `<div class="row">${svgLine(st)}<div><b>${esc(st)}</b> <small>${esc(how)}</small><br><small>${esc(mean)}</small></div></div>`).join("");
   const all = D.노선.map(L => ({ L, has: true })).concat(D.목록만.map(L => ({ L, has: false })));
   const grp = ORDER.map(st => { const xs = all.filter(o => o.L.st === st); if (!xs.length) return "";
    return `<div style="margin-top:6px"><b>${esc(st)}</b> <small>${xs.filter(o => o.has).length}개 선 · ${xs.filter(o => !o.has).length}개 목록만</small><ul>${xs.map((o, i) => `<li>${o.has ? `<i style="--c:${o.L.c}"></i><button type="button" data-id="${o.L.id}">${esc(o.L.짧은)}</button>` : `<i style="--c:#D1D5DB"></i><button type="button" data-only="${esc(st)}|${i}" class="no">${esc(o.L.짧은)}</button>`}${openTxt(o.L.개통) ? ` <small>${esc(openTxt(o.L.개통))}</small>` : ""}</li>`).join("")}</ul></div>`; }).join("");
   el.innerHTML = `<button type="button" class="t" aria-expanded="true">개발 호재 (참고용) <span>▾</span></button><div class="dh-b">${rows}<div style="margin-top:4px"><small>회색 이름은 위치 자료가 없어 지도에 선을 긋지 않은 노선이에요.</small></div>${grp}<div style="margin-top:6px"><small>${esc(C.출처)}</small></div></div>`;
   el.classList.add("dh-lg"); el.hidden = false;
   const tb = el.querySelector(".t"), setF = f => { el.classList.toggle("fold", f); tb.setAttribute("aria-expanded", String(!f)); tb.querySelector("span").textContent = f ? "▸" : "▾"; };
   setF(!!(cfg.phone && cfg.phone())); tb.onclick = () => setF(!el.classList.contains("fold"));
   el.querySelectorAll("li button").forEach(b => b.onclick = () => {
    if (b.dataset.id) { const L = D.노선.find(x => x.id === b.dataset.id); fitLine(L); lineCard(L); if (cfg.phone && cfg.phone()) setF(true); }
    else { const [st, i] = b.dataset.only.split("|"); const o = all.filter(q => q.L.st === st)[+i]; open(lineHtml(o.L)); }
   });
  }
  function toggle(on) {
   S.on = !!on; if (cfg.onState) cfg.onState(S.on);
   if (!S.on) { S.seq++; clearMarks(); S.polys.forEach(p => p.setMap(null)); close(); if (cfg.legend) cfg.legend.hidden = true; return Promise.resolve(); }
   return load().then(D => { if (D && S.on) { legend(); return draw(); } });
  }
  return { toggle, draw, click, close, load, get on() { return S.on; }, get data() { return S.D; } };
 };
})();
