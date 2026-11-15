/* 48차 덧붙임 2: 거리 재기 — 재개발 지도·계산기 지도 공용(같은 파일)
 *  계산기 라이브 calc_map.js 묶음 L98B(MS98 · msSet98b · msTake98b · msLen98b · msDraw98b · msNew98b · msDel98b · msNextCol98b, 2026-11-11 받은 판)를
 *  같은 동작·같은 모양(같은 클래스 이름·색·글자)으로 옮긴 것. 계산기 코드는 고치지 않음.
 *  쓰는 법: const ms = DistMeasure(map, { host: 지도를 감싼 요소(안내 띠를 붙일 곳), btn: [거리] 단추, onSet: on => {…}(켤 때 거리뷰 끄기 등) })
 *    ms.set(true/false) · ms.take(ev, 마커 자리) — 켜져 있으면 그 자리에 점을 찍고 true(구역·단지·학교 누르기 대신) · ms.on · ms.state
 *  동작: 지도를 찍을 때마다 점·선, 구간 길이, 마지막 점에 "① 580m · 도보 9분"(직선 거리 합, 도보 분당 67m 올림)
 *        [새 거리] 지금 선 고정·새 선(선마다 다른 색 12개), [마지막 점 지우기]·[전체 지우기], 아래 목록에서 선 하나씩 [지우기]
 *        켠 동안 두 번 눌러 확대를 끔. 끄면 숨기기만(다시 켜면 그대로)
 */
