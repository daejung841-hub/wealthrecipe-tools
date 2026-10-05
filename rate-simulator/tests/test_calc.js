const assert = require('assert');
global.window = {};
require('../calc.js');
const { calcProportion, calcScenario } = window.RateCalc;

function run(name, fn){
  try { fn(); console.log('PASS', name); }
  catch(e){ console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
}

run('calcProportion computes (A-B)/C', () => {
  assert.strictEqual(calcProportion({ C: 100, A: 150, B: 50 }), 1);
});

run('calcProportion returns null when C is 0', () => {
  assert.strictEqual(calcProportion({ C: 0, A: 100, B: 50 }), null);
});

run('calcScenario: cost-only increase pushes Z positive and rate down', () => {
  const r = calcScenario({ C: 1000, A0: 2000, B0: 1000, A1: 2000, B1: 1200, memberCount: 10 });
  assert.strictEqual(r.X, 200);
  assert.strictEqual(r.Y, 0);
  assert.strictEqual(r.Z, 200);
  assert.strictEqual(r.perMember, 20);
  assert.ok(r.rate1 < r.rate0);
});

run('calcScenario: sales-only increase pushes Z negative (환급) and rate up', () => {
  const r = calcScenario({ C: 1000, A0: 2000, B0: 1000, A1: 2300, B1: 1000, memberCount: 10 });
  assert.strictEqual(r.Y, 300);
  assert.strictEqual(r.Z, -300);
  assert.ok(r.rate1 > r.rate0);
});

run('calcScenario: myAppraisal omitted yields myZ null', () => {
  const r = calcScenario({ C: 1000, A0: 2000, B0: 1000, A1: 2000, B1: 1200, memberCount: 10 });
  assert.strictEqual(r.myZ, null);
});

run('calcScenario: myAppraisal given yields myAppraisal * (rate0-rate1)', () => {
  const r = calcScenario({ C: 1000, A0: 2000, B0: 1000, A1: 2000, B1: 1200, memberCount: 10, myAppraisal: 500 });
  assert.strictEqual(r.myZ, 500 * (r.rate0 - r.rate1));
});

// --- 십정4구역 실측 기준값 (분양가 현실화 시트.xlsx > 십정4 탭) ---
const SIPJEONG4 = {
  A0: 446386779974,
  B0: 378099405249,
  C: 71790392845,
  memberCount: 641,
};

run('십정4: 기존 비례율이 95.12%에 근접한다', () => {
  const rate0 = calcProportion({ C: SIPJEONG4.C, A: SIPJEONG4.A0, B: SIPJEONG4.B0 });
  assert.ok(Math.abs(rate0 - 0.9512049178) < 1e-6, `rate0=${rate0}`);
});

run('십정4: 매출+121억/공사비+346억 시나리오가 인당 3,510만원을 재현한다', () => {
  const r = calcScenario({
    C: SIPJEONG4.C, A0: SIPJEONG4.A0, B0: SIPJEONG4.B0,
    A1: SIPJEONG4.A0 + 12100000000,
    B1: SIPJEONG4.B0 + 34600000000,
    memberCount: SIPJEONG4.memberCount,
  });
  assert.strictEqual(r.Z, 22500000000);
  assert.strictEqual(Math.round(r.perMember / 10000), 3510);
});

// --- 갈산1구역 실측 기준값 ---
const GALSAN1 = {
  A0: 460167487028,
  B0: 385710819772,
  C: 68252250490,
  memberCount: 478,
};

run('갈산1: 기존 비례율이 109.09%에 근접한다', () => {
  const rate0 = calcProportion({ C: GALSAN1.C, A: GALSAN1.A0, B: GALSAN1.B0 });
  assert.ok(Math.abs(rate0 - 1.090904207868) < 1e-6, `rate0=${rate0}`);
});

run('갈산1: 공사비만 500억 증가하면 비례율이 내려가고 Z가 양수다', () => {
  const r = calcScenario({
    C: GALSAN1.C, A0: GALSAN1.A0, B0: GALSAN1.B0,
    A1: GALSAN1.A0,
    B1: GALSAN1.B0 + 50000000000,
    memberCount: GALSAN1.memberCount,
  });
  assert.strictEqual(r.Z, 50000000000);
  assert.ok(r.rate1 < r.rate0);
  assert.ok(r.perMember > 0);
});

run('개인화: 감정가 합계가 C와 같으면 myZ 합계가 Z와 같다', () => {
  const appraisals = [30000000000, 25000000000, 16790392845]; // 합계 = SIPJEONG4.C
  assert.strictEqual(appraisals.reduce((a,b)=>a+b,0), SIPJEONG4.C);

  const base = calcScenario({
    C: SIPJEONG4.C, A0: SIPJEONG4.A0, B0: SIPJEONG4.B0,
    A1: SIPJEONG4.A0 + 12100000000,
    B1: SIPJEONG4.B0 + 34600000000,
    memberCount: SIPJEONG4.memberCount,
  });

  const myZSum = appraisals.reduce((sum, appraisal) => {
    const r = calcScenario({
      C: SIPJEONG4.C, A0: SIPJEONG4.A0, B0: SIPJEONG4.B0,
      A1: SIPJEONG4.A0 + 12100000000,
      B1: SIPJEONG4.B0 + 34600000000,
      memberCount: SIPJEONG4.memberCount,
      myAppraisal: appraisal,
    });
    return sum + r.myZ;
  }, 0);

  assert.ok(Math.abs(myZSum - base.Z) < 1, `myZSum=${myZSum}, Z=${base.Z}`);
});

run('sumUnitRows: 십정4 조합원 평형별 데이터를 합치면 실측 합계와 같다', () => {
  const rows = [
    { count: 290, unitPrice: 351190000 }, // 59A
    { count: 58, unitPrice: 358115441 },  // 59B
    { count: 91, unitPrice: 428544565 },  // 74
    { count: 202, unitPrice: 480509314 }, // 84
  ];
  const { totalCount, totalAmount } = window.RateCalc.sumUnitRows(rows);
  assert.strictEqual(totalCount, 641);
  assert.strictEqual(totalAmount, 258676232421);
});

run('sumUnitRows: 십정4 일반분양 평형별 데이터를 합치면 실측 합계와 같다', () => {
  const rows = [
    { count: 228, unitPrice: 485006940 }, // 59A
    { count: 40, unitPrice: 487996740 },  // 59B
    { count: 1, unitPrice: 582347027 },   // 74 보류지
    { count: 2, unitPrice: 663793376 },   // 84 보류지
  ];
  const { totalCount, totalAmount } = window.RateCalc.sumUnitRows(rows);
  assert.strictEqual(totalCount, 271);
  assert.strictEqual(totalAmount, 132011385699);
});

run('고급 모드 합산값으로 계산한 결과가 약식 모드 총액 직접입력과 같다', () => {
  const memberRows = [
    { count: 290, unitPrice: 351190000 }, { count: 58, unitPrice: 358115441 },
    { count: 91, unitPrice: 428544565 }, { count: 202, unitPrice: 480509314 },
  ];
  const generalRows = [
    { count: 228, unitPrice: 485006940 }, { count: 40, unitPrice: 487996740 },
    { count: 1, unitPrice: 582347027 }, { count: 2, unitPrice: 663793376 },
  ];
  const memberSum = window.RateCalc.sumUnitRows(memberRows);
  const generalSum = window.RateCalc.sumUnitRows(generalRows);
  const otherIncome = 55699161854; // 십정4 기타수입 (약식/고급 모드 공통 단일 필드)

  const A0FromRows = memberSum.totalAmount + generalSum.totalAmount + otherIncome;
  assert.strictEqual(A0FromRows, SIPJEONG4.A0);
  assert.strictEqual(memberSum.totalCount, SIPJEONG4.memberCount);

  const advanced = calcScenario({
    C: SIPJEONG4.C, A0: A0FromRows, B0: SIPJEONG4.B0,
    A1: A0FromRows + 12100000000, B1: SIPJEONG4.B0 + 34600000000,
    memberCount: memberSum.totalCount,
  });
  const simple = calcScenario({
    C: SIPJEONG4.C, A0: SIPJEONG4.A0, B0: SIPJEONG4.B0,
    A1: SIPJEONG4.A0 + 12100000000, B1: SIPJEONG4.B0 + 34600000000,
    memberCount: SIPJEONG4.memberCount,
  });
  assert.deepStrictEqual(advanced, simple);
});

run('pctToAmount: base=485006940, pct=9.28 -> base*(1+9.28/100)', () => {
  const amount = window.RateCalc.pctToAmount(485006940, 9.28);
  assert.ok(Math.abs(amount - 530015584.032) < 0.01, `amount=${amount}`);
});

run('amountToPct와 pctToAmount는 서로 역함수다', () => {
  const base = 242127405249;
  const amount = window.RateCalc.pctToAmount(base, 20);
  const pct = window.RateCalc.amountToPct(base, amount);
  assert.ok(Math.abs(pct - 20) < 1e-9, `pct=${pct}`);
});

run('amountToPct: base가 0이면 null을 반환한다', () => {
  assert.strictEqual(window.RateCalc.amountToPct(0, 100), null);
});

// --- Task 14: 원 ↔ 만원 표시 변환 (내부 계산은 항상 원 단위 유지, 표시 레이어 전용) ---
run('manwonToWon: 6825225만원 -> 68252250000원', () => {
  assert.strictEqual(window.RateCalc.manwonToWon(6825225), 68252250000);
});

run('wonToManwon: 71790392845원 -> 7179039만원 (반올림)', () => {
  assert.strictEqual(window.RateCalc.wonToManwon(71790392845), 7179039);
});

run('wonToManwon: 사사오입 확인 (49995원은 5만원으로 올림)', () => {
  assert.strictEqual(window.RateCalc.wonToManwon(49995), 5);
});

run('manwonToWon → wonToManwon 왕복은 만원 미만 오차만 남긴다 (누적 없음)', () => {
  const won = 242127405249;
  const manwon = window.RateCalc.wonToManwon(won);
  const backToWon = window.RateCalc.manwonToWon(manwon);
  assert.ok(Math.abs(backToWon - won) < 10000, `diff=${Math.abs(backToWon - won)}`);
});

run('십정4 시나리오: 만원 단위로 입력해도(반올림 후 ×10000) 원 단위 raw로 계산하면 인당 3,510만원이 그대로 재현된다', () => {
  const manwon = window.RateCalc;
  const C = manwon.manwonToWon(manwon.wonToManwon(SIPJEONG4.C));
  const A0 = manwon.manwonToWon(manwon.wonToManwon(SIPJEONG4.A0));
  const B0 = manwon.manwonToWon(manwon.wonToManwon(SIPJEONG4.B0));
  const salesDelta = manwon.manwonToWon(manwon.wonToManwon(12100000000));
  const costDelta = manwon.manwonToWon(manwon.wonToManwon(34600000000));
  const r = calcScenario({
    C, A0, B0, A1: A0 + salesDelta, B1: B0 + costDelta, memberCount: SIPJEONG4.memberCount,
  });
  assert.strictEqual(Math.round(r.perMember / 10000), 3510);
});

// --- Task 15: 공사비 = (연면적㎡ ÷ 3.3058) × 평당공사비 ---
run('calcTotalConstructionCost: 정확히 1평(3.3058㎡)이면 평당공사비와 같다', () => {
  const total = window.RateCalc.calcTotalConstructionCost(3.3058, 5830000);
  assert.ok(Math.abs(total - 5830000) < 1e-6, `total=${total}`);
});

run('calcTotalConstructionCost: 연면적 0이면 0원', () => {
  assert.strictEqual(window.RateCalc.calcTotalConstructionCost(0, 5830000), 0);
});

run('calcTotalConstructionCost: 십정4 실측 연면적(총회책자 원문 137,293.51㎡)·평당단가로 계산하면 실측 공사비와 근접한다', () => {
  // 십정4구역 관리처분 총회책자(PDF) 45p "변경계약서(안) 주요 비교표" 원문: 건축 연면적 137,293.51㎡
  // 평당공사비는 분양가 현실화 시트.xlsx 기준 5,830,000원(583만원/평)
  const total = window.RateCalc.calcTotalConstructionCost(137293.51, 5830000);
  const actual = SIPJEONG4.B0 - 135972000000; // 실측 공사비 = 총사업비 - 기타사업비
  const diff = Math.abs(total - actual);
  assert.ok(diff / actual < 0.001, `total=${total}, actual=${actual}, diff=${diff} (${(diff/actual*100).toFixed(4)}%)`);
});

// --- Task 16: 기타수입 = 총수입 - 조합원분양매출 - 일반분양매출 ---
run('calcOtherIncome: 기본 역산', () => {
  assert.strictEqual(window.RateCalc.calcOtherIncome(1000, 600, 300), 100);
});

run('calcOtherIncome: 십정4 실측값을 넣으면 실측 기타수입(556.99억)과 정확히 같다', () => {
  const other = window.RateCalc.calcOtherIncome(SIPJEONG4.A0, 258676232421, 132011385699);
  assert.strictEqual(other, 55699161854);
});

run('calcOtherIncome: 총수입이 두 매출 합보다 작으면 음수를 그대로 반환한다 (UI에서 경고 처리)', () => {
  assert.strictEqual(window.RateCalc.calcOtherIncome(500, 300, 300), -100);
});

// --- Task 17: 기타사업비 = 총지출 - 공사비 ---
run('calcOtherExpense: 기본 역산', () => {
  assert.strictEqual(window.RateCalc.calcOtherExpense(1000, 700), 300);
});

run('calcOtherExpense: 십정4 실측값을 넣으면 실측 기타사업비(1,359.72억)와 정확히 같다', () => {
  const etc = window.RateCalc.calcOtherExpense(SIPJEONG4.B0, 242127405249);
  assert.strictEqual(etc, 135972000000);
});

run('calcOtherExpense: 총지출이 공사비보다 작으면 음수를 그대로 반환한다 (UI에서 경고 처리)', () => {
  assert.strictEqual(window.RateCalc.calcOtherExpense(500, 700), -200);
});

// --- Task 18: 일반분양가 변경액 = (변경후단가 - 변경전단가) × 세대수 ---
run('calcSalesPriceChange: 기본 계산', () => {
  assert.strictEqual(window.RateCalc.calcSalesPriceChange(400, 450, 271), 50 * 271);
});

run('calcSalesPriceChange: 단가가 내려가면 음수(매출 감소)를 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcSalesPriceChange(450, 400, 271), -50 * 271);
});

