/*
 * 임장 체크리스트 — 규칙 엔진 (화면과 무관한 순수 로직. 브라우저와 node 양쪽에서 쓴다)
 *
 * 항목 문구·선택지·조건·판정 규칙은 data/items.json, 기준 수치는 data/config.json에 있고
 * 이 파일에는 "규칙을 읽어 실행하는 코드"와 이름 붙은 계산 함수 2개만 있다.
 *
 * ── 조건(cond) 문법 ─────────────────────────────────────────────
 *   {eq:[ref, 값]}  {ne:[ref, 값]}  {in:[ref, [값…]]}  {includes:[ref, 값]}(복수 선택 답에 값이 있는지)
 *   {gte|gt|lte|lt:[ref, 숫자]}      숫자가 아닌 답은 항상 false
 *   {all:[cond…]}  {any:[cond…]}
 *   ref   = "항목id.필드키" (예: "p10.v"). 아직 답이 없으면 undefined.
 *   값/숫자 자리에 "$경로"를 쓰면 config.json의 값을 읽는다 (예: "$opposition.danger").
 *
 * ── 판정 규칙(flags) ────────────────────────────────────────────
 *   항목의 flags 배열을 위에서부터 보고 처음 맞는 것 하나가 결과다. 없으면 null.
 *   {when:cond, lv, msg, tag?}  lv 2=위험(빨강) 1=주의(노랑) 0=참고(초록)
 *   {fn:"이름", status:{상태:{lv,msg}}}  계산이 필요한 판정. 이름 붙은 함수(FUNCTIONS)가 상태와 변수를 돌려준다.
 *   msg 안의 {토큰}은 buildTokens(config) + 함수가 돌려준 변수로 바뀐다.
 */