(function () {
 "use strict";
 const CSS = `
 .cm84-ms{position:absolute;z-index:1058;left:50%;bottom:28px;transform:translateX(-50%);width:max-content;max-width:calc(100% - 150px);background:#fff;border:2px solid #2B8A3E;border-radius:12px;padding:6px 10px;box-shadow:0 2px 10px rgba(0,0,0,.2);font-size:12px;color:#1f2937;text-align:center}
 .cm84-ms[hidden]{display:none}
 .cm84-ms .tx{font-weight:700;line-height:1.5}
 .cm84-ms .bt{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:5px}
 .cm84-ms .bt button{border:1px solid #2B8A3E;background:#fff;color:#2B8A3E;font:inherit;font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px;cursor:pointer;min-height:28px}
 .cm84-ms .bt button:disabled{opacity:.4;cursor:default}
 .cm84-ms .ls{list-style:none;margin:6px 0 0;padding:4px 0 0;border-top:1px solid #e9ecef;max-height:132px;overflow:auto;text-align:left}
 .cm84-ms .ls[hidden]{display:none}
 .cm84-ms .ls li{display:flex;align-items:center;gap:5px;padding:2px 0;font-weight:700;white-space:nowrap}
 .cm84-ms .ls li i{flex:0 0 auto;width:14px;height:4px;border-radius:2px}
 .cm84-ms .ls li em{font-style:normal;font-weight:600;font-size:11px;color:#868e96}
 .cm84-ms .ls li button{margin-left:auto;border:1px solid #ced4da;background:#fff;color:#495057;font:inherit;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;cursor:pointer;min-height:24px}
 .ms98d{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #2B8A3E;box-sizing:border-box;pointer-events:none}
 .ms98l{transform:translate(-50%,-50%);background:rgba(255,255,255,.92);border:1px solid #2B8A3E;color:#2B8A3E;font-size:11px;font-weight:800;border-radius:6px;padding:0 4px;white-space:nowrap;pointer-events:none}
 .ms98t{transform:translate(-50%,calc(-100% - 10px));background:#2B8A3E;color:#fff;font-size:12.5px;font-weight:800;border-radius:8px;padding:3px 8px;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,.25);pointer-events:none}
 .ms98b-on{cursor:crosshair}
 .ms98b-btn[aria-pressed="true"]{background:#2B8A3E!important;border-color:#2B8A3E!important;color:#fff!important}
 @media (max-width:767px){ .cm84-ms{left:64px;right:62px;bottom:14px;transform:none;width:auto;max-width:none;padding:5px 8px} .cm84-ms .bt button{min-height:34px;padding:5px 8px} .cm84-ms .ls{max-height:96px} .cm84-ms .ls li button{min-height:30px} }`;
 function addCss() { if (document.getElementById("ms98Css")) return; const s = document.createElement("style"); s.id = "ms98Css"; s.textContent = CSS; document.head.appendChild(s); }
 const MS_COL = [ "#2B8A3E", "#1C7ED6", "#E8590C", "#AE3EC9", "#C2255C", "#0B7285", "#5C940D", "#364FC7", "#B7791F", "#862E9C", "#D6336C", "#495057" ];
 const MS_TIP = "길을 따라 여러 번 찍을수록 실제 도보 거리에 가까워요(직선 거리 기준)";
 function msLen(a, b) {   // 두 점 사이 직선 거리(m, 하버사인) — 계산기 msLen98b와 같음
  const R = 6371008.8, r = Math.PI / 180, la1 = a.lat() * r, la2 = b.lat() * r, dla = la2 - la1, dln = (b.lng() - a.lng()) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dln / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
 }
 const msFmt = m => m >= 1000 ? (Math.round(m / 100) / 10).toFixed(1) + "km" : Math.round(m) + "m";
 const msNo = i => i < 20 ? String.fromCharCode(0x2460 + i) : "(" + (i + 1) + ")";
 const msTot = P => { let t = 0; for (let i = 1; i < P.length; i++) t += msLen(P[i - 1], P[i]); return t; };

 window.DistMeasure = function (map, cfg) {
  const NV = naver.maps, MS = { on: false, pts: [], lines: [], polys: [], marks: [], walkM: 67, last: 0, dz: null, curCol: null };
  addCss();
  const host = cfg.host || (map.getElement && map.getElement().parentNode), mapEl = map.getElement ? map.getElement() : null;
  const walk = m => Math.max(1, Math.ceil(m / MS.walkM));
  host.insertAdjacentHTML("beforeend", '<div class="cm84-ms" id="cm84Ms98" hidden><div class="tx"></div><div class="bt"><button type="button" data-ms="undo">마지막 점 지우기</button><button type="button" data-ms="new">새 거리</button><button type="button" data-ms="clear">전체 지우기</button></div><ul class="ls" hidden></ul></div>');
  const bar = host.querySelector("#cm84Ms98");
  bar.addEventListener("click", e => { e.stopPropagation(); const d = e.target.closest("[data-msdel]"); if (d) { del(+d.dataset.msdel); return; }
   const b = e.target.closest("[data-ms]"); if (!b) return; const k = b.dataset.ms;
   if (k === "new") return newLine(); if (k === "undo") { MS.pts.pop(); if (!MS.pts.length) MS.curCol = null; } else { MS.pts = []; MS.lines = []; MS.curCol = null; } draw(); });
  if (cfg.btn) { cfg.btn.classList.add("ms98b-btn"); cfg.btn.addEventListener("click", () => set(!MS.on)); }
  function set(on) {
   MS.on = !!on; if (cfg.btn) { cfg.btn.setAttribute("aria-pressed", String(MS.on)); cfg.btn.title = "거리 재기" + (MS.on ? " — 켜짐(다시 누르면 꺼짐)" : ""); }
   if (MS.on && cfg.onSet) cfg.onSet(true);
   try { if (MS.on) { MS.dz = { a: map.getOptions("disableDoubleClickZoom"), b: map.getOptions("disableDoubleTapZoom") }; map.setOptions({ disableDoubleClickZoom: true, disableDoubleTapZoom: true }); }
    else if (MS.dz) { map.setOptions({ disableDoubleClickZoom: !!MS.dz.a, disableDoubleTapZoom: !!MS.dz.b }); MS.dz = null; } } catch (e) {}
   if (mapEl) mapEl.classList.toggle("ms98b-on", MS.on); draw();
   if (!MS.on && cfg.onSet) cfg.onSet(false);
  }
  const all = () => MS.lines.map(l => ({ pts: l.pts, col: l.col, cur: false })).concat(MS.pts.length ? [ { pts: MS.pts, col: MS.curCol || nextCol(), cur: true } ] : []);
  function nextCol() { const used = MS.lines.map(l => l.col); return MS_COL.find(c => !used.includes(c)) || MS_COL[MS.lines.length % MS_COL.length]; }
  function newLine() { if (MS.pts.length > 1) MS.lines.push({ pts: MS.pts, col: MS.curCol || nextCol() }); MS.pts = []; MS.curCol = null; draw(); }
  function del(i) { const n = MS.lines.length; if (i < n) MS.lines.splice(i, 1); else { MS.pts = []; MS.curCol = null; } draw(); }
  function take(ev, fallback) {   // 켜져 있으면 그 자리에 점을 찍고 true
   if (!MS.on) return false;
   const ll = ev && ev.coord ? ev.coord : (fallback || null), now = Date.now();
   if (ll && now - MS.last > 120) { MS.last = now; if (!MS.pts.length) MS.curCol = nextCol(); MS.pts.push(ll); draw(); }
   return true;
  }
  function draw() {
   MS.marks.forEach(m => m.setMap(null)); MS.marks = []; MS.polys.forEach(p => p.setMap(null)); MS.polys = [];
   const P = MS.pts, A = all();
   const mk = (pos, html, z, ax, ay) => { const m = new NV.Marker({ map, position: pos, clickable: false, zIndex: z, icon: { content: html, anchor: new NV.Point(ax, ay) } }); MS.marks.push(m); };
   const lab = (L, i) => msNo(i) + " " + msFmt(msTot(L.pts)) + " · 도보 " + walk(msTot(L.pts)) + "분";
   if (MS.on) A.forEach((L, k) => {
    const Q = L.pts, c = L.col;
    if (Q.length > 1) { const pl = new NV.Polyline({ map, path: Q, strokeColor: c, strokeWeight: 4, strokeOpacity: .9, clickable: false, zIndex: 300 + k }); MS.polys.push(pl); }
    Q.forEach((p, i) => { mk(p, '<div class="ms98d" style="border-color:' + c + '"></div>', 410, 6, 6);
     if (i) mk(new NV.LatLng((Q[i - 1].lat() + p.lat()) / 2, (Q[i - 1].lng() + p.lng()) / 2), '<div class="ms98l" style="border-color:' + c + ";color:" + c + '">' + msFmt(msLen(Q[i - 1], p)) + "</div>", 405, 0, 0); });
    if (Q.length > 1) mk(Q[Q.length - 1], '<div class="ms98t" style="background:' + c + '">' + lab(L, k) + "</div>", 420 + k, 0, 0);
   });
   const tag = () => MS.polys.forEach(p => { const el = p.getElement && p.getElement(); if (el) el.classList.add("msk"); }); tag(); setTimeout(tag, 60);
   const done = A.filter(L => L.pts.length > 1);
   bar.hidden = !MS.on; bar.querySelector(".tx").textContent = P.length ? MS_TIP : (MS.lines.length ? "새 출발점을 찍으세요 · " : "지도에서 출발점을 찍으세요 · ") + MS_TIP;
   bar.querySelector('[data-ms="undo"]').disabled = !P.length; bar.querySelector('[data-ms="new"]').disabled = P.length < 2; bar.querySelector('[data-ms="clear"]').disabled = !P.length && !MS.lines.length;
   const ls = bar.querySelector(".ls");
   ls.innerHTML = A.map((L, k) => L.pts.length < 2 ? "" : '<li><i style="background:' + L.col + '"></i><b>' + msNo(k) + "</b> " + msFmt(msTot(L.pts)) + " · 도보 " + walk(msTot(L.pts)) + "분" + (L.cur ? " <em>그리는 중</em>" : "") + '<button type="button" data-msdel="' + k + '">지우기</button></li>').join("");
   ls.hidden = !done.length;
   MS.state = { on: MS.on, n: P.length, total: Math.round(msTot(P)), walkM: MS.walkM,
    lines: A.map((L, k) => ({ no: msNo(k), col: L.col, n: L.pts.length, total: Math.round(msTot(L.pts)), walk: L.pts.length > 1 ? walk(msTot(L.pts)) : 0, cur: L.cur, txt: L.pts.length > 1 ? lab(L, k) : "" })),
    shown: { polys: MS.polys.length, marks: MS.marks.length } };
  }
  draw();
  return { set, take, draw, get on() { return MS.on; }, get state() { return MS.state; } };
 };
})();