run('calcSalesPriceChange: 세대수가 0이면 0이다', () => {
  assert.strictEqual(window.RateCalc.calcSalesPriceChange(400, 450, 0), 0);
});

run('calcSalesPriceChange: 십정4 59A 평형 단가 인상(4억8500만원→5억3천만원, 228세대)을 반영한다', () => {
  const delta = window.RateCalc.calcSalesPriceChange(485006940, 530000000, 228);
  assert.strictEqual(delta, 44993060 * 228);
});

// --- Task 19: 잠재적 환급 여력 = 예비비 + 미분양대책비 (참고용, Z 계산에는 영향 없음) ---
run('calcContingencyReserve: 예비비+미분양대책비 합계', () => {
  assert.strictEqual(window.RateCalc.calcContingencyReserve(1000, 500), 1500);
});

run('calcContingencyReserve: 값이 없으면 0으로 취급한다', () => {
  assert.strictEqual(window.RateCalc.calcContingencyReserve(null, 500), 500);
  assert.strictEqual(window.RateCalc.calcContingencyReserve(undefined, undefined), 0);
});

// --- Task 20: 대표 평형/평당공사비 변경률 = (신규/기존 - 1) × 100 ---
run('calcRateFromRepresentativeUnit: 기본 변경률', () => {
  const rate = window.RateCalc.calcRateFromRepresentativeUnit(485006940, 530000000);
  assert.ok(Math.abs(rate - 9.276787) < 1e-4, `rate=${rate}`);
});

