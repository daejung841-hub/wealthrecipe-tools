/*
 * 비례율_시뮬레이터.html이 쓰는 순수 계산 함수 모음 (약식/고급 모드 공유).
 * 브라우저에서는 window.RateCalc로, Node 테스트에서는 module.exports로 노출.
 */
(function(){
  function calcProportion({ C, A, B }){
    if (!C) return null;
    return (A - B) / C;
  }

  function calcScenario({ C, A0, B0, A1, B1, memberCount, myAppraisal }){
    const rate0 = calcProportion({ C, A: A0, B: B0 });
    const rate1 = calcProportion({ C, A: A1, B: B1 });
    const X = B1 - B0;
    const Y = A1 - A0;
    const Z = X - Y;
    const perMember = (memberCount != null && memberCount > 0) ? Z / memberCount : null;
    const deltaRate = (rate0 != null && rate1 != null) ? rate1 - rate0 : null;
    const myZ = (myAppraisal != null && rate0 != null && rate1 != null)
      ? myAppraisal * (rate0 - rate1)
      : null;
    return { rate0, rate1, deltaRate, X, Y, Z, perMember, myZ };
  }

  function sumUnitRows(rows){
    let totalCount = 0, totalAmount = 0;
    (rows || []).forEach(row => {
      const count = Number(row.count) || 0;
      const unitPrice = Number(row.unitPrice) || 0;
      totalCount += count;
      totalAmount += count * unitPrice;
    });
    return { totalCount, totalAmount };
  }

  function pctToAmount(base, pct){
    return base * (1 + pct / 100);
  }

  function amountToPct(base, amount){
    if (!base) return null;
    return (amount / base - 1) * 100;
  }

  function manwonToWon(manwon){
    return Math.round(manwon) * 10000;
  }

  function wonToManwon(won){
    return Math.round(won / 10000);
  }

  function calcTotalConstructionCost(areaSqm, pricePerPyeong){
    return (areaSqm / 3.3058) * pricePerPyeong;
  }

  function calcAreaFromCost(cost, pricePerPyeong){
    if (!pricePerPyeong) return null;
    return (cost / pricePerPyeong) * 3.3058;
  }

  function calcPricePerPyeongFromCost(cost, areaSqm){
    if (!areaSqm) return null;
    return (cost / areaSqm) * 3.3058;
  }

  function calcOtherExpenseChangeFromRate(baseOtherExpense, ratePct){
    return baseOtherExpense * (ratePct / 100);
  }

  // 약식 계산: 인당 증감액 = (총공사비 증액분 - 총수입 증가분) ÷ 조합원수.
  // 고급모드의 Z(=공사비증가-수입증가, 양수=추가분담금)와 부호 관례를 맞춘다.
  function calcSimplifiedDelta(constructionCostDelta, incomeDelta, memberCount){
    if (!memberCount) return null;
    return (constructionCostDelta - incomeDelta) / memberCount;
  }

  function calcOtherIncome(totalIncome, memberSales, generalSales){
    return totalIncome - memberSales - generalSales;
  }

  function calcOtherExpense(totalExpense, constructionCost){
    return totalExpense - constructionCost;
  }

  function calcSalesPriceChange(oldPrice, newPrice, units){
    return (newPrice - oldPrice) * units;
  }

  function calcContingencyReserve(reserveAmt, unsoldReserveAmt){
    return (reserveAmt || 0) + (unsoldReserveAmt || 0);
  }

  function calcRateFromRepresentativeUnit(oldPrice, newPrice){
    return (newPrice / oldPrice - 1) * 100;
  }

  const PYEONG_REFERENCE = [[39, 18], [49, 22], [59, 25], [74, 30], [84, 33]];

  function calcAverageMultiplier(){
    const multipliers = PYEONG_REFERENCE.map(([sqm, pyeong]) => sqm / pyeong);
    return multipliers.reduce((sum, m) => sum + m, 0) / multipliers.length;
  }

  function calcPyeong(sqm){
    const exact = PYEONG_REFERENCE.find(([refSqm]) => refSqm === sqm);
    if (exact) return exact[1];
    return sqm / calcAverageMultiplier();
  }

  function solveReserveShiftToTarget(A, B, C, targetRatio){
    const targetB = A - targetRatio * C;
    return targetB - B;
  }

  function solveMemberPriceIncreaseToTarget(A, B, C, targetRatio){
    return targetRatio * C - (A - B);
  }

  function calcUnitComparisonTable(unitRows, myAppraisal, proportionRate){
    const rightsValue = myAppraisal * proportionRate;
    return (unitRows || []).map(row => ({
      label: row.label,
      memberPrice: row.unitPrice,
      rightsValue,
      dues: row.unitPrice - rightsValue,
    }));
  }

  // 목표값찾기 "B안": 조합원분양가 인상 필요액(increaseWon)을 기존 조합원분양수입(totalMemberIncomeWon)
  // 대비 비율로 환산해, 모든 평형에 동일 비율로 적용했을 때의 평형별 변경 전/후 분양가·분담금을 계산한다.
  function calcMemberPriceIncreaseTable(unitRows, myAppraisal, currentRate, increaseWon, totalMemberIncomeWon){
    const ratio = totalMemberIncomeWon ? increaseWon / totalMemberIncomeWon : 0;
    const rightsCurrent = myAppraisal * currentRate;
    const rights100 = myAppraisal * 1.0;
    return (unitRows || []).map(row => {
      const newPrice = row.unitPrice * (1 + ratio);
      return {
        label: row.label,
        oldPrice: row.unitPrice,
        newPrice,
        oldDues: row.unitPrice - rightsCurrent,
        newDues: newPrice - rights100,
      };
    });
  }

  // 목표값찾기 "직접 입력 시뮬레이션": 사용자가 임의로 넣은 인상률(ratePct, %)을 모든 평형에
  // 동일 적용한다. calcMemberPriceIncreaseTable과 달리 목표 비례율이 100% 고정이 아니므로
  // (직접 입력한 인상률이 낳는 결과 비례율은 그때그때 다르다) 호출 쪽이 계산한 newRate를 그대로 받는다.
  function calcCustomRateIncreaseTable(unitRows, myAppraisal, currentRate, newRate, ratePct){
    const rightsCurrent = myAppraisal * currentRate;
    const rightsNew = myAppraisal * newRate;
    const ratio = ratePct / 100;
    return (unitRows || []).map(row => {
      const newPrice = row.unitPrice * (1 + ratio);
      return {
        label: row.label,
        oldPrice: row.unitPrice,
        newPrice,
        oldDues: row.unitPrice - rightsCurrent,
        newDues: newPrice - rightsNew,
      };
    });
  }

  // 평형별 표 전체를 대표하는 "평당분양가" 한 줄 요약: 최다세대 평형의 세대수 비중이
  // threshold(기본 65%) 이상이면 그 평형을 대표값으로, 미만이면 세대수가중 평균을 반환한다.
  // unitRows: [{label, count, oldPrice, newPrice?}] — newPrice를 생략하면 oldPrice와 같은 값을 쓴다
  // (변경 전/미입력 상태에서는 화살표 없이 단일값으로 표시할 수 있도록).
  function calcRepresentativeOrAverageUnitPrice(unitRows, threshold){
    const th = threshold == null ? 0.65 : threshold;
    const rows = (unitRows || []).filter(r => r.count > 0);
    if (!rows.length) return null;
    const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
    const rep = rows.reduce((max, r) => (r.count > max.count ? r : max));
    const share = totalCount ? rep.count / totalCount : 0;
    const pyeongOf = (label) => calcPyeong(parseFloat(label));

    if (share >= th){
      const oldPrice = rep.oldPrice;
      const newPrice = rep.newPrice != null ? rep.newPrice : rep.oldPrice;
      const pyeong = pyeongOf(rep.label);
      return {
        mode: 'representative', label: rep.label, share, oldPrice, newPrice,
        oldPricePerPyeong: pyeong ? oldPrice / pyeong : null,
        newPricePerPyeong: pyeong ? newPrice / pyeong : null,
      };
    }

    let totalOldAmount = 0, totalNewAmount = 0, totalPyeong = 0;
    rows.forEach(r => {
      const pyeong = pyeongOf(r.label);
      totalOldAmount += r.count * r.oldPrice;
      totalNewAmount += r.count * (r.newPrice != null ? r.newPrice : r.oldPrice);
      totalPyeong += r.count * pyeong;
    });
    return {
      mode: 'average', label: null, share,
      oldPrice: totalOldAmount / totalCount,
      newPrice: totalNewAmount / totalCount,
      oldPricePerPyeong: totalPyeong ? totalOldAmount / totalPyeong : null,
      newPricePerPyeong: totalPyeong ? totalNewAmount / totalPyeong : null,
    };
  }

  // ---- 사진(OCR) 숫자 인식 파서 (Task 62) ----
  // 입력: OCR이 읽어낸 "행" 문자열 배열(같은 줄에 놓인 단어들을 좌→우로 이은 것). 출력: 4개 값 후보.
  // 실제 총회책자 OCR 결과는 라벨이 글자 단위로 쪼개지거나("소 요 비 용") 깨지고, 숫자도 쉼표 대신 마침표로
  // 읽히는 일이 잦아서, ① 공백/기호 무시 라벨 규칙 ② 라벨이 없는 "A - B / C" 산식 레이아웃 ③ 비례율 검산
  // (총수입−총지출)/C = 비례율 으로 총수입·총지출을 식별·검증하는 3단계로 구성했다.
  const OCR_UNIT_FACTOR = { '원': 1 / 10000, '천원': 1 / 10, '만원': 1, '백만원': 100, '억원': 10000 };
  const OCR_BIG_DIGITS = 7;

  function ocrNumberMatches(text){
    const out = [];
    const re = /\d{1,3}(?:[,.]\s?\d{3})+(?!\d)|\d{4,}/g;
    let m;
    while ((m = re.exec(text))){
      if (m.index > 0 && /\d/.test(text[m.index - 1])) continue; // 긴 숫자의 중간부터 잘려 잡힌 매치 제외
      const digits = m[0].replace(/\D/g, '');
      out.push({ start: m.index, end: m.index + m[0].length, raw: m[0].replace(/\s/g, ''), digits, value: Number(digits) });
    }
    return out;
  }

  function detectOcrUnit(rows){
    const t = rows.join(' ').replace(/\s/g, '');
    const m = t.match(/단위[:：]?(백만원|천원|만원|억원|원)/) || t.match(/금액\((백만원|천원|만원|억원|원)\)/);
    return m ? m[1] : null;
  }

  function formatOcrRaw(item){
    return item.digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function extractBookFields(rowsIn){
    const rows = (rowsIn || []).map(String);
    const fields = {};
    const items = [];
    rows.forEach((row, ri) => {
      let prevEnd = 0;
      ocrNumberMatches(row).forEach(m => {
        const ctx = row.slice(prevEnd, m.start).replace(/[\s|:：()（）\[\]\-–—_.,*※＊·ㆍ]/g, '');
        items.push(Object.assign({ ri, ctx, hangul: ctx.replace(/[^가-힣]/g, '') }, m));
        prevEnd = m.end;
      });
    });
    const explicit = detectOcrUnit(rows);
    // 단위가 명시돼 있으면 "1억원 이상(만원 환산 1만 이상)"인 숫자를, 모르면 7자리 이상 숫자를 큰 금액으로 본다
    // (백만원 단위 표기는 71,790처럼 5자리라서 자릿수 기준만 쓰면 놓친다).
    const big = items.filter(it => explicit
      ? Math.round(it.value * OCR_UNIT_FACTOR[explicit]) >= 10000
      : it.digits.length >= OCR_BIG_DIGITS);
    let unit = explicit, unitGuessed = false;
    if (!unit && big.length){
      const maxDigits = Math.max.apply(null, big.map(it => it.digits.length));
      unit = maxDigits >= 10 ? '원' : (maxDigits === 9 ? '천원' : '만원');
      unitGuessed = true;
    }
    const result = { unit: unit, unitGuessed: unitGuessed, rate: null, fields: fields };
    if (!big.length || !unit) return result;
    const factor = OCR_UNIT_FACTOR[unit];
    const toMan = (v) => Math.round(v * factor);
    const mk = (it, how) => ({ manwon: toMan(it.value), raw: formatOcrRaw(it), how: how });
    const absOk = (it) => { const v = toMan(it.value); return v >= 100000 && v <= 10000000000; };

    // 1) 라벨 규칙 (공백·기호 무시). 라벨은 "숫자 바로 앞 텍스트"만 본다(오른쪽 산출근거 문구에 낚이지 않도록).
    const firstOf = (pred, filt) => big.filter(it => pred(it) && (filt || absOk)(it))[0];
    // 'ㅇㅇ평가액' 단독 라벨은 "총"이 "홍"처럼 깨져 읽히는 경우를 위한 2순위(종후 감정평가는 숫자 뒤 문구라서 걸리지 않는다).
    const cItem = firstOf(it => /총평가액|종전(자산|재산|토지|평가|총)/.test(it.hangul)) || firstOf(it => /평가액$/.test(it.hangul));
    if (cItem) fields.C = mk(cItem, 'label');
    const relOk = (it) => {
      if (!absOk(it)) return false;
      if (!cItem) return true;
      const ratio = it.value / cItem.value;
      return ratio >= 0.2 && ratio <= 20;
    };
    const incItem = firstOf(it => /총수입/.test(it.hangul) || /^수[입일](금)?(합계|계|총계)?$/.test(it.hangul), relOk);
    const expItem = firstOf(it => /총지출|총사업비|지출합계|지출총계|소요비용|사업비합계/.test(it.hangul) || /^지출(계|합계)?$/.test(it.hangul), relOk);
    if (incItem) fields.income = mk(incItem, 'label');
    if (expItem) fields.expense = mk(expItem, 'label');

    // 2) "A - B" 다음 줄들에 나오는 C (비례율 산정내역 산식 레이아웃)
    const dashOnly = /^[-–−—―ー~]+$/;
    for (let ri = 0; ri < rows.length && !(fields.income && fields.expense && fields.C); ri++){
      const rowBig = big.filter(it => it.ri === ri);
      if (rowBig.length < 2) continue;
      const a = rowBig[0], b = rowBig[1];
      if (!dashOnly.test(rows[ri].slice(a.end, b.start).replace(/\s/g, ''))) continue;
      const cand = big.filter(it => it.ri > ri && it.ri <= ri + 3)[0];
      if (!cand) continue;
      const rate = (a.value - b.value) / cand.value;
      if (rate < 0.3 || rate > 3) continue;
      if (!fields.income) fields.income = mk(a, 'formula');
      if (!fields.expense) fields.expense = mk(b, 'formula');
      if (!fields.C) fields.C = mk(cand, 'formula');
    }

    // 3) 비례율 검산: (총수입 − 총지출) / C = 비례율
    const rows0 = rows.map(r => r.replace(/\s/g, ''));
    let rate = null;
    rows0.forEach(r => { if (rate == null && /비례율/.test(r)) { const m = r.match(/(\d{2,3}\.\d{1,2})/); if (m) rate = Number(m[1]); } });
    if (rate == null){
      const pct = [];
      rows0.forEach(r => { const re = /(\d{2,3}\.\d{1,2})%/g; let m; while ((m = re.exec(r))) { const v = Number(m[1]); if (v >= 40 && v <= 250 && pct.indexOf(v) < 0) pct.push(v); } });
      if (pct.length === 1) rate = pct[0];
    }
    // "비례율" 라벨이 깨져 읽힌 경우(예: "diag | 95.12")를 위해, 라벨·% 표기가 모두 없으면 단독 소수(40~250)를 후보로 두고
    // 그 중 총수입−총지출 검산을 "정확히 하나만" 통과시키는 값을 비례율로 본다.
    let rateCands = rate != null ? [rate] : [];
    if (rate == null){
      const seen = [];
      rows0.forEach(r => { const re = /(?<![\d.,])(\d{2,3}\.\d{1,2})(?![\d.,])/g; let m; while ((m = re.exec(r))) { const v = Number(m[1]); if (v >= 40 && v <= 250 && seen.indexOf(v) < 0) seen.push(v); } });
      rateCands = seen.slice(0, 6);
    }
    const cVal = fields.C ? Number((fields.C.raw).replace(/,/g, '')) : null;
    const TOL = 0.0035;
    const findChecksum = (rt) => {
      const uniq = [];
      big.forEach(it => { const ratio = it.value / cVal; if (ratio >= 0.2 && ratio <= 20 && !uniq.some(u => u.value === it.value)) uniq.push(it); });
      const hits = [];
      uniq.forEach(a => uniq.forEach(b => {
        if (a === b) return;
        const err = Math.abs((b.value - a.value) / cVal - rt / 100);
        if (err <= TOL) hits.push({ inc: b, exp: a, err: err });
      }));
      hits.sort((x, y) => x.err - y.err);
      return (hits.length === 1 || (hits.length > 1 && hits[1].err >= hits[0].err * 3)) ? hits[0] : null;
    };
    if (rateCands.length && cVal){
      const li = fields.income && fields.income.how === 'label' ? Number(fields.income.raw.replace(/,/g, '')) : null;
      const le = fields.expense && fields.expense.how === 'label' ? Number(fields.expense.raw.replace(/,/g, '')) : null;
      const labelOkRate = (li != null && le != null) ? rateCands.filter(rt => Math.abs((li - le) / cVal - rt / 100) <= TOL)[0] : undefined;
      if (labelOkRate !== undefined){
        rate = labelOkRate;
        fields.income.verified = fields.expense.verified = true;
      } else {
        const found = rateCands.map(rt => ({ rt: rt, hit: findChecksum(rt) })).filter(x => x.hit);
        if (found.length === 1){
          rate = found[0].rt;
          fields.income = Object.assign(mk(found[0].hit.inc, 'checksum'), { verified: true });
          fields.expense = Object.assign(mk(found[0].hit.exp, 'checksum'), { verified: true });
        } else if (rate != null){
          // 비례율은 읽혔는데 라벨로 읽은 값들이 검산과 맞지 않고(또는 한쪽만 읽혀 검산 불가) 대체 후보도 못 정했다
          // → 숫자 한두 자리를 잘못 읽었을 가능성이 커서, 틀린 값을 채우느니 비운다.
          if (fields.income && fields.income.how !== 'formula') delete fields.income;
          if (fields.expense && fields.expense.how !== 'formula') delete fields.expense;
        }
      }
    }
    result.rate = rate;
    if (fields.income && fields.expense && fields.income.how === 'formula'){
      fields.income.verified = fields.expense.verified = true;
    }

    // 4) 총공사비: "총공사비" 우선, 없으면 '공사비' 라벨 중 가장 큰 값(철거·설계·감리·부가세 등 제외). 총지출보다 클 수는 없다.
    const costOk = (it) => {
      if (!absOk(it)) return false;
      if (fields.expense && toMan(it.value) > fields.expense.manwon) return false;
      return true;
    };
    const costBase = big.filter(it => /공사비/.test(it.hangul) && !/철거|설계|감리|제외|협상|용역|예비|부가세/.test(it.hangul) && costOk(it));
    const costTotal = costBase.filter(it => /총공사비/.test(it.hangul))[0];
    const costItem = costTotal || costBase.sort((x, y) => y.value - x.value)[0];
    if (costItem) fields.cost = mk(costItem, costTotal ? 'label' : 'label-max');

    // 5) 평당공사비: "(3.3058㎡ × 5,830,000원)" 또는 "4,688,000원/3.3㎡" 같은 단가 표기
    for (let i = 0; i < rows0.length && !fields.price; i++){
      const m = rows0[i].match(/3\.3\d*[^\d]{0,4}[×xX＊*]([\d][\d.,]{4,})원/) || rows0[i].match(/([\d][\d.,]{4,})원\/3\.3/);
      if (!m) continue;
      const won = Number(m[1].replace(/\D/g, ''));
      const man = Math.round(won / 10000);
      if (man >= 100 && man <= 3000) fields.price = { manwon: man, raw: m[1], how: 'pattern' };
    }
    return result;
  }

  const api = {
    extractBookFields, ocrNumberMatches,
    calcProportion, calcScenario, sumUnitRows, pctToAmount, amountToPct,
    manwonToWon, wonToManwon, calcTotalConstructionCost, calcOtherIncome, calcOtherExpense,
    calcSalesPriceChange, calcContingencyReserve, calcRateFromRepresentativeUnit,
    calcAverageMultiplier, calcPyeong, solveReserveShiftToTarget, solveMemberPriceIncreaseToTarget,
    calcUnitComparisonTable, calcMemberPriceIncreaseTable, calcAreaFromCost, calcPricePerPyeongFromCost,
    calcOtherExpenseChangeFromRate, calcSimplifiedDelta,
    calcCustomRateIncreaseTable, calcRepresentativeOrAverageUnitPrice,
  };
  if (typeof module !== 'undefined' && module.exports){
    module.exports = api;
    if (typeof window !== 'undefined') window.RateCalc = api;
  } else {
    window.RateCalc = api;
  }
})();
