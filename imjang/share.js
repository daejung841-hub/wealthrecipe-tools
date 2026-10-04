/*
 * 결론 공유 — 보낼 글·이미지 카드 내용을 만드는 순수 함수 모음 (화면·브라우저 기능과 무관, node 에서 테스트)
 *
 * ctx = { zone, items, meta, config, stages }
 *   zone   구역 기록 {name, info, ans, n, concl, note, cmp, cmpRows, cmpNote}
 *   items  items.json 의 items,  meta  items.json 전체(order, steps, comparison),  config, stages(단계 이름 목록)
 *
 * summaryText(ctx)  요약 글        fullText(ctx)  전체 내용 글(요약 + 답한 항목 + 판정 결과)
 * splitText(text, max) 긴 글 나누기   numberChunks(chunks) "(1/3)" 번호 붙이기
 * cardModel(ctx) / layoutCard(model, measure) 이미지 카드 내용과 배치(그리기는 화면 쪽 canvas)
 */
(function (root) {
  'use strict';
  const R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.ImjangRules;

  // 목록표 화면과 같이 작업 메모성 괄호("지도 라벨 확인, 정확 날짜 미상" 등)는 보여 주지 않는다
  const cleanStage = (s) => String(s == null ? '' : s).replace(/\s*\([^)]*(지도|라벨|사이트|정확|날짜|확인|해당)[^)]*\)/g, '').trim();
  const shortName = (n) => String(n || '').replace(/ \([^)]*\)/, '');   // 첫 괄호("(구 동)")만 뗀다 — 뒤의 "(복원)"은 남긴다
  const hasText = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const noQ = (q) => String(q).replace(/\?$/, '');

  // 구역의 현재 단계 글자: 앱 단계에 대응되면 그 이름, 아니면 목록표 원문(메모 괄호 제거), 없으면 ''
  function stageText(info, stages) {
    if (!info) return '';
    const rs = R.resolveStage(info, stages);                 // 기록에 저장된 단계 이름 기준으로 지금 단계 목록에서 찾는다
    if (rs.idx !== null) return rs.name;
    return cleanStage(info.stage);
  }

  function prep(ctx) {
    const { zone, items, config } = ctx, tokens = R.buildTokens(config), T = (s) => R.interp(s, tokens);
    const vs = R.visibleQuestions(items, zone.ans, config);
    const flags = R.zoneFlags(items, zone, config);
    return { zone, items, meta: ctx.meta, config, stages: ctx.stages, T, vs, flags, red: flags.filter((x) => x.f.lv === 2), yel: flags.filter((x) => x.f.lv === 1),
      open: R.openItems(items, zone, config), prog: R.progress(items, zone, config), conc: R.conclusion(zone.n) };
  }

  // 비교단지 입지: 우위/비슷/열위로 묶는다 (cmpRows 는 평가 항목 이름 → 평가)
  function cmpGroups(p) {
    const C = p.meta.comparison, r = p.zone.cmpRows || {}, g = { up: [], eq: [], dn: [] };
    C.rows.forEach((n) => { const v = r[n]; if (!v) return; (C.goodGrades.includes(v) ? g.up : C.equalGrades.includes(v) ? g.eq : g.dn).push(n); });
    return g;
  }

  // ───────── 요약 글 ─────────
  function summaryText(ctx) {
    const p = prep(ctx), z = p.zone, i = z.info, c = p.conc, g = cmpGroups(p);
    const stage = stageText(i, p.stages), tag = i ? ' (' + [i.sheet, stage].filter(hasText).join(' · ') + ')' : '';
    let t = '📍 임장 결론 | ' + shortName(z.name) + (i ? tag : '') + '\n\n' + c.line1 + '\n' + c.line2;
    if (c.margin !== null) t += c.margin >= 0 ? '\n안전마진 ' + R.fmt(c.margin) + '억' : '\n안전마진 ' + R.fmt(c.margin) + '억 ⚠ 사오는 가격이 아파트 가치보다 비싸요';
    t += '\n\n판단: ' + (z.concl || '미정') + '\n\n🚩 위험 신호 ' + p.red.length + '건' + p.red.map((x) => '\n- ' + noQ(p.T(x.it.q))).join('');
    if (p.yel.length) t += '\n⚠ 주의 ' + p.yel.length + '건' + p.yel.map((x) => '\n- ' + noQ(p.T(x.it.q))).join('');
    t += '\n\n확인 ' + p.prog.done + '/' + p.prog.total + '개 · 못 확인 ' + p.open.length + '건';
    if (g.up.length || g.eq.length || g.dn.length) t += '\n\n비교단지' + (z.cmp ? '(' + z.cmp + ')' : '') + ' 대비 입지\n👍 ' + (g.up.join(', ') || '-') + '\n👎 ' + (g.dn.join(', ') || '-');
    if (hasText(z.note)) t += '\n\n메모: ' + z.note;
    return t;
  }

  // ───────── 전체 내용 글 ─────────
  // 한 항목의 답을 "라벨: 값 / …" 조각들로. 숫자 금액(만원)은 읽기 쉽게. 사진은 "📷 사진 있음" 으로만 표시한다.
  function ansLines(p, it) {
    const a = p.zone.ans[it.id] || {}, parts = [];
    (it.fields || []).forEach((f) => {
      let v = a[f.k];
      if (f.t === 'multi') v = [...(v || []).map(p.T), ...(a[f.k + 'X'] || [])].join(', ');
      else if (f.t === 'chips' && typeof v === 'string') v = p.T(v);   // 선택지 글자의 {토큰}만 풀고, 사용자가 쓴 글은 그대로 둔다
      if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) return;
      const num = parseFloat(v);
      parts.push((f.l ? f.l + ': ' : '') + (f.t === 'num' && f.u === '만원' && !Number.isNaN(num) ? R.fmtMan(num) : v + (f.t === 'num' ? (f.u || '') : '')));
    });
    if ((a.ph || []).length) parts.push('📷 사진 있음');
    return parts;
  }
  function fullText(ctx) {
    const p = prep(ctx), z = p.zone, M = p.meta;
    let t = summaryText(ctx) + '\n\n━━━━━━━━\n📋 상세 기록';
    M.order.forEach((st) => {
      if (st === 'info' || st === 'wrap') return;
      const its = p.items.filter((it) => it.step === st && it.type !== 'tip' && !it.custom && R.isVisible(it, z.ans, p.config) && R.isDone(it, z));
      if (!its.length) return;
      t += '\n\n[' + M.steps[st] + ']';
      its.forEach((it) => {
        const f = R.evalFlag(it, z.ans, p.config), mk = f && f.lv === 2 ? '🚩 ' : f && f.lv === 1 ? '⚠ ' : '';
        t += '\n' + mk + noQ(p.T(it.q)) + '\n  → ' + ansLines(p, it).join(' / ') + (f && f.lv === 0 ? '\n  ✔ ' + f.msg : '');
      });
    });
    const r = z.cmpRows || {};
    if (Object.keys(r).length) {
      t += '\n\n[비교단지 입지' + (z.cmp ? ' · ' + z.cmp : '') + ']';
      M.comparison.rows.forEach((n) => { if (r[n]) t += '\n' + n + ': ' + r[n]; });
      if (hasText(z.cmpNote)) t += '\n종합: ' + z.cmpNote;
    }
    return t;
  }

  // ───────── 긴 글 나누기 ─────────
  // 단락(빈 줄) → 줄 → 글자 순으로 가능한 한 자연스러운 곳에서 자른다. 번호 "(10/10)\n" 몫을 남겨 둔다.
  const NUMBER_RESERVE = 10;
  function splitText(text, max) {
    if (text.length <= max) return [text];
    const limit = Math.max(20, max - NUMBER_RESERVE), pieces = [];
    text.split('\n\n').forEach((block) => {
      if (block.length <= limit) { pieces.push({ s: block, sep: '\n\n' }); return; }
      block.split('\n').forEach((line) => {
        if (line.length <= limit) { pieces.push({ s: line, sep: '\n' }); return; }
        for (let k = 0; k < line.length; k += limit) pieces.push({ s: line.slice(k, k + limit), sep: '\n' });
      });
    });
    const chunks = []; let cur = '';
    pieces.forEach((pc) => {
      const cand = cur ? cur + pc.sep + pc.s : pc.s;
      if (cand.length <= limit) cur = cand; else { if (cur) chunks.push(cur); cur = pc.s; }
    });
    if (cur) chunks.push(cur);
    return chunks;
  }
  const numberChunks = (chunks) => (chunks.length <= 1 ? chunks.slice() : chunks.map((c, i) => '(' + (i + 1) + '/' + chunks.length + ')\n' + c));

  // ───────── 이미지 카드 ─────────
  // 내용은 목업 카드와 같다: 구역·유형, 4개 숫자 문장, 안전마진, 판단, 위험 신호(여러 개면 앞쪽만 + "외 N건"), 확인 x/y
  function cardModel(ctx, opts) {
    const p = prep(ctx), z = p.zone, i = z.info, c = p.conc, maxRisks = (opts && opts.maxRisks) || 5;
    const stage = stageText(i, p.stages);
    return {
      title: shortName(z.name), sub: i ? [i.sheet, stage].filter(hasText).join(' · ') : '',
      line1: c.line1, line2: c.line2,
      margin: c.margin === null ? null : { ok: c.margin >= 0, text: c.margin >= 0 ? '안전마진 ' + R.fmt(c.margin) + '억' : '⚠ 사오는 가격이 아파트 가치보다 비싸요' },
      concl: z.concl || '미정',
      riskCount: p.red.length, risks: p.red.slice(0, maxRisks).map((x) => noQ(p.T(x.it.q))), riskMore: Math.max(0, p.red.length - maxRisks),
      cautionCount: p.yel.length,
      checked: p.prog.done + '/' + p.prog.total,
    };
  }
  // 글을 폭에 맞춰 줄바꿈(한글은 글자 단위). measure(text, font) → 폭(px)
  // 띄어쓰기에서 먼저 줄을 바꾸고, 한 단어가 폭보다 길 때만 글자 단위로 자른다
  function wrap(text, font, maxW, measure) {
    const lines = [];
    String(text).split('\n').forEach((para) => {
      let cur = '';
      para.split(' ').forEach((word) => {
        const cand = cur ? cur + ' ' + word : word;
        if (measure(cand, font) <= maxW) { cur = cand; return; }
        if (cur) { lines.push(cur); cur = ''; }
        if (measure(word, font) <= maxW) { cur = word; return; }
        // 한 단어가 폭보다 길다: 글자 단위로 자른다
        let piece = '';
        for (const ch of word) { if (piece && measure(piece + ch, font) > maxW) { lines.push(piece); piece = ch; } else piece += ch; }
        cur = piece;
      });
      lines.push(cur);
    });
    return lines;
  }
  // 그릴 것들을 위에서부터 쌓아 높이를 정한다. 반환 ops: {type:'text', text, x, y(기준선), font, color} | {type:'dot', x, y, r, color}
  function layoutCard(m, measure, o) {
    const W = (o && o.width) || 1080, pad = Math.round(W * 0.06), inner = W - pad * 2, ops = [];
    const FAM = (o && o.family) || 'sans-serif';
    const font = (px, bold) => (bold ? '700 ' : '400 ') + px + 'px ' + FAM;
    let y = pad;
    const para = (text, px, bold, color, gap, indent) => {
      const f = font(px, bold), lh = Math.round(px * 1.45), x0 = pad + (indent || 0);
      wrap(text, f, inner - (indent || 0), measure).forEach((ln) => { ops.push({ type: 'text', text: ln, x: x0, y: y + Math.round(px * 1.05), font: f, color }); y += lh; });
      y += gap || 0;
    };
    para(m.title + (m.sub ? ' · ' + m.sub : ''), 30, false, 'mute', 26);
    para(m.line1, 54, true, 'ink', 6); para(m.line2, 54, true, 'ink', 22);
    if (m.margin) para(m.margin.text, 40, true, m.margin.ok ? 'good' : 'bad', 22);
    para('판단: ' + m.concl, 36, true, 'ink', 26);
    para('위험 신호 ' + m.riskCount + '건', 34, true, m.riskCount ? 'bad' : 'mute', 8);
    m.risks.forEach((q) => { ops.push({ type: 'dot', x: pad + 10, y: y + 17, r: 6, color: 'bad' }); para(q, 32, false, 'ink', 6, 34); });
    if (m.riskMore) para('외 ' + m.riskMore + '건', 30, false, 'mute', 6, 34);
    if (m.cautionCount) para('주의 ' + m.cautionCount + '건', 30, false, 'mute', 6);
    y += 14; para('확인 ' + m.checked + '개', 30, false, 'mute', 0);
    return { width: W, height: y + pad, ops };
  }

  const api = { cleanStage, stageText, summaryText, fullText, ansLines: (ctx, it) => ansLines(prep(ctx), it), splitText, numberChunks, cardModel, layoutCard, wrap, NUMBER_RESERVE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