run('calcRateFromRepresentativeUnit: 가격이 내려가면 음수 변경률', () => {
  const rate = window.RateCalc.calcRateFromRepresentativeUnit(500, 400);
  assert.ok(Math.abs(rate - (-20)) < 1e-9, `rate=${rate}`);
});

run('calcRateFromRepresentativeUnit: 십정4 평당공사비 583만→700만 인상률을 계산한다', () => {
  const rate = window.RateCalc.calcRateFromRepresentativeUnit(5830000, 7000000);
  assert.ok(Math.abs(rate - 20.06861) < 1e-3, `rate=${rate}`);
});

// --- Task 22: 공급면적(㎡) ↔ 평형 환산 (5개 기준점 평균 배수, 특수 면적은 추정치) ---
run('calcAverageMultiplier: 5개 기준점(39/18, 49/22, 59/25, 74/30, 84/33)의 평균 배수', () => {
  const avg = window.RateCalc.calcAverageMultiplier();
  const expected = (39/18 + 49/22 + 59/25 + 74/30 + 84/33) / 5;
  assert.ok(Math.abs(avg - expected) < 1e-9, `avg=${avg}`);
});

run('calcPyeong: 기준점에 정확히 있는 면적은 표의 값을 그대로 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcPyeong(59), 25);
  assert.strictEqual(window.RateCalc.calcPyeong(84), 33);
});