(function (root) {
  'use strict';

  // ───────── 값 읽기 ─────────
  function cfgGet(config, path) {
    return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
  }
  const resolve = (x, config) => (typeof x === 'string' && x[0] === '$' ? cfgGet(config, x.slice(1)) : x);
  function refGet(answers, ref) {
    const i = String(ref).indexOf('.');
    const a = (answers || {})[ref.slice(0, i)];
    return a == null ? undefined : a[ref.slice(i + 1)];
  }
  const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };

  // ───────── 조건 ─────────
  function evalCond(c, answers, config) {
    if (c == null) return true;
    const ops = Object.keys(c);
    if (ops.length !== 1) throw new Error('조건은 연산자 하나만 가져야 해요: ' + JSON.stringify(c));
    const op = ops[0], a = c[op];
    switch (op) {
      case 'all': return a.every((x) => evalCond(x, answers, config));
      case 'any': return a.some((x) => evalCond(x, answers, config));
      case 'eq': return refGet(answers, a[0]) === resolve(a[1], config);
      case 'ne': return refGet(answers, a[0]) !== resolve(a[1], config);
      case 'in': return resolve(a[1], config).includes(refGet(answers, a[0]));
      case 'includes': { const v = refGet(answers, a[0]); return Array.isArray(v) && v.includes(resolve(a[1], config)); }
      case 'gte': case 'gt': case 'lte': case 'lt': {
        const n = num(refGet(answers, a[0])), m = num(resolve(a[1], config));
        if (n === null || m === null) return false;
        return op === 'gte' ? n >= m : op === 'gt' ? n > m : op === 'lte' ? n <= m : n < m;
      }
      default: throw new Error('알 수 없는 조건 연산자: ' + op);
    }
  }

  // ───────── 문구 토큰 ─────────
  const comma = (n) => Number(n).toLocaleString('en-US');
  function buildTokens(config) {
    const t = {};
    const [y, m] = String(config.asOf).split('-');
    t.asOfLabel = y + '년 ' + Number(m) + '월';
    (config.constructionCost.regions || []).forEach((r) => { t['cost.' + r.id + '.lo'] = r.range[0]; t['cost.' + r.id + '.hi'] = r.range[1]; });
    const pr = config.premium.appraisalRatioOfPublicPrice;
    t['premium.loPct'] = Math.round(pr[0] * 100); t['premium.hiPct'] = Math.round(pr[1] * 100);
    t['opp.danger'] = config.opposition.danger; t['opp.critical'] = config.opposition.critical;
    t['legal.consent'] = config.legal.unionConsentRatio;
    t['rental.insuredPct'] = config.rental.insuredRatioPct;
    t['retail.lo'] = comma(config.retail.activeHouseholdsRange[0]); t['retail.hi'] = comma(config.retail.activeHouseholdsRange[1]);
    return t;
  }
  // {토큰}을 바꾼다. 모르는 토큰은 그대로 두고(눈에 띄게), 테스트가 잡아낸다.
  function interp(text, vars) {
    return String(text).replace(/\{([^{}]+)\}/g, (all, k) => (vars && Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : all));
  }
  const unresolvedTokens = (text) => (String(text).match(/\{[^{}]+\}/g) || []);

  // ───────── 금액 표기 (만원 단위 → "1억 2,300만원") ─────────
  function fmtMan(x) {
    const sg = x < 0 ? '-' : ''; x = Math.abs(Math.round(x));
    const e = Math.floor(x / 10000), m = x % 10000, parts = [];
    if (e) parts.push(e + '억');
    if (m || !e) parts.push(m.toLocaleString('en-US') + '만원');
    return sg + parts.join(' ');
  }
  const fmt = (x) => String(Math.round(x * 10) / 10).replace(/\.0$/, '');

  // ───────── 이름 붙은 계산 함수 2개 ─────────
  // 각 함수는 null(판정 없음) 또는 {status, vars}를 돌려준다. 문구·단계는 items.json의 규칙이 정한다.
  const FUNCTIONS = {
    // 공사비(계약면적 기준 만원/평)가 지역별 적정 범위(config.constructionCost.regions)의 아래/안/위인지
    constructionCostRange(a, config) {
      const n = num(a.v);
      const region = (config.constructionCost.regions || []).find((r) => r.label === a.r);
      if (n === null || !region) return null;
      const [lo, hi] = region.range;
      return { status: n < lo ? 'low' : n > hi ? 'high' : 'ok', vars: { lo, hi, value: n, region: region.label } };
    },
    // 프리미엄: 추정 감정평가액이 있으면 그것 기준, 없으면 공동주택가격의 배율(config.premium)로 감정평가액을 가정
    premiumEstimate(a, config) {
      const p = num(a.pm), e = num(a.e), g = num(a.g);
      if (p === null) return null;
      if (e !== null && e > 0) return { status: 'appraisal', vars: { premium: fmtMan(p - e), ratio: Math.round((p / e) * 100) } };
      if (g !== null && g > 0) {
        const [rl, rh] = config.premium.appraisalRatioOfPublicPrice, lo = g * rl, hi = g * rh;
        return { status: 'publicPrice', vars: { loPct: Math.round(rl * 100), hiPct: Math.round(rh * 100), appraisalLo: fmtMan(lo), appraisalHi: fmtMan(hi), premiumLo: fmtMan(p - hi), premiumHi: fmtMan(p - lo) } };
      }
      return null;
    },
  };

  // ───────── 판정 / 노출 ─────────
  function evalFlag(item, answers, config) {
    if (!item.flags) return null;
    const tokens = buildTokens(config), a = (answers || {})[item.id] || {};
    for (const rule of item.flags) {
      if (rule.fn) {
        const fn = FUNCTIONS[rule.fn];
        if (!fn) throw new Error('알 수 없는 판정 함수: ' + rule.fn);
        const r = fn(a, config);
        const s = r && rule.status[r.status];
        if (s) return { lv: s.lv, msg: interp(s.msg, Object.assign({}, tokens, r.vars)) };
      } else if (evalCond(rule.when, answers, config)) {
        const out = { lv: rule.lv, msg: interp(rule.msg, tokens) };
        if (rule.tag) out.tag = rule.tag;
        return out;
      }
    }
    return null;
  }
  const isVisible = (item, answers, config) => evalCond(item.show, answers, config);
  // 화면에 보이는 "질문" 항목(질문 요령 카드는 진행률에서 뺀다)
  const visibleQuestions = (items, answers, config) => items.filter((it) => it.type !== 'tip' && isVisible(it, answers, config));
  const visibleInStep = (items, step, answers, config) => items.filter((it) => it.step === step && isVisible(it, answers, config));

  // zone = {ans, cmp, cmpRows}. 답이 하나라도 있으면 완료 (사진 표시·메모도 답으로 친다 — 목업과 동일)
  function isDone(item, zone) {
    if (item.custom === 'cmpPick') return !!zone.cmp;
    if (item.custom === 'cmpGrid') return Object.keys(zone.cmpRows || {}).length > 0;
    const a = (zone.ans || {})[item.id];
    if (!a) return false;
    return Object.values(a).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false && v !== undefined && v !== null));
  }
  function zoneFlags(items, zone, config) {
    return visibleQuestions(items, zone.ans, config)
      .map((it) => ({ it, f: evalFlag(it, zone.ans, config) }))
      .filter((x) => x.f && x.f.lv > 0);
  }
  function progress(items, zone, config) {
    const v = visibleQuestions(items, zone.ans, config);
    const done = v.filter((it) => isDone(it, zone)).length;
    return { done, total: v.length, pct: v.length ? Math.round((done / v.length) * 100) : 0 };
  }
  const openItems = (items, zone, config) => visibleQuestions(items, zone.ans, config).filter((it) => !isDone(it, zone) && !it.custom);

  // 정리 탭의 4개 숫자 → 문장·안전마진 (n = {y, v, p, i})
  function conclusion(n) {
    n = n || {};
    const has = (k) => n[k] !== undefined && n[k] !== null && n[k] !== '';
    const y = has('y') ? n.y : '○○○○', v = has('v') ? n.v : '○○', pr = has('p') ? n.p : '○○';
    const iv = has('i') ? (Number(n.i) === 0 ? '0원' : n.i + '만원') : '○○원';
    const margin = has('v') && has('p') && num(n.v) !== null && num(n.p) !== null ? num(n.v) - num(n.p) : null;
    return { line1: y + '년에 ' + v + '억짜리 아파트를 ' + pr + '억에 사온다.', line2: '필요한 투자금은 ' + iv + '이다.', margin };
  }

  // ───────── 데이터 점검 (테스트·개발용) ─────────
  // items.json 안의 모든 조건·참조·토큰이 실제로 존재하는지 확인하고 문제 목록을 돌려준다.
  function validate(data, config, stages) {
    const errs = [], items = data.items, byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const tokens = buildTokens(config);
    const walk = (c, where) => {
      if (c == null) return;
      const ops = Object.keys(c);
      if (ops.length !== 1) return errs.push(where + ': 연산자가 하나가 아님');
      const op = ops[0], a = c[op];
      if (op === 'all' || op === 'any') return a.forEach((x) => walk(x, where));
      if (!['eq', 'ne', 'in', 'includes', 'gte', 'gt', 'lte', 'lt'].includes(op)) return errs.push(where + ': 알 수 없는 연산자 ' + op);
      const [id, key] = String(a[0]).split('.');
      const it = byId[id];
      if (!it) return errs.push(where + ': 없는 항목 ' + a[0]);
      if (!(it.fields || []).some((f) => f.k === key)) errs.push(where + ': 없는 필드 ' + a[0]);
      if (typeof a[1] === 'string' && a[1][0] === '$' && cfgGet(config, a[1].slice(1)) === undefined) errs.push(where + ': config에 없는 값 ' + a[1]);
      // 선택지 비교 값이 실제 선택지에 있는지 (오타 방지)
      const f = (it.fields || []).find((x) => x.k === key);
      const opts = f && (f.from === 'stages' ? stages : f.o);
      if (opts && (op === 'eq' || op === 'ne' || op === 'includes') && typeof a[1] === 'string' && a[1][0] !== '$' && !opts.includes(a[1])) errs.push(where + ': 선택지에 없는 값 "' + a[1] + '" (' + a[0] + ')');
    };
    const checkText = (t, where, extra) => unresolvedTokens(interp(t, Object.assign({}, tokens, extra))).forEach((x) => errs.push(where + ': 풀리지 않는 토큰 ' + x));
    const ids = new Set();
    items.forEach((it) => {
      if (ids.has(it.id)) errs.push('항목 id 중복 ' + it.id); ids.add(it.id);
      if (!data.order.includes(it.step)) errs.push(it.id + ': 알 수 없는 단계 ' + it.step);
      walk(it.show, it.id + '.show');
      ['q', 'why', 'where', 'guide', 'script'].forEach((k) => it[k] && checkText(it[k], it.id + '.' + k));
      (it.lines || []).forEach((l, i) => checkText(l, it.id + '.lines[' + i + ']'));
      (it.fields || []).forEach((f) => {
        (f.o || []).forEach((o) => checkText(o, it.id + '.' + f.k + '.option'));
        (f.bad || []).forEach((b) => { if (!(f.o || []).includes(b)) errs.push(it.id + '.' + f.k + ': bad 값이 선택지에 없음 ' + b); });
      });
      (it.flags || []).forEach((r, i) => {
        const w = it.id + '.flags[' + i + ']';
        if (r.fn) {
          if (!FUNCTIONS[r.fn]) errs.push(w + ': 없는 함수 ' + r.fn);
          Object.entries(r.status).forEach(([s, v]) => checkText(v.msg, w + '.' + s, { lo: 0, hi: 0, value: 0, region: '', premium: '', ratio: 0, loPct: 0, hiPct: 0, appraisalLo: '', appraisalHi: '', premiumLo: '', premiumHi: '' }));
        } else { walk(r.when, w); checkText(r.msg, w); if (![0, 1, 2].includes(r.lv)) errs.push(w + ': lv는 0/1/2'); }
      });
    });
    // 공사비 지역 선택지 ↔ config 지역 라벨 일치
    const m6 = byId.m6 && byId.m6.fields.find((f) => f.k === 'r');
    if (m6) m6.o.forEach((o) => { if (!config.constructionCost.regions.some((r) => r.label === o)) errs.push('m6 지역 선택지가 config에 없음: ' + o); });
    return errs;
  }

  // ───────── 구역 기록의 단계: 번호와 함께 이름도 저장한다 ─────────
  // 단계 목록(stages.json)이 나중에 바뀌어도 이미 저장된 기록의 뜻이 어긋나지 않도록, 기록(info)에 그때의 단계 이름 목록(stageNames)을 같이 둔다.
  // STAGES_V1 은 이름 없이 번호만 저장되던 때(백업 version 1, 12단계)의 단계 목록이다 — 옛 기록의 이름을 채우는 데만 쓴다.
  const STAGES_V1 = ['연번부여', '후보지 지정', '정비구역 공람', '정비구역 지정', '추진위 승인', '조합설립인가·사업시행자 지정', '시공사 선정', '건축심의(통합심의)', '사업시행인가', '관리처분인가', '이주·철거', '착공 이후'];
  function fillStageNames(info) {
    if (info && Number.isInteger(info.stageIdx) && !Array.isArray(info.stageNames)) info.stageNames = STAGES_V1.slice();
    return info;
  }
  // 기록의 단계를 "지금의" 단계 목록 기준으로 읽는다 → {idx(없으면 null), name, dates(지금 목록 순서)}
  function resolveStage(info, stages) {
    const none = { idx: null, name: null, dates: stages.map(() => null) };
    if (!info || !Number.isInteger(info.stageIdx)) return none;
    const names = Array.isArray(info.stageNames) ? info.stageNames : stages;       // 이름이 없는 옛 기록은 지금 목록으로 본다
    const oldName = names[info.stageIdx], idx = oldName ? stages.indexOf(oldName) : -1;
    if (idx < 0) return Object.assign(none, { name: oldName || null });             // 지금 목록에 없는 단계: 이름만
    const dates = stages.map(() => null);
    if (Array.isArray(info.stageDates)) info.stageDates.forEach((d, i) => { const j = stages.indexOf(names[i]); if (j >= 0 && d) dates[j] = d; });
    return { idx, name: stages[idx], dates };
  }

  const api = { STAGES_V1, fillStageNames, resolveStage, evalCond, buildTokens, interp, unresolvedTokens, fmtMan, fmt, FUNCTIONS, evalFlag, isVisible, visibleQuestions, visibleInStep, isDone, zoneFlags, progress, openItems, conclusion, validate, cfgGet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