run('calcPyeong: 표에 없는 특수 면적(68㎡)은 평균 배수로 추정한다', () => {
  const avg = window.RateCalc.calcAverageMultiplier();
  const expected = 68 / avg;
  const pyeong = window.RateCalc.calcPyeong(68);
  assert.ok(Math.abs(pyeong - expected) < 1e-9, `pyeong=${pyeong}`);
  assert.ok(pyeong > 28 && pyeong < 30, `합리적 범위를 벗어남: pyeong=${pyeong}`);
});

// --- Task 23: 목표값찾기 (비례율을 targetRatio로 맞추는 데 필요한 조정액 역산) ---
run('solveReserveShiftToTarget: 비례율이 목표보다 높으면 양수(기타사업비로 옮길 초과분)를 반환한다', () => {
  // A=2000,B=1000,C=1000 -> rate=1.0(100%). targetRatio=0.8이면 B를 200 늘려야 함(초과분 200)
  const shift = window.RateCalc.solveReserveShiftToTarget(2000, 1000, 1000, 0.8);
  assert.strictEqual(shift, 200);
});

run('solveReserveShiftToTarget: 비례율이 목표보다 낮으면 음수를 반환한다', () => {
  const shift = window.RateCalc.solveReserveShiftToTarget(1800, 1000, 1000, 1.0);
  assert.strictEqual(shift, -200);
});

run('solveMemberPriceIncreaseToTarget: 비례율이 목표보다 낮으면 필요한 조합원분양가 인상분(양수)을 반환한다', () => {
  // A=1800,B=1000,C=1000 -> rate=0.8(80%). 100%로 맞추려면 A를 200 늘려야 함
  const increase = window.RateCalc.solveMemberPriceIncreaseToTarget(1800, 1000, 1000, 1.0);
  assert.strictEqual(increase, 200);
});

run('solveMemberPriceIncreaseToTarget: 이미 목표보다 높으면 음수(감액 여지)를 반환한다', () => {
  const increase = window.RateCalc.solveMemberPriceIncreaseToTarget(2000, 1000, 1000, 0.8);
  assert.strictEqual(increase, -200);
});

// --- Task 24: 평형별 분담금 비교표 (권리가액은 모든 행에서 동일, 조합원분양가만 행마다 다름) ---
run('calcUnitComparisonTable: 평형별 분담금 = 조합원분양가 - 권리가액(고정)', () => {
  const rows = [
    { label: '59', count: 290, unitPrice: 400 },
    { label: '84', count: 202, unitPrice: 500 },
  ];
  const table = window.RateCalc.calcUnitComparisonTable(rows, 1000, 0.5);
  assert.strictEqual(table.length, 2);
  assert.strictEqual(table[0].rightsValue, 500);
  assert.strictEqual(table[1].rightsValue, 500);
  assert.strictEqual(table[0].dues, -100);
  assert.strictEqual(table[1].dues, 0);
});

run('calcUnitComparisonTable: 감정가가 없으면(0) 권리가액도 0이다', () => {
  const table = window.RateCalc.calcUnitComparisonTable([{ label: '59', count: 1, unitPrice: 400 }], 0, 0.5);
  assert.strictEqual(table[0].rightsValue, 0);
  assert.strictEqual(table[0].dues, 400);
});

run('calcMemberPriceIncreaseTable: 인상액을 기존 조합원분양수입 대비 비율로 환산해 모든 평형에 동일 적용한다', () => {
  const rows = [
    { label: '59', unitPrice: 400 },
    { label: '84', unitPrice: 500 },
  ];
  // 기존 조합원분양수입 1000, 인상 필요액 100 -> 10% 인상
  const table = window.RateCalc.calcMemberPriceIncreaseTable(rows, 1000, 0.9, 100, 1000);
  assert.ok(Math.abs(table[0].newPrice - 440) < 1e-6, `newPrice=${table[0].newPrice}`);
  assert.ok(Math.abs(table[1].newPrice - 550) < 1e-6, `newPrice=${table[1].newPrice}`);
});

run('calcMemberPriceIncreaseTable: 기존 분담금은 현재 비례율 기준, 변경 분담금은 100% 기준 권리가액을 쓴다', () => {
  const rows = [{ label: '59', unitPrice: 400 }];
  const table = window.RateCalc.calcMemberPriceIncreaseTable(rows, 1000, 0.9, 100, 1000);
  assert.strictEqual(table[0].oldDues, 400 - 1000 * 0.9); // -500
  assert.ok(Math.abs(table[0].newDues - (440 - 1000 * 1.0)) < 1e-6, `newDues=${table[0].newDues}`); // -560
});

run('calcMemberPriceIncreaseTable: 기존 조합원분양수입이 0이면 인상 비율도 0이다(가격 그대로)', () => {
  const table = window.RateCalc.calcMemberPriceIncreaseTable([{ label: '59', unitPrice: 400 }], 1000, 0.9, 100, 0);
  assert.strictEqual(table[0].newPrice, 400);
});

// --- Task 32: 연면적/평당공사비/총공사비 3원 순환 자동계산 (calcTotalConstructionCost의 역함수 2개) ---
run('calcAreaFromCost: calcTotalConstructionCost의 역함수다 (round-trip)', () => {
  const cost = window.RateCalc.calcTotalConstructionCost(137293.51, 5830000);
  const area = window.RateCalc.calcAreaFromCost(cost, 5830000);
  assert.ok(Math.abs(area - 137293.51) < 1e-6, `area=${area}`);
});

run('calcAreaFromCost: 정확히 평당공사비=총공사비이면 1평(3.3058㎡)이다', () => {
  const area = window.RateCalc.calcAreaFromCost(5830000, 5830000);
  assert.ok(Math.abs(area - 3.3058) < 1e-9, `area=${area}`);
});

run('calcAreaFromCost: 평당공사비가 0이면 null을 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcAreaFromCost(1000, 0), null);
});

run('calcPricePerPyeongFromCost: calcTotalConstructionCost의 역함수다 (round-trip)', () => {
  const cost = window.RateCalc.calcTotalConstructionCost(137293.51, 5830000);
  const price = window.RateCalc.calcPricePerPyeongFromCost(cost, 137293.51);
  assert.ok(Math.abs(price - 5830000) < 1e-6, `price=${price}`);
});

run('calcPricePerPyeongFromCost: 연면적이 0이면 null을 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcPricePerPyeongFromCost(1000, 0), null);
});

run('갈산1: 총공사비를 실측값으로 직접 입력해도 연면적과의 round-trip으로 평당공사비를 정확히 역산한다', () => {
  // 갈산1은 부가세/근생시설 등의 이유로 연면적×평당공사비 추정이 실측과 19% 어긋났던 사례.
  // 이제는 실측 총공사비를 직접 입력하는 경로를 검증한다 (연면적은 실측 163,854.47㎡ 그대로).
  const actualCost = 320000000000; // 실측 총공사비(가정값, UI 회귀검증용) - 추정치(연면적×469만원)와 다른 값
  const price = window.RateCalc.calcPricePerPyeongFromCost(actualCost, 163854.47);
  const roundTripCost = window.RateCalc.calcTotalConstructionCost(163854.47, price);
  assert.ok(Math.abs(roundTripCost - actualCost) < 1e-3, `roundTripCost=${roundTripCost}`);
});

// --- Task 36: 기타사업비 변경 = 기존 기타사업비 × 비율(%) ---
run('calcOtherExpenseChangeFromRate: 기존 기타사업비 대비 비율만큼의 변경액을 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcOtherExpenseChangeFromRate(1000, 10), 100);
});

run('calcOtherExpenseChangeFromRate: 음수 비율이면 감소액(음수)을 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcOtherExpenseChangeFromRate(1000, -10), -100);
});

run('calcOtherExpenseChangeFromRate: 비율이 0이면 0이다', () => {
  assert.strictEqual(window.RateCalc.calcOtherExpenseChangeFromRate(135972000000, 0), 0);
});

// --- Task 38: 약식 계산 인당 증감액 = (총공사비 증액분 - 총수입 증가분) ÷ 조합원수 ---
// 고급모드 Z(=공사비증가-수입증가, 양수=추가분담금)와 부호 관례를 일치시킨다(사용자 확인 완료).
run('calcSimplifiedDelta: 공사비증가분에서 수입증가분을 빼고 조합원수로 나눈다', () => {
  assert.strictEqual(window.RateCalc.calcSimplifiedDelta(300, 100, 10), 20);
});

run('calcSimplifiedDelta: 수입 증가가 더 크면 음수(환급)를 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcSimplifiedDelta(100, 300, 10), -20);
});

run('calcSimplifiedDelta: 조합원수가 0이면 null을 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcSimplifiedDelta(100, 300, 0), null);
});

run('calcSimplifiedDelta: 십정4 실측값 기준으로는 고급모드 Z와 정확히 같다 (Z가 C에 의존하지 않으므로)', () => {
  // 고급모드 회귀 시나리오: 공사비 +346억, 일반분양매출 +121억 -> 인당 약 3,510만원 추가분담금 (조합원 641명)
  // Z = X - Y는 C를 쓰지 않으므로, 동일한 증감액을 넣으면 약식 계산도 정확히 같은 값이 나온다.
  // (다만 실제 화면에서는 대표평형 %를 전체 일반분양수입에 곱하는 근사를 쓰므로 오차가 생길 수 있다.)
  const constructionCostDelta = 34600000000;
  const incomeDelta = 12100000000;
  const perMember = window.RateCalc.calcSimplifiedDelta(constructionCostDelta, incomeDelta, 641);
  assert.ok(perMember > 0, `공사비 증가가 더 크므로 양수(추가분담금)여야 함: perMember=${perMember}`);
  assert.strictEqual(Math.round(perMember / 10000), 3510);
});

// --- Task 56: 목표값찾기 B안 확장 — 직접 인상률(%) 시뮬레이션 + 대표/평균 평당가 ---
run('calcCustomRateIncreaseTable: 인상률(%)을 모든 평형에 동일 적용해 변경 후 분양가를 계산한다', () => {
  const rows = [{ label: '59', unitPrice: 400 }, { label: '84', unitPrice: 500 }];
  const table = window.RateCalc.calcCustomRateIncreaseTable(rows, 1000, 0.9, 1.0, 10);
  assert.ok(Math.abs(table[0].newPrice - 440) < 1e-6, `newPrice=${table[0].newPrice}`);
  assert.ok(Math.abs(table[1].newPrice - 550) < 1e-6, `newPrice=${table[1].newPrice}`);
});

run('calcCustomRateIncreaseTable: 기존 분담금은 현재 비례율, 변경 분담금은 새 비례율(newRate) 기준 권리가액을 쓴다', () => {
  const rows = [{ label: '59', unitPrice: 400 }];
  const table = window.RateCalc.calcCustomRateIncreaseTable(rows, 1000, 0.9, 0.95, 10);
  assert.strictEqual(table[0].oldDues, 400 - 1000 * 0.9); // -500
  assert.ok(Math.abs(table[0].newDues - (440 - 1000 * 0.95)) < 1e-6, `newDues=${table[0].newDues}`); // -510
});

run('calcCustomRateIncreaseTable: 인상률 0%면 변경 후 분양가가 기존과 같다', () => {
  const table = window.RateCalc.calcCustomRateIncreaseTable([{ label: '59', unitPrice: 400 }], 1000, 0.9, 0.9, 0);
  assert.strictEqual(table[0].newPrice, 400);
});

run('calcCustomRateIncreaseTable: 인상률이 음수면 분양가가 내려간다', () => {
  const table = window.RateCalc.calcCustomRateIncreaseTable([{ label: '59', unitPrice: 400 }], 1000, 0.9, 0.8, -10);
  assert.ok(Math.abs(table[0].newPrice - 360) < 1e-6, `newPrice=${table[0].newPrice}`);
});

run('calcRepresentativeOrAverageUnitPrice: 최다세대 평형 비중이 65% 이상이면 대표평형을 반환한다', () => {
  const rows = [
    { label: '59', count: 700, oldPrice: 400 },
    { label: '74', count: 200, oldPrice: 500 },
    { label: '84', count: 100, oldPrice: 600 },
  ];
  const r = window.RateCalc.calcRepresentativeOrAverageUnitPrice(rows, 0.65);
  assert.strictEqual(r.mode, 'representative');
  assert.strictEqual(r.label, '59');
  assert.strictEqual(r.oldPrice, 400);
  assert.ok(Math.abs(r.oldPricePerPyeong - 16) < 1e-6, `oldPricePerPyeong=${r.oldPricePerPyeong}`); // 400/25평
});

run('calcRepresentativeOrAverageUnitPrice: 최다세대 비중이 65% 미만이면 세대수가중 평균을 반환한다', () => {
  const rows = [
    { label: '59', count: 300, oldPrice: 375 },
    { label: '74', count: 400, oldPrice: 600 },
    { label: '84', count: 300, oldPrice: 825 },
  ];
  const r = window.RateCalc.calcRepresentativeOrAverageUnitPrice(rows, 0.65);
  assert.strictEqual(r.mode, 'average');
  assert.strictEqual(r.label, null);
  assert.ok(Math.abs(r.oldPrice - 600) < 1e-6, `oldPrice=${r.oldPrice}`); // 600,000/1,000세대
  // 평균 평당가 = 총액(600,000) / 총평형면적(300*25+400*30+300*33=29,400평)
  assert.ok(Math.abs(r.oldPricePerPyeong - (600000 / 29400)) < 1e-6, `oldPricePerPyeong=${r.oldPricePerPyeong}`);
});

run('calcRepresentativeOrAverageUnitPrice: threshold를 낮추면 같은 데이터도 대표평형으로 분기할 수 있다', () => {
  const rows = [
    { label: '59', count: 300, oldPrice: 375 },
    { label: '74', count: 400, oldPrice: 600 },
    { label: '84', count: 300, oldPrice: 825 },
  ];
  const r = window.RateCalc.calcRepresentativeOrAverageUnitPrice(rows, 0.3);
  assert.strictEqual(r.mode, 'representative');
  assert.strictEqual(r.label, '74');
});

run('calcRepresentativeOrAverageUnitPrice: newPrice를 생략하면 oldPrice와 같은 값을 쓴다(변경 전이면 화살표 없이 단일값)', () => {
  const rows = [{ label: '59', count: 700, oldPrice: 400 }, { label: '84', count: 300, oldPrice: 600 }];
  const r = window.RateCalc.calcRepresentativeOrAverageUnitPrice(rows, 0.65);
  assert.strictEqual(r.newPrice, r.oldPrice);
  assert.strictEqual(r.newPricePerPyeong, r.oldPricePerPyeong);
});

run('calcRepresentativeOrAverageUnitPrice: newPrice가 주어지면 대표/평균 로직 그대로 newPrice 쪽도 계산한다', () => {
  const rows = [
    { label: '59', count: 700, oldPrice: 400, newPrice: 440 },
    { label: '84', count: 300, oldPrice: 600, newPrice: 660 },
  ];
  const r = window.RateCalc.calcRepresentativeOrAverageUnitPrice(rows, 0.65);
  assert.strictEqual(r.mode, 'representative');
  assert.strictEqual(r.newPrice, 440);
  assert.ok(Math.abs(r.newPricePerPyeong - 17.6) < 1e-6, `newPricePerPyeong=${r.newPricePerPyeong}`); // 440/25평
});

run('calcRepresentativeOrAverageUnitPrice: 세대수가 모두 0이거나 빈 배열이면 null을 반환한다', () => {
  assert.strictEqual(window.RateCalc.calcRepresentativeOrAverageUnitPrice([], 0.65), null);
  assert.strictEqual(window.RateCalc.calcRepresentativeOrAverageUnitPrice([{ label: '59', count: 0, oldPrice: 400 }], 0.65), null);
});

// --- Task 62: 사진(OCR) 숫자 인식 — 실제 Tesseract(kor+eng, PSM 11, 표 테두리 제거 전처리) 결과를 그대로 저장한
// fixtures로 파서를 검증한다(이상적인 문자열이 아니라 실제로 깨진 라벨/구분자 오인식 포함).
const fs = require('fs');
const path = require('path');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ocr_rows_' + n + '.json'), 'utf8'));

run('extractBookFields: 십정4 p200(라벨이 깨진 총수입/총지출)도 비례율 검산으로 식별한다', () => {
  const r = window.RateCalc.extractBookFields(fx('sj4_p200'));
  assert.strictEqual(r.unit, '원');
  assert.strictEqual(r.fields.C.manwon, 7179039);
  assert.strictEqual(r.fields.income.manwon, 44638678);
  assert.strictEqual(r.fields.expense.manwon, 37809973);
  assert.strictEqual(r.fields.income.how, 'checksum');
});

run('extractBookFields: 브라우저 전처리로 읽은 p200(비례율 라벨 "diag", 총평가액이 "홍 평가액"으로 깨짐)도 세 값을 찾는다', () => {
  const r = window.RateCalc.extractBookFields(fx('sj4_p200_browser'));
  assert.strictEqual(r.fields.C.manwon, 7179039);
  assert.strictEqual(r.fields.income.manwon, 44638678);
  assert.strictEqual(r.fields.expense.manwon, 37809973);
  assert.strictEqual(r.rate, 95.12);
});

run('extractBookFields: 십정4 p199+p200를 합치면 총공사비·평당공사비도 읽는다', () => {
  const r = window.RateCalc.extractBookFields(fx('sj4_p199').concat(fx('sj4_p200')));
  assert.strictEqual(r.fields.cost.manwon, 25249955); // 공사비(소계) 252,499,551,870원
  assert.strictEqual(r.fields.price.manwon, 583);     // 공사비(3.3058㎡ × 5,830,000원)
  assert.strictEqual(r.fields.C.manwon, 7179039);
});

run('extractBookFields: 갈산1 p13(지출이 "계"로만 표기)은 검산으로 총수입/총지출을 찾는다', () => {
  const r = window.RateCalc.extractBookFields(fx('gs1_p13'));
  assert.strictEqual(r.fields.C.manwon, 6825225);
  assert.strictEqual(r.fields.income.manwon, 46016749);
  assert.strictEqual(r.fields.expense.manwon, 38571082);
});

run('extractBookFields: 갈산1 p3(A - B / C 산식 레이아웃)에서 세 값을 읽는다', () => {
  const r = window.RateCalc.extractBookFields(fx('gs1_p3'));
  assert.strictEqual(r.fields.income.how, 'formula');
  assert.strictEqual(r.fields.income.manwon, 46016749);
  assert.strictEqual(r.fields.expense.manwon, 38571082);
  assert.strictEqual(r.fields.C.manwon, 6825225);
});

run('extractBookFields: 갈산1 p12+p13 — 총공사비는 읽고, 평당공사비는 OCR이 8을 6으로 읽은 값 그대로 나온다(실측 오인식 사례)', () => {
  const r = window.RateCalc.extractBookFields(fx('gs1_p12').concat(fx('gs1_p13')));
  assert.strictEqual(r.fields.cost.manwon, 28852048);
  // 원문은 4,688,000원/3.3㎡ 인데 OCR이 4,600,000으로 읽었다 -> 그래서 화면에서 반드시 사용자가 확인하도록 경고한다.
  assert.strictEqual(r.fields.price.manwon, 460);
});

run('extractBookFields: 숫자를 못 찾으면 빈 결과를 돌려주고 예외를 던지지 않는다', () => {
  const r = window.RateCalc.extractBookFields(['안녕하세요', '합계 12', '|']);
  assert.deepStrictEqual(r.fields, {});
  assert.deepStrictEqual(window.RateCalc.extractBookFields([]).fields, {});
});

run('extractBookFields: 비례율이 숫자와 안 맞으면(검산 불일치) 총수입/총지출을 지어내지 않는다', () => {
  const rows = fx('sj4_p200').map(row => row.replace('95.12', '70.00'));
  const r = window.RateCalc.extractBookFields(rows);
  assert.strictEqual(r.fields.C.manwon, 7179039);
  assert.strictEqual(r.fields.expense, undefined); // 총지출은 라벨이 깨져 있어 검산으로만 찾을 수 있는데, 검산이 안 맞으니 비운다
  assert.ok(!r.fields.income || r.fields.income.how !== 'checksum');
});

run('extractBookFields: 천원/백만원 단위 표기를 읽어 만원으로 환산한다', () => {
  const r1 = window.RateCalc.extractBookFields(['단위 : 천원', '분양대상대지 총평가액 71,790,393']);
  assert.strictEqual(r1.unit, '천원');
  assert.strictEqual(r1.fields.C.manwon, 7179039);
  const r2 = window.RateCalc.extractBookFields(['(단위: 백만원)', '종전자산 총평가액 71,790']);
  assert.strictEqual(r2.unit, '백만원');
  assert.strictEqual(r2.fields.C.manwon, 7179000);
});

// --- Task 62: 약식 계산에 기타사업비 변경(정액/비율%) 추가 — 고급 모드와 같은 인당 증감액이 나와야 한다 ---
[
  { name: '십정4', C: SIPJEONG4.C, A0: SIPJEONG4.A0, B0: SIPJEONG4.B0, n: SIPJEONG4.memberCount, etcBase: 135972000000 },
  { name: '갈산1', C: GALSAN1.C, A0: GALSAN1.A0, B0: GALSAN1.B0, n: GALSAN1.memberCount, etcBase: GALSAN1.B0 - 288520476063 },
].forEach(b => {
  run(b.name + ': 약식(공사비+기타사업비 비율 변경분 합산)이 고급 모드 perMember와 정확히 같다', () => {
    const costDelta = 20000000000, incomeDelta = 5000000000;
    [10, -10, 0].forEach(pct => {
      const etcDelta = window.RateCalc.calcOtherExpenseChangeFromRate(b.etcBase, pct);
      const simple = window.RateCalc.calcSimplifiedDelta(costDelta + etcDelta, incomeDelta, b.n);
      const adv = calcScenario({ C: b.C, A0: b.A0, B0: b.B0, A1: b.A0 + incomeDelta, B1: b.B0 + costDelta + etcDelta, memberCount: b.n }).perMember;
      assert.ok(Math.abs(simple - adv) < 1e-3, `${pct}%: simple=${simple}, adv=${adv}`);
    });
  });
  run(b.name + ': 약식 기타사업비 정액 변경도 인당 증감액에 (정액÷조합원수)만큼 더해진다', () => {
    const etcDelta = 3000000000;
    const withEtc = window.RateCalc.calcSimplifiedDelta(0 + etcDelta, 0, b.n);
    assert.ok(Math.abs(withEtc - etcDelta / b.n) < 1e-6);
  });
});
