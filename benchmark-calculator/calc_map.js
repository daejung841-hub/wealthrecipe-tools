/* 저평가 단지 계산기 — 지도(묶음 L84: 지도 탭·말풍선·패널·재개발 구역 겹쳐 보기, 묶음 L85: 지도 중심 화면의 검색창·패널 모양)
 * 계산기 HTML이 지도를 처음 열 때만 이 파일을 받는다. 이 파일이 다시 지도 설정·좌표 두 개·네이버 지도를 받는다.
 * - 지도 부분(네이버 지도, 말풍선, 오른쪽 패널, Pretendard, 화면 안만 그리기)은 재개발 지도(redevelopment-map) 방식을 따랐다.
 * - 지도 사용 번호: 계산기 폴더의 map_config.js(재개발 지도 설정과 같은 값, 이 파일에는 적지 않음).
 * - 단지 좌표: 시세보정 좌표 파일 두 개(../price-correction/data/) 그대로, 키 = seed id.
 * - 말풍선 가격·판정: 계산기 함수(computeSlot·badgeViewL61)로 화면에 보이는 단지만 계산하고 기억한다(우리 단지 진단하기와 같은 값).
 * - 말풍선 = 시안 A(11-01 결정): 흰 말풍선 + 왼쪽 판정 색 띠. 확대 12~14 가격만, 15부터 단지 이름까지.
 * - 재개발 구역: 재개발 지도 폴더의 구역·경계 자료를 읽기만 해서 겹쳐 그린다(기본 꺼짐). 못 읽으면 버튼만 숨긴다.
 */
(function(){
  'use strict';
  const MAP_CONFIG_URL = 'map_config.js';
  const COORD_URLS = ['../price-correction/data/seoul_coords_v3.json', '../price-correction/data/gi_coords_v1.json'];
  const FONT_URL = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css';
  const CX_MIN_ZOOM = 12, DETAIL_ZOOM = 15, OPEN_ZOOM = 16, ZONE_MIN_ZOOM = 12, ZONE_LABEL_ZOOM = 15, MAP_TIMEOUT_MS = 15000;
  const CALC_PAGE = location.pathname.split('/').pop() || encodeURIComponent('벤치마크_배율_계산기.html');
  // ---- 재개발 구역 자료 설정(이 한 곳만 고친다) ----
  // 기준: 재개발 지도 '배포본_구역자료_형식.md' 15차 덧붙임 2(배포본_1031j) — 라이브 고정 경로 /redevelopment-map/ 아래 번호 없는 이름만 읽는다.
  // 재개발 지도 쪽에서 '형식 변경 있음' 알림이 오면 여기만 맞춘다. 켜기: map_config.js에 redevZones: true 한 줄(재개발 지도 배포 뒤).
  const REDEV = {
    format: '15차 덧붙임 2',   // 재개발 지도 형식 안내서의 판(1031j)
    base: '../redevelopment-map/',
    page: '재개발_지도.html',
    zones: ['지도_구역.js', 'MAP_ZONES'],
    bounds: [['지도_테두리.js', 'MAP_BOUNDS'], ['지도_테두리_모아추가.js', 'MAP_BOUNDS_MOA'], ['지도_테두리_모아추가2.js', 'MAP_BOUNDS_MOA2'],
      ['지도_테두리_새구역.js', 'MAP_BOUNDS_NEW'], ['지도_테두리_확인추가.js', 'MAP_BOUNDS_CHK'], ['지도_테두리_양재통합.js', 'MAP_BOUNDS_UNI']],
    // 구역 패널에 쓰는 칸(재개발 지도에 보이는 정보만): 이름 n·유형 t·단계 s·면적 ar·사업성 b·전체 세대 hh·일반분양 gn·조합원분양 un
    fields: { key: 'k', name: 'n', type: 't', stage: 's', area: 'ar', biz: 'b', hh: 'hh', gn: 'gn', un: 'un', id: 'i' },
    // 묶음 L87-6: 구역 패널은 재개발 지도 패널과 같은 목록표 구역 상세(같은 페이지·같은 주소 #zone=…&id=…)를 띄운다
    listPage: '../redevelopment-list/재개발_목록표.html',
    on: () => (window.MAP_CONFIG || {}).redevZones === true,
  };
  const REDEV_URL = (f) => REDEV.base + encodeURIComponent(f);
  const REDEV_PAGE = REDEV_URL(REDEV.page);
  const PANEL_W_KEY = 'calcMapPanelW84', PANEL_W_MIN = 380;
  // 묶음 L87(지도·패널 화면 개편) 설정 한 곳 — distZoom 미만 확대 단계에서는 자치구·시 말풍선, 폰 시트 첫 높이, PC 패널 첫 넓이(화면 비율·최소·최대), 최근 본 단지 칩 수, 자치구 말풍선 판정 막대(시안)
  const L87CFG = { distZoom: 12, sidoZoom: 11, distOpenZoom: 13, sheetH: '75%', pcRatio: .40, pcMin: 440, pcMax: 820, recentMax: 8, distBar: false, zoneW: .30, zoneMin: 360, mapMin: 320 };
  // 묶음 L88(말풍선 세대수·연식 + 연식·세대수 필터) 설정 한 곳 — infoZoom 이상에서 말풍선에 "세대 · 준공연도" 한 줄(11-03 결정: 16단계부터, 15단계는 가격·이름만),
  // distSmallZoom 이하(서울 전체를 보는 단계)의 자치구 말풍선은 이름만 작게(모든 구가 보이게 — 서울 구 먼저), 더 가까운 단계는 이름 + 단지 수
  const L88CFG = { infoZoom: 16, distSmallZoom: 11, units: [0, 300, 500, 1000, 2000] };
  // 묶음 L89(지도 화면 다듬기) 설정 한 곳 — 확대 단계: 자치구·시 말풍선을 2단계 더(distZoom 미만), 가격 말풍선은 distOpenZoom부터(= 자치구를 누르면 가는 단계),
  // 단지 이름(detailZoom)·정보 줄(infoZoom)도 같은 만큼 뒤로, 단지를 열 때 확대(openZoom). 평형 목록(나중에 평형이 늘면 여기만), 가격 구간(만원, 고른 평형의 KB 현재가, 아래 초과~위 이하)
  const L89CFG = { distZoom: 14, distOpenZoom: 14, cxMinZoom: 14, detailZoom: 17, infoZoom: 18, openZoom: 17,
    pyeongs: [[34, '34평'], [25, '25평']],
    prices: [['0-3', '3억 이하', -Infinity, 30000], ['3-6', '3~6억', 30000, 60000], ['6-9', '6~9억', 60000, 90000], ['9-12', '9~12억', 90000, 120000], ['12-15', '12~15억', 120000, 150000], ['15-', '15억 초과', 150000, Infinity]] };
  // 묶음 L91(지도 1차 보완) 설정 한 곳 — PC 실거래 칸 넓이(화면 비율·최소·최대), 초등 학교 이름표가 보이는 확대 단계·최대 개수
  const L91CFG = { rtRatio: .26, rtMin: 320, rtMax: 420, schoolZoom: 14, schoolMax: 150 };
  const l91 = () => { try { return !!(BUNDLES.L91 && l89()); } catch (e) { return false; } };
  // 묶음 L92(지도 1차 보완 2) 설정 한 곳 — PC 지도가 늘 보이는 몫(화면 비율), 실거래 칸 최소 넓이, 실거래 그래프 기간 버튼(개월, 0 = 전체)·기본, 실거래 칸 접기 저장 이름
  const L92CFG = { mapShare: .35, rtMin: 280, periods: [['3y', '최근 3년', 36], ['5y', '최근 5년', 60], ['all', '전체', 0]], defPeriod: '3y', foldKey: 'calcMapRtFoldL92' };
  const l92 = () => { try { return !!(BUNDLES.L92 && l91()); } catch (e) { return false; } };
  // 묶음 L93(지도 1차 배포 전 마지막 보완) 설정 한 곳 — 칸 제목·설명 문구, 가격 상자에 '최근 신고가'를 띄우는 기간(개월), 끌어 고르기 실거래 쪽 양 끝 묶음(개월·최소 건수)
  const L93CFG = { headKb: ['저평가 진단', 'KB 시세 기준(판정에 쓰는 값)'], headRt: ['실거래', '실제 팔린 가격(KB가 늦게 따라가는지 확인용, 판정에는 안 씀)'],
    foldOpen: '실제 거래 자세히', newHighMonths: 12, endMonths: 3, endMin: 3, kbLegend: 'KB 시세(판정 기준)', rtLegend: '실거래(실제 팔린 가격)' };
  const l93 = () => { try { return !!(BUNDLES.L93 && l92()); } catch (e) { return false; } };
  // 묶음 L94(배치 조정 + 진학률) 설정 한 곳 — PC 패널 기본 폭(화면 비율·최소·최대), 패널 안 저평가 : 실거래 비율, 실거래 칸 최소, 끌어 정한 폭 저장 이름, 진학률 파일 자리
  const L94CFG = { share: .44, min: 780, max: 880, diag: .55, rtMin: 300, key: 'calcMapPanelW94', rateBase: '지도자료_202609/진학률/' };
  const l94 = () => { try { return !!(BUNDLES.L94 && l93()); } catch (e) { return false; } };
  // 묶음 L95(대표님 확인 피드백) 설정 한 곳 — 진단 칸 최소 폭(그래프 버튼 줄 [매매가 추이]~[상승률 겹쳐보기]가 두 줄에 드는 폭 = 버튼 둘째 줄 487px + 칸 여백 47px + 여유), 끌어 정한 폭 저장 이름(새 기본 폭이 보이게 L94와 나눔),
  //   학군 이름표 = 화면과 겹친 부분 안쪽(찾는 격자 칸 수), 실거래 '해제 여부 확인 불가' 기준 계약연월(이 달 앞 = 원자료에 해제 칸이 없던 시기)
  const L95CFG = { diagMin: 545, key: 'calcMapPanelW95', labelGrid: 7, noCancelBefore: 202001 };
  const l95 = () => { try { return !!(BUNDLES.L95 && l94()); } catch (e) { return false; } };
  const l96 = () => { try { return !!(BUNDLES.L96 && l95()); } catch (e) { return false; } };   // 묶음 L96: 단지에서 연 학군 창 — 거리·가까운 3곳(계산기 HTML rateTableL94)
  const panelKey94 = () => l95() ? L95CFG.key : L94CFG.key;
  // 지금 쓰는 확대 단계(묶음 L89를 끄면 L88 값 그대로)
  const ZM = () => l89() ? { dist: L89CFG.distZoom, open: L89CFG.distOpenZoom, cx: L89CFG.cxMinZoom, detail: L89CFG.detailZoom, info: L89CFG.infoZoom, cxOpen: L89CFG.openZoom }
    : { dist: L87CFG.distZoom, open: L87CFG.distOpenZoom, cx: CX_MIN_ZOOM, detail: DETAIL_ZOOM, info: L88CFG.infoZoom, cxOpen: OPEN_ZOOM };
  const SHEET_HALF = '52%';   // 폰 아래 시트 첫 높이(11-02 결정: 52% 유지 — 대표님 폰 확인 뒤 여기만 바꿈)

  // 판정 → 왼쪽 색 띠(배지 색 규칙: 저평가 초록·고평가 빨강·주의 노랑, 판단 보류 회색)
  const BAND = [
    ['저평가', 'good', '#1E8E5A'], ['적정', 'fair', '#3B5BA9'], ['주의', 'warn', '#C98A12'], ['고평가', 'bad', '#C63F3F'],
    ['고평가 보류', 'badhold', '#E29A9A'], ['판단 보류', 'hold', '#9CA3AF'], ['이력 부족·확인 필요', 'none', '#D1D5DB'],
  ];
  // 재개발 구역 유형 색(재개발 지도와 같은 값)
  const ZKINDS = [['re', '재개발', '#E8590C'], ['sn', '신통', '#D6336C'], ['gg', '공공', '#2F9E44'], ['mo', '모아타운', '#7048E8'], ['rb', '재건축', '#1C7ED6'], ['st', '역세권·도시정비', '#0C8599']];

  const CSS = `
  .cm84{--cm-navy:#1E3A8A;--cm-navy-soft:#EEF2FF;--cm-ink:#1F2937;--cm-sub:#4B5563;--cm-faint:#6B7280;--cm-line:#E5E7EB;
    font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:var(--cm-ink);word-break:keep-all}
  .cm84-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 8px}
  .cm84-basis{font-size:12px;color:var(--cm-faint);margin-left:auto;min-width:0;flex:1 1 280px;text-align:right}
  .cm84-legend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:var(--cm-sub)}
  .cm84-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  .cm84-main{position:relative;height:min(72vh,760px);min-height:420px;border:1px solid var(--cm-line);border-radius:12px;overflow:hidden;display:flex;background:#fff}
  .cm84-map{flex:1;min-width:0;position:relative}
  .cm84-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:200;background:rgba(255,255,255,.95);border:1px solid var(--cm-line);border-radius:999px;font-size:12.5px;color:var(--cm-sub);padding:6px 12px;box-shadow:0 1px 4px rgba(0,0,0,.12);pointer-events:none;white-space:nowrap}
  .cm84-err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;font-size:14px;color:var(--cm-sub);background:#fff;z-index:300}
  /* 검색창(지도 왼쪽 위) */
  .cm84-search{position:absolute;left:10px;top:10px;z-index:260;width:min(420px,calc(100% - 92px));display:flex;gap:6px}
  .cm84-search .qbox{flex:1 1 auto;min-width:0;display:flex;align-items:center;background:#fff;border:1px solid #C7CDD4;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.14);padding:0 4px 0 10px}
  .cm84-search input{flex:1;min-width:0;border:0;outline:0;font:inherit;font-size:14px;padding:9px 4px;background:transparent;color:var(--cm-ink)}
  .cm84-search .qx{border:0;background:transparent;font-size:15px;color:var(--cm-faint);cursor:pointer;padding:4px 6px}
  .cm84-search .tb{flex:0 0 auto;border:1px solid #C7CDD4;background:#fff;border-radius:10px;font:inherit;font-size:12.5px;font-weight:700;color:var(--cm-navy);padding:0 10px;box-shadow:0 2px 8px rgba(0,0,0,.14);cursor:pointer;min-height:40px;white-space:nowrap}
  .cm84-ac{position:absolute;left:0;right:0;top:46px;background:#fff;border:1px solid var(--cm-line);border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.16);max-height:min(60vh,420px);overflow:auto;padding:4px 0}
  .cm84-ac .it{display:block;width:100%;text-align:left;border:0;background:transparent;font:inherit;padding:8px 12px;cursor:pointer;color:var(--cm-ink)}
  .cm84-ac .it:hover,.cm84-ac .it.act{background:var(--cm-navy-soft)}
  .cm84-ac .it b{font-size:14px;font-weight:700}
  .cm84-ac .it small{display:block;font-size:11.5px;color:var(--cm-faint);margin-top:1px}
  .cm84-ac .it em{font-style:normal;font-size:10.5px;color:#9A6B00;background:#FFF6DB;border-radius:6px;padding:1px 5px;margin-left:4px}
  .cm84-ac .none{padding:10px 12px;font-size:13px;color:var(--cm-faint)}
  /* 오른쪽 세로 버튼 */
  .cm84-vbtns{position:absolute;right:10px;top:10px;z-index:250;display:flex;flex-direction:column;gap:6px}
  .cm84-vbtns button{border:1px solid var(--cm-line);background:#fff;color:var(--cm-sub);font:inherit;font-size:12px;font-weight:700;padding:7px 9px;border-radius:9px;box-shadow:0 1px 4px rgba(0,0,0,.12);cursor:pointer;min-width:58px;line-height:1.2}
  .cm84-vbtns button[aria-pressed="true"]{background:var(--cm-navy);border-color:var(--cm-navy);color:#fff}
  .cm84-vbtns button:disabled{cursor:not-allowed;color:var(--cm-faint)}
  .cm84-vbtns button[hidden]{display:none}
  .cm84-vbtns small{display:block;font-size:10px;font-weight:600;color:#9CA3AF}
  /* 말풍선: 흰 바탕 + 왼쪽 색 띠, 글자는 칸 안에서만(줄바꿈 없음, 칸이 글자에 맞춰 늘어남) */
  .cm84-bb{position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 7px));display:flex;align-items:stretch;white-space:nowrap;background:#fff;border:1px solid #9CA3AF;border-radius:7px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.18);overflow:visible;font-family:"Pretendard",-apple-system,"Malgun Gothic",sans-serif}
  .cm84-bb::after{content:"";position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);border:6px solid transparent;border-top-color:#9CA3AF;border-bottom:0}
  .cm84-bb .bd{flex:0 0 5px;border-radius:6px 0 0 6px;background:var(--b)}
  .cm84-bb .tx{display:flex;align-items:center;gap:4px;padding:3px 7px 3px 5px;line-height:1.15}
  .cm84-bb b{font-size:12.5px;font-weight:800;color:#111827}
  .cm84-bb .nm{display:block;font-size:10px;color:#6B7280;font-weight:600;max-width:96px;overflow:hidden;text-overflow:ellipsis}
  .cm84-bb .col{display:flex;flex-direction:column;align-items:flex-start}
  .cm84-bb.sel{border-color:var(--cm-navy);box-shadow:0 0 0 2px var(--cm-navy)}
  .cm84-bb .nmt{display:none}
  @media (hover:hover){   /* 묶음 L96: PC는 말풍선에 마우스를 올리면 이름표(1줄 단지명 굵게, 2줄 세대수 / 연차 작게)가 바로 뜸(폰은 누르면 패널 — 그대로) */
    .cm84-bb[data-nm]:hover .nmt{display:block;position:absolute;left:50%;bottom:calc(100% + 9px);transform:translateX(-50%);padding:4px 9px;border-radius:6px;background:#111827;color:#fff;line-height:1.35;white-space:nowrap;text-align:center;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .cm84-bb .nmt .n1{display:block;font-size:12.5px;font-weight:800;color:#fff}
    .cm84-bb .nmt .n2{display:block;font-size:10.5px;font-weight:500;color:#D1D5DB}
    div:has(> .cm84-bb[data-nm]:hover){z-index:1000 !important}
  }
  /* 묶음 L88: 말풍선 정보 줄(세대수 · 준공연도) — 작은 글씨, 칸을 넘으면 말줄임 */
  .cm84-bb .if{display:block;font-size:9.5px;line-height:1.2;color:#6B7280;font-weight:600;max-width:112px;overflow:hidden;text-overflow:ellipsis}
  /* 묶음 L88: 필터 버튼·작은 창 */
  .cm84-search .tb.flt b{display:inline-block;min-width:16px;margin-left:4px;padding:0 5px;border-radius:999px;background:var(--cm-navy);color:#fff;font-size:11px;line-height:16px}
  .cm84-search .tb.flt b:empty{display:none}
  .cm84-search .tb.flt[aria-pressed="true"]{border-color:var(--cm-navy)}
  .cm84-fp{position:absolute;left:0;top:46px;z-index:270;width:min(360px,calc(100vw - 32px));background:#fff;border:1px solid var(--cm-line);border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.18);padding:12px 14px;font-size:13px}
  .cm84-fp[hidden]{display:none}
  /* 묶음 L88: 폰 검색 줄 [⋯ 더보기](⭐ 즐겨찾기·📂 엑셀을 하나로) — PC는 그대로 두 버튼 */
  .cm84-search .tb.more{display:none}
  .cm84-mm{position:absolute;right:0;top:46px;z-index:270;min-width:190px;background:#fff;border:1px solid var(--cm-line);border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.18);padding:6px 0}
  .cm84-mm[hidden]{display:none}
  .cm84-mm button{display:block;width:100%;text-align:left;border:0;background:transparent;font:inherit;font-size:14px;padding:11px 16px;cursor:pointer;color:var(--cm-ink)}
  .cm84-mm button:hover{background:var(--cm-navy-soft)}
  .cm84-fp .fh{font-weight:800;margin:2px 0 6px;font-size:13.5px}
  .cm84-fp .fh small{font-weight:600;color:var(--cm-faint);margin-left:6px;font-size:11.5px}
  .cm84-fp .ch{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .cm84-fp .ch button{border:1px solid #C7CDD4;background:#fff;border-radius:999px;padding:5px 11px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--cm-ink)}
  .cm84-fp .ch button[aria-pressed="true"]{background:var(--cm-navy);border-color:var(--cm-navy);color:#fff;font-weight:700}
  .cm84-fp .fb{display:flex;align-items:center;gap:8px;border-top:1px solid var(--cm-line);padding-top:10px}
  .cm84-fp .fb .fn{flex:1;color:var(--cm-sub);font-size:12.5px}
  .cm84-fp .fb button{border:1px solid var(--cm-line);background:#fff;border-radius:8px;padding:6px 10px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--cm-navy)}
  /* 재개발 구역 이름표·점 */
  .cm84-zl{position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(255,255,255,.92);border:1px solid var(--z);border-radius:6px;padding:2px 6px;font-size:11px;line-height:1.2;color:#1F2937;cursor:pointer;text-align:center;font-family:"Pretendard",-apple-system,"Malgun Gothic",sans-serif}
  .cm84-zl small{color:var(--z);font-weight:800;margin-right:3px}
  .cm84-zl span{display:block;font-size:10px;color:#6B7280}
  .cm84-zp{position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:var(--z);border:2px solid #fff;box-shadow:0 0 0 1px var(--z);cursor:pointer}
  /* 오른쪽 패널(계산기 '우리 단지 진단하기' 또는 재개발 구역 요약) */
  .cm84-panel{flex:0 0 auto;width:var(--pw,560px);max-width:calc(100% - 240px);border-left:1px solid var(--cm-line);display:none;flex-direction:column;background:#fff;min-width:0;position:relative}
  .cm84-panel.on{display:flex}
  .cm84-rz{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:5}
  .cm84-rz:hover{background:rgba(30,58,138,.12)}
  .cm84-ph{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--cm-line);flex:0 0 auto}
  .cm84-ph h2{font-size:16px;margin:0;font-weight:800;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .cm84-ph .ty{font-size:11px;font-weight:700;color:#fff;border-radius:999px;padding:2px 8px;flex:0 0 auto;background:var(--cm-navy)}
  .cm84-ph .nomap{font-size:11px;color:#9A6B00;background:#FFF6DB;border-radius:6px;padding:1px 6px;flex:0 0 auto}
  .cm84-ph a,.cm84-ph button{border:1px solid var(--cm-line);background:#fff;font:inherit;font-size:12px;font-weight:700;color:var(--cm-navy);padding:5px 9px;border-radius:8px;flex:0 0 auto;text-decoration:none;cursor:pointer}
  .cm84-ph a{margin-left:auto}
  .cm84-ph .x{background:#F5F6F8;color:var(--cm-sub);border-color:transparent}
  .cm84-ph .sz{display:none}
  .cm84-ph .fs{background:var(--cm-navy);color:#fff;border-color:var(--cm-navy)}
  .cm84-ph .bk{display:none;background:var(--cm-navy);color:#fff;border-color:var(--cm-navy);font-size:13px;padding:6px 12px}
  /* 묶음 L85_FULL: 단지 전체 화면 보기 — 패널을 화면 전체로(지도·패널 상태는 그대로 두고 덮기만), [← 지도로]로 돌아감 */
  .cm84-panel.fsv{position:fixed!important;inset:0!important;width:auto!important;max-width:none!important;height:auto!important;z-index:3000!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding-top:0!important;display:flex!important}
  .cm84-panel.fsv .bk{display:inline-block}
  .cm84-panel.fsv .fs,.cm84-panel.fsv .sz,.cm84-panel.fsv .x,.cm84-panel.fsv .cm84-rz,.cm84-panel.fsv .cm84-rt{display:none!important}
  .cm84-panel.fsv .cm84-ph h2{order:1}
  .cm84-panel.fsv .cm84-ph .ty{order:2}
  .cm84-panel.fsv .cm84-ph a{order:3;margin-left:auto;display:inline-block}
  body.cm84-fsb{overflow:hidden}
  body.cm84-fsb #mapSectionL84{z-index:3000!important}
  .cm84-body{flex:1;min-height:0;position:relative;overflow:auto}
  .cm84-body iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
  .cm84-body .ld{padding:24px 12px;color:var(--cm-faint);font-size:13px;text-align:center}
  /* 묶음 L86: 시세 이력을 받는 동안 패널 맨 위 한 줄 요약(가벼운 파일 값 — 현재가·판정·적정가) */
  .cm84-sum{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:14px 12px 0;padding:12px 14px;border:1px solid var(--cm-line);border-radius:12px;background:#fff;text-align:left;font-size:14px;color:var(--cm-ink)}
  .cm84-sum b{font-size:17px;font-weight:800}
  .cm84-sum .bd{color:#fff;font-size:12px;font-weight:800;border-radius:999px;padding:3px 10px}
  .cm84-sum .fr{color:var(--cm-sub)}
  .cm84-rt{flex:0 0 auto;border-top:1px dashed #C7D2FE;background:#F8FAFF;padding:10px 12px;font-size:12.5px;color:var(--cm-faint)}
  .cm84-rt b{color:var(--cm-navy);font-weight:800;margin-right:6px}
  /* 지도 1-2: 실거래 칸(패널 아래) — 가격 상자 2칸·차이 한 줄(+빨강·−파랑·±3% 회색)·꼬리표·KB 전세가율, [실거래 자세히]로 그래프·목록 */
  .cm84-rt.rt12{border-top:1px solid var(--cm-line);background:#fff;padding:10px 12px 8px;color:var(--cm-ink);max-height:34%;overflow:auto}
  .cm84-rt.rt12.open{max-height:62%}
  .cm84-panel.twv .cm84-rt{display:none}   /* 쌍둥이 큰 창을 열면 실거래 칸은 접어 둠 */
  .cm84-rt.rt12 b{color:inherit;margin:0}
  .cm84-rt .rld{color:var(--cm-faint);font-size:12.5px;padding:4px 0}
  .cm84-rt .rtx{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .cm84-rt .bx{border:1px solid var(--cm-line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:1px;min-width:0}
  .cm84-rt .bx.kb{border-color:#C7D2FE;background:#F8FAFF}
  .cm84-rt .bx b{font-size:17px;font-weight:800}
  .cm84-rt .bx.kb b{color:var(--cm-navy)}
  .cm84-rt .bx b.few{font-size:14px;color:var(--cm-faint)}
  .cm84-rt .bx small{font-size:11px;color:var(--cm-faint);line-height:1.3}
  .cm84-rt .rtd{margin:7px 0 0;font-size:13px;font-weight:800}
  .cm84-rt .rtd.up{color:#C92A2A}.cm84-rt .rtd.dn{color:#1864AB}.cm84-rt .rtd.same{color:#6B7280;font-weight:700}
  .cm84-rt .rtt{margin:4px 0 0;font-size:12px;font-weight:700}
  .cm84-rt .rtt.up{color:#C92A2A}.cm84-rt .rtt.dn{color:#1864AB}.cm84-rt .rtt.few{color:#9CA3AF;font-weight:600}
  .cm84-rt .rtj{margin:8px 0 0;border-top:1px dashed var(--cm-line);padding-top:7px}
  .cm84-rt .jr{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;font-size:12.5px;margin:0 0 5px}
  .cm84-rt .jr .jp{font-weight:800;color:var(--cm-navy);min-width:34px}
  .cm84-rt .jr b{font-weight:800}
  .cm84-rt .jb{flex:1 1 100%;display:block;height:5px;border-radius:3px;background:#E5E7EB;overflow:hidden}
  .cm84-rt .jb i{display:block;height:100%;background:#748FFC}
  .cm84-rt .rts{font-size:11px;color:var(--cm-faint);margin-top:6px;line-height:1.5}
  .cm84-rt .rtm,.cm84-rt .rto,.cm84-rt .rtmore{margin-top:8px;border:1px solid var(--cm-line);background:#fff;border-radius:8px;font:inherit;font-size:12.5px;font-weight:700;color:var(--cm-navy);padding:6px 10px;cursor:pointer}
  .cm84-rt .rto{margin:0 0 0 auto;padding:3px 9px;font-size:12px}
  .cm84-rt .rtg-h{display:flex;align-items:center;gap:8px;margin:10px 0 4px;font-size:13px}
  .cm84-rt .rtg-h small{font-size:11px;color:var(--cm-faint)}
  .cm84-rt .lg{font-size:11px;color:var(--cm-sub);display:inline-flex;align-items:center;gap:4px}
  .cm84-rt .lg .ln{display:inline-block;width:14px;height:2px;background:#1E3A8A}
  .cm84-rt .lg .pt{display:inline-block;width:7px;height:7px;border-radius:50%;background:rgba(224,49,49,.6);margin-left:6px}
  .cm84-rt .rtc{position:relative;height:200px}
  .cm84-rt .rtl,.cm84-kbl .rtl{width:100%;min-width:0!important;table-layout:fixed;border-collapse:collapse;font-size:12.5px}   /* 계산기 표 기본 최소 넓이를 쓰지 않음 */
  .cm84-rt .rtl th,.cm84-kbl .rtl th{text-align:left;font-weight:700;color:var(--cm-faint);font-size:11.5px;border-bottom:1px solid var(--cm-line);padding:4px 4px}
  .cm84-rt .rtl td,.cm84-kbl .rtl td{padding:4px 4px;border-bottom:1px solid #F1F3F5}
  .cm84-rt .rtl tr.cx td{text-decoration:line-through;color:#9CA3AF}
  .cm84-rt .rtl small{text-decoration:none;font-size:10.5px}
  .cm84-rt .rtsc{margin-top:8px;border-top:1px dashed var(--cm-line);padding-top:7px;display:flex;flex-direction:column;gap:6px;font-size:12.5px}
  .cm84-rt .rtsc .sl{display:inline-block;min-width:86px;color:var(--cm-faint);font-size:12px}
  .cm84-rt .rtsc .sf,.cm84-rt .rtsc .sm{font-size:11px;color:#9CA3AF;margin:1px 0 0 86px}
  .cm84-kbl{padding:14px;font-size:14px}
  .cm84-kbl .kn{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#F1F3F5;color:var(--cm-sub);font-size:13px}
  .cm84-kbl dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 12px}
  .cm84-kbl dt{color:var(--cm-faint);font-size:13px}
  .cm84-kbl dd{margin:0;font-weight:600}
  .cm84-kbl .rts{font-size:11.5px;color:var(--cm-faint);margin-top:10px}
  .cm84-ac .it em.kbl{color:#495057;background:#E9ECEF}
  /* 지도 1-2: 말풍선 실거래 꼬리표 */
  .cm84-bb .rtg{align-self:center;font-size:9.5px;font-weight:800;border-radius:5px;padding:1px 4px;margin-left:2px;white-space:nowrap}
  .cm84-bb .rtg.up{color:#C92A2A;background:#FFF5F5;border:1px solid #FFC9C9}
  .cm84-bb .rtg.dn{color:#1864AB;background:#E7F5FF;border:1px solid #A5D8FF}
  /* 지도 1-3: 학구 이름표 */
  .cm84-scl{position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(255,255,255,.88);border:1px dashed var(--s);border-radius:6px;padding:1px 6px;font-size:10.5px;font-weight:700;color:var(--s);pointer-events:none;font-family:"Pretendard",-apple-system,"Malgun Gothic",sans-serif}
  .cm84-zone{padding:14px 14px 18px;font-size:14px}
  .cm84-zone dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 14px}
  .cm84-zone dt{color:var(--cm-faint);font-size:13px}
  .cm84-zone dd{margin:0;font-weight:600}
  .cm84-zone .go{display:inline-block;background:var(--cm-navy);color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:9px 14px;border-radius:10px}
  .cm84-zone .src{margin-top:10px;font-size:11.5px;color:var(--cm-faint)}
  /* 묶음 L85_LEFT: PC에서 패널을 왼쪽에 — 검색창이 패널 위쪽에 얹히고 그 아래로 패널이 이어짐, 넓이 손잡이는 오른쪽 끝 */
  @media (min-width:768px){
    .left84 .cm84-panel{order:-1;border-left:0;border-right:1px solid var(--cm-line);padding-top:60px;box-sizing:border-box}
    .left84 .cm84-rz{left:auto;right:-4px}
    .left84.pon .cm84-search{width:calc(var(--pw,560px) - 20px)}
  }
  /* 묶음 L87-1: 자치구·시 말풍선(멀리 볼 때) */
  .cm84-dg{position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;background:#fff;border:1.5px solid var(--cm-navy,#1E3A8A);border-radius:999px;padding:5px 11px;font-size:12.5px;line-height:1.15;color:#1F2937;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.18);text-align:center;font-family:"Pretendard",-apple-system,"Malgun Gothic",sans-serif}
  .cm84-dg b{font-weight:800;font-size:13px}
  .cm84-dg span{margin-left:5px;color:#1E3A8A;font-weight:800}
  .cm84-dg .br{display:flex;height:4px;border-radius:2px;overflow:hidden;margin-top:4px;min-width:64px;background:#E5E7EB}
  .cm84-dg .br i{display:block;height:100%}
  /* 묶음 L88: 서울 전체를 보는 단계의 작은 자치구 말풍선(이름만) */
  .cm84-dg.sm{padding:2px 7px;border-width:1px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.16)}
  .cm84-dg.sm b{font-size:11px;font-weight:700}
  /* 묶음 L87-4: 검색창 아래 최근 본 단지 칩 줄(가로로 밀어 보기) */
  .cm84-rc{position:absolute;left:10px;top:58px;z-index:255;width:min(420px,calc(100% - 92px));display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0 4px}
  .cm84-rc::-webkit-scrollbar{display:none}
  .cm84-rc .rc{flex:0 0 auto;display:flex;align-items:center;background:#fff;border:1px solid #C7CDD4;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.12);font-size:12.5px;max-width:210px}
  .cm84-rc .rc button{border:0;background:transparent;font:inherit;cursor:pointer;color:var(--cm-ink)}
  .cm84-rc .rc .o{padding:5px 4px 5px 10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}
  .cm84-rc .rc .o small{font-weight:600;color:var(--cm-faint);margin-left:3px}
  .cm84-rc .rc .d{padding:5px 9px 5px 3px;color:var(--cm-faint);font-size:13px}
  @media (min-width:768px){ .left84.pon .cm84-rc{width:calc(var(--pw,560px) - 20px)} .left84.rcon .cm84-panel{padding-top:96px} }
  /* 묶음 L89: 검색창 아래 늘 보이는 필터 줄 + 그 자리 작은 펼침 */
  .cm84-frow{position:absolute;left:10px;top:58px;z-index:255;width:min(420px,calc(100% - 92px));display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0 4px}
  .cm84-frow::-webkit-scrollbar{display:none}
  .cm84-frow[hidden]{display:none}
  .cm84-frow button{flex:0 0 auto;border:1px solid #C7CDD4;background:#fff;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.12);font:inherit;font-size:13px;font-weight:700;color:var(--cm-ink);padding:5px 11px;cursor:pointer;white-space:nowrap;line-height:1.25}
  .cm84-frow button i{font-style:normal;font-size:10px;margin-left:3px;color:var(--cm-faint)}
  .cm84-frow button[aria-pressed="true"]{background:var(--cm-navy);border-color:var(--cm-navy);color:#fff}
  .cm84-frow button[aria-pressed="true"] i{color:#C7D2FE}
  .cm84-frow button:hover{background:var(--cm-navy-soft)}
  .cm84-frow button[aria-pressed="true"]:hover{background:var(--cm-navy)}
  .cm84-frow .fz{color:var(--cm-navy)}
  .cm84-frow .fz:disabled{color:#9CA3AF;cursor:default;box-shadow:none}
  .cm84-fd{position:absolute;z-index:275;min-width:200px;max-width:min(260px,calc(100% - 12px));background:#fff;border:1px solid var(--cm-line);border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.18);padding:6px;display:flex;flex-direction:column;gap:2px}
  .cm84-fd[hidden]{display:none}
  .cm84-fd button{text-align:left;border:0;background:transparent;font:inherit;font-size:13.5px;padding:9px 10px;border-radius:8px;cursor:pointer;color:var(--cm-ink)}
  .cm84-fd button:hover{background:var(--cm-navy-soft)}
  .cm84-fd button[aria-pressed="true"]{color:var(--cm-navy);font-weight:800;background:var(--cm-navy-soft)}
  .cm84-fd button[aria-pressed="true"]::before{content:"✓ "}
  .cm84-fd .fdh{font-size:11.5px;color:var(--cm-faint);padding:4px 10px 2px}
  .cm84-fd .fdn{font-size:12px;color:var(--cm-sub);border-top:1px solid var(--cm-line);margin-top:4px;padding:8px 10px 4px}
  @media (min-width:768px){ .left84.pon .cm84-frow{width:calc(var(--pw,560px) - 20px)} .left84.fron .cm84-panel{padding-top:96px} }
  /* 묶음 L89: 재개발 지도와 같은 모양 — 오른쪽 세로 버튼(넓이 60·둥근 10·눌림은 남색 글자+옅은 남색), 구역 이름표(구역 색 글자·굵게·둥근 9), 패널 열림(밀려 들어옴 .22초) */
  .cm84.l89 .cm84-vbtns{right:12px;top:12px}
  .cm84.l89 .cm84-vbtns button{width:60px;min-width:0;border-radius:10px;font-size:11.5px;font-weight:600;line-height:1.25;padding:6px 2px;color:var(--cm-sub);box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .cm84.l89 .cm84-vbtns button[aria-pressed="true"]{background:var(--cm-navy-soft);border-color:var(--cm-navy);color:var(--cm-navy);font-weight:800}
  .cm84.l89 .cm84-vbtns button:not(:disabled):hover{background:var(--cm-navy-soft)}
  .cm84.l89 .cm84-zl{border:1.5px solid var(--z);border-radius:9px;padding:2px 8px 3px;font-size:12px;font-weight:800;color:var(--z);background:rgba(255,255,255,.94);box-shadow:0 1px 2px rgba(0,0,0,.1)}
  .cm84.l89 .cm84-zl small{font-size:10px;font-weight:700;margin-right:3px;opacity:.85;color:var(--z)}
  .cm84.l89 .cm84-zl span{font-size:9.5px;font-weight:600;opacity:.8;color:var(--z)}
  @keyframes cm89In{from{transform:translateX(-24px);opacity:.4}to{transform:none;opacity:1}}
  @keyframes cm89Up{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
  .cm84.l89 .cm84-panel.on,.cm84.l89 .cm84-zpanel.on{animation:cm89In .22s ease}
  @media (max-width:767px){ .cm84.l89 .cm84-panel.on,.cm84.l89 .cm84-zpanel.on{animation:cm89Up .22s ease} .cm84.l89 .cm84-vbtns button{width:52px;font-size:11px;padding:5px 2px} }
  /* 묶음 L91: 단지 패널 2칸(PC: 저평가 진단 왼쪽 그대로 + 실거래 오른쪽) · 폰: 위쪽 탭 */
  .cm84-panel.l91{width:calc(var(--pw,560px) + var(--rtw,360px));max-width:calc(100% - 200px)}
  .cm84-split91{flex:1;min-height:0;display:flex;position:relative}
  .cm84-split91 > .cm84-body{flex:0 0 var(--pw,560px);min-width:0;border-right:1px solid var(--cm-line)}
  .cm84-split91 > .cm84-rt.rt12{flex:1 1 auto;min-width:0;max-height:none;border-top:0;overflow:auto;padding:12px 12px 14px}
  .cm84-tabs91{display:none}
  .cm84-panel.twv .cm84-split91 > .cm84-body,.cm84-panel.fsv .cm84-split91 > .cm84-body{flex:1 1 auto}
  .cm84-panel.l91.twv,.cm84-panel.l91.fsv{max-width:none}
  .cm84-rt .rtc.c91{height:300px;margin-bottom:6px}
  @media (max-width:767px){
    .cm84-panel.l91{width:auto;max-width:none}
    .cm84-tabs91{display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid var(--cm-line);flex:0 0 auto}
    .cm84-tabs91 button{flex:1 1 0;border:1px solid var(--cm-line);background:#fff;border-radius:999px;font:inherit;font-size:13px;font-weight:700;color:var(--cm-sub);padding:6px 8px;cursor:pointer}
    .cm84-tabs91 button[aria-selected="true"]{background:var(--cm-navy);border-color:var(--cm-navy);color:#fff}
    .cm84-split91 > .cm84-body{flex:1 1 auto;border-right:0}
    .cm84-panel[data-t91="diag"] .cm84-split91 > .cm84-rt{display:none}
    .cm84-panel[data-t91="rt"] .cm84-split91 > .cm84-body{display:none}
    .cm84-panel.twv .cm84-tabs91{display:none}
  }
  /* 묶음 L91: 켬/끔이 한눈에 보이는 버튼(재개발 구역 = 구역 색, 학구도 = 학구 색, 켜면 "끄기") */
  .cm84.l91 .cm84-vbtns button small{display:block;font-size:10px;font-weight:700;color:inherit;opacity:.9;margin-top:1px}
  .cm84.l91 #cm84Zone[aria-pressed="true"]{background:#E8590C;border-color:#E8590C;color:#fff}
  .cm84.l91 #cm84ScE[aria-pressed="true"]{background:#1864AB;border-color:#1864AB;color:#fff}
  .cm84.l91 #cm84ScM[aria-pressed="true"]{background:#C2255C;border-color:#C2255C;color:#fff}
  .cm84-ph .zoff{background:#FFF4E6;border-color:#FFD8A8;color:#D9480F}
  /* 묶음 L91: 초등학교 이름표(학교 위치)·학군/학교 작은 창 */
  .cm84-sch{position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;background:#fff;border:1px solid var(--s);border-radius:999px;padding:1px 7px;font-size:11px;font-weight:700;color:var(--s);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15);font-family:"Pretendard",-apple-system,"Malgun Gothic",sans-serif}
  .cm84-sch.on{background:var(--s);color:#fff;z-index:2}
  .cm84-scc{position:absolute;left:10px;top:104px;z-index:265;width:min(340px,calc(100% - 20px));max-height:calc(100% - 150px);overflow:auto;background:#fff;border:1px solid var(--cm-line);border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.18);padding:12px 14px;font-size:13px;color:var(--cm-ink)}
  .cm84-scc[hidden]{display:none}
  @media (max-width:767px){ .cm84-scc{width:calc(100% - 88px)} }   /* 폰: 오른쪽 세로 버튼(학구도·학군 끄기)을 가리지 않게 */
  .cm84-scc > b{font-size:15px;font-weight:800}
  .cm84-scc .scx{position:absolute;right:8px;top:8px;border:0;background:#F1F3F5;border-radius:8px;font:inherit;font-size:12px;padding:3px 7px;cursor:pointer;color:var(--cm-sub)}
  .cm84-scc .scs{margin:6px 0 0;font-size:12.5px;color:var(--cm-sub)}
  .cm84-scc .scs .sl{display:inline-block;min-width:52px;color:var(--cm-faint)}
  .cm84-scc .sct{width:100%;min-width:0!important;table-layout:fixed;border-collapse:collapse;margin:6px 0 2px;font-size:12.5px}
  .cm84-scc .sct th{text-align:left;font-size:11px;color:var(--cm-faint);font-weight:700;border-bottom:1px solid var(--cm-line);padding:3px 4px}
  .cm84-scc .sct td{padding:3px 4px;border-bottom:1px solid #F1F3F5}
  .cm84-scc .sct th:nth-child(1){width:52%}
  .cm84-scc .scq{color:#9CA3AF}
  .cm84-scc .scr{margin:8px 0 0;border-top:1px dashed var(--cm-line);padding-top:6px;font-size:12.5px}
  .cm84-scc .scr p{margin:3px 0;line-height:1.5;color:var(--cm-ink)}
  .cm84-scc .scn{margin-top:6px;font-size:10.5px;color:var(--cm-faint);line-height:1.5}
  /* 묶음 L92: [단지 숨기기] 켜짐 색 · 실거래 칸 접기 버튼 · 그래프 기간 버튼·막대·끌어 고르기 */
  .cm84.l91 #cm84Hide[aria-pressed="true"]{background:#343A40;border-color:#343A40;color:#fff}
  .cm84-split91 > .rtfold92{position:absolute;top:50%;left:calc(var(--pw,560px) - 13px);transform:translateY(-50%);z-index:6;width:26px;height:58px;padding:0;border:1px solid var(--cm-line);background:#fff;border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,.15);font:inherit;font-size:12px;color:var(--cm-navy);cursor:pointer}
  .cm84-split91 > .rtfold92:hover{background:#EEF2FF}
  @media (min-width:768px){
    .cm84-panel.rtf92 .cm84-split91 > .cm84-rt{display:none}
    .cm84-panel.rtf92 .cm84-split91 > .cm84-body{border-right:0}
    .cm84-panel.rtf92 .cm84-split91 > .rtfold92{left:auto;right:3px}
  }
  .cm84-panel.twv .rtfold92,.cm84-panel.fsv .rtfold92{display:none}
  @media (max-width:767px){ .cm84-split91 > .rtfold92{display:none} }
  .cm84-rt .rtp92{display:flex;gap:6px;margin:2px 0 6px}
  .cm84-rt .rtp92 button{flex:1 1 0;border:1px solid var(--cm-line);background:#fff;border-radius:999px;font:inherit;font-size:12px;font-weight:700;color:var(--cm-sub);padding:5px 6px;cursor:pointer}
  .cm84-rt .rtp92 button[aria-pressed="true"]{background:var(--cm-navy);border-color:var(--cm-navy);color:#fff}
  .cm84-rt .rtc.c91 > .chart-canvas-wrap{position:relative;width:100%;height:100%}
  .cm84-rt .rtc.c91 canvas{width:100%!important;height:100%!important}
  .cm84-rt .rts92{margin:0 0 4px}
  .cm84-rt .rts92 .period-l40-track{margin:0 13px}
  .cm84-rt .drag-result{width:min(300px,calc(100% - 20px))}
  .cm84-rt .drag-row{flex-wrap:wrap;row-gap:0}
  .cm84-rt .drag-row .drag-name{flex:1 1 calc(100% - 14px);white-space:normal}
  .cm84-rt .drag-row .drag-diff{flex:1 1 auto;text-align:left;margin-left:13px;font-size:11px}
  .cm84-rt .drag-row .drag-rate{min-width:0}
  /* 묶음 L93: 칸 머리(제목 + 한 줄 설명, 색 띠 = 그래프 선 색) · 최고점·신고가·직거래 · 그래프 누르기 강조 · 끌어 고르기 실거래 줄 · 접힌 버튼 글자 */
  .cm84-panel.l93 .cm84-split91 > .cm84-body{display:flex;flex-direction:column}
  @media (max-width:767px){ .cm84-panel.l93[data-t91="rt"] .cm84-split91 > .cm84-body{display:none} }   /* 폰 실거래 탭: 진단 칸은 숨김(위 flex가 L91 숨김을 이기지 않게) */
  .cm84-panel.l93 .cm84-rt .rtc.c91{height:330px}
  .cm84-panel.l93 .cm84-split91 > .cm84-body iframe{position:relative;inset:auto;flex:1 1 auto;min-height:0;height:auto}
  .h93{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding:7px 12px 7px 10px;border-left:4px solid #1E3A8A;background:#F5F7FF;border-bottom:1px solid var(--cm-line);font-size:12px;color:var(--cm-sub);line-height:1.5}
  .h93 b{font-size:13.5px;font-weight:800;color:#1E3A8A;margin:0}
  .h93.rt{border-left-color:#E8590C;background:#FFF6EE;margin:-12px -12px 10px}
  .h93.rt b{color:#C2410C}
  .cm84-rt .nhb93{margin:6px 0 0;padding:5px 9px;border:1px solid #FFC9C9;border-radius:8px;background:#FFF5F5;font-size:12.5px;font-weight:700;color:#C92A2A;line-height:1.5}
  .cm84-rt .nhb93[hidden]{display:none}
  .cm84-rt .nh93,.cm84-rt .rtl .nh93{display:inline-block;background:#FFE3E3;color:#C92A2A;border-radius:4px;padding:0 4px;font-size:10.5px;font-weight:800}
  .cm84-rt .rtl .dg93{display:inline-block;background:#F1F3F5;color:#495057;border-radius:4px;padding:0 4px;font-size:10.5px;font-weight:700}
  .cm84-rt .rth93{margin:8px 0 2px;padding:7px 10px;border:1px solid var(--cm-line);border-radius:10px;background:#FAFBFC}
  .cm84-rt .hr93{display:flex;align-items:baseline;gap:6px;font-size:12.5px;line-height:1.6}
  .cm84-rt .hr93 .k{min-width:84px;color:var(--cm-sub);font-weight:700}
  .cm84-rt .hr93 .k.kb{color:#1E3A8A}
  .cm84-rt .hr93 .k.rt{color:#C2410C}
  .cm84-rt .hr93 b{font-size:14px;font-weight:800;color:var(--cm-ink)}
  .cm84-rt .hr93 small{color:var(--cm-faint);font-size:11px}
  .cm84-rt .hr93.g b{font-size:12.5px;color:#495057}
  .cm84-rt .rth93 .rts{margin-top:3px}
  .cm84-rt .rtl tr.hl93 td{background:#FFF3BF;transition:background .3s}
  .cm84-rt .rtj93{margin:2px 0 4px;font-size:11.5px;color:#9C6500;font-weight:700}
  .cm84-rt .rtj93[hidden]{display:none}
  .cm84-rt .drag-row .dr93{display:block;font-size:10.5px;color:var(--cm-faint);font-weight:400}
  .cm84-rt .drag-row .few93{color:#868E96;font-weight:700}
  .cm84-split91 > .rtfold92.f93{height:auto;width:28px;padding:8px 0;writing-mode:vertical-rl;letter-spacing:1px;font-weight:700;line-height:1;display:flex;align-items:center;gap:6px}
  .cm84-split91 > .rtfold92.f93 span{font-size:12px}
  /* 묶음 L94: 쌍둥이 창 자리(PC = 실거래 칸 자리, 폰 = [쌍둥이] 탭) */
  .cm84-split91 > .cm84-tw94{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;background:#fff}
  .cm84-split91 > .cm84-tw94[hidden]{display:none}
  .cm84-tw94 iframe{flex:1 1 auto;width:100%;min-height:0;border:0;background:#fff}
  .cm84-tw94 .ld{padding:24px 12px;color:var(--cm-faint);font-size:13px;text-align:center}
  .cm84-tw94 .tw94-h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--cm-line);font-size:14px}
  .cm84-tw94 .tw94-x{margin-left:auto;border:1px solid var(--cm-line);background:#fff;border-radius:9px;font:inherit;font-size:12.5px;font-weight:700;padding:5px 10px;cursor:pointer}
  /* 묶음 L94: 좁아진 실거래 칸 — 가격 상자·신고가 줄·최고점이 줄바꿈 없이 */
  .cm84-panel.l94 .cm84-rt .rtx .bx{padding:8px 9px;min-width:0}
  .cm84-panel.l94 .cm84-rt .rtx .bx small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}
  .cm84-panel.l94 .cm84-rt .nhb93{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;padding:5px 8px}
  .cm84-panel.l94 .cm84-rt .hr93{white-space:nowrap}
  .cm84-panel.l94 .cm84-rt .hr93 .k{min-width:76px}
  .cm84-panel.l94 .cm84-rt .rtp92 button{padding:5px 4px;white-space:nowrap}
  /* 묶음 L95: 2019년 이전 최고가 작은 글씨 · 폰에서 학교·학군으로 갈 때 시트를 낮춤(머리 ▲/▼를 누르면 원래대로) */
  .cm84-rt .hx95{font-size:10.5px;color:var(--cm-faint);margin:-3px 0 3px 82px;white-space:nowrap;line-height:1.5}
  @media (max-width:767px){
    .cm84.l87 .cm84-panel.mini95,.cm84-panel.mini95{height:34%}
    .cm84-main:has(.cm84-panel.mini95) .cm84-scc{max-height:calc(66% - 116px)}
  }
  @media (min-width:768px){ .cm84-panel.tws94 .cm84-split91 > .cm84-rt,.cm84-panel.tws94 .cm84-split91 > .rtfold92{display:none} }
  @media (max-width:767px){
    .cm84-panel.l93[data-t91="tw"] .cm84-split91 > .cm84-body,.cm84-panel[data-t91="tw"] .cm84-split91 > .cm84-rt{display:none}
    .cm84-panel:not([data-t91="tw"]) .cm84-split91 > .cm84-tw94{display:none}
  }
  /* 묶음 L89: 머리줄의 최근 본 단지(PC는 탭 옆 칩 줄, 폰은 [🕘 최근] 하나로 접음) */
  .mh-recent-l89{flex:1 1 auto;min-width:0;display:flex;align-items:center;position:relative}
  .mh-recent-l89[hidden]{display:none!important}
  .mh-recent-l89 .hr-btn{display:none;border:1px solid #C7CDD4;background:#fff;border-radius:999px;font:inherit;font-size:12.5px;font-weight:700;color:var(--cm-ink,#1F2937);padding:5px 10px;cursor:pointer;white-space:nowrap;min-height:32px}
  .mh-recent-l89 .hr-btn b{color:var(--cm-navy,#1E3A8A)}
  .mh-recent-l89 .hr-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;min-width:0;padding:2px 0}
  .mh-recent-l89 .hr-chips::-webkit-scrollbar{display:none}
  .mh-recent-l89 .rc{flex:0 0 auto;display:flex;align-items:center;background:#fff;border:1px solid #C7CDD4;border-radius:999px;font-size:12.5px;max-width:210px;font-family:"Pretendard",-apple-system,"Malgun Gothic",sans-serif}
  .mh-recent-l89 .rc button{border:0;background:transparent;font:inherit;cursor:pointer;color:#1F2937}
  .mh-recent-l89 .rc .o{padding:4px 4px 4px 10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}
  .mh-recent-l89 .rc .o small{font-weight:600;color:#6B7280;margin-left:3px}
  .mh-recent-l89 .rc .d{padding:4px 9px 4px 3px;color:#6B7280;font-size:13px}
  @media (max-width:767px){
    .cm84-frow{width:calc(100% - 20px)}
    .cm84-frow button{padding:5px 9px}
    .mh-recent-l89{flex:0 0 auto}
    .mh-recent-l89 .hr-btn{display:inline-flex;align-items:center}
    .mh-recent-l89 .hr-chips{display:none;position:absolute;left:0;top:calc(100% + 6px);z-index:3100;flex-direction:column;align-items:stretch;background:#fff;border:1px solid #E5E7EB;border-radius:12px;box-shadow:0 8px 22px rgba(0,0,0,.18);padding:6px;width:min(280px,calc(100vw - 24px));max-height:60vh;overflow:auto}
    .mh-recent-l89.open .hr-chips{display:flex}
    .mh-recent-l89 .rc{max-width:none;border:0;border-radius:8px}
    .mh-recent-l89 .rc .o{flex:1;max-width:none;text-align:left;padding:9px 6px 9px 10px;font-size:13.5px}
  }
  /* 묶음 L87-3: 패널 머리 — 단지명 하나(조금 크게) + 바로 옆 [비교 단지 추가] */
  .cm84.l87 .cm84-ph.cx .ty{display:none}
  .cm84.l87 .cm84-ph.cx h2{font-size:18.5px}
  .cm84-ph .ad{background:var(--cm-navy-soft);border-color:#C7D2FE;color:var(--cm-navy)}
  .cm84-ph .ad:disabled{opacity:.5;cursor:default}
  .cm84-ph .zt{display:none}
  /* 묶음 L87-5: 쌍둥이 창을 열면 패널을 넓게(PC는 패널 옆으로, 폰은 전체 화면) */
  .cm84-panel.twv{width:min(1180px,calc(100% - 80px))!important;max-width:none!important;z-index:600}
  /* 묶음 L87-6: 오른쪽 구역 패널(단지 패널과 동시에) */
  .cm84-zpanel{flex:0 0 auto;width:var(--zw,380px);border-left:1px solid var(--cm-line);display:none;flex-direction:column;background:#fff;min-width:0;position:relative}
  .cm84-zpanel.on{display:flex}
  .cm84-zpanel .cm84-body iframe{background:#fff}
  .cm84-zpanel .zhead{padding:10px 14px 8px;border-bottom:1px solid var(--cm-line);font-size:12.5px;color:var(--cm-sub)}
  /* 묶음 L85: 화면 전체 지도 */
  .l85-map .cm84{height:100%;display:flex;flex-direction:column}
  .l85-map .cm84-bar{margin:0;padding:6px 12px;border-bottom:1px solid var(--cm-line);background:#fff}
  .l85-map .cm84-main{flex:1;height:auto;min-height:0;border:0;border-radius:0}
  @media (max-width:767px){
    .cm84-main{height:calc(100dvh - 210px);min-height:460px;flex-direction:column}
    .cm84-panel{position:absolute;left:0;right:0;bottom:0;width:auto;max-width:none;height:${SHEET_HALF};border-left:0;border-top:1px solid var(--cm-line);border-radius:14px 14px 0 0;box-shadow:0 -4px 16px rgba(0,0,0,.18);z-index:400;transition:height .18s}
    .cm84-panel.full{height:100%;border-radius:0}
    .cm84-rz{display:none}
    .cm84-ph .sz{display:inline-block;margin-left:auto}
    .cm84-ph a{display:none}
    .cm84-ph .fs{font-size:11.5px;padding:5px 7px}
    .cm84-panel.fsv .cm84-ph a{display:none}
    .cm84-basis{margin-left:0;width:100%;flex-basis:100%;text-align:left}
    .cm84-bb b{font-size:13px}
    .cm84-search{width:calc(100% - 86px)}
    .cm84-search .tb{padding:0 8px}
    .cm84-search .tb .tx{display:none}
    .cm84.l88 .cm84-search .tb.more{display:block}
    .cm84.l88 .cm84-search #cm84Fav,.cm84.l88 .cm84-search #cm84Xls{display:none}
    .l85-map .cm84-legend{font-size:10.5px;gap:2px 8px}
    .l85-map .cm84-bar{padding:4px 10px;gap:2px 8px}
    .l85-map .cm84-basis{font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cm84.l87 .cm84-panel{height:${L87CFG.sheetH}}
    .cm84.l87 .cm84-panel.full{height:100%}
    .cm84-rc{width:calc(100% - 20px)}
    .cm84.l87 .cm84-ph{gap:5px;padding:8px 10px;flex-wrap:nowrap}
    .cm84.l87 .cm84-ph h2{font-size:17px;flex:1 1 auto}
    .cm84.l87 .cm84-ph .tx{display:none}
    .cm84.l87 .cm84-ph .sz{margin-left:0}
    .cm84.l87 .cm84-ph button{padding:5px 7px}
    .cm84-panel.twv{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;z-index:3000!important;border-radius:0!important}
    .cm84-zpanel{position:absolute;left:0;right:0;bottom:0;width:auto;height:${L87CFG.sheetH};border-left:0;border-top:1px solid var(--cm-line);border-radius:14px 14px 0 0;box-shadow:0 -4px 16px rgba(0,0,0,.18);z-index:401}
    .cm84-zpanel.full{height:100%;border-radius:0}
    .cm84-main.both .cm84-ph .zt{display:inline-block}
    .cm84-main.both .cm84-panel.back,.cm84-main.both .cm84-zpanel.back{display:none}
  }`;

  // 묶음 L85_LEFT(L85 보충): PC에서 단지 패널을 왼쪽에(검색창 바로 아래로 이어지게), 넓이 손잡이는 패널 오른쪽 끝. 폰은 그대로 아래 시트
  const leftPanelOn = () => { try { return !!(typeof BUNDLES !== 'undefined' && BUNDLES.L85_LEFT); } catch (e) { return false; } };
  let mainEl = null, zpanel = null;
  // 묶음 L87: 켜짐 여부(지도 중심 화면 L85 위에서만). 끄면(setBundles({L87:false})) L85·L86 화면 그대로
  const l87 = () => { try { return !!(typeof BUNDLES !== 'undefined' && BUNDLES.L87 && BUNDLES.L85 && isL85()); } catch (e) { return false; } };
  function syncL87(){ if (root && root.firstElementChild){ root.firstElementChild.classList.toggle('l87', l87()); root.firstElementChild.classList.toggle('l88', l88()); root.firstElementChild.classList.toggle('l89', l89()); root.firstElementChild.classList.toggle('l91', l91()); root.firstElementChild.classList.toggle('l92', l92()); } syncFltBtn(); }
  // 묶음 L88: 켜짐 여부(L87 위에서만). 끄면(setBundles({L88:false})) 말풍선 정보 줄·필터 없이 L87 그대로
  const l88 = () => { try { return !!(BUNDLES.L88 && l87()); } catch (e) { return false; } };
  // 묶음 L89: 켜짐 여부(L88 위에서만). 끄면(setBundles({L89:false})) L88 화면 그대로
  const l89 = () => { try { return !!(BUNDLES.L89 && l88()); } catch (e) { return false; } };
  let root = null, mapEl = null, panel = null, map = null, NV = null, built = false, started = false, ready = false;
  let items = [], itemsById = new Map(), marks = [], selId = null, lt = null, pendingOpen = null, failTimer = null;
  const cache = new Map();

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const eok = (man) => man == null ? '' : (Math.round(man / 100) / 100).toString() + '억';
  const isL85 = () => document.body.classList.contains('l85');
  function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function addFont(){ if (document.getElementById('cm84Font')) return; const l = document.createElement('link'); l.id = 'cm84Font'; l.rel = 'stylesheet'; l.href = FONT_URL; document.head.appendChild(l); }
  const resize = () => { if (map) { map.setSize(new NV.Size(mapEl.clientWidth, mapEl.clientHeight)); drawAll(); } };

  function build(sec){
    root = sec; built = true;
    const st = document.createElement('style'); st.id = 'cm84Css'; st.textContent = CSS; document.head.appendChild(st);
    const l85 = isL85();
    sec.innerHTML = `<div class="cm84">
      <div class="cm84-bar"><div class="cm84-legend" id="cm84Legend"></div><span class="cm84-basis" id="cm84Basis">가격 34평 기준</span></div>
      <div class="cm84-main${leftPanelOn() ? ' left84' : ''}">
        <div class="cm84-search" id="cm84Search"><div class="qbox"><input id="cm84Q" type="search" placeholder="단지명·동 이름으로 찾기" autocomplete="off" aria-label="단지 검색"><button type="button" class="qx" id="cm84Qx" aria-label="지우기" hidden>✕</button></div>
          ${l85 ? '<button type="button" class="tb flt" id="cm84Flt" aria-pressed="false" aria-haspopup="dialog" hidden>필터<b></b></button>' : ''}
          ${l85 ? '<button type="button" class="tb" id="cm84Fav" title="즐겨찾기 목록">⭐<span class="tx"> 즐겨찾기</span></button><button type="button" class="tb" id="cm84Xls" title="엑셀 파일로 단지 넣기">📂<span class="tx"> 엑셀</span></button>'
            + '<button type="button" class="tb more" id="cm84More" aria-haspopup="menu" aria-expanded="false" aria-label="더보기">⋯</button>' : ''}
          <div class="cm84-ac" id="cm84Ac" role="listbox" hidden></div>${l85 ? '<div class="cm84-mm" id="cm84Mm" role="menu" hidden><button type="button" role="menuitem" data-mm="cm84Fav">⭐ 즐겨찾기</button><button type="button" role="menuitem" data-mm="cm84Xls">📂 엑셀로 단지 넣기</button></div>' : ''}<div class="cm84-fp" id="cm84Fp" role="dialog" aria-label="필터" hidden></div></div>
        <div class="cm84-rc" id="cm84Rc" aria-label="최근 본 단지" hidden></div><div class="cm84-frow" id="cm84Frow" role="group" aria-label="지도 필터" hidden></div><div class="cm84-fd" id="cm84Fd" role="listbox" aria-label="필터 고르기" hidden></div>
        <div class="cm84-map" id="cm84Map"><div class="cm84-hint" id="cm84Hint" hidden></div>
        <div class="cm84-vbtns" aria-label="지도 위 버튼"><button type="button" id="cm84Zone" aria-pressed="false" hidden>재개발<br>구역</button>${SC.on() ? '<button type="button" id="cm84ScE" aria-pressed="false">초등<br>학구도</button><button type="button" id="cm84ScM" aria-pressed="false">중학교<br>학군</button>' : '<button type="button" disabled>학구도<small>준비 중</small></button><button type="button" disabled>학군<small>준비 중</small></button>'}${l92() ? '<button type="button" id="cm84Hide" aria-pressed="false" title="단지 가격 말풍선 숨기기">단지<br>숨기기</button>' : ''}</div></div>
        <aside class="cm84-panel" id="cm84Panel" aria-label="단지 진단"></aside><aside class="cm84-zpanel" id="cm84ZPanel" aria-label="재개발 구역"></aside></div></div>`;
    mapEl = sec.querySelector('#cm84Map'); panel = sec.querySelector('#cm84Panel'); mainEl = sec.querySelector('.cm84-main'); zpanel = sec.querySelector('#cm84ZPanel');
    syncL87();
    window.addEventListener('storage', (ev) => { if (!ev || ev.key === RECENT_KEY) renderRecent(); });
    root.querySelector('#cm84Legend').innerHTML = BAND.map(([t, , c]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('');
    try { const w = +localStorage.getItem(PANEL_W_KEY); if (w >= PANEL_W_MIN) mainEl.style.setProperty('--pw', w + 'px'); } catch (e) {}
    wireSearch(); wireResize(); wireFilter(); wireFrow();
    const fav = sec.querySelector('#cm84Fav'); if (fav) fav.addEventListener('click', () => { saveState(); setTopMode('favorites'); });
    const xls = sec.querySelector('#cm84Xls'); if (xls) xls.addEventListener('click', () => { if (typeof openClassicL85 === 'function') openClassicL85(); setTimeout(() => { const b = document.getElementById('singleUploadBtn'); if (b && !b.closest('[hidden]')) b.click(); }, 60); });
    sec.querySelector('#cm84Zone').addEventListener('click', toggleZones);
    const se = sec.querySelector('#cm84ScE'), sm = sec.querySelector('#cm84ScM'); if (se) se.addEventListener('click', () => toggleSchool('elem')); if (sm) sm.addEventListener('click', () => toggleSchool('mid'));   // 지도 1-3
    const hb = sec.querySelector('#cm84Hide'); if (hb) hb.addEventListener('click', toggleHideCx);   // 묶음 L92
    wireMore();
  }
  // 묶음 L88: 폰 [⋯ 더보기] — 고르면 숨겨 둔 원래 버튼(⭐ 즐겨찾기·📂 엑셀)을 그대로 누름
  function wireMore(){
    const b = root.querySelector('#cm84More'), mm = root.querySelector('#cm84Mm'); if (!b || !mm) return;
    const shut = () => { mm.hidden = true; b.setAttribute('aria-expanded', 'false'); };
    b.addEventListener('click', (ev) => { ev.stopPropagation(); const fp = root.querySelector('#cm84Fp'); if (fp) fp.hidden = true; if (mm.hidden){ mm.hidden = false; b.setAttribute('aria-expanded', 'true'); } else shut(); });
    mm.addEventListener('click', (ev) => { const it = ev.target.closest('[data-mm]'); if (!it) return; ev.stopPropagation(); shut(); const o = root.querySelector('#' + it.dataset.mm); if (o) o.click(); });
    document.addEventListener('click', (ev) => { if (!mm.hidden && !(ev.target.closest && ev.target.closest('#cm84Mm'))) shut(); });
  }
  function err(msg){ const e = document.createElement('div'); e.className = 'cm84-err'; e.innerHTML = msg; mapEl.appendChild(e); }
  // 지도를 못 띄우면: 지도 중심 화면(L85)은 진단 화면으로 바꾸고, 지도 탭(L84)은 안내만
  function fail(why, msg){
    clearTimeout(failTimer); if (ready && why !== 'auth') return;
    window.CALC_MAP_L84.failed = why;
    if (typeof onMapFailL85 === 'function' && onMapFailL85(why)) return;
    err(msg || '지도를 불러오지 못했어요. 인터넷 연결을 확인하고 탭을 다시 눌러 주세요.');
  }

  // ---------- 자료 ----------
  // 묶음 L86: 시세 이력을 미룬 첫 화면이면 가벼운 지도 파일(map_light.js — 좌표·현재가·화면 판정·검색 이름)로 그린다.
  // 그 파일을 못 받으면 시세 이력을 바로 받아 예전 방식(좌표 파일 + 계산)으로 그린다.
  const LIGHT_URL = 'map_light.js';
  const lightMode = () => !!window.DEFER_SEED_L86;
  const seedsPending = () => typeof seedPendingL86 === 'function' && seedPendingL86();
  let LIGHT = null;
  function useLight(L){
    LIGHT = L;
    L.cx.forEach(r => { const s = L.s[r[0]]; if (!s) return; const id = s[0] || s[1];
      const it = { id, name: s[1], region: s[4] || '', lat: r[1] / 1e5, lng: r[2] / 1e5, units: s[5] || 0, built: s[6] || null, light: { p: r[5], cur: r[3], badge: L.bands[r[4]], fair: r[6] == null ? null : r[6] },
        l25: r.length > 7 ? { p: 25, cur: r[7], badge: L.bands[r[8]], fair: r[9] == null ? null : r[9] } : null };   // 묶음 L89: 34평 단지의 25평 칸(가벼운 파일 v4)
      items.push(it); itemsById.set(id, it); });
  }
  function loadCoordsAndSeedItems(){
    return Promise.all(COORD_URLS.map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); }))).then(cs => {
      cs.forEach(c => Object.entries(c).forEach(([id, v]) => {
        if (id === '_meta' || itemsById.has(id) || !Array.isArray(v)) return; const e = seedEntryById(id); if (!e) return;
        const it = { id, name: e.name, lat: v[0], lng: v[1], units: e.units || v[3] || 0, built: e.builtYear || null }; items.push(it); itemsById.set(id, it);
      }));
    });
  }
  function loadData(){
    const coords = lightMode()
      ? loadScript(typeof assetUrlL52 === 'function' ? assetUrlL52(LIGHT_URL) : LIGHT_URL).then(() => { if (!window.MAP_LIGHT || !window.MAP_LIGHT.cx) throw new Error('light'); useLight(window.MAP_LIGHT); })
          .catch(() => new Promise((res, rej) => { window.CALC_MAP_L84.lightFailed = true; whenSeedsL86(ok => ok ? loadCoordsAndSeedItems().then(res, rej) : rej(new Error('seed'))); }))
      : loadCoordsAndSeedItems();
    const naver = loadScript(MAP_CONFIG_URL).then(() => {
      const id = (window.MAP_CONFIG || {}).naverClientId; if (!id) throw new Error('config');
      window.navermap_authFailure = () => fail('auth', '네이버 지도 인증에 실패했어요.<br><span style="font-size:12px">네이버 클라우드 콘솔의 Web 서비스 URL에 이 주소가 등록돼 있는지 확인해 주세요.</span>');
      return loadScript('https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(id));
    });
    return Promise.all([coords, naver]).then(() => {
      if (!window.naver || !window.naver.maps) throw new Error('naver');
      items.sort((a, b) => (b.units || 0) - (a.units || 0));   // 겹치면 세대수 큰 단지 먼저
      window.CALC_MAP_L84.stats = { items: items.length, seed: (window.SEED_COMPLEXES || []).length, light: !!LIGHT };
    });
  }
  const infoOf = (it) => info(it);   // drawCx 안에서는 info가 '정보 줄 보이기' 변수라 별칭으로 부름
  // 한 단지의 말풍선 값(34평, 34평 시세가 없으면 25평) — 우리 단지 진단하기와 같은 계산(묶음 L86: 가벼운 파일이면 미리 계산한 값 그대로)
  function info(it){
    if (it.light) return it.light;
    if (cache.has(it.id)) return cache.get(it.id);
    let out = null;
    try {
      const e = seedEntryById(it.id); let p = 34, text = e && e.text, nm = e && e.name;
      if (!text && typeof SEED25_BY_ID !== 'undefined' && SEED25_BY_ID.get(it.id)){ p = 25; text = SEED25_BY_ID.get(it.id).text; nm = e.name + PYEONG25_SUFFIX; }
      if (text){
        const c = buildComplex(text, nm, nm); c._pyeong = p;
        if (c.rows.length){
          const r = computeSlot(getVirtualBenchmarkComplex(pickBenchGroupForTarget(stripPyeongSuffix(nm)).groupKey), c);
          if (!r.error){ const v = badgeViewL61(r.diag); out = { p, cur: r.curSalePrice, badge: v.text }; }
        }
      }
    } catch (e) { out = null; }
    cache.set(it.id, out); return out;
  }
  // 묶음 L89: 고른 평형(34·25)의 값 — 그 평형 칸이 없으면 null(지도에서 숨김). 우리 단지 진단하기의 그 평형과 같은 계산
  function infoP(it, p){
    if (it.light) return it.light.p === p ? it.light : (p === 25 ? it.l25 : null);
    const k = it.id + '|' + p; if (cache.has(k)) return cache.get(k);
    let out = null;
    try {
      const e = seedEntryById(it.id); let text = null, nm = null;
      if (p === 34 && e){ text = e.text; nm = e.name; }
      else if (p === 25 && e && typeof SEED25_BY_ID !== 'undefined' && SEED25_BY_ID.get(it.id)){ text = SEED25_BY_ID.get(it.id).text; nm = e.name + PYEONG25_SUFFIX; }
      if (text){
        const c = buildComplex(text, nm, nm); c._pyeong = p;
        if (c.rows.length){ const r = computeSlot(getVirtualBenchmarkComplex(pickBenchGroupForTarget(stripPyeongSuffix(nm)).groupKey), c); if (!r.error){ const v = badgeViewL61(r.diag); out = { p, cur: r.curSalePrice, badge: v.text }; } }
      }
    } catch (e) { out = null; }
    cache.set(k, out); return out;
  }
  // 말풍선에 쓰는 값: 평형을 안 골랐으면 지금처럼(34평, 없으면 25평). keep = 누른 단지(그 평형이 없어도 말풍선은 보임)
  function shownInfo(it, keep){ const p = l89() && FLT.py; if (!p) return info(it); return infoP(it, p) || (keep ? info(it) : null); }
  function bandOf(badge){
    if (badge === '저평가') return BAND[0]; if (badge === '적정') return BAND[1]; if (badge === '주의') return BAND[2]; if (badge === '고평가') return BAND[3];
    if (badge === '고평가 보류') return BAND[4]; if (badge === HOLD_LABEL_L80 || badge === '판단 보류') return BAND[5]; return BAND[6];
  }

  // ---------- 말풍선 ----------
  function infoText(it){ return [it.units ? Number(it.units).toLocaleString('ko-KR') + '세대' : '', it.built ? it.built + '년' : ''].filter(Boolean).join(' · '); }
  // 묶음 L96: 말풍선 이름표 2줄 "882세대 / 15년차(2011)" — 지도 파일에 있는 값만(없으면 그 항목만 뺌, 둘 다 없으면 2줄 없음), 연차는 계산기와 같은 기준 연도
  function nmSubL96(it){
    const u = Number(it.units), b = Number(it.built), a = b ? baseYear() - b : NaN;
    return [u > 0 ? u.toLocaleString('ko-KR') + '세대' : '', b > 0 && a >= 0 ? a + '년차(' + b + ')' : ''].filter(Boolean).join(' / ');
  }
  function nmTipL96(it){ const s = nmSubL96(it); return '<span class="nmt"><span class="n1">' + esc(it.name) + '</span>' + (s ? '<span class="n2">' + esc(s) + '</span>' : '') + '</span>'; }
  function bubble(it, f, detail, info){
    const [, , col] = bandOf(f.badge), price = eok(f.cur) + (f.p === 25 ? '<small style="font-size:9.5px;color:#6B7280;margin-left:1px">25평</small>' : '');
    const inf = info ? infoText(it) : '';
    const body = detail ? `<span class="col"><b>${price}</b><span class="nm">${esc(it.name)}</span>${inf ? `<span class="if">${esc(inf)}</span>` : ''}</span>` : `<b>${price}</b>`;
    const tg = detail ? rtTagHtml(rtTagOf(it.id)) : '';   // 지도 1-2: 단지 이름이 보이는 단계부터 실거래 꼬리표(±7%·3건을 넘을 때만)
    return `<div class="cm84-bb${it.id === selId ? ' sel' : ''}" style="--b:${col}"${l96() ? ` data-nm="${esc(it.name)}"` : ''}><span class="bd"></span><span class="tx">${body}${tg}</span>${l96() ? nmTipL96(it) : ''}</div>`;
  }
  function boxOf(it, f, detail, info){   // 겹침 판단용 크기(글자 수로 어림 — 말풍선은 글자에 맞춰 늘어나므로 넘치지 않음)
    const t = eok(f.cur).length * 7.4 + (f.p === 25 ? 18 : 0); const nm = detail ? Math.min(96, it.name.length * 9) : 0;
    const inf = info ? Math.min(112, infoText(it).length * 5.6) : 0;
    return [20 + Math.max(t, nm, inf) + (detail && rtTagOf(it.id) ? 44 : 0), detail ? (info && infoText(it) ? 47 : 36) : 22];   // 정보 줄이 있으면 약 1/3 높게, 실거래 꼬리표는 옆으로
  }
  function view(){
    const b = map.getBounds(), sw = b.getSW(), ne = b.getNE(), proj = map.getProjection();
    return { sw, ne, proj, oNE: proj.fromCoordToOffset(ne), oSW: proj.fromCoordToOffset(sw), padLat: (ne.lat() - sw.lat()) * .05, padLng: (ne.lng() - sw.lng()) * .05 };
  }
  const inView = (v, y, x) => !(y < v.sw.lat() - v.padLat || y > v.ne.lat() + v.padLat || x < v.sw.lng() - v.padLng || x > v.ne.lng() + v.padLng);
  // 묶음 L92: [단지 숨기기] — 켜면 단지 가격 말풍선(자치구·시 말풍선, 꼬리표 포함)만 지도에서 뺀다. 학교 이름표·학구·학군·재개발 구역은 그대로
  let cxHidden = false;
  function toggleHideCx(){
    cxHidden = !cxHidden; const b = root.querySelector('#cm84Hide');
    if (b){ b.setAttribute('aria-pressed', String(cxHidden)); b.innerHTML = cxHidden ? '단지<br>보이기' : '단지<br>숨기기'; b.title = cxHidden ? '단지 가격 말풍선 다시 보이기' : '단지 가격 말풍선 숨기기'; }
    window.CALC_MAP_L84.cxHidden = cxHidden; drawCx();
  }
  function drawCx(){
    if (!map) return;
    marks.forEach(m => m.setMap(null)); marks = [];
    const zm = map.getZoom(), hint = root.querySelector('#cm84Hint');
    syncL87();
    if (cxHidden && l92()){ hint.hidden = true; window.CALC_MAP_L84.last = { zoom: zm, shown: 0, hidden: true, W: mapEl.clientWidth, H: mapEl.clientHeight }; return; }   // 묶음 L92: 단지 숨김
    const Z = ZM();   // 묶음 L89: 확대 단계 설정 한 곳
    if (l87() && zm < Z.dist){ hint.hidden = true; drawDistricts(); return; }
    if (zm < Z.cx){ hint.textContent = '지도를 확대하면 단지 가격이 보여요'; hint.hidden = false; return; }
    hint.hidden = true;
    const v = view(), detail = zm >= Z.detail, info = detail && l88() && zm >= Z.info, boxes = [], t0 = performance.now();
    const sel = selId ? itemsById.get(selId) : null;
    const list = sel ? [sel].concat(items.filter(x => x !== sel)) : items;
    for (const it of list){
      if (!inView(v, it.lat, it.lng)) continue;
      const f = shownInfo(it, it === sel); if (!f || f.cur == null) continue;   // 묶음 L89: 고른 평형 값(없으면 숨김)
      if (it !== sel && !passFilter(it, f)) continue;   // 묶음 L88: 필터(누른 단지는 늘 보임)
      const pt = v.proj.fromCoordToOffset(new NV.LatLng(it.lat, it.lng));
      const x = pt.x - v.oSW.x, y = pt.y - v.oNE.y; const [w, h] = boxOf(it, f, detail, info);
      const bx = { l: x - w / 2, r: x + w / 2, t: y - h - 7, b: y };
      if (it !== sel && boxes.some(q => !(bx.r < q.l || bx.l > q.r || bx.b < q.t || bx.t > q.b))) continue;
      boxes.push(bx);
      const m = new NV.Marker({ map, position: new NV.LatLng(it.lat, it.lng), zIndex: it === sel ? 300 : 60, title: l96() ? '' : it.name, icon: { content: bubble(it, f, detail, info), anchor: new NV.Point(0, 0) } });
      NV.Event.addListener(m, 'click', () => openPanel(it, l89() ? f.p : undefined));   // 묶음 L89: 고른 평형으로 연다
      marks.push(m);
    }
    window.CALC_MAP_L84.last = { zoom: zm, shown: marks.length, info, flt: fltCount(), ms: Math.round(performance.now() - t0), W: mapEl.clientWidth, H: mapEl.clientHeight };
  }
  function drawAll(){ drawCx(); drawZones(); if (SC.on()) drawSchool(); }   // 지도 1-3: 학구도

  // ---------- 묶음 L88: 연식·세대수 필터 ----------
  // 연식 = 계산기 나이 규칙(L76: seed 시세 기준월의 연도 − 준공연도). 연식은 여러 개(어느 하나라도 맞으면), 세대수는 하나.
  // 단지 자료가 어디서 왔든(KB 시세 단지, 나중의 실거래만 단지) it.units·it.built 두 칸만 보면 같은 필터를 따른다 — 칸이 없으면 그 조건에서 빠짐.
  // 같은 창에서 기억(sessionStorage — 새로고침해도 유지, 창을 닫으면 초기화), 주소에도 남김(&연식=5,10&세대=1000 — 공유하면 같은 필터).
  // 검색창 결과·최근 본 단지·주소로 연 단지는 필터와 상관없이 열린다(누른 단지 말풍선은 늘 보임).
  const AGE_OPTS = [['5', '5년 이내', (a) => a <= 5], ['10', '10년 이내', (a) => a <= 10], ['20', '20년 이내', (a) => a <= 20], ['20-30', '20~30년', (a) => a > 20 && a < 30], ['30이상', '30년 이상', (a) => a >= 30]];
  // 묶음 L89: 평형(하나)·가격(하나) 추가 — 주소 &지도평형=25&가격=6-9('평형'은 단지를 25평으로 여는 주소 칸이라 겹치지 않게 '지도평형')
  const FLT_KEY = 'calcMapFilterL88', FLT_AGE = '연식', FLT_UNITS = '세대', FLT_PY = '지도평형', FLT_PRICE = '가격';
  function cleanFilter(o){
    const age = (Array.isArray(o && o.age) ? o.age : []).filter(k => AGE_OPTS.some(x => x[0] === k)); const u = +(o && o.units) || 0;
    const py = +(o && o.py) || 0, pr = String((o && o.price) || '');
    return { age: AGE_OPTS.map(x => x[0]).filter(k => age.includes(k)), units: L88CFG.units.includes(u) ? u : 0, py: L89CFG.pyeongs.some(x => x[0] === py) ? py : 0, price: L89CFG.prices.some(x => x[0] === pr) ? pr : '' };
  }
  function readFilter(){
    try { const q = new URLSearchParams(window.location.search || ''); if (q.has(FLT_AGE) || q.has(FLT_UNITS) || q.has(FLT_PY) || q.has(FLT_PRICE)) return cleanFilter({ age: String(q.get(FLT_AGE) || '').split(',').filter(Boolean), units: q.get(FLT_UNITS), py: q.get(FLT_PY), price: q.get(FLT_PRICE) }); } catch (e) {}
    try { return cleanFilter(JSON.parse(sessionStorage.getItem(FLT_KEY) || '{}')); } catch (e) { return cleanFilter({}); }
  }
  let FLT = readFilter();
  const fltCount = () => l88() ? FLT.age.length + (FLT.units ? 1 : 0) + (l89() ? (FLT.py ? 1 : 0) + (FLT.price ? 1 : 0) : 0) : 0;
  const fltSig = () => fltCount() ? '|' + FLT.age.join(',') + '|' + FLT.units + (l89() ? '|' + FLT.py + '|' + FLT.price : '') : '';
  function writeFilter(){
    try { sessionStorage.setItem(FLT_KEY, JSON.stringify(FLT)); } catch (e) {}
    try {
      const u = new URL(window.location.href), q = u.searchParams;
      if (FLT.age.length) q.set(FLT_AGE, FLT.age.join(',')); else q.delete(FLT_AGE);
      if (FLT.units) q.set(FLT_UNITS, String(FLT.units)); else q.delete(FLT_UNITS);
      if (l89() && FLT.py) q.set(FLT_PY, String(FLT.py)); else q.delete(FLT_PY);
      if (l89() && FLT.price) q.set(FLT_PRICE, FLT.price); else q.delete(FLT_PRICE);
      window.history.replaceState(window.history.state, '', u.pathname + (q.toString() ? '?' + q.toString() : '') + u.hash);
    } catch (e) {}
  }
  function baseYear(){
    try { if (Array.isArray(window.SEED_COMPLEXES) && typeof ageBaseYearL76 === 'function') return ageBaseYearL76(); } catch (e) {}
    if (LIGHT && LIGHT.meta && LIGHT.meta.month) return +String(LIGHT.meta.month).slice(0, 4);   // 시세 이력 전: 가벼운 파일의 기준월(같은 seed의 같은 달)
    return new Date().getFullYear();
  }
  function passFilter(it, f){
    if (!fltCount()) return true;
    if (FLT.units && !((it.units || 0) >= FLT.units)) return false;
    if (FLT.age.length){ if (!it.built) return false; const a = baseYear() - it.built; if (!FLT.age.some(k => AGE_OPTS.find(x => x[0] === k)[2](a))) return false; }
    if (l89() && (FLT.py || FLT.price)){   // 묶음 L89: 고른 평형 칸이 있어야 하고, 가격은 그 평형의 KB 현재가
      const g = f || shownInfo(it); if (!g || g.cur == null) return false;
      if (FLT.price){ const b = L89CFG.prices.find(x => x[0] === FLT.price); if (b && !(g.cur > b[2] && g.cur <= b[3])) return false; }
    }
    return true;
  }
  function syncFltBtn(){
    const b = root && root.querySelector('#cm84Flt'); if (!b) return;
    b.hidden = !l88() || l89(); const n = fltCount();   // 묶음 L89: [필터] 버튼·창 대신 늘 보이는 필터 줄
    const fr = root.querySelector('#cm84Frow'); if (fr){ fr.hidden = !l89(); if (mainEl) mainEl.classList.toggle('fron', l89()); if (l89()) renderFrow(); }
    b.querySelector('b').textContent = n ? String(n) : ''; b.setAttribute('aria-pressed', String(n > 0)); b.title = n ? '필터 ' + n + '개 걸림' : '연식·세대수 필터';
    if (!l88()){ const fp = root.querySelector('#cm84Fp'); if (fp) fp.hidden = true; }
  }
  function renderFilter(){
    const fp = root.querySelector('#cm84Fp'); if (!fp) return;
    const hit = items.filter(passFilter).length;
    fp.innerHTML = `<div class="fh">연식<small>여러 개 고를 수 있어요 · ${baseYear()}년 기준</small></div><div class="ch">${AGE_OPTS.map(([k, t]) => `<button type="button" data-fa="${k}" aria-pressed="${FLT.age.includes(k)}">${esc(t)}</button>`).join('')}</div>`
      + `<div class="fh">세대수</div><div class="ch">${L88CFG.units.map(u => `<button type="button" data-fu="${u}" aria-pressed="${FLT.units === u}">${u ? u.toLocaleString('ko-KR') + ' 이상' : '전체'}</button>`).join('')}</div>`
      + `<div class="fb"><span class="fn">지도에 보일 단지 ${hit.toLocaleString('ko-KR')}곳</span><button type="button" data-fr="1">초기화</button><button type="button" data-fx="1">닫기</button></div>`;
  }
  function setFilter(next){
    FLT = cleanFilter(next); writeFilter(); syncFltBtn(); renderFilter(); drawAll(); syncBasis();
    window.CALC_MAP_L84.filter = { age: FLT.age.slice(), units: FLT.units, py: FLT.py, price: FLT.price, count: fltCount() };
    // 묶음 L89: 25평을 골랐는데 시세 이력 화면에서 25평 파일을 아직 안 받았으면 받은 뒤 다시 그림(가벼운 파일이면 이미 있음)
    if (l89() && FLT.py === 25 && !LIGHT && typeof loadSeed25 === 'function' && typeof seed25State !== 'undefined' && seed25State !== 'loaded'){
      loadSeed25().then(() => { [...cache.keys()].filter(k => /\|25$/.test(k)).forEach(k => cache.delete(k)); groupsBy.clear(); drawAll(); }, () => {});
    }
  }
  // 묶음 L89: 지도 위 기준 줄(가격 ○평 기준)
  function syncBasis(){
    const el = root && root.querySelector('#cm84Basis'); if (!el || !ready) return;
    const head = l89() && FLT.py ? '가격 ' + FLT.py + '평 기준(' + FLT.py + '평 칸이 없는 단지는 숨김)' : '가격 34평 기준(34평 시세가 없는 단지는 25평)';
    el.textContent = head + ' · ' + seedMonthText() + ' 시세 · 좌표 있는 단지 ' + items.length.toLocaleString('ko-KR') + '곳';
  }
  // ---------- 묶음 L89: 늘 보이는 필터 줄 [연식▾][세대수▾][가격▾][평형▾][초기화] — 누르면 그 자리에서 작게 펼침, 고른 값이 버튼에 ----------
  let frowOpen = '';
  function frowLabel(k){
    if (k === 'age') return FLT.age.length ? AGE_OPTS.find(x => x[0] === FLT.age[0])[1] + (FLT.age.length > 1 ? ' 외 ' + (FLT.age.length - 1) : '') : '연식';
    if (k === 'units') return FLT.units ? FLT.units.toLocaleString('ko-KR') + '세대↑' : '세대수';
    if (k === 'price') return FLT.price ? L89CFG.prices.find(x => x[0] === FLT.price)[1] : '가격';
    return FLT.py ? L89CFG.pyeongs.find(x => x[0] === FLT.py)[1] : '평형';
  }
  const FROW_KEYS = [['age', '연식'], ['units', '세대수'], ['price', '가격'], ['py', '평형']];
  const frowOn = (k) => k === 'age' ? FLT.age.length > 0 : k === 'units' ? !!FLT.units : k === 'price' ? !!FLT.price : !!FLT.py;
  function renderFrow(){
    const el = root && root.querySelector('#cm84Frow'); if (!el) return;
    el.innerHTML = FROW_KEYS.map(([k, t]) => `<button type="button" class="fb" data-fk="${k}" aria-haspopup="listbox" aria-expanded="${frowOpen === k}" aria-pressed="${frowOn(k)}" title="${esc(t)}">${esc(frowLabel(k))}<i>▾</i></button>`).join('')
      + `<button type="button" class="fz" data-fz="1"${fltCount() ? '' : ' disabled'}>초기화</button>`;
    renderFdrop();
  }
  function renderFdrop(){
    const d = root.querySelector('#cm84Fd'), el = root.querySelector('#cm84Frow'); if (!d || !el) return;
    if (!frowOpen){ d.hidden = true; return; }
    const opt = (attr, v, t, on) => `<button type="button" role="option" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(t)}</button>`;
    let h = '';
    if (frowOpen === 'age') h = `<div class="fdh">여러 개 고를 수 있어요 · ${baseYear()}년 기준</div>` + AGE_OPTS.map(([k, t]) => opt('data-fa', k, t, FLT.age.includes(k))).join('');
    else if (frowOpen === 'units') h = L88CFG.units.map(u => opt('data-fu', u, u ? u.toLocaleString('ko-KR') + '세대 이상' : '전체', FLT.units === u)).join('');
    else if (frowOpen === 'price') h = `<div class="fdh">${FLT.py ? FLT.py + '평' : '보이는 평형'} KB 현재가</div>` + opt('data-fp', '', '전체', !FLT.price) + L89CFG.prices.map(([k, t]) => opt('data-fp', k, t, FLT.price === k)).join('');
    else h = opt('data-fy', 0, '기본(34평, 없으면 25평)', !FLT.py) + L89CFG.pyeongs.map(([p, t]) => opt('data-fy', p, t, FLT.py === p)).join('');
    const hit = items.filter(it => passFilter(it)).length;
    d.innerHTML = h + `<div class="fdn">지도에 보일 단지 ${hit.toLocaleString('ko-KR')}곳</div>`;
    const b = el.querySelector(`[data-fk="${frowOpen}"]`), mr = mainEl.getBoundingClientRect(), br = b ? b.getBoundingClientRect() : mr;
    d.style.left = Math.max(6, Math.min(br.left - mr.left, mainEl.clientWidth - 236)) + 'px'; d.style.top = (br.bottom - mr.top + 4) + 'px';
    d.hidden = false;
  }
  function wireFrow(){
    const el = root.querySelector('#cm84Frow'), d = root.querySelector('#cm84Fd'); if (!el || !d) return;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation(); const b = ev.target.closest('[data-fk]');
      if (b){ frowOpen = frowOpen === b.dataset.fk ? '' : b.dataset.fk; renderFrow(); return; }
      if (ev.target.closest('[data-fz]')){ frowOpen = ''; setFilter({}); }
    });
    el.addEventListener('scroll', () => { if (frowOpen) renderFdrop(); });
    d.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const a = ev.target.closest('[data-fa]'), u = ev.target.closest('[data-fu]'), p = ev.target.closest('[data-fp]'), y = ev.target.closest('[data-fy]');
      const cur = { age: FLT.age, units: FLT.units, py: FLT.py, price: FLT.price };
      if (a){ const k = a.dataset.fa; cur.age = FLT.age.includes(k) ? FLT.age.filter(x => x !== k) : FLT.age.concat(k); setFilter(cur); return; }   // 연식은 여러 개 — 펼친 채로
      if (u) cur.units = +u.dataset.fu; else if (p) cur.price = p.dataset.fp; else if (y) cur.py = +y.dataset.fy; else return;
      frowOpen = ''; setFilter(cur);
    });
    document.addEventListener('click', (ev) => { if (frowOpen && !(ev.target.closest && (ev.target.closest('#cm84Fd') || ev.target.closest('#cm84Frow')))){ frowOpen = ''; renderFrow(); } });
  }
  function wireFilter(){
    const b = root.querySelector('#cm84Flt'), fp = root.querySelector('#cm84Fp'); if (!b || !fp) return;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (fp.hidden){ renderFilter(); fp.hidden = false; } else fp.hidden = true; });
    fp.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const a = ev.target.closest('[data-fa]'), u = ev.target.closest('[data-fu]');
      if (a){ const k = a.dataset.fa, age = FLT.age.includes(k) ? FLT.age.filter(x => x !== k) : FLT.age.concat(k); setFilter({ age, units: FLT.units }); }
      else if (u) setFilter({ age: FLT.age, units: +u.dataset.fu });
      else if (ev.target.closest('[data-fr]')) setFilter({});
      else if (ev.target.closest('[data-fx]')) fp.hidden = true;
    });
    document.addEventListener('click', (ev) => { if (!fp.hidden && !(ev.target.closest && ev.target.closest('#cm84Fp'))) fp.hidden = true; });
    syncFltBtn();
  }

  // ---------- 묶음 L87-1: 멀리 볼 때 자치구·시 말풍선(이름 + 단지 수). 누르면 그 구역으로 확대 → 단지 말풍선 ----------
  // 묶는 기준: 서울·인천은 구, 경기는 시(구가 있는 시도 시 하나로). sidoZoom 미만(더 멀리)이면 서울·인천은 하나로. 말풍선 자리는 그 묶음 단지 좌표의 가운데
  const groupsBy = new Map();
  function groupOf(city, dist){
    city = String(city || ''); dist = String(dist || '');
    if (city === '서울') return dist ? [city + ' ' + dist, dist, '서울'] : null;
    if (city === '인천') return dist ? [city + ' ' + dist, '인천 ' + dist, '인천'] : [city, '인천', '인천'];
    return city ? [city, city, city] : null;
  }
  function regionParts(it){
    if (it._g !== undefined) return it._g;
    let g = null;
    try {
      const e = typeof seedEntryById === 'function' && Array.isArray(window.SEED_COMPLEXES) ? seedEntryById(it.id) : null;
      if (e) g = groupOf(e.regionCity, e.district);
      else if (it.region){ const ps = it.region.split(' '); g = groupOf(ps[0], (ps[0] === '서울' || ps[0] === '인천') && /[구군]$/.test(ps[1] || '') ? ps[1] : ''); }
    } catch (e) {}
    it._g = g; return g;
  }
  function buildGroups(sido){
    const m = new Map();
    items.forEach(it => {
      const g0 = regionParts(it); if (!g0 || !passFilter(it)) return;   // 묶음 L88: 단지 수도 필터 기준
      const g = sido ? [g0[2], g0[2]] : g0;
      // 가격·판정은 가벼운 파일(L86)이면 미리 계산된 값, 아니면 막대를 켤 때만 계산(멀리 볼 때 3천여 단지를 다시 계산하지 않게)
      const need = !!it.light || L87CFG.distBar, f = need ? info(it) : null; if (need && (!f || f.cur == null)) return;
      let o = m.get(g[0]); if (!o){ o = { key: g[0], name: g[1], n: 0, y: 0, x: 0, bands: new Map(), s: 90, w: 180, nn: -90, e: -180 }; m.set(g[0], o); }
      o.n++; o.y += it.lat; o.x += it.lng; if (f){ const b = bandOf(f.badge)[2]; o.bands.set(b, (o.bands.get(b) || 0) + 1); }
      if (it.lat < o.s) o.s = it.lat; if (it.lat > o.nn) o.nn = it.lat; if (it.lng < o.w) o.w = it.lng; if (it.lng > o.e) o.e = it.lng;
    });
    const gs = [...m.values()].map(o => Object.assign(o, { y: o.y / o.n, x: o.x / o.n })).sort((a, b) => b.n - a.n);
    groupsBy.set((sido ? 'sido' : 'dist') + fltSig(), gs); return gs;
  }
  function distBubble(g, small){
    if (small) return `<div class="cm84-dg sm"><b>${esc(g.name)}</b></div>`;   // 묶음 L88: 서울 전체 단계 — 이름만 작게
    const bar = L87CFG.distBar ? '<span class="br">' + BAND.filter(b => g.bands.get(b[2])).map(b => `<i style="width:${(g.bands.get(b[2]) / g.n * 100).toFixed(1)}%;background:${b[2]}"></i>`).join('') + '</span>' : '';
    return `<div class="cm84-dg"><b>${esc(g.name)}</b><span>${g.n.toLocaleString('ko-KR')}</span>${bar}</div>`;
  }
  function drawDistricts(){
    const sido = map.getZoom() < L87CFG.sidoZoom, v = view(), t0 = performance.now(), gs0 = groupsBy.get((sido ? 'sido' : 'dist') + fltSig()) || buildGroups(sido), boxes = [];
    const small = !sido && l88() && map.getZoom() <= L88CFG.distSmallZoom;   // 묶음 L88: 이름만 작게, 겹치면 서울 구를 먼저 남김
    const shownNames = [], gs = small ? gs0.filter(g => g.key.startsWith('서울 ')).concat(gs0.filter(g => !g.key.startsWith('서울 '))) : gs0;
    gs.forEach(g => {
      if (!inView(v, g.y, g.x)) return;
      const pt = v.proj.fromCoordToOffset(new NV.LatLng(g.y, g.x)), x = pt.x - v.oSW.x, y = pt.y - v.oNE.y;
      const w = small ? 16 + g.name.length * 11.5 : 34 + g.name.length * 13 + String(g.n).length * 8, h = small ? 18 : L87CFG.distBar ? 34 : 26;
      const hit = b => boxes.some(q => !(b.r < q.l || b.l > q.r || b.b < q.t || b.t > q.b)), boxAt = (ox, oy) => ({ l: x + ox - w / 2, r: x + ox + w / 2, t: y + oy - h / 2, b: y + oy + h / 2, ox, oy });
      // 겹치면 단지가 많은 쪽 먼저. 묶음 L88 작은 이름(서울 구)만: 겹치면 위·아래·옆으로 한 칸 비켜 놓아 보고, 그래도 겹치면 뺀다(11-04: 중구·도봉구가 이웃 구에 가려짐)
      const tries = small && g.key.startsWith('서울 ') ? [[0, 0], [0, -(h + 2)], [0, h + 2], [-(w / 2 + 8), 0], [w / 2 + 8, 0]] : [[0, 0]];
      const bx = tries.map(([ox, oy]) => boxAt(ox, oy)).find(b => !hit(b));
      if (!bx) return;
      boxes.push(bx); shownNames.push(g.name);
      const m = new NV.Marker({ map, position: new NV.LatLng(g.y, g.x), zIndex: 70, title: g.name + ' 단지 ' + g.n + '곳', icon: { content: distBubble(g, small), anchor: new NV.Point(-bx.ox, -bx.oy) } });
      NV.Event.addListener(m, 'click', () => openGroup(g));
      marks.push(m);
    });
    window.CALC_MAP_L84.last = { zoom: map.getZoom(), shown: marks.length, dist: sido ? 'sido' : small ? 'small' : 'dist', names: shownNames, ms: Math.round(performance.now() - t0), W: mapEl.clientWidth, H: mapEl.clientHeight };
  }
  function openGroup(g){
    const dy = (g.nn - g.s) * .08, dx = (g.e - g.w) * .08;
    try { map.fitBounds(new NV.LatLngBounds(new NV.LatLng(g.s - dy, g.w - dx), new NV.LatLng(g.nn + dy, g.e + dx))); } catch (e) {}
    const Z = ZM(), sido = g.key === '서울' || g.key === '인천', z = map.getZoom(), want = sido ? L87CFG.sidoZoom : Z.open;   // 서울·인천 묶음을 누르면 구 말풍선 단계로
    if (l89() && !sido){ map.setCenter(new NV.LatLng(g.y, g.x)); map.setZoom(want); return; }   // 묶음 L89: 자치구·시를 누르면 바로 가격 말풍선 시작 단계로
    if (z < want || (want === L87CFG.sidoZoom && z >= Z.dist)){ map.setCenter(new NV.LatLng(g.y, g.x)); map.setZoom(want); }
  }

  // ---------- 검색창: 단지명·별칭·KB 원래 이름(L74)·동 이름 ----------
  function regionOf(e){ return e._region != null ? e._region : [e.regionCity, e.district, e.dong].filter(Boolean).join(' '); }
  // 묶음 L86: 시세 이력을 받기 전에는 가벼운 파일의 검색 사전으로 찾는다(이름·KB 원래 이름·별칭·동 이름 — 받은 뒤에는 계산기 검색 규칙)
  let lightEntries = null;
  function lightSearch(qq){
    if (!lightEntries) lightEntries = LIGHT.s.map(s => { const reg = s[4] || ''; return { id: s[0] || s[1], name: s[1], kbName: s[2] || null, als: s[3] || [], _region: reg, dong: reg.split(' ').pop() || '', units: s[5] || 0 }; });
    const norm = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(), nn = norm(qq), nq = qq.replace(/\s+/g, '');
    if (!nn) return [];
    const scored = [];
    lightEntries.forEach(e => {
      const names = [e.name, e.kbName].concat(e.als).filter(Boolean).map(norm);
      let r = null;
      if (names.some(n => n === nn)) r = 0; else if (names.some(n => n.startsWith(nn))) r = 1; else if (names.some(n => n.includes(nn))) r = 2;
      else if (nq.length >= 2 && e.dong && (e.dong === nq || e.dong.startsWith(nq) || (nq.endsWith('동') && e.dong.startsWith(nq.slice(0, -1))))) r = 3;
      if (r != null) scored.push([r, -e.units, e]);
    });
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return scored.slice(0, 30).map(x => x[2]);
  }
  function search(q){
    const qq = String(q || '').trim(); if (!qq) return [];
    if (LIGHT && seedsPending()) return lightSearch(qq);
    const seeds = window.SEED_COMPLEXES || [], nq = qq.replace(/\s+/g, '');
    const out = searchLibraryEntries(seeds, qq).slice(0, 20);   // 계산기 검색과 같은 규칙(이름·별칭·옛 이름)
    const has = new Set(out.map(e => e.id));
    // KB 원래 이름, 그리고 괄호·쉼표를 뺀 이름('상계주공3' → 상계주공(3단지))
    const norm = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(), nn = norm(qq);
    seeds.forEach(e => { if (out.length < 20 && !has.has(e.id) && nn && (norm(e.kbName).includes(nn) || norm(e.name).includes(nn))){ out.push(e); has.add(e.id); } });
    if (nq.length >= 2){   // 동 이름: '상계동'·'상계' 모두(세대수 큰 단지 먼저)
      const dong = seeds.filter(e => e.dong && !has.has(e.id) && (e.dong === nq || e.dong.startsWith(nq) || (nq.endsWith('동') && e.dong.startsWith(nq.slice(0, -1)))))
        .sort((a, b) => (b.units || 0) - (a.units || 0));
      dong.slice(0, Math.max(0, 30 - out.length)).forEach(e => { out.push(e); has.add(e.id); });
    }
    return out.slice(0, 30);
  }
  function wireSearch(){
    const q = root.querySelector('#cm84Q'), ac = root.querySelector('#cm84Ac'), qx = root.querySelector('#cm84Qx');
    let res = [], act = -1;
    const close = () => { ac.hidden = true; act = -1; };
    const render = () => {
      const v = q.value; qx.hidden = !v;
      if (!v.trim()){   // 빈 검색창: 최근 본 단지(묶음 L16 — 패널에서 본 단지도 같은 기록에 쌓임)
        let rec = []; try { rec = typeof recentViewItems === 'function' ? recentViewItems().filter(x => seedEntryById(x.id)).slice(0, 8) : []; } catch (e) {}
        if (!rec.length){ close(); return; }
        res = rec.map(x => Object.assign({}, seedEntryById(x.id), { _p: x.p })); act = -1;
        ac.innerHTML = '<div class="none">최근 본 단지</div>' + res.map((e, i) => `<button type="button" class="it" role="option" data-i="${i}"><b>${esc(e.name)}</b> <small style="display:inline">${e._p}평</small><small>${esc(regionOf(e))}</small></button>`).join('');
        ac.hidden = false; return;
      }
      res = search(v); act = res.length ? 0 : -1;
      if (RT.on()){ if (!KBL) loadKbless().then(j => { if (j && q.value === v) render(); }); else res = res.concat(kblessSearch(v.trim())); if (res.length && act < 0) act = 0; }   // 지도 1-2: KB 없는 단지(실거래만)
      // 모든 줄에 지역(시·구·동)을 함께 보여 같은 이름 단지를 구분
      ac.innerHTML = res.length ? res.map((e, i) => `<button type="button" class="it${i === act ? ' act' : ''}" role="option" data-i="${i}"><b>${esc(e.name)}</b>${e._kbl != null ? '<em class="kbl">실거래만</em>' : itemsById.has(e.id) ? '' : '<em>지도 위치 없음</em>'}<small>${esc(regionOf(e))}${e.units ? ' · ' + Number(e.units).toLocaleString('ko-KR') + '세대' : ''}</small></button>`).join('')
        : '<div class="none">찾는 단지가 없어요. 단지명이나 동 이름(예: 상계동)으로 찾아 보세요.</div>';
      ac.hidden = false;
    };
    const pick = (i) => { const e = res[i]; if (!e) return; q.value = e.name; close(); q.blur(); if (e._kbl != null){ openKbless(e); return; } openById(e.id, e._p === 25 ? 25 : 34, { fly: true }); };
    q.addEventListener('input', render);
    q.addEventListener('focus', render);
    q.addEventListener('keydown', (ev) => {
      if (ac.hidden && ev.key !== 'Enter') return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){ ev.preventDefault(); if (!res.length) return; act = (act + (ev.key === 'ArrowDown' ? 1 : -1) + res.length) % res.length; ac.querySelectorAll('.it').forEach((b, i) => b.classList.toggle('act', i === act)); const a = ac.querySelector('.it.act'); if (a) a.scrollIntoView({ block: 'nearest' }); }
      else if (ev.key === 'Enter'){ ev.preventDefault(); if (ac.hidden) render(); if (act >= 0) pick(act); }
      else if (ev.key === 'Escape') close();
    });
    ac.addEventListener('mousedown', (ev) => ev.preventDefault());
    ac.addEventListener('click', (ev) => { const b = ev.target.closest('.it'); if (b) pick(+b.dataset.i); });
    qx.addEventListener('click', () => { q.value = ''; qx.hidden = true; close(); q.focus(); });
    document.addEventListener('click', (ev) => { if (!ev.target.closest || !ev.target.closest('#cm84Search')) close(); });
  }

  // ---------- 패널: 계산기 '우리 단지 진단하기'(주소 ?단지=, 25평이면 &평형=25) ----------
  // 패널 안 계산기는 다른 화면 안이라 지도 탭·지도 중심 화면을 쓰지 않는다(inFrameL85). 머리말·탭·검색칸만 가린다.
  const FRAME_HIDE = ['.fw-fab', '.wrap > .topbar', '#topModeTabs', '#singleDiagSection > .single-search-wrap', '.wrap > footer', 'body > footer', '#mapSectionL84', '#mapHeadL85', '#mapNoteL85', '#recentRail'];
  function calcUrl(id, p){ return CALC_PAGE + '?' + encodeURIComponent('단지') + '=' + encodeURIComponent(id) + (p === 25 ? '&' + encodeURIComponent('평형') + '=25' : ''); }
  function panelHead(tyLabel, tyColor, title, extra){
    return `<div class="cm84-ph"><span class="ty" style="background:${tyColor || 'var(--cm-navy)'}">${esc(tyLabel)}</span><h2>${esc(title)}</h2>${extra || ''}<button type="button" class="sz" aria-label="패널 크기">▲ 크게</button><button type="button" class="x">닫기 ✕</button></div>`;
  }
  // 묶음 L85_FULL: 전체 화면 보기 — 주소에 &보기=전체(단지 번호와 함께)를 붙여 새로고침·공유해도 전체 화면으로 열린다
  const FULL_KEY = '보기', FULL_VAL = '전체';
  const fullOn = () => typeof BUNDLES !== 'undefined' && !!(BUNDLES.L85 && BUNDLES.L85_FULL) && !(typeof inFrameL85 === 'function' && inFrameL85());
  let fullUrlFirst = (() => { try { return new URLSearchParams(window.location.search || '').get(FULL_KEY) === FULL_VAL; } catch (e) { return false; } })();
  function setFullUrl(on, id, p){
    try {
      const u = new URL(window.location.href), q = u.searchParams;
      if (on){ q.set('단지', id); if (p === 25) q.set('평형', '25'); else q.delete('평형'); q.set(FULL_KEY, FULL_VAL); }
      else q.delete(FULL_KEY);
      window.history.replaceState(window.history.state, '', u.pathname + (q.toString() ? '?' + q.toString() : '') + u.hash);
    } catch (e) {}
  }
  function enterFull(){
    if (!panel.classList.contains('on') || !panel.dataset.id) return;
    if (typeof whenSeedsL86 === 'function' && seedsPending()){   // 묶음 L86: 시세 이력을 다 받은 뒤에만 — 그 전에는 "받는 중(○%)" 안내, 다 받으면 바로 전체 화면
      const id = panel.dataset.id;
      if (typeof loadSeedsL86 === 'function') loadSeedsL86();
      if (typeof seedPendingNoteL86 === 'function') seedPendingNoteL86();
      whenSeedsL86(ok => { if (ok && panel.dataset.id === id && panel.classList.contains('on')) enterFull(); });
      return;
    }
    panel.classList.add('fsv'); document.body.classList.add('cm84-fsb');
    setFullUrl(true, panel.dataset.id, +panel.dataset.p);
    window.CALC_MAP_L84.full = true;
  }
  function exitFull(){
    if (!panel.classList.contains('fsv')) return;
    panel.classList.remove('fsv'); document.body.classList.remove('cm84-fsb');
    setFullUrl(false); window.CALC_MAP_L84.full = false;
    setTimeout(resize, 30);
  }
  function showPanel(){
    panel.classList.add('on'); panel.classList.remove('full', 'mini95'); mainEl.classList.add('pon');
    panel.querySelector('.x').onclick = closePanel;
    const fs = panel.querySelector('.fs'); if (fs) fs.onclick = enterFull;
    const bk = panel.querySelector('.bk'); if (bk) bk.onclick = exitFull;
    const sz = panel.querySelector('.sz'); if (sz) sz.onclick = () => { panel.classList.remove('mini95'); const f = panel.classList.toggle('full'); sz.textContent = l87() ? (f ? '▼' : '▲') : (f ? '▼ 작게' : '▲ 크게'); };
    if (!panel.querySelector('.cm84-rz')) panel.insertAdjacentHTML('afterbegin', '<div class="cm84-rz" title="끌어서 넓이 조절"></div>');
    wireSheetTabs(panel);
    layoutL87(); setTimeout(resize, 30);
  }
  // 묶음 L87-2: 패널 첫 크기 — PC는 화면의 pcRatio(최소 pcMin·최대 pcMax, 이용자가 끌어 정한 넓이가 있으면 그것), 폰 시트는 sheetH(CSS).
  // 구역 패널(오른쪽)과 같이 열리면 지도 가운데가 mapMin 이상 보이게 두 패널을 같은 비율로 줄인다
  // 묶음 L92: 실거래 칸 접기 — 이 브라우저에 기억(저장이 안 되는 창이면 이번 방문 동안만)
  let rtFoldMem = null;
  function rtFolded(){ if (rtFoldMem != null) return rtFoldMem; try { rtFoldMem = localStorage.getItem(L92CFG.foldKey) === '1'; } catch (e) { rtFoldMem = false; } return rtFoldMem; }
  function setRtFold(v){ rtFoldMem = !!v; try { localStorage.setItem(L92CFG.foldKey, v ? '1' : '0'); } catch (e) {} }
  function wireRtFold(){
    const fb = panel.querySelector('.rtfold92'); if (!fb) return;
    const sync = () => { const f = rtFolded(); fb.textContent = f ? '▶' : '◀'; fb.title = f ? '실거래 칸 펼치기' : '실거래 칸 접기(지도 넓게)';
      if (l93()){ fb.classList.toggle('f93', f); fb.innerHTML = f ? `<span>${esc(L93CFG.foldOpen)}</span>▶` : '◀'; fb.title = f ? L93CFG.foldOpen + '(실거래 칸 펼치기)' : '실거래 칸 접기(지도 넓게)'; }   /* 묶음 L93: 접힌 버튼에 글자 */
      fb.setAttribute('aria-label', fb.title); fb.setAttribute('aria-expanded', String(!f)); };
    sync();
    fb.onclick = () => { setRtFold(!rtFolded()); sync(); layoutL87(); window.CALC_MAP_L84.rtFold = rtFolded(); setTimeout(() => { resize(); if (rtChart && !rtFolded()) { try { rtChart.resize(); } catch (e) {} } }, 30); };
  }
  // 묶음 L94: 끌어 정한 패널 전체 폭(이 브라우저에 기억) — 옛 저장값(진단 칸 폭)과 이름을 나눠 섞이지 않게
  let dragT94 = 0;
  function savedT94(){ try { const w = +localStorage.getItem(panelKey94()); return w >= PANEL_W_MIN ? w : 0; } catch (e) { return 0; } }
  function savedPw(){ try { const w = +localStorage.getItem(PANEL_W_KEY); return w >= PANEL_W_MIN ? w : 0; } catch (e) { return 0; } }
  function layoutL87(){
    if (!mainEl) return;
    const zOn = !!(zpanel && zpanel.classList.contains('on')), pOn = panel.classList.contains('on');
    mainEl.classList.toggle('both', zOn && pOn);
    if (!(zOn && pOn)){ panel.classList.remove('back'); if (zpanel) zpanel.classList.remove('back'); }
    if (!l87() || window.innerWidth < 768) return;
    const W = mainEl.clientWidth;
    let pw = savedPw() || Math.round(Math.max(L87CFG.pcMin, Math.min(L87CFG.pcMax, W * L87CFG.pcRatio)));
    let zw = Math.round(Math.max(L87CFG.zoneMin, W * L87CFG.zoneW));
    if (zOn && pOn && pw + zw + L87CFG.mapMin > W){ const k = Math.max(.3, (W - L87CFG.mapMin) / (pw + zw)); pw = Math.round(pw * k); zw = Math.round(zw * k); }
    else if (zOn && !pOn) zw = Math.min(zw, W - L87CFG.mapMin);
    if (l94() && pOn && panel.classList.contains('l91')){   // 묶음 L94: 패널 전체 폭 T = 화면의 44%(최소 720·최대 880, 끌어 정한 폭이 있으면 그것) → 저평가 55 : 실거래 45
      const fold = rtFolded() && !panel.classList.contains('tws94'); panel.classList.toggle('rtf92', fold);   // 쌍둥이 창을 연 동안은 접힘을 잠시 풂
      const mapMin = Math.max(L87CFG.mapMin, Math.ceil(W * L92CFG.mapShare));
      const auto95 = l95() && !dragT94 && !savedT94(), room = W - mapMin - (zOn ? zw : 0);
      let T = dragT94 || savedT94() || Math.round(Math.max(L94CFG.min, Math.min(L94CFG.max, W * L94CFG.share)));
      T = Math.max(PANEL_W_MIN, Math.min(T, room));
      pw = Math.round(T * L94CFG.diag); let rtw = T - pw;
      if (auto95 && pw < L95CFG.diagMin){ pw = L95CFG.diagMin; T = Math.max(PANEL_W_MIN, Math.min(pw + rtw, room)); rtw = T - pw; }   // 묶음 L95: 기본 폭은 진단 칸을 버튼 두 줄 폭까지만 넓힘(실거래 칸은 그대로, 지도 35% 규칙이 먼저)
      if (rtw < L94CFG.rtMin){ rtw = Math.min(L94CFG.rtMin, Math.max(0, T - PANEL_W_MIN + 80)); pw = T - rtw; }
      if (fold) rtw = 0;   // 접으면 진단 칸(55%)만 — 지도가 넓어짐
      mainEl.style.setProperty('--rtw', rtw + 'px'); mainEl.style.setProperty('--pw', pw + 'px'); mainEl.style.setProperty('--zw', zw + 'px');
      window.CALC_MAP_L84.layout94 = { W, T, pw, rtw, fold, auto95 };
      return;
    }
    if (l91() && pOn && panel.classList.contains('l91')){   // 묶음 L91: 진단 칸(pw)은 그대로, 오른쪽에 실거래 칸(rtw)을 더함 — 지도가 mapMin보다 좁아지면 실거래 칸부터 줄임
      const fold = l92() && rtFolded(); panel.classList.toggle('rtf92', fold);   // 묶음 L92: 실거래 칸을 접으면 진단 칸만(지도가 넓어짐)
      const mapMin = l92() ? Math.max(L87CFG.mapMin, Math.ceil(W * L92CFG.mapShare)) : L87CFG.mapMin, rtMin = l92() ? L92CFG.rtMin : L91CFG.rtMin;   // 묶음 L92: 펼쳐도 지도가 화면의 35% 이상
      let rtw = fold ? 0 : Math.round(Math.max(rtMin, Math.min(L91CFG.rtMax, W * L91CFG.rtRatio)));
      const room = W - mapMin - (zOn ? zw : 0) - pw;
      if (!fold && rtw > room) rtw = Math.max(rtMin, room);
      if (pw + rtw + mapMin + (zOn ? zw : 0) > W) pw = Math.max(PANEL_W_MIN - 80, W - mapMin - (zOn ? zw : 0) - rtw);
      mainEl.style.setProperty('--rtw', rtw + 'px');
    }
    mainEl.style.setProperty('--pw', pw + 'px'); mainEl.style.setProperty('--zw', zw + 'px');
  }
  // 묶음 L91: 패널 안 계산기가 그 단지를 다 그렸다는 알림(calc-ready)을 받으면 보여 주고, 평형을 바꿨으면 실거래 칸도 그 평형으로
  function revealFrame91(fr){
    if (!fr || fr.style.visibility !== 'hidden') return;
    fr.style.visibility = ''; const ld = panel.querySelector('.cm84-body .ld'); if (ld) ld.remove(); const sm = panel.querySelector('.cm84-body .cm84-sum'); if (sm) sm.remove();
    window.CALC_MAP_L84.revealAt = performance.now();
  }
  window.addEventListener('message', (ev) => {
    const m = ev.data; if (!m || m.type !== 'calc-ready' || !panel) return;
    const fr = panel.querySelector('.cm84-body iframe'); if (!fr || ev.source !== fr.contentWindow) return;
    if (m.id && m.id !== panel.dataset.id) return;   // 아직 다른 단지(저장된 기본 단지)를 그린 알림이면 무시
    revealFrame91(fr);
    const p = m.p === 25 ? 25 : 34;
    if (RT.on() && fr._it91 && +panel.dataset.p !== p){ panel.dataset.p = p; const kv = infoP(fr._it91, p); renderRT(fr._it91, p, kv ? kv.cur : null); }   // 평형을 바꾸면 실거래도 그 평형 칸
  });
  // 묶음 L87-6: 폰에서 단지·구역 패널이 둘 다 열리면 아래 시트 머리의 [구역]/[단지]로 앞에 보일 쪽을 바꾼다
  function wireSheetTabs(el){
    const b = el.querySelector('.zt'); if (!b) return;
    b.onclick = () => { const other = el === panel ? zpanel : panel; el.classList.add('back'); other.classList.remove('back'); };
  }
  // 묶음 L87-5: 패널 안 계산기가 쌍둥이 창을 열고 닫을 때 부른다 — PC는 패널을 옆으로 넓게, 폰은 전체 화면
  // ---- 묶음 L94: 쌍둥이 창 = 실거래 칸 자리(PC) · 위쪽 [쌍둥이] 탭(폰). 왼쪽 저평가 진단은 그대로 둔다 ----
  //   같은 계산기를 그 자리에 하나 더 띄워 쌍둥이 창만 보인다(주소 &쌍둥이창=1 — 계산기가 그 단지 쌍둥이 창을 바로 열고, 머리 단추는 [× 실거래로 돌아가기]).
  //   그 자리 폭에 맞춰 그려지므로 왼쪽 진단 화면의 배치는 흔들리지 않는다. 닫으면 두 번째 계산기는 지운다(메모리)
  function setTab94(k){
    if (k !== 'tw' && panel.classList.contains('tws94')) closeTwin94(true);
    panel.dataset.t91 = k; panel.querySelectorAll('[data-t91]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t91 === k)));
    if (k === 'tw') openTwin94();
    if (k === 'rt' && rtChart) setTimeout(() => { try { rtChart.resize(); } catch (e) {} }, 30);
  }
  function twinCount94(){ try { const d = panel.querySelector('.cm84-body iframe').contentDocument; return d.querySelector('[data-twin-l87]') ? 1 : 0; } catch (e) { return 0; } }
  function openTwin94(){
    const host = panel.querySelector('.cm84-tw94'); if (!host) return false;
    const id = panel.dataset.id, p = +panel.dataset.p === 25 ? 25 : 34;
    panel.classList.add('tws94'); host.hidden = false; layoutL87();
    if (window.innerWidth < 768 && panel.dataset.t91 !== 'tw'){ panel.dataset.t91 = 'tw'; panel.querySelectorAll('[data-t91]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.t91 === 'tw'))); }
    if (host.dataset.id === id + '|' + p) return true;
    host.dataset.id = id + '|' + p;
    if (!twinCount94()){ host.innerHTML = '<div class="tw94-h"><b>🧑‍🤝‍🧑 쌍둥이 단지</b><button type="button" class="tw94-x">✕ 실거래로 돌아가기</button></div><div class="rts" style="padding:14px">이 단지는 쌍둥이 단지가 없어요.</div>'; host.querySelector('.tw94-x').onclick = () => closeTwin94(); return true; }
    host.innerHTML = '<div class="ld">쌍둥이 단지를 불러오는 중이에요…</div>';
    const fr = document.createElement('iframe'); fr.title = '쌍둥이 단지'; fr.dataset.tw94 = '1'; fr.style.visibility = 'hidden';
    fr.addEventListener('load', () => { try { const d = fr.contentWindow.document, s = d.createElement('style'); s.textContent = FRAME_HIDE.map(q => q + '{display:none!important}').join(''); d.head.appendChild(s); } catch (e) {} });
    fr.src = calcUrl(id, p) + '&' + encodeURIComponent('쌍둥이창') + '=1';
    host.appendChild(fr);
    window.CALC_MAP_L84.twin94 = { id, p, at: performance.now(), shown: 0 };
    setTimeout(resize, 30);
    return true;
  }
  function twinShown94(){ const host = panel.querySelector('.cm84-tw94'), fr = host && host.querySelector('iframe'); if (!fr) return; fr.style.visibility = ''; const ld = host.querySelector('.ld'); if (ld) ld.remove(); if (window.CALC_MAP_L84.twin94) window.CALC_MAP_L84.twin94.shown = Math.round(performance.now() - window.CALC_MAP_L84.twin94.at); }
  function closeTwin94(keepTab){
    const host = panel.querySelector('.cm84-tw94'); panel.classList.remove('tws94');
    if (host){ host.hidden = true; host.innerHTML = ''; delete host.dataset.id; }
    layoutL87();
    if (!keepTab && panel.dataset.t91 === 'tw') setTab94('rt');
    setTimeout(() => { resize(); if (rtChart) { try { rtChart.resize(); } catch (e) {} } }, 30);
  }
  function twinWide(on){
    if (l94() && panel.classList.contains('l91')){ if (on) return openTwin94() ? { side: true } : null; closeTwin94(); return null; }   // 묶음 L94: 패널을 넓히지 않고 실거래 칸 자리에
    panel.classList.toggle('twv', !!on); window.CALC_MAP_L84.twin = !!on; setTimeout(resize, 30); }
  function openPanel(it, pOver){
    selId = it.id; const f = itemsById.has(it.id) ? (info(it) || {}) : {};
    const p = pOver || f.p || 34, url = calcUrl(it.id, p);
    exitFull();
    panel.dataset.id = it.id; panel.dataset.p = p;
    recordRecent(it.id, p);
    panel.classList.remove('twv');
    const L91 = l91(); panel.classList.toggle('l91', L91); panel.classList.toggle('l93', l93()); panel.classList.toggle('l94', l94()); panel.classList.remove('tws94'); panel.dataset.t91 = 'diag';
    if (L91){   // 묶음 L91: PC = 저평가 진단(왼쪽)·실거래(오른쪽) 2칸, 폰 = 위쪽 탭 [저평가 진단 | 실거래](기본 저평가). 패널 안 계산기는 다 그려질 때까지 가림
      panel.innerHTML = headCx(it, p, url) + '<div class="cm84-tabs91" role="tablist"><button type="button" role="tab" data-t91="diag" aria-selected="true">저평가 진단</button><button type="button" role="tab" data-t91="rt" aria-selected="false">실거래</button>' + (l94() ? '<button type="button" role="tab" data-t91="tw" aria-selected="false">쌍둥이</button>' : '') + '</div>'
        + '<div class="cm84-split91"><div class="cm84-body">' + (l93() ? head93('kb') : '') + '<div class="ld">우리 단지 진단하기를 불러오는 중이에요…</div></div>' + (RT.on() ? rtHtmlShell() : '') + (l94() ? '<div class="cm84-tw94" hidden></div>' : '') + (l92() && RT.on() ? '<button type="button" class="rtfold92">◀</button>' : '') + '</div>';
      wireRtFold();   // 묶음 L92
      panel.querySelectorAll('[data-t91]').forEach(b => b.onclick = () => { if (l94()){ setTab94(b.dataset.t91); return; } panel.dataset.t91 = b.dataset.t91; panel.querySelectorAll('[data-t91]').forEach(x => x.setAttribute('aria-selected', String(x === b))); if (b.dataset.t91 === 'rt' && rtChart) setTimeout(() => { try { rtChart.resize(); } catch (e) {} }, 30); });
    } else
    panel.innerHTML = (l87() ? headCx(it, p, url) : panelHead('단지', '', it.name + (p === 25 ? '(25평)' : ''), (fullOn() ? '<button type="button" class="bk">← 지도로</button>' : '') + (itemsById.has(it.id) ? '' : '<span class="nomap">지도 위치 없음</span>') + `<a href="${url}" target="_blank" rel="opener">계산기 새 탭으로 열기</a>` + (fullOn() ? '<button type="button" class="fs">⛶ 전체 화면으로 보기</button>' : '')))
      + '<div class="cm84-body"><div class="ld">우리 단지 진단하기를 불러오는 중이에요…</div></div>' + (RT.on() ? rtHtmlShell() : '<div class="cm84-rt"><b>실거래</b>이 자리에 최근 실거래가 들어갈 예정이에요(지도 1-2단계).</div>');
    const fr = document.createElement('iframe'); fr.title = '우리 단지 진단하기';
    if (L91){ fr.style.visibility = 'hidden'; fr._it91 = it; }   // 묶음 L91: 기본 화면이 잠깐 보였다 바뀌지 않게, 그 단지를 다 그릴 때까지 가림
    fr.addEventListener('load', () => {
      try {
        const d = fr.contentWindow.document, s = d.createElement('style');
        s.textContent = FRAME_HIDE.map(q => q + '{display:none!important}').join('') + '.wrap{padding-top:8px!important}';
        d.head.appendChild(s);
        if (!d.getElementById('cm84Font')){ const l = d.createElement('link'); l.id = 'cm84Font'; l.rel = 'stylesheet'; l.href = FONT_URL; d.head.appendChild(l); }   // 그래프 가격 상자 글꼴(지도에서 이미 받은 파일이라 다시 받지 않음)
        let n = 0; const t = setInterval(() => { const ov = d.getElementById('guideOverlay'), b = d.getElementById('guideCloseBtn'); if (ov && b && !ov.hidden && getComputedStyle(ov).display !== 'none') b.click(); if (++n > 20) clearInterval(t); }, 150);
      } catch (e) {}
      if (!L91){ const ld = panel.querySelector('.ld'); if (ld) ld.remove(); }
      else setTimeout(() => revealFrame91(fr), 15000);   // 묶음 L91: 다 그렸다는 알림(calc-ready)이 안 오면 15초 뒤에라도 보여 줌
      window.CALC_MAP_L84.panelLoadedAt = performance.now();
      // 묶음 L87-3: 머리의 [비교 단지 추가] = 패널 안 계산기의 같은 버튼(계산기 안 버튼은 숨김)
      const ad = panel.querySelector('.cm84-ph .ad');
      if (ad){ ad.disabled = false; ad.onclick = () => { try { const b = fr.contentWindow.document.getElementById('singleAddCompareBtn'); if (b) b.click(); } catch (e) {} }; }
      renderRecent();
    });
    showPanel();
    if (rate94()) setTimeout(() => { try { const c = (seedEntryById(it.id) || {}).regionCity; loadRateL94(c === '서울' || c === '인천' ? c : '경기'); } catch (e) {} }, 1500);   // 묶음 L94: 그 단지 시도의 진학률 파일만, 패널을 연 뒤 잠깐 뒤
    if (RT.on()){ const kv = infoP(it, p) || (f.p === p ? f : null); renderRT(it, p, kv ? kv.cur : null); }   // 지도 1-2: 실거래 칸(가격 상자 왼쪽 = 이 평형 KB 현재가)
    // 묶음 L86: 시세 이력을 아직 받는 중이면 다 받은 뒤 진단 화면을 띄운다(패널 안 계산기가 같은 파일을 두 번 받지 않게 — 받은 파일을 그대로 씀)
    const mount = () => { if (selId !== it.id || !panel.contains(panel.querySelector('.cm84-body'))) return; fr.src = url; panel.querySelector('.cm84-body').appendChild(fr); };
    if (seedsPending()){
      const ld = panel.querySelector('.ld');
      const pctTx = () => '자세한 진단을 불러오는 중이에요' + (typeof seedPctL86 !== 'undefined' && seedPctL86 != null ? '(' + seedPctL86 + '%)' : '') + '…';
      if (ld){
        const g = f.cur != null ? f : null;
        if (g) ld.insertAdjacentHTML('beforebegin', summaryLine(g));
        ld.textContent = pctTx();
        if (typeof seedProgressFnsL86 !== 'undefined'){ const fn = () => { const l2 = panel.querySelector('.ld'); if (selId === it.id && l2) l2.textContent = pctTx(); }; seedProgressFnsL86.push(fn); }
      }
      window.CALC_MAP_L84.panelWaited = true;
      whenSeedsL86(ok => { if (ok) mount(); else { const l2 = panel.querySelector('.ld'); if (l2) l2.textContent = '시세 자료를 받지 못했어요. 새로고침해 주세요.'; } });
    } else mount();
  }
  // 묶음 L87-3: 단지 패널 머리 — 단지명 하나(조금 크게) + 바로 옆 [비교 단지 추가], 폰은 글자 없는 작은 버튼으로 한 줄
  function headCx(it, p, url){
    return `<div class="cm84-ph cx"><span class="ty">단지</span><h2 title="${esc(it.name)}">${esc(it.name + (p === 25 ? '(25평)' : ''))}</h2>`
      + `<button type="button" class="ad" disabled title="비교 단지 추가">➕<span class="tx"> 비교 단지</span></button>`
      + (fullOn() ? '<button type="button" class="bk">← 지도로</button>' : '') + (itemsById.has(it.id) ? '' : '<span class="nomap">위치 없음</span>')
      + `<a href="${url}" target="_blank" rel="opener">새 탭</a>`
      + (fullOn() ? '<button type="button" class="fs" title="전체 화면으로 보기">⛶<span class="tx"> 전체 화면</span></button>' : '')
      + '<button type="button" class="zt">🏗️ 구역</button><button type="button" class="sz" aria-label="패널 크기">▲</button><button type="button" class="x" aria-label="닫기">✕<span class="tx"> 닫기</span></button></div>';
  }
  // 묶음 L87-4: 검색창 아래 최근 본 단지 칩 — 계산기 최근 본 단지 기록(같은 저장 키)을 그대로 읽고, 하나씩 지운다
  const RECENT_KEY = 'benchmarkCalc_recentSingle_v1';
  function recentList(){
    let list = []; try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) return [];
    return list.filter(x => x && typeof x.id === 'string').slice(0, L87CFG.recentMax).map(x => {
      let nm = null;
      try { const e = Array.isArray(window.SEED_COMPLEXES) && typeof seedEntryById === 'function' ? seedEntryById(x.id) : null; if (e) nm = e.name; } catch (e) {}
      if (!nm && LIGHT){ const s = LIGHT.s.find(q => (q[0] || q[1]) === x.id); if (s) nm = s[1]; }
      return nm ? { id: x.id, p: x.p === 25 ? 25 : 34, name: nm } : null;
    }).filter(Boolean);
  }
  // 지도 패널로 연 단지도 최근 본 단지에 넣는다(계산기와 같은 형식 {id, p, t}, 같은 단지는 맨 위로, 최대 개수는 계산기 값)
  function recordRecent(id, p){
    if (!l87() || !id) return;
    let l = []; try { l = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { l = []; }
    if (!Array.isArray(l)) l = [];
    const max = typeof RECENT_MAX === 'number' ? RECENT_MAX : 10, pp = p === 25 ? 25 : 34;
    if (l.length && l[0] && l[0].id === id && l[0].p === pp){ renderRecent(); return; }
    l = l.filter(x => x && x.id !== id); l.unshift({ id, p: pp, t: Date.now() }); if (l.length > max) l.length = max;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(l)); } catch (e) {}
    renderRecent();
  }
  // 묶음 L89: 최근 본 단지 칩은 지도 밖 흰 머리줄(#mapHeadL85, 탭 옆)로. 폰은 [🕘 최근] 버튼 하나로 접고 누르면 아래로 펼침
  function headRecentEl(){
    const head = document.getElementById('mapHeadL85'); if (!head) return null;
    let w = head.querySelector('#cm84HRc');
    if (!w){
      w = document.createElement('div'); w.id = 'cm84HRc'; w.className = 'mh-recent-l89'; w.setAttribute('aria-label', '최근 본 단지');
      w.innerHTML = '<button type="button" class="hr-btn" aria-expanded="false">🕘 최근<b></b></button><div class="hr-chips"></div>';
      const tabs = head.querySelector('.mh-tabs'); if (tabs) tabs.insertAdjacentElement('afterend', w); else head.appendChild(w);
      const btn = w.querySelector('.hr-btn');
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); const o = w.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)); });
      document.addEventListener('click', (ev) => { if (w.classList.contains('open') && !(ev.target.closest && ev.target.closest('#cm84HRc .hr-chips'))){ w.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
      wireRecentClicks(w.querySelector('.hr-chips'), () => { w.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); });
    }
    return w;
  }
  function wireRecentClicks(el, after){
    if (el._wired) return; el._wired = true;
    el.addEventListener('click', (ev) => {
      const o = ev.target.closest('[data-rc87-open]'), d = ev.target.closest('[data-rc87-del]');
      if (d){ ev.stopPropagation(); let l = []; try { l = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) {} try { localStorage.setItem(RECENT_KEY, JSON.stringify((Array.isArray(l) ? l : []).filter(x => x && x.id !== d.dataset.rc87Del))); } catch (e) {} renderRecent(); return; }
      if (o){ if (after) after(); openById(o.dataset.rc87Open, +o.dataset.rc87P === 25 ? 25 : 34, { fly: true }); }
    });
  }
  function renderRecent(){
    const el = root && root.querySelector('#cm84Rc'); if (!el) return;
    const list = l87() ? recentList() : [];
    const chip = x => `<span class="rc"><button type="button" class="o" data-rc87-open="${esc(x.id)}" data-rc87-p="${x.p}" title="${esc(x.name)} ${x.p}평">${esc(x.name)}<small>${x.p}평</small></button><button type="button" class="d" data-rc87-del="${esc(x.id)}" aria-label="${esc(x.name)} 기록 지우기">✕</button></span>`;
    const hw = l89() ? headRecentEl() : document.getElementById('cm84HRc');
    if (hw){ hw.hidden = !l89() || !list.length; hw.querySelector('.hr-chips').innerHTML = l89() ? list.map(chip).join('') : ''; hw.querySelector('.hr-btn b').textContent = list.length ? ' ' + list.length : ''; }
    const onMap = !(l89() && hw);   // 묶음 L89: 머리줄로 옮겼으면 지도 위 칩 줄은 숨김
    el.hidden = !onMap || !list.length; if (mainEl) mainEl.classList.toggle('rcon', onMap && !!list.length);
    el.innerHTML = onMap ? list.map(chip).join('') : '';
    wireRecentClicks(el);
  }
  // 묶음 L86: 한 줄 요약 — 진단 화면과 같은 값(가벼운 파일에 미리 계산), 적정가는 진단 화면에 숫자가 보일 때만
  function summaryLine(g){
    const fe = (v) => typeof fmtEok === 'function' ? fmtEok(v) : eok(v), [, , col] = bandOf(g.badge);
    return `<div class="cm84-sum"><span>현재가 <b>${fe(g.cur)}</b>${g.p === 25 ? ' <small>(25평)</small>' : ''}</span><span class="bd" style="background:${col}">${esc(g.badge)}</span>${g.fair != null ? `<span class="fr">적정가 약 <b>${fe(g.fair)}</b></span>` : ''}</div>`;
  }
  function closePanel(){ exitFull(); delete panel.dataset.id; panel.classList.remove('on', 'full', 'twv', 'back'); mainEl.classList.remove('pon'); panel.innerHTML = ''; selId = null; layoutL87(); setTimeout(resize, 30); }
  // PC: 패널 가장자리를 끌어 넓이 조절(이 브라우저에서 기억). 묶음 L85_LEFT면 패널이 왼쪽이라 손잡이는 패널 오른쪽 끝
  function wireResize(){
    let on = false, x0 = 0, w0 = 0;
    panel.addEventListener('mousedown', (e) => { if (!e.target.classList.contains('cm84-rz')) return; on = true; x0 = e.clientX; w0 = panel.offsetWidth; const f = panel.querySelector('iframe'); if (f) f.style.pointerEvents = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!on) return; const max = mainEl.clientWidth - 240, d = e.clientX - x0, nw = Math.max(PANEL_W_MIN, Math.min(max, mainEl.classList.contains('left84') ? w0 + d : w0 - d));
      if (l94() && panel.classList.contains('l91') && !panel.classList.contains('twv') && !panel.classList.contains('fsv')){ dragT94 = rtFolded() ? Math.round(nw / L94CFG.diag) : nw; layoutL87(); return; }   // 묶음 L94: 끄는 폭 = 패널 전체(접혀 있으면 진단 칸 폭으로 거꾸로)
      mainEl.style.setProperty('--pw', nw + 'px'); });
    window.addEventListener('mouseup', () => { if (!on) return; on = false; const f = panel.querySelector('iframe'); if (f) f.style.pointerEvents = '';
      if (l94() && dragT94){ try { localStorage.setItem(panelKey94(), dragT94); } catch (e) {} resize(); return; }
      try { localStorage.setItem(PANEL_W_KEY, panel.offsetWidth); } catch (e) {} resize(); });
  }
  // 주소 ?단지=·검색·카드 링크로 단지 열기 — 지도 준비 전이면 기다렸다가
  function openById(id, p, opt){
    if (!ready){ pendingOpen = [id, p, opt]; return true; }
    const it = itemsById.get(id);
    if (it){
      if (!opt || opt.fly !== false){ const oz = ZM().cxOpen; map.setCenter(new NV.LatLng(it.lat, it.lng)); if (map.getZoom() < oz) map.setZoom(oz); }
      openPanel(it, p === 25 ? 25 : null);
      openFullFromUrl();
      return true;
    }
    let e = typeof seedEntryById === 'function' ? seedEntryById(id) : null;
    if (!e && LIGHT){ const s = LIGHT.s.find(x => (x[0] || x[1]) === id); if (s) e = { name: s[1] }; }   // 묶음 L86: 시세 이력 전에는 검색 사전에서 이름
    if (!e) return false;
    openPanel({ id, name: e.name }, p === 25 ? 25 : 34);   // 좌표 없는 단지: 지도는 그대로, 패널만
    openFullFromUrl();
    return true;
  }
  // 주소에 &보기=전체가 있으면 처음 한 번 전체 화면으로(시세 이력을 미룬 첫 화면이면 다 받은 뒤)
  function openFullFromUrl(){
    if (!fullUrlFirst || !fullOn()) return; fullUrlFirst = false;
    const id = panel.dataset.id;
    if (seedsPending() && typeof whenSeedsL86 === 'function') whenSeedsL86(ok => { if (ok && panel.dataset.id === id) enterFull(); });
    else enterFull();
  }

  // ---------- 재개발 구역 겹쳐 보기(재개발 지도 자료를 읽기만) ----------
  let ZD = null, zonesOn = false, zoneLoad = null, zMarks = [];
  const zPolys = new Map();
  function probeZones(){   // 설정으로 켰고 자료가 있으면 버튼을 보인다(꺼짐·미배포·못 읽음이면 버튼만 숨김)
    const b = root.querySelector('#cm84Zone');
    if (!REDEV.on()){ b.hidden = true; window.CALC_MAP_L84.zoneProbe = 'off'; return; }
    fetch(REDEV_URL(REDEV.zones[0]), l95() ? { method: 'HEAD', cache: 'no-store' } : { method: 'HEAD' }).then(r => { b.hidden = !r.ok; window.CALC_MAP_L84.zoneProbe = r.ok; }, () => { b.hidden = true; window.CALC_MAP_L84.zoneProbe = false; });
  }
  // 묶음 L95: 재개발 구역 파일은 라이브 /redevelopment-map/ 원본을 그 자리에서 읽는다(계산기 쪽 복사본·고정 해시 없음). 다만 라이브(GitHub Pages)는 모든 파일에 10분 캐시(max-age=600)를 붙여
  //   목록표 창이 배포한 직후에도 브라우저가 옛 파일을 최대 10분 쓸 수 있으므로, 받기 전에 파일마다 캐시 없이 머리(HEAD)만 물어 수정 표시(ETag·Last-Modified)를 ?v= 꼬리로 붙인다
  //   → 배포하면 다음 지도 열기부터 바로 새 파일, 바뀌지 않았으면 브라우저에 있던 것을 그대로 씀. 머리를 못 받으면 꼬리 없이(전과 같음)
  const redevVer95 = {};
  function redevSrc95(f){
    if (!l95()) return Promise.resolve(REDEV_URL(f));
    return fetch(REDEV_URL(f), { method: 'HEAD', cache: 'no-store' }).then(r => {
      const t = r.ok ? (r.headers.get('etag') || r.headers.get('last-modified') || '') : ''; let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
      redevVer95[f] = t ? h.toString(36) : ''; return REDEV_URL(f) + (t ? '?v=' + h.toString(36) : '');
    }, () => REDEV_URL(f));
  }
  function loadZones(){
    if (zoneLoad) return zoneLoad;
    window.CALC_MAP_L84.redevVer95 = redevVer95;
    zoneLoad = redevSrc95(REDEV.zones[0]).then(loadScript).then(() => Promise.all(REDEV.bounds.map(([f]) => redevSrc95(f).then(loadScript).catch(() => null)))).then(() => {
      const Z = window[REDEV.zones[1]]; if (!Z || !Z.f || !Z.pts) throw new Error('zones');
      const fi = {}; Z.f.forEach((f, i) => fi[f] = i); const get = (z, f) => z[fi[f]];
      const byKey = new Map(); Z.pts.forEach(([y, x, zs]) => zs.forEach(z => byKey.set(get(z, REDEV.fields.key), { z, y, x })));
      const feats = [];
      REDEV.bounds.map(([, v]) => window[v]).filter(Boolean).forEach(B => B.f.forEach(f => {
        const keys = (f.k || []).filter(k => byKey.has(k)); if (!keys.length) return;
        const ll = f.c.map(poly => poly.map(ring => { const out = []; let x = 0, y = 0; for (let i = 0; i < ring.length; i += 2){ x += ring[i]; y += ring[i + 1]; out.push([y / B.scale, x / B.scale]); } return out; }));
        let s = 90, w = 180, n = -90, e = -180; ll.forEach(p => p.forEach(r => r.forEach(([yy, xx]) => { if (yy < s) s = yy; if (yy > n) n = yy; if (xx < w) w = xx; if (xx > e) e = xx; })));
        feats.push({ keys, ll, bb: { s, w, n, e } });
      }));
      const bounded = new Set(); feats.forEach(f => f.keys.forEach(k => bounded.add(k)));
      ZD = { get, byKey, feats, bounded };
      window.CALC_MAP_L84.zoneStats = { zones: byKey.size, feats: feats.length };
      return ZD;
    });
    return zoneLoad;
  }
  function zKind(z){
    const t = ZD.get(z, REDEV.fields.type), n = String(ZD.get(z, REDEV.fields.name) || '');
    if (t === '신통') return ZKINDS[1]; if (t === '공공') return ZKINDS[2]; if (t === '모아') return ZKINDS[3]; if (t === '재건축') return ZKINDS[4];
    if (/역세권|도시정비/.test(n)) return ZKINDS[5]; return ZKINDS[0];
  }
  const stageName = (t) => String(t || '').replace(/\s*\(.*$/, '').trim();
  function toggleZones(){
    const b = root.querySelector('#cm84Zone');
    zonesOn = !zonesOn; b.setAttribute('aria-pressed', String(zonesOn));
    if (l91()){ b.innerHTML = '재개발<br>구역' + (zonesOn ? '<small>끄기</small>' : ''); b.title = zonesOn ? '재개발 구역 끄기' : '재개발 구역 켜기'; }   // 묶음 L91: 켬/끔이 한눈에
    if (!zonesOn){ drawZones(); return; }
    loadZones().then(drawZones, () => { zonesOn = false; zoneLoad = null; b.setAttribute('aria-pressed', 'false'); b.hidden = true; });
  }
  function drawZones(){
    zMarks.forEach(m => m.setMap(null)); zMarks = [];
    if (!map || !ZD || !zonesOn || map.getZoom() < ZONE_MIN_ZOOM){ zPolys.forEach(p => p.setMap(null)); return; }
    const v = view(), zm = map.getZoom(), vis = (bb) => !(bb.n < v.sw.lat() || bb.s > v.ne.lat() || bb.e < v.sw.lng() || bb.w > v.ne.lng());
    ZD.feats.forEach((f, i) => {
      let p = zPolys.get(i);
      if (!vis(f.bb)){ if (p) p.setMap(null); return; }
      const z = ZD.byKey.get(f.keys[0]).z, k = zKind(z);
      if (!p){
        const zo = l89() ? { fillOpacity: .22, strokeWeight: 2, strokeOpacity: 1 } : { fillOpacity: .12, strokeWeight: 2, strokeOpacity: .9 };   // 묶음 L89: 재개발 지도와 같은 진하기(면 22%·선 2px)
        p = new NV.Polygon({ paths: f.ll.flatMap(poly => poly.map(r => r.map(([y, x]) => new NV.LatLng(y, x)))), fillColor: k[2], fillOpacity: zo.fillOpacity, strokeColor: k[2], strokeWeight: zo.strokeWeight, strokeOpacity: zo.strokeOpacity, clickable: true, zIndex: 20 });
        NV.Event.addListener(p, 'click', () => openZone(f.keys[0]));
        zPolys.set(i, p);
      }
      if (!p.getMap()) p.setMap(map);
      if (zm >= ZONE_LABEL_ZOOM && zMarks.length < 80){
        const nm = String(ZD.get(z, REDEV.fields.name) || ''), sg = stageName(ZD.get(z, REDEV.fields.stage));
        const m = new NV.Marker({ map, position: new NV.LatLng((f.bb.s + f.bb.n) / 2, (f.bb.w + f.bb.e) / 2), zIndex: 40, title: nm,
          icon: { content: `<div class="cm84-zl" style="--z:${k[2]}"><small>${esc(k[0] === 'st' ? '정비' : k[1])}</small>${esc(nm)}${sg ? `<span>${esc(sg)}</span>` : ''}</div>`, anchor: new NV.Point(0, 0) } });
        NV.Event.addListener(m, 'click', () => openZone(f.keys[0])); zMarks.push(m);
      }
    });
    if (zm >= 13){   // 경계 자료가 없는 구역은 점으로
      ZD.byKey.forEach((o, key) => {
        if (ZD.bounded.has(key) || !inView(v, o.y, o.x) || zMarks.length > 400) return;
        const m = new NV.Marker({ map, position: new NV.LatLng(o.y, o.x), zIndex: 30, title: String(ZD.get(o.z, REDEV.fields.name) || ''), icon: { content: `<div class="cm84-zp" style="--z:${zKind(o.z)[2]}"></div>`, anchor: new NV.Point(0, 0) } });
        NV.Event.addListener(m, 'click', () => openZone(key)); zMarks.push(m);
      });
    }
    window.CALC_MAP_L84.zoneLast = { polys: [...zPolys.values()].filter(p => p.getMap()).length, marks: zMarks.length };
  }
  function openZone(key){
    const o = ZD && ZD.byKey.get(key); if (!o) return;
    // 재개발 지도에 보이는 정보만(이름·유형·단계·면적·사업성·세대수) — 공개 금지 값과 사이트 이름은 쓰지 않는다
    const F = REDEV.fields, z = o.z, g = (f) => ZD.get(z, F[f]), k = zKind(z), num = (v) => v == null || v === '' ? '-' : Number(v).toLocaleString('ko-KR');
    if (l87() && zpanel){ openZoneL87(key, o, k); return; }
    selId = null;
    const rows = [['유형', k[1]], ['단계', stageName(g('stage')) || '-'], ['면적', g('area') || '-'], ['사업성', g('biz') || '-'],
      ['전체 세대', g('hh') == null || g('hh') === '' ? '-' : num(g('hh')) + '세대'], ['일반분양', num(g('gn'))], ['조합원분양', num(g('un'))]];
    panel.innerHTML = panelHead('구역', k[2], String(g('name') || ''), '') +
      `<div class="cm84-body"><div class="cm84-zone"><dl>${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
        <a class="go" href="${REDEV_PAGE}#zone=${encodeURIComponent(key)}" target="_blank" rel="opener">재개발 지도에서 자세히 보기</a>
        <div class="src">재개발 지도와 같은 자료(재개발 목록표 기준)예요. 경계·단계 상세와 고시는 재개발 지도에서 볼 수 있어요.</div></div></div>`;
    showPanel();
  }

  // 묶음 L87-6: 구역 패널 — 재개발 지도 패널과 같은 목록표 구역 상세(같은 페이지·같은 주소 #zone=…&id=…, 같은 꾸밈). 재개발 지도 폴더는 읽기만
  let zframe = null, zframeReady = false, zPending = null;
  const ZFRAME_CSS = '@import url("' + FONT_URL + '");body,button,input,select,textarea{font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif!important}html,body{overflow:auto}' +
    '#modalOverlay{background:#fff!important;padding:0!important;align-items:stretch!important;justify-content:stretch!important;z-index:9000!important}' +
    '#modalBox{max-width:none!important;width:100%!important;max-height:100vh!important;height:100vh!important;border-radius:0!important;box-shadow:none!important}' +
    '#modalCloseBtn{display:none!important}.fw-fab{display:none!important}' +
    '#dmpLinks,.dmp-links{display:none!important}';   // 계산기 화면에는 바깥 사이트 이름을 쓰지 않는 규칙 — 목록표 상세 맨 위 바깥 사이트 바로가기 줄(목록표 파일은 그대로)
  function zoneHash(key, o){ const i = ZD.get(o.z, REDEV.fields.id); return 'zone=' + encodeURIComponent(key) + (i ? '&id=' + i : ''); }
  function zframeOpen(){
    if (!zframe || !zframeReady || !zPending) return;
    try {
      const d = zframe.contentWindow.document;
      if (!d.getElementById('cm87ZCss')){ const s = d.createElement('style'); s.id = 'cm87ZCss'; s.textContent = ZFRAME_CSS; d.head.appendChild(s); }
      zframe.contentWindow.location.hash = zPending;
      const ld = zpanel.querySelector('.ld'); if (ld) ld.remove();
      window.CALC_MAP_L84.zoneOpenedAt = performance.now();
    } catch (e) {}
  }
  function openZoneL87(key, o, k){
    const nm = String(ZD.get(o.z, REDEV.fields.name) || '');
    zpanel.innerHTML = `<div class="cm84-ph zn"><span class="ty" style="background:${k[2]}">${esc(k[0] === 'st' ? '정비' : k[1])}</span><h2 title="${esc(nm)}">${esc(nm)}</h2><button type="button" class="zt">🏠 단지</button><button type="button" class="sz" aria-label="패널 크기">▲</button><button type="button" class="x" aria-label="닫기">✕<span class="tx"> 닫기</span></button></div>`
      + '<div class="cm84-body"><div class="ld">목록표 구역 상세를 불러오는 중이에요…</div></div>';
    zpanel.dataset.key = key; zpanel.classList.add('on'); zpanel.classList.remove('back', 'full');
    if (panel.classList.contains('on')) panel.classList.add('back');   // 폰: 방금 누른 구역이 앞
    zPending = zoneHash(key, o);
    if (!zframe){
      zframe = document.createElement('iframe'); zframe.title = '재개발 구역 상세';
      zframe.addEventListener('load', () => { zframeReady = true; zframeOpen(); });
      zframe.src = REDEV.listPage + '#' + zPending;
    }
    zpanel.querySelector('.cm84-body').appendChild(zframe);
    zframeOpen();
    zpanel.querySelector('.x').onclick = closeZoneL87;
    if (l91()){ const h = zpanel.querySelector('.cm84-ph'); if (h && !h.querySelector('.zoff')){ h.insertAdjacentHTML('beforeend', '<button type="button" class="zoff" title="지도 위 재개발 구역을 끄고 이 패널을 닫아요">구역 끄기</button>'); h.querySelector('.zoff').onclick = () => { closeZoneL87(); if (zonesOn) toggleZones(); }; } }   // 묶음 L91: 구역 패널에서 바로 끄기
    const sz = zpanel.querySelector('.sz'); sz.onclick = () => { const f = zpanel.classList.toggle('full'); sz.textContent = f ? '▼' : '▲'; };
    wireSheetTabs(zpanel);
    layoutL87(); setTimeout(resize, 30);
  }
  function closeZoneL87(){ zpanel.classList.remove('on', 'back', 'full'); delete zpanel.dataset.key; zpanel.innerHTML = ''; layoutL87(); setTimeout(resize, 30); }

  // ---------- 지도 1-2(묶음 L84_RT): 실거래 칸·KB 괴리 꼬리표·KB 없는 단지 — 저평가 판정·적정가는 KB로만, 실거래는 보여 주기만(계산에 섞지 않음) ----------
  // 자료(분석 탭 결과_20년_<기준월> 그대로): 지도자료_<기준월>\단지별\<seed id>.json(최근 5년 + 꼬리표 — 패널을 열 때), 단지별_이전\(그 전 — [전체 기간]을 누를 때),
  // KB없는단지_실거래요약.json(검색창에 처음 글자를 칠 때), 색인 map_trade_idx.js(첫 지도를 그린 뒤 — 말풍선 꼬리표·이전 파일 없는 단지). 기준월이 바뀌면 base만 바꾼다
  const RT = { base: '지도자료_202610/', idx: 'map_trade_idx.js', recent: '단지별/', old: '단지별_이전/', kbless: 'KB없는단지_실거래요약.json',
    src: '국토교통부 실거래가 공개 자료', listN: 20, boxMonths: 3, boxMin: 3, same: 3, band: { 34: [81, 86], 25: [56, 62] }, bandPad: 3,
    on: () => { try { return !!(BUNDLES.L84_RT && l87()); } catch (e) { return false; } } };
  let RTX = null, rtIdxLoad = null, KBL = null, kblLoad = null;
  const rtCache = new Map();
  const assetU = (f) => typeof assetUrlL52 === 'function' ? assetUrlL52(f) : f;
  function loadTradeIdx(){
    if (!RT.on()) return Promise.resolve(null); if (rtIdxLoad) return rtIdxLoad;
    rtIdxLoad = loadScript(assetU(RT.base + RT.idx)).then(() => { RTX = window.MAP_TRADE_IDX || null; if (RTX) RTX._noOld = new Set(RTX.noOld || []); drawCx(); return RTX; }, () => { RTX = null; return null; });
    return rtIdxLoad;
  }
  const rtFile = (dir, id) => RT.base + dir + encodeURIComponent(id) + '.json' + (RTX && RTX.meta ? '?m=' + encodeURIComponent(RTX.meta.month) : '');
  // 묶음 L93: 직거래 칸을 더한 판(지도자료 v3 — 옛 6칸과 나머지는 한 글자도 같음). 열 이름으로 읽으므로 L93을 꺼도 이 폴더를 그대로 씀(옛 폴더는 올리지 않음)
  // 묶음 L94 추가(11-06): 분석 탭 최신판 결과_20년_202610(monthly_map 첫 실행, 2006-01~2026-10, 같은 7칸)으로 — 지도자료_202610\단지별·단지별_이전(학구도·진학률은 지도자료_202609 그대로)
  const RT93 = { recent: '단지별/', old: '단지별_이전/' };
  function getTrades(id, old){ const k = (old ? 'o|' : 'r|') + id; if (!rtCache.has(k)) rtCache.set(k, fetch(rtFile(old ? RT93.old : RT93.recent, id)).then(r => r.ok ? r.json() : null).catch(() => null)); return rtCache.get(k); }
  function rtTagOf(id){ return RT.on() && RTX && RTX.tags ? RTX.tags[id] || null : null; }
  const rtTagHtml = (t) => t ? `<span class="rtg ${t[0] > 0 ? 'up' : 'dn'}">실거래${t[0] > 0 ? '↑' : '↓'}</span>` : '';
  // 같은 평형대(칸 기준 전용㎡ ±3㎡ — 분석 탭 꼬리표와 같은 잣대): 146 예외 칸이면 실제 면적, 아니면 칩의 seed 시세 타입 면적, 없으면 칸 기준 범위
  function slotBandRT(id, p){
    try { const a = typeof slotAreaL69 === 'function' ? slotAreaL69(id, p) : null; if (a && a[1]) return [a[1] - RT.bandPad, a[1] + 1 + RT.bandPad]; } catch (e) {}
    try { const c = window.SEED_CHIPS && window.SEED_CHIPS[id], m = c ? (p === 25 ? c[5] && c[5][0] : c[4] && c[4][0]) : null; if (m) return [m - RT.bandPad, m + RT.bandPad]; } catch (e) {}
    return RT.band[p] || RT.band[34];
  }
  // 25평 시세 text: 이 창에 25평 파일이 있으면 그것, 없으면 패널 안 계산기가 이미 받은 것(같은 출처 — 27MB를 다시 받지 않게, 묶음 L91)
  function seed25TextRT(id){
    try { if (typeof SEED25_BY_ID !== 'undefined' && SEED25_BY_ID && SEED25_BY_ID.get(id)) return SEED25_BY_ID.get(id).text; } catch (e) {}
    try { const f = panel && panel.querySelector('.cm84-body iframe'), w = f && f.contentWindow, arr = w && w.SEED_COMPLEXES_25; if (!Array.isArray(arr)) return null;
      if (s25cache.src !== arr){ s25cache.src = arr; s25cache.map = new Map(arr.map(e => [e.id, e])); } const x = s25cache.map.get(id); return x ? x.text : null; } catch (e) { return null; }
  }
  const s25cache = { src: null, map: null };
  const ymAdd = (ym, k) => { let y = Math.floor(ym / 100), m = ym % 100 + k; while (m < 1){ m += 12; y--; } while (m > 12){ m -= 12; y++; } return y * 100 + m; };
  const colsOf = (d) => { const c = d.열 || [], ix = (n, i) => { const j = c.indexOf(n); return j >= 0 ? j : i; }; return { ym: ix('계약연월', 0), d: ix('일', 1), a: ix('전용㎡', 2), f: ix('층', 3), p: ix('금액(만원)', 4), x: ix('해제', 5), g: c.indexOf('직거래') }; };   // 묶음 L93: 직거래 칸(없는 옛 파일이면 −1)
  const dg95 = (t, C) => l95() && C.g >= 0 && !!t[C.g];   // 묶음 L95: 직거래는 실거래 중앙값(가격 상자·그래프 선·끌어 고르기 묶음)에서 뺌 — 목록에는 "직거래" 표시 그대로
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  // 가격 상자 오른쪽: 최근 3개월(자료 끝 달 포함) 같은 평형대 실거래 — 해제 뺌, 중앙값·건수·마지막 거래일
  function boxStats(d, id, p){
    const C = colsOf(d), [lo, hi] = slotBandRT(id, p), end = +String(d.기간 || '').split('~')[1] || 0, from = ymAdd(end, -(RT.boxMonths - 1));
    const ts = (d.거래 || []).filter(t => !t[C.x] && !dg95(t, C) && t[C.a] >= lo && t[C.a] <= hi && t[C.ym] >= from && t[C.ym] <= end);
    const last = ts.reduce((m, t) => Math.max(m, t[C.ym] * 100 + t[C.d]), 0);
    return { n: ts.length, med: median(ts.map(t => t[C.p])), last, from, end, lo, hi };
  }
  const ymd = (v) => { const s = String(v); return s.slice(0, 4) + '.' + s.slice(4, 6) + (s.length > 6 ? '.' + s.slice(6, 8) : ''); };
  const eokTx = (man) => man == null ? '-' : (typeof fmtEok === 'function' ? fmtEok(man) : eok(man));
  // 차이 한 줄: (실거래 중앙값 − KB) ÷ KB, +빨강 / −파랑 / ±3% 안 회색 "비슷"
  function diffLine(kb, st){
    if (!kb || st.n < RT.boxMin || st.med == null) return '';
    const pc = (st.med - kb) / kb * 100, sm = Math.abs(pc) <= RT.same;
    return `<div class="rtd ${sm ? 'same' : pc > 0 ? 'up' : 'dn'}">${sm ? `실거래가 KB와 비슷 (±${RT.same}% 안, ${st.n}건)` : `실거래가 KB보다 ${pc > 0 ? '+' : '−'}${Math.abs(pc).toFixed(1)}% (${st.n}건)`}</div>`;
  }
  // 패널 꼬리표(분석 탭 값 그대로, 대표님 확정 문구): 높음·낮음·거래 적음
  function tagLine(t){
    if (!t || !t.상태 || t.상태 === '없음') return '';
    if (t.상태 === '적음') return '<div class="rtt few">거래 적음 · 참고만</div>';
    const g = Math.abs(t.괴리).toFixed(1);
    return t.상태 === '높음' ? `<div class="rtt up">실거래가 KB보다 +${g}% (최근 6개월 ${t.건수}건)</div>` : `<div class="rtt dn">실거래가 KB보다 −${g}% (최근 6개월 ${t.건수}건, 참고)</div>`;
  }
  // KB 전세가율·갭(KB 기준 — seed의 마지막 달 KB 매매·전세): 평형 칸(34·25)마다
  function jeonseRows(id){
    const out = [];
    try {
      const e = seedEntryById(id); if (!e) return out;
      [[34, e.text, e.name], [25, seed25TextRT(id), e.name + PYEONG25_SUFFIX]].forEach(([p, text, nm]) => {
        if (!text) return; const c = buildComplex(text, nm, nm); const r = c.rows.slice().reverse().find(x => x.saleMid != null && x.jeonseMid != null); if (!r) return;
        out.push({ p, ym: r.ym, sale: r.saleMid, jeon: r.jeonseMid, ratio: r.jeonseMid / r.saleMid * 100, gap: r.saleMid - r.jeonseMid });
      });
    } catch (e) {}
    return out;
  }
  function jeonseHtml(id){
    const rows = jeonseRows(id); if (!rows.length) return '';
    return '<div class="rtj">' + rows.map(x => `<div class="jr"><span class="jp">${x.p}평</span><span>KB 전세 <b>${eokTx(x.jeon)}</b></span><span>전세가율 <b>${x.ratio.toFixed(0)}%</b></span><span>갭 <b>${eokTx(x.gap)}</b></span>`
      + `<i class="jb" title="전세가율 ${x.ratio.toFixed(1)}%"><i style="width:${Math.max(0, Math.min(100, x.ratio)).toFixed(1)}%"></i></i></div>`).join('') + `<div class="rts">KB 시세 기준(${ymd(rows[0].ym)}) · 갭 = KB 매매 − KB 전세</div></div>`;
  }
  // 실거래 칸 그리기(패널 아래). 처음엔 가격 상자·차이·꼬리표·전세가율, [실거래 자세히]를 누르면 그래프(KB 선 + 실거래 점)·최근 거래 목록
  function rtHtmlShell(){ return '<div class="cm84-rt rt12" id="cm84Rt">' + (l93() ? head93('rt') : '') + '<div class="rtb"><div class="rld">실거래를 불러오는 중이에요…</div></div></div>'; }
  // 묶음 L93: 칸 머리 제목 + 한 줄 설명(왼쪽 = KB 판정, 오른쪽 = 실거래 확인용). 색 띠는 두 그래프의 선 색(KB 남색·실거래 주황)과 같음
  function head93(k){ const h = k === 'kb' ? L93CFG.headKb : L93CFG.headRt; return `<div class="h93 ${k}"><b>${esc(h[0])}</b><span>${esc(h[1])}</span></div>`; }
  function renderRT(it, p, kb){
    const host = panel.querySelector('#cm84Rt'); if (!host) return;
    const id = it.id, L91 = l91();
    if (L91 && seedsPending() && typeof whenSeedsL86 === 'function' && !host._seed91){ host._seed91 = true; whenSeedsL86(ok => { if (ok && selId === id && +panel.dataset.p === p && panel.contains(host)) renderRT(it, p, kb); }); }   // 묶음 L91: 시세 이력(146 예외 칸 면적·KB 선)을 받은 뒤 한 번 더
    getTrades(id, false).then(d => {
      if (selId !== id || !panel.contains(host)) return;
      const st = d ? boxStats(d, id, p) : null;
      const L94 = l94(), sYmd = (v) => String(v).slice(2, 4) + '.' + String(v).slice(4, 6) + '.' + String(v).slice(6, 8);   // 묶음 L94: 줄바꿈 없게 짧은 문구(평형 칸 면적은 최고점 칸 설명에)
      const box = (L94 ? `<div class="rtx"><div class="bx kb"><small>KB 시세 · 판정 기준</small><b>${eokTx(kb)}</b><small>${p}평</small></div>`
        + `<div class="bx tr"><small>최근 실거래 ${p}평대</small>`
        + (st && st.n >= RT.boxMin ? `<b>${eokTx(st.med)}</b><small>3개월 중앙값 · ${st.n}건</small><small>마지막 ${sYmd(st.last)}</small>` : `<b class="few">거래 적음</b><small>최근 3개월 ${st ? st.n : 0}건</small>${st && st.last ? `<small>마지막 ${sYmd(st.last)}</small>` : ''}`)
        : `<div class="rtx"><div class="bx kb"><small>KB 시세 · 판정 기준</small><b>${eokTx(kb)}</b><small>${p}평</small></div>`
        + `<div class="bx tr"><small>최근 실거래 · ${p}평대(전용 ${st ? Math.round(st.lo) + '~' + Math.round(st.hi) : '-'}㎡)</small>`
        + (st && st.n >= RT.boxMin ? `<b>${eokTx(st.med)}</b><small>최근 3개월 중앙값 · ${st.n}건 · 마지막 ${ymd(st.last)}</small>` : `<b class="few">거래 적음</b><small>최근 3개월 ${st ? st.n : 0}건${st && st.last ? ' · 마지막 ' + ymd(st.last) : ''}</small>`))
        + '</div></div>' + (l93() && d ? '<div class="nhb93" hidden></div><div class="rth93"><div class="rld">최고점을 찾는 중이에요…</div></div>' : '');   // 묶음 L93: 최근 신고가 한 줄 · 최고점 두 줄
      const more = d && !L91 ? `<button type="button" class="rtm" aria-expanded="false">실거래 자세히 ▾</button>` : '';   // 묶음 L91: 접지 않고 늘 펼침
      host.innerHTML = (l93() ? head93('rt') : '') + `<div class="rtb">${box}${st ? diffLine(kb, st) : ''}${d ? tagLine(d.꼬리표) : ''}${d ? '' : '<div class="rts">이 단지는 맞춘 실거래 자료가 없어요.</div>'}<div class="rtj-w"></div>${more}<div class="rtv" hidden></div>`
        + `<div class="rts">${esc(RT.src)} · ${esc(d ? ymd(String(d.기간).split('~')[1]) : (RTX && RTX.meta ? RTX.meta.month.replace('-', '.') : ''))} 기준 · 참고용(판정은 KB 시세로만)${l95() ? ' · 중앙값은 계약 해제·직거래 뺌' : ''}</div><div class="sc-w"></div></div>`;
      const fillJ = () => { const w = host.querySelector('.rtj-w'); if (w) w.innerHTML = jeonseHtml(id); };
      if (seedsPending() && typeof whenSeedsL86 === 'function') whenSeedsL86(ok => { if (ok && selId === id) fillJ(); }); else fillJ();
      renderSchool(host.querySelector('.sc-w'), id);
      if (l93() && d){ const fillH = () => hist93(id, p, d).then(H => { if (selId === id && panel.contains(host)) fillHigh93(host, H); }); if (seedsPending() && typeof whenSeedsL86 === 'function') whenSeedsL86(ok => { if (ok) fillH(); }); else fillH(); }
      const mb = host.querySelector('.rtm'); if (mb) mb.onclick = () => { const v = host.querySelector('.rtv'), o = v.hidden; v.hidden = !o; mb.setAttribute('aria-expanded', String(o)); mb.textContent = o ? '실거래 접기 ▴' : '실거래 자세히 ▾'; host.classList.toggle('open', o); if (o && !v.dataset.done){ v.dataset.done = '1'; renderRtView(v, it, p, d); } };
      if (L91 && d){ const v = host.querySelector('.rtv'); v.hidden = false; v.dataset.done = '1'; host.classList.add('open'); renderRtView(v, it, p, d); }
      window.CALC_MAP_L84.rtShownAt = performance.now(); window.CALC_MAP_L84.rtP = p;
    });
  }
  // ---- 묶음 L93: 최고점·신고가 — 같은 평형 칸(slotBandRT)의 모든 거래(최근 5년 + 이전 파일, 이전 파일은 패널을 열 때 같이 받음) ----
  //   계약 해제는 목록·최고가·신고가 모두에서 뺌. 직거래(자료 '직거래' 칸)는 목록에 "직거래" 표시, 최고가·신고가 판정에서 빼고 따로 한 줄.
  //   신고가 = 그 거래 날짜 앞의(같은 날 거래는 서로 비교하지 않음) 같은 평형 칸 중개 거래 최고가보다 비싼 거래(그 앞 거래가 하나도 없으면 신고가 아님)
  const yymm = (ym) => String(ym).slice(2, 4) + '.' + String(ym).slice(4, 6);
  function kbRowsRT(id, p){
    try { const e = seedEntryById(id), text = p === 25 ? seed25TextRT(id) : e && e.text, nm = e ? e.name + (p === 25 ? PYEONG25_SUFFIX : '') : '';
      return text ? buildComplex(text, nm, nm).rows.filter(r => r.saleMid != null) : []; } catch (e) { return []; }
  }
  const h93cache = new Map();
  function hist93(id, p, d){
    const [lo, hi] = slotBandRT(id, p), key = id + '|' + p + '|' + lo + '|' + hi;
    if (h93cache.has(key)) return h93cache.get(key);
    const hasOld = !(RTX && RTX._noOld && RTX._noOld.has(id));
    const pr = (hasOld ? getTrades(id, true) : Promise.resolve(null)).then(o => {
      const C = colsOf(d), all = ((o && o.거래) || []).concat(d.거래 || []), hasG = C.g >= 0;
      const inBand = all.filter(t => !t[C.x] && t[C.a] >= lo && t[C.a] <= hi).sort((a, b) => (a[C.ym] * 100 + a[C.d]) - (b[C.ym] * 100 + b[C.d]));
      const nh = new Map(); let top = null, topG = null;
      for (let i = 0; i < inBand.length;){
        const day = inBand[i][C.ym] * 100 + inBand[i][C.d]; let j = i; while (j < inBand.length && inBand[j][C.ym] * 100 + inBand[j][C.d] === day) j++;
        const grp = inBand.slice(i, j);
        grp.forEach(t => { if (hasG && t[C.g]){ if (!topG || t[C.p] > topG[C.p]) topG = t; return; } if (top && t[C.p] > top[C.p]) nh.set(t, top); });
        grp.forEach(t => { if (!(hasG && t[C.g]) && (!top || t[C.p] >= top[C.p])) top = t; });   // 같은 값이면 더 늦은 거래를 '전 최고'로(신고가는 더 비쌀 때만)
        i = j;
      }
      const kb = kbRowsRT(id, p), kbTop = kb.reduce((m, r) => !m || r.saleMid > m.saleMid ? r : m, null);
      const end = +String(d.기간 || '').split('~')[1] || 0, from = ymAdd(end, -(L93CFG.newHighMonths - 1));
      let recent = null; nh.forEach((prev, t) => { if (t[C.ym] >= from && (!recent || t[C.ym] * 100 + t[C.d] > recent.t[C.ym] * 100 + recent.t[C.d])) recent = { t, prev }; });
      const H = { C, all, nh, top, topG: topG && (!top || topG[C.p] > top[C.p]) ? topG : null, hasG, kbTop, recent, oldOk: !hasOld || !!o, lo, hi, n: inBand.length };
      window.CALC_MAP_L84.rtHigh = { id, p, top: top ? [top[C.ym] * 100 + top[C.d], top[C.p], top[C.f]] : null, kbTop: kbTop ? [kbTop.ym, kbTop.saleMid] : null, newHighs: nh.size,
        recent: recent ? [recent.t[C.ym] * 100 + recent.t[C.d], recent.t[C.p], recent.prev[C.ym] * 100 + recent.prev[C.d], recent.prev[C.p]] : null, direct: hasG ? inBand.filter(t => t[C.g]).length : null, hasG, oldOk: H.oldOk };
      return H;
    });
    h93cache.set(key, pr); return pr;
  }
  function fillHigh93(host, H){
    const C = H.C, w = host.querySelector('.rth93'), nb = host.querySelector('.nhb93');
    if (w) w.innerHTML = `<div class="hr93"><span class="k kb">KB 최고점</span>${H.kbTop ? `<b>${eokTx(H.kbTop.saleMid)}</b><small>(${ymd(H.kbTop.ym)})</small>` : '<small>KB 시세 이력 없음</small>'}</div>`
      + `<div class="hr93"><span class="k rt">실거래 최고가</span>${H.top ? `<b>${eokTx(H.top[C.p])}</b><small>(${ymd(H.top[C.ym])}, ${H.top[C.f]}층)</small>` : '<small>이 평형 칸 거래 없음</small>'}</div>`
      + (l95() && H.top && H.top[C.ym] < L95CFG.noCancelBefore ? '<div class="hx95">(해제 여부 확인 불가 시기)</div>' : '')   // 묶음 L95: 2019년 이전 계약은 원자료에 해제 칸이 없음
      + (H.topG ? `<div class="hr93 g"><span class="k">직거래 최고</span><b>${eokTx(H.topG[C.p])}</b><small>(${ymd(H.topG[C.ym])}, ${H.topG[C.f]}층) · 신고가 판정에서 뺌</small></div>` : '')
      + (l94() ? `<div class="rts">전용 ${Math.round(H.lo)}~${Math.round(H.hi)}㎡ 칸 · 계약 해제·직거래 뺀 최고가${H.hasG ? '' : '(직거래 구분 없음)'}${H.oldOk ? '' : ' · 최근 5년만'}</div>`
      : `<div class="rts">같은 평형 칸(전용 ${Math.round(H.lo)}~${Math.round(H.hi)}㎡) · KB는 월 시세 최고, 실거래는 계약 해제·직거래를 뺀 최고가${H.hasG ? '' : ' · 이 자료엔 직거래 칸이 없어 직거래도 포함'}${H.oldOk ? '' : ' · 이전 기간 자료를 못 받아 최근 5년만'}</div>`);
    if (nb){ if (H.recent){ const t = H.recent.t, q = H.recent.prev; nb.innerHTML = `<span class="nh93">신고가</span> ${yymm(t[C.ym])} ${eokTx(t[C.p])} — 전 최고 ${yymm(q[C.ym])} ${eokTx(q[C.p])}`; nb.hidden = false; } else nb.hidden = true; }
  }
  function renderRtView(v, it, p, d){
    const id = it.id, C = colsOf(d), hasOld = !(RTX && RTX._noOld && RTX._noOld.has(id));
    let all = (d.거래 || []).slice(), shown = RT.listN, oldOn = false, per = L92CFG.defPeriod, oldBusy = false, keep92 = null;
    const L91 = l91(), L92 = l92(), [blo, bhi] = slotBandRT(id, p), L93 = l93();
    let H93 = null, hl93 = null;
    // 묶음 L93: 거래 목록 — 계약 해제는 빼고, 직거래·신고가 표시, 줄마다 계약 달(data-ym: 그래프를 누르면 그 달로)
    function drawList93(){
      const w = v.querySelector('.rtl93-w'); if (!w) return;
      const hasG = C.g >= 0, nh = H93 ? H93.nh : null;
      const list = all.filter(t => !t[C.x] && t[C.a] >= blo && t[C.a] <= bhi).sort((a, b) => (b[C.ym] * 100 + b[C.d]) - (a[C.ym] * 100 + a[C.d]));
      const tag = (t) => (nh && nh.has(t) ? ' <small class="nh93">신고가</small>' : '') + (hasG && t[C.g] ? ' <small class="dg93">직거래</small>' : '');
      w.innerHTML = `<div class="rtg-h"><b>최근 거래</b><small>${p}평 칸(전용 ${Math.round(blo)}~${Math.round(bhi)}㎡) · 계약 해제는 뺌${hasG ? (l95() ? ' · 직거래는 신고가·중앙값에서 뺌' : ' · 직거래는 신고가 판정에서 뺌') : ' · 직거래 여부 자료 없음'}</small></div>`
        + '<div class="rtj93" hidden></div>'
        + `<table class="rtl"><thead><tr><th>계약일</th><th>전용</th><th>층</th><th>금액</th></tr></thead><tbody>`
        + list.slice(0, shown).map(t => `<tr data-ym="${t[C.ym]}"${hl93 === t[C.ym] ? ' class="hl93"' : ''}><td>${ymd(t[C.ym] * 100 + t[C.d])}</td><td>${t[C.a]}㎡</td><td>${t[C.f]}층</td><td>${eokTx(t[C.p])}${tag(t)}</td></tr>`).join('') + '</tbody></table>'
        + (list.length > shown ? `<button type="button" class="rtmore">더보기 (${(list.length - shown).toLocaleString('ko-KR')}건 더)</button>` : '')
        + (!list.length ? '<div class="rts">이 평형 칸 거래가 없어요.</div>' : '');
      const mo = w.querySelector('.rtmore'); if (mo) mo.onclick = () => { shown += RT.listN; drawList93(); };
      return list;
    }
    // 묶음 L93: 그래프에서 한 달을 누르면 → 목록을 그 달 거래로 넘기고 그 줄들을 강조(그 달 거래가 없으면 가장 가까운 달)
    function jump93(ym){
      const list = all.filter(t => !t[C.x] && t[C.a] >= blo && t[C.a] <= bhi).sort((a, b) => (b[C.ym] * 100 + b[C.d]) - (a[C.ym] * 100 + a[C.d]));
      if (!list.length) return;
      const md = (a, b) => Math.abs((Math.floor(a / 100) * 12 + a % 100) - (Math.floor(b / 100) * 12 + b % 100));
      let tgt = ym; if (!list.some(t => t[C.ym] === ym)) tgt = list.reduce((m, t) => md(t[C.ym], ym) < md(m, ym) ? t[C.ym] : m, list[0][C.ym]);
      const last = list.reduce((k, t, i) => t[C.ym] === tgt ? i : k, -1);
      if (last >= shown) shown = Math.ceil((last + 1) / RT.listN) * RT.listN;
      hl93 = tgt; drawList93();
      const w = v.querySelector('.rtl93-w'), rows = w ? [...w.querySelectorAll(`tr[data-ym="${tgt}"]`)] : [], note = w && w.querySelector('.rtj93');
      if (note){ note.textContent = (tgt === ym ? `${ymd(ym)} 거래 ${rows.length}건` : `${ymd(ym)}엔 거래가 없어 가까운 ${ymd(tgt)} 거래 ${rows.length}건을 보여 줘요`); note.hidden = false; }
      if (rows[0]){ try { rows[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { rows[0].scrollIntoView(); } }
      window.CALC_MAP_L84.rtJump = { ym, tgt, rows: rows.length };
    }
    const draw = () => {
      const list = all.filter(t => !L91 || (t[C.a] >= blo && t[C.a] <= bhi)).sort((a, b) => (b[C.ym] * 100 + b[C.d]) - (a[C.ym] * 100 + a[C.d]));   // 묶음 L91: 지금 보는 평형 칸(전용㎡ ±3)의 거래만
      v.innerHTML = (L92 ? `<div class="rtg-h"><b>실거래 그래프</b><small>${p}평 칸 · 월별 중앙값${l95() && C.g >= 0 ? '(직거래 뺌)' : ''}</small></div><div class="rtp92" role="group" aria-label="그래프 기간">${L92CFG.periods.map(([k, t]) => `<button type="button" data-per92="${k}" aria-pressed="${k === per}">${oldBusy && k === 'all' ? '받는 중…' : t}</button>`).join('')}</div>`
          : L91 ? `<div class="rtg-h"><b>실거래 그래프</b><small>${p}평 칸 · 월별 중앙값</small>${hasOld && !oldOn ? '<button type="button" class="rto">전체 기간</button>' : ''}</div>`
          : `<div class="rtg-h"><b>실거래 그래프</b><span class="lg"><i class="ln"></i>KB 시세(선) <i class="pt"></i>실거래(점)</span>${hasOld && !oldOn ? '<button type="button" class="rto">전체 기간</button>' : ''}</div>`)
        + (L92 ? `<div class="rtc c91"><div class="chart-canvas-wrap"><canvas aria-label="KB 시세와 실거래"></canvas><div class="drag-select-box" hidden></div><div class="drag-result" hidden><div class="drag-result-head"><span data-role="dragRange"></span><button type="button" class="clear-link" aria-label="구간 지우기">✕</button></div><div class="drag-result-list" data-role="dragList"></div></div></div></div>`
            + `<div class="period-l40 rts92"><div class="period-l40-head"><span>표시 기간</span><b class="pl"></b></div><div class="period-l40-track"><div class="period-l40-fill"></div><input type="range" class="ps" min="0" max="0" step="1" value="0" aria-label="표시 시작 월"><input type="range" class="pe" min="0" max="0" step="1" value="0" aria-label="표시 끝 월"></div></div>`
            + '<div class="rts">그래프를 끌면(폰은 두 손가락) 그 구간의 시작·끝 값과 상승률이 나와요(KB 선·실거래 중앙값 선 둘 다)</div>'
          : `<div class="rtc${L91 ? ' c91' : ''}"><canvas aria-label="KB 시세와 실거래"></canvas></div>`)
        + (L93 ? '<div class="rtl93-w"></div>'   // 묶음 L93: 거래 목록은 따로 그림(더보기·그래프 누르기가 그래프를 다시 그리지 않게)
          : (L91 ? `<div class="rtg-h"><b>최근 거래</b><small>${p}평 칸(전용 ${Math.round(blo)}~${Math.round(bhi)}㎡) · 해제는 줄 긋기</small></div>` : `<div class="rtg-h"><b>최근 거래</b><small>전용㎡는 모든 평형 · 해제는 줄 긋기</small></div>`)
        + `<table class="rtl"><thead><tr><th>계약일</th><th>전용</th><th>층</th><th>금액</th></tr></thead><tbody>`
        + list.slice(0, shown).map(t => `<tr${t[C.x] ? ' class="cx"' : ''}><td>${ymd(t[C.ym] * 100 + t[C.d])}</td><td>${t[C.a]}㎡</td><td>${t[C.f]}층</td><td>${eokTx(t[C.p])}${t[C.x] ? ' <small>해제</small>' : ''}</td></tr>`).join('') + '</tbody></table>'
        + (list.length > shown ? `<button type="button" class="rtmore">더보기 (${(list.length - shown).toLocaleString('ko-KR')}건 더)</button>` : '')
        + (L91 && !list.length ? '<div class="rts">이 평형 칸 거래가 없어요.</div>' : ''));
      if (L93) drawList93();
      if (L92){ drawRtChart91(v.querySelector('canvas'), it, p, all, C, null, L93 ? { nh: H93 ? H93.nh : null, pick: (ym) => jump93(ym) } : null); wirePeriod92(v); }   // 묶음 L92: 그래프는 있는 기간 전부, 보이는 범위는 기간 버튼·막대로
      else if (L91) drawRtChart91(v.querySelector('canvas'), it, p, all, C, oldOn ? null : d.기간); else drawRtChart(v.querySelector('canvas'), it, p, all, C);
      const mo = v.querySelector('.rtmore'); if (mo) mo.onclick = () => { shown += RT.listN; draw(); };
      v.querySelectorAll('[data-per92]').forEach(b => b.onclick = () => {
        const k = b.dataset.per92;
        if (k === 'all' && hasOld && !oldOn){ if (oldBusy) return; oldBusy = true; per = 'all'; draw(); const t0 = performance.now();   // 전체 = 이전 기간 파일을 이때 받음
          getTrades(id, true).then(o => { window.CALC_MAP_L84.rtOldMs = Math.round(performance.now() - t0); if (o && o.거래) all = o.거래.concat(d.거래 || []); oldOn = true; oldBusy = false; draw(); }); return; }
        per = k; applyPer92(v);
      });
      const ob = v.querySelector('.rto'); if (ob) ob.onclick = () => { ob.disabled = true; ob.textContent = '받는 중…'; const t0 = performance.now(); getTrades(id, true).then(o => { window.CALC_MAP_L84.rtOldMs = Math.round(performance.now() - t0); if (o && o.거래){ all = o.거래.concat(d.거래 || []); } oldOn = true; draw(); }); };
    };
    // 묶음 L92: 기간 버튼(최근 3년·5년·전체) = 끝 달에서 그만큼, 막대(양 끝 손잡이)로 직접 고르면 버튼은 꺼짐. 보이는 범위가 바뀌면 끌어 고른 구간은 지움
    function rangeOf92(n){ const pd = L92CFG.periods.find(x => x[0] === per), k = pd ? pd[2] : 0; return [k ? Math.max(0, n - k) : 0, n - 1]; }
    function setRange92(v, a, b, fromUser){
      const ch = rtChart, raw = ch && ch.$raw92; if (!raw) return;
      const n = raw.n, sEl = v.querySelector('.ps'), eEl = v.querySelector('.pe'), x = ch.options.scales.x;
      a = Math.max(0, Math.min(a, n - 2)); b = Math.max(a + 1, Math.min(b, n - 1));
      if (a === 0 && b === n - 1){ delete x.min; delete x.max; } else { x.min = a; x.max = b; }
      sEl.value = String(a); eEl.value = String(b); sEl.style.zIndex = a > (n - 1) / 2 ? '3' : '2'; eEl.style.zIndex = a > (n - 1) / 2 ? '2' : '3';
      const fill = v.querySelector('.period-l40-fill'); fill.style.left = (a / (n - 1) * 100) + '%'; fill.style.width = ((b - a) / (n - 1) * 100) + '%';
      v.querySelector('.pl').textContent = raw.lab[a] + ' ~ ' + raw.lab[b] + ' (' + (b - a + 1) + '개월)';
      if (fromUser){ per = ''; keep92 = [raw.yms[a], raw.yms[b]]; }   // 직접 고른 범위는 다시 그려도(더보기·평형) 유지
      v.querySelectorAll('[data-per92]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.per92 === per)));
      const bx = v.querySelector('.drag-select-box'), rs = v.querySelector('.drag-result'); if (bx) bx.hidden = true; if (rs) rs.hidden = true;
      try { ch.stop(); } catch (e) {} ch.update('none');
      window.CALC_MAP_L84.rtRange = { per, from: raw.yms[a], to: raw.yms[b], n: b - a + 1 };
    }
    function applyPer92(v){ const raw = rtChart && rtChart.$raw92; if (!raw) return; const [a, b] = rangeOf92(raw.n); setRange92(v, a, b, false); }
    function wirePeriod92(v){
      const raw = rtChart && rtChart.$raw92, box = v.querySelector('.rts92'); if (!box) return;
      if (!raw || raw.n < 3){ box.hidden = true; return; }
      const sEl = v.querySelector('.ps'), eEl = v.querySelector('.pe'); sEl.max = eEl.max = String(raw.n - 1);
      sEl.addEventListener('input', () => setRange92(v, Math.min(+sEl.value, +eEl.value - 1), +eEl.value, true));
      eEl.addEventListener('input', () => setRange92(v, +sEl.value, Math.max(+eEl.value, +sEl.value + 1), true));
      if (per) applyPer92(v); else applyPer92Keep(v);
    }
    function applyPer92Keep(v){ const raw = rtChart && rtChart.$raw92; if (!raw) return; const k = keep92 || [raw.yms[0], raw.yms[raw.n - 1]], a = raw.yms.findIndex(y => y >= k[0]), b = raw.yms.findIndex(y => y >= k[1]); setRange92(v, a < 0 ? 0 : a, b < 0 ? raw.n - 1 : b, false); }
    draw();
    // 묶음 L93: 신고가는 이전 기간까지 다 봐야 하므로 이전 파일을 같이 받아 합친 뒤 한 번 더 그림(보고 있던 기간·고른 범위는 그대로)
    if (L93) hist93(id, p, d).then(H => { if (!v.isConnected || selId !== id) return; H93 = H; if (H.oldOk && hasOld && !oldOn){ all = H.all; oldOn = true; } draw(); });
  }
  let rtChart = null, rtDragOff = null;
  function drawRtChart(cv, it, p, trades, C){
    if (!cv || !window.Chart) return;
    if (rtChart){ try { rtChart.destroy(); } catch (e) {} rtChart = null; }
    const [lo, hi] = slotBandRT(it.id, p), pts = trades.filter(t => !t[C.x] && t[C.a] >= lo && t[C.a] <= hi);
    const x0 = pts.reduce((m, t) => Math.min(m, t[C.ym]), 999912), toX = (ym, d) => Math.floor(ym / 100) + ((ym % 100) - 1 + (d ? (d - 1) / 31 : 0)) / 12;
    let kb = [];
    try {
      const e = seedEntryById(it.id), text = p === 25 ? (seed25TextRT(it.id)) : e && e.text, nm = e ? e.name + (p === 25 ? PYEONG25_SUFFIX : '') : '';
      if (text) kb = buildComplex(text, nm, nm).rows.filter(r => r.saleMid != null && r.ym >= Math.min(x0, 999912)).map(r => ({ x: toX(r.ym), y: r.saleMid / 10000 }));
    } catch (e) {}
    rtChart = new Chart(cv, { data: { datasets: [
      { type: 'line', label: 'KB 시세', data: kb, borderColor: '#1E3A8A', borderWidth: 2, pointRadius: 0, tension: .15, order: 2 },
      { type: 'scatter', label: '실거래', data: pts.map(t => ({ x: toX(t[C.ym], t[C.d]), y: t[C.p] / 10000, t })), backgroundColor: 'rgba(224,49,49,.55)', borderColor: '#C92A2A', pointRadius: 3, order: 1 } ] },
      options: { animation: false, responsive: true, maintainAspectRatio: false, parsing: false,
        scales: { x: { type: 'linear', ticks: { callback: (v) => Number.isInteger(v) ? String(v) : '', stepSize: 1 } }, y: { ticks: { callback: (v) => v + '억' } } },
        plugins: { legend: { display: false }, tooltip: { enabled: true, external: null, callbacks: { title: (it) => { const x = it[0] ? it[0].raw.x : 0, y = Math.floor(x + 1e-6), m = Math.min(12, Math.floor((x - y) * 12 + 1e-6) + 1); return y + '.' + String(m).padStart(2, '0'); }, label: (c) => c.raw.t ? `실거래 ${ymd(c.raw.t[C.ym] * 100 + c.raw.t[C.d])} · ${c.raw.t[C.a]}㎡ · ${c.raw.t[C.f]}층 · ${eokTx(c.raw.t[C.p])}` : `KB 시세 ${c.raw.y.toFixed(2)}억` } } } } });
    window.CALC_MAP_L84.rtChart = { kb: kb.length, pts: pts.length };
  }
  // 묶음 L91: 실거래 그래프 = 계산기 시세 그래프와 같은 형식(축·글꼴·툴팁) — KB 매매 선 + 같은 평형 칸 실거래 월별 중앙값 선(거래 없는 달은 비움, 해제 뺌)
  function drawRtChart91(cv, it, p, trades, C, period, o93){
    if (!cv || !window.Chart) return;
    if (rtDragOff){ try { rtDragOff(); } catch (e) {} rtDragOff = null; }   // 묶음 L92: 끌어 고르기 연결 풀기
    if (rtChart){ try { rtChart.$crossIdxL85 = -1; rtChart.destroy(); } catch (e) {} rtChart = null; }   // 지운 그래프에 가격 상자 자리 맞춤이 늦게 오지 않게
    const [lo, hi] = slotBandRT(it.id, p), by = new Map();
    trades.forEach(t => { if (t[C.x] || dg95(t, C) || t[C.a] < lo || t[C.a] > hi) return; (by.get(t[C.ym]) || by.set(t[C.ym], []).get(t[C.ym])).push(t[C.p]); });
    let kbRows = [];
    try {
      const e = seedEntryById(it.id), text = p === 25 ? (seed25TextRT(it.id)) : e && e.text, nm = e ? e.name + (p === 25 ? PYEONG25_SUFFIX : '') : '';
      if (text) kbRows = buildComplex(text, nm, nm).rows.filter(r => r.saleMid != null);
    } catch (e) {}
    const kbMap = new Map(kbRows.map(r => [r.ym, r.saleMid])), yms = [...by.keys()].concat(kbRows.map(r => r.ym));
    const pr = String(period || '').split('~').map(Number), end = pr[1] || Math.max(...yms, 0), start = pr[0] || Math.min(...[...by.keys()].concat(kbRows.length ? [kbRows[0].ym] : []), end);
    const labels = []; for (let ym = start; ym <= end && labels.length < 400; ym = ymAdd(ym, 1)) labels.push(ym);
    const fmt = (v) => v == null ? '—' : (typeof fmtEok === 'function' ? fmtEok(v) : eok(v)), lab = labels.map(ym => typeof fmtYm === 'function' ? fmtYm(ym) : ymd(ym));
    const opt = typeof chartOptions === 'function' ? chartOptions(fmt, typeof CHART_EXT_TOOLTIP_RESERVED_TOP !== 'undefined' ? CHART_EXT_TOOLTIP_RESERVED_TOP : undefined)   /* 가격 상자 두 줄 자리(쌍둥이 그래프와 같은 88px) — 본 그래프용 172px는 이 칸에서 그래프를 눌러 버림 */ : { responsive: true, maintainAspectRatio: false };
    opt.animation = false;
    const ds = [
      { label: 'KB 매매 시세', _kind: 'base', _color: '#1E3A8A', data: labels.map(ym => kbMap.has(ym) ? kbMap.get(ym) : null), borderColor: '#1E3A8A', backgroundColor: '#1E3A8A', borderWidth: 2.5, pointRadius: 0, tension: .15, spanGaps: false },
      { label: '실거래 월별 중앙값(' + p + '평 칸)', _kind: 'base', _color: '#E8590C', data: labels.map(ym => by.has(ym) ? median(by.get(ym)) : null), borderColor: '#E8590C', backgroundColor: '#E8590C', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0, spanGaps: false } ];   // _kind·_color = 계산기 끌어 고르기(구간 상승률)가 읽는 칸
    if (o93){   // 묶음 L93: 범례 = 칸 머리와 같은 말, 실거래 선은 끌어 고르기에서 직접 계산(양 끝 3개월 묶음 중앙값)하므로 _kind를 뺌, 신고가 = 그 달 신고가 거래(세모)
      ds[0].label = L93CFG.kbLegend; ds[1].label = L93CFG.rtLegend; delete ds[1]._kind;
      const nhBy = new Map(); if (o93.nh) o93.nh.forEach((prev, t) => { if (!nhBy.has(t[C.ym]) || t[C.p] > nhBy.get(t[C.ym])) nhBy.set(t[C.ym], t[C.p]); });
      if (nhBy.size) ds.push({ label: '신고가', data: labels.map(ym => nhBy.has(ym) ? nhBy.get(ym) : null), showLine: false, borderColor: '#C92A2A', backgroundColor: '#FA5252', pointStyle: 'triangle', pointRadius: 6, pointHoverRadius: 8, borderWidth: 1.5, spanGaps: false });
      const down = { x: null };
      cv.addEventListener('mousedown', (e) => { down.x = e.clientX; });
      cv.addEventListener('touchstart', (e) => { down.x = e.touches && e.touches.length === 1 ? e.touches[0].clientX : null; down.multi = !!(e.touches && e.touches.length > 1); }, { passive: true });
      opt.onClick = (e, els, ch) => {   // 끌어 고른 뒤 떼는 누르기·두 손가락은 넘김
        const nx = e.native ? (e.native.clientX != null ? e.native.clientX : (e.native.changedTouches && e.native.changedTouches[0] ? e.native.changedTouches[0].clientX : null)) : null;
        if (down.multi || (down.x != null && nx != null && Math.abs(nx - down.x) > 6)) return;
        const sx = ch.scales.x, i = Math.round(sx.getValueForPixel(e.x)); if (!(i >= 0 && i < labels.length)) return;
        if (o93.pick) o93.pick(labels[i]);
      };
    }
    rtChart = new Chart(cv, { type: 'line', data: { labels: lab, datasets: ds }, options: opt });
    window.CALC_MAP_L84.rtChart = { kb: kbRows.length, months: by.size, labels: labels.length, from: start, to: end };
    if (l92()){   // 묶음 L92: 계산기 본 그래프와 같은 끌어 고르기(wireDragSelect — 마우스 끌기·폰 두 손가락) → 구간 시작·끝 값과 상승률
      rtChart.$raw92 = { n: labels.length, yms: labels, lab };
      const wrap = cv.parentNode, bx = wrap.querySelector('.drag-select-box'), rs = wrap.querySelector('.drag-result');
      if (bx && rs && typeof wireDragSelect === 'function'){ rtDragOff = wireDragSelect(rtChart, wrap, bx, rs, o93 ? { showRange: true, afterL93: (a, b, listEl) => dragRow93(listEl, labels, by, a, b, p) } : { showRange: true }); const cl = rs.querySelector('.clear-link'); if (cl) cl.onclick = () => { rs.hidden = true; bx.hidden = true; }; }
    }
  }
  // 묶음 L93: 끌어 고르기 실거래 줄 — 양 끝 3개월 묶음(시작 달부터 3개월·끝 달까지 3개월, 고른 구간 안)의 거래 중앙값으로 시작·끝 값과 상승률. 묶음 거래가 3건 미만이면 "거래 적음"
  function dragRow93(listEl, labels, by, a, b, p){
    if (!listEl) return;
    const k = L93CFG.endMonths, grab = (i0, i1) => { const v = []; for (let i = Math.max(a, i0); i <= Math.min(b, i1); i++){ const x = by.get(labels[i]); if (x) v.push(...x); } return v; };
    const s = grab(a, a + k - 1), e = grab(b - k + 1, b), sm = median(s), em = median(e), few = s.length < L93CFG.endMin || e.length < L93CFG.endMin;
    const lb = (i0, i1) => ymd(labels[Math.max(a, i0)]) + '~' + ymd(labels[Math.min(b, i1)]).slice(5);
    const nm = `${esc(L93CFG.rtLegend)} 중앙값 <small class="dr93">양 끝 ${k}개월 묶음 · 시작 ${lb(a, a + k - 1)} ${s.length}건 · 끝 ${lb(b - k + 1, b)} ${e.length}건</small>`;
    let row;
    if (few || sm == null || em == null) row = `<div class="drag-row r93"><span class="swatch" style="background:#E8590C"></span><span class="drag-name">${nm}</span><span class="drag-diff few93">거래 적음</span><span class="drag-rate"></span></div>`;
    else { const df = em - sm, rate = df / sm * 100, tone = rate >= 0 ? 'up' : 'down';
      row = `<div class="drag-row r93"><span class="swatch" style="background:#E8590C"></span><span class="drag-name">${nm}</span><span class="drag-diff ${tone}">${fmtEok(sm)} → ${fmtEok(em)}</span><span class="drag-rate ${tone}">${df >= 0 ? '+' : ''}${fmtEok(df)} (${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%)</span></div>`; }
    const empty = listEl.querySelector('.drag-empty'); if (empty) listEl.innerHTML = '';
    listEl.insertAdjacentHTML('beforeend', (listEl.children.length ? '<div class="drag-divider"></div>' : '') + row);
    window.CALC_MAP_L84.rtDrag93 = { from: labels[a], to: labels[b], s: s.length, e: e.length, sm, em, few };
  }
  // KB 없는 단지(검색창·패널만 — 자료에 좌표가 없어 지도 말풍선은 놓지 못함): 이름·동 이름으로 찾고 "실거래만" 표시, 패널은 면적 구간별 최근 6개월 거래
  function loadKbless(){
    if (!RT.on()) return Promise.resolve(null); if (kblLoad) return kblLoad;
    kblLoad = fetch(RT.base + RT.kbless + (RTX && RTX.meta ? '?m=' + encodeURIComponent(RTX.meta.month) : '')).then(r => r.ok ? r.json() : null).then(j => { KBL = j; return j; }, () => null);
    return kblLoad;
  }
  function kblessSearch(qq){
    if (!KBL || !KBL.단지) return [];
    const norm = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(), nn = norm(qq), nq = qq.replace(/\s+/g, ''); if (!nn) return [];
    const out = [];
    KBL.단지.forEach((r, i) => { const nm = norm(r[3]), dong = String(r[0] || ''); if (nm.includes(nn) || (nq.length >= 2 && (dong === nq || dong.startsWith(nq)))) out.push({ _kbl: i, id: 'kbl:' + i, name: r[3], dong, jb: r[1], _region: [dong, r[1]].filter(Boolean).join(' ') + (r[4] ? ' · ' + r[4] + '년' : ''), built: r[4], n: r[5], areas: r[6] }); });
    return out.sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 10);
  }
  function openKbless(x){
    exitFull(); selId = null; panel.dataset.id = x.id; panel.dataset.p = 34; panel.classList.remove('twv'); drawCx();
    panel.innerHTML = panelHead('실거래만', '#868E96', x.name, '<span class="nomap">위치 없음</span>')
      + `<div class="cm84-body"><div class="cm84-kbl"><p class="kn">KB 시세가 없어 실거래만 보여 줍니다. 적정가·판정은 계산하지 않습니다.</p>`
      + `<dl><dt>위치</dt><dd>${esc([x.dong, x.jb].filter(Boolean).join(' '))}</dd><dt>준공</dt><dd>${x.built ? esc(x.built) + '년' : '-'}</dd><dt>최근 6개월 거래</dt><dd>${(x.n || 0).toLocaleString('ko-KR')}건</dd></dl>`
      + `<table class="rtl"><thead><tr><th>전용 면적</th><th>건수</th><th>중앙값</th></tr></thead><tbody>${(x.areas || []).map(a => `<tr><td>${esc(a[0])}</td><td>${a[1]}건</td><td>${eokTx(a[2])}</td></tr>`).join('')}</tbody></table>`
      + `<div class="rts">${esc(RT.src)} · ${esc(KBL && KBL.기준 ? String(KBL.기준).replace(/(\d{4})(\d{2})/g, '$1.$2') : '')} · 지도 위치 자료가 없어 말풍선은 없어요</div></div></div>`;
    showPanel();
    window.CALC_MAP_L84.kblOpened = x.name;
  }

  // ---------- 지도 1-3(묶음 L84_SC): 초등 학구도·중학교 학군 — 오른쪽 세로 버튼(기본 꺼짐), 켜면 지금 보는 시도 파일만 받아 경계선 + 학구 이름, 패널에 배정 학교 ----------
  // 자료: 분석 탭 결과_학구도(지도용_10m 델타 판·school_elem_202609·school_mid_202609 — 기존 school_elem.js는 그대로). '_'로 시작하는 키(_meta·_표시·_zones)는 단지로 읽지 않는다
  const SC = { base: '지도자료_202609/학구도/', elem: ['school_elem_202609.js', 'SCHOOL_ELEM_202609'], mid: ['school_mid_202609.js', 'SCHOOL_MID_202609'],
    zone: { elem: '초등_%s_델타.json', mid: '중학_%s_델타.json' }, attr: { elem: '초등_속성.json', mid: '중학_속성.json' }, minZoom: 13, labelZoom: 15, labelMax: 40,
    style: { elem: { c: '#1864AB', dash: 'shortdash', name: '초등 학구도' }, mid: { c: '#C2255C', dash: 'longdash', name: '중학교 학군' } },
    sido: [['서울', [37.41, 126.76, 37.72, 127.19]], ['인천', [37.0, 126.0, 37.85, 126.80]], ['경기', [36.89, 126.37, 38.30, 127.86]]],
    note: '학구도는 참고용이며 실제 배정은 교육지원청 고시를 따릅니다.', src: '학구도안내서비스',
    // 묶음 L91: 학교 위치(초등 이름표·중학교 설립형태) — 같은 공공데이터(초중등학교위치 2026-10-01)로 만든 파일
    points: ['school_points_202610.js', 'SCHOOL_POINTS_202610'],
    // 묶음 L91: 중학교 배정 원리(교육청·법령 공식 안내를 짧게) — 문구를 바꿀 때는 출처와 같이 이 한 곳만
    rule: { 학교군: '학교군: 교육지원청이 학교군 안의 중학교 가운데 한 곳으로 추첨(전산)해 배정해요. 같은 학교군 안에서는 어느 학교에 갈지 미리 정해지지 않아요.',
      중학구: '중학구: 거리·교통이 통학하기에 매우 불편한 곳은 정해진 중학교로 바로 배정해요.',
      서울: '서울: 학교군 추첨이 기본이고, 근거리 통학 대상자 심사·지정 같은 예외는 서울특별시교육청이 해마다 정해 안내해요.',
      경기: '경기: 교육감이 학교군·중학구와 추첨 방법을 해마다 고시해요(2026학년도 경기도교육청 고시 제2025-576호, 추첨은 컴퓨터 또는 수동식 추첨기).',
      인천: '인천: 교육감이 정한 학교군·중학구와 추첨 방법에 따라 교육지원청이 배정해요.',
      src: { 공통: '초·중등교육법 시행령 제68조(중학교 입학방법)', 서울: '서울특별시교육청 고입자료실 「2026학년도 중입 재배정 … 근거리 통학 대상자 심사·지정 계획」', 경기: '경기도교육청 고시 제2025-576호(2025. 9. 23.)', 인천: '' } },
    on: () => { try { return !!(BUNDLES.L84_SC && l87()); } catch (e) { return false; } } };
  const scOn = { elem: false, mid: false }, scFiles = new Map(), scAttr = {}, scPolys = new Map();
  let scMarks = [], scAssign = null;
  function scJson(f){ if (!scFiles.has(f)) scFiles.set(f, fetch(SC.base + encodeURIComponent(f)).then(r => r.ok ? r.json() : null).catch(() => null)); return scFiles.get(f); }
  // 보이는 시도: 화면이 서울 상자 안에 다 들어가면 서울만(경기 상자가 서울을 둘러싸 겹치므로), 아니면 화면과 겹치는 시도 모두
  function scVisSido(){
    const v = view(), s = v.sw.lat(), w = v.sw.lng(), n = v.ne.lat(), e = v.ne.lng(), hit = ([, b]) => !(b[2] < s || b[0] > n || b[3] < w || b[1] > e);
    const seoul = SC.sido.find(x => x[0] === '서울'), inside = seoul && s >= seoul[1][0] && n <= seoul[1][2] && w >= seoul[1][1] && e <= seoul[1][3];
    return inside ? ['서울'] : SC.sido.filter(hit).map(x => x[0]);
  }
  function scDecode(ring){ const out = []; let x = 0, y = 0; for (let i = 0; i < ring.length; i += 2){ x += ring[i]; y += ring[i + 1]; out.push([y / 1e5, x / 1e5]); } return out; }
  function toggleSchool(kind){
    scOn[kind] = !scOn[kind]; const b = root.querySelector(kind === 'elem' ? '#cm84ScE' : '#cm84ScM'); if (b) b.setAttribute('aria-pressed', String(scOn[kind]));
    if (scOn[kind] && !scAttr[kind]) scJson(SC.attr[kind]).then(a => { scAttr[kind] = a || {}; drawSchool(); });
    if (l91()){ const b2 = root.querySelector(kind === 'elem' ? '#cm84ScE' : '#cm84ScM'); if (b2) b2.innerHTML = (kind === 'elem' ? '초등<br>학구도' : '중학교<br>학군') + (scOn[kind] ? '<small>끄기</small>' : '');
      if (!scOn[kind]){ if (kind === 'elem') scSel = null; if (kind === 'mid' && midSel93){ midSel93 = null; styleMid93(); } scCard(null, kind); } else { loadSchoolPts(); if (kind === 'mid') loadAssign(); } }
    drawSchool();
  }
  // ---- 묶음 L91: 초등 = 학교 위치에 이름표만, 학교를 누르면 그 학교 배정 범위 하나만(다시 누르거나 다른 학교를 누르면 바뀜) / 중학교 = 학군을 누르면 소속 중학교·진학률·배정 원리 ----
  let SCP = null, scpLoad = null, scSel = null;
  function loadSchoolPts(){ if (scpLoad) return scpLoad; scpLoad = loadScript(SC.base + encodeURIComponent(SC.points[0])).then(() => { SCP = window[SC.points[1]] || null; if (scOn.elem) drawSchool(); return SCP; }, () => null); return scpLoad; }
  const shortSch = (n) => String(n || '').replace(/^(서울|인천|경기)(?=.)/, '').replace(/초등학교$/, '초').replace(/중학교$/, '중');
  function scDec(j, f){ if (j && !j._dec){ j._dec = j.학구.map(([zid, joint, rings]) => { const ll = rings.map(scDecode); let s = 90, w = 180, n = -90, e = -180; ll.forEach(r => r.forEach(([y, x]) => { if (y < s) s = y; if (y > n) n = y; if (x < w) w = x; if (x > e) e = x; })); return { zid, joint, ll, bb: { s, w, n, e } }; }); window.CALC_MAP_L84.scLoaded = (window.CALC_MAP_L84.scLoaded || []).concat(f); } return j; }
  function scCard(html, kind){
    let c = mapEl.querySelector('#cm84Scc');
    if (!html){ if (c && (!kind || c.dataset.kind === kind)) c.hidden = true; return; }
    if (!c){ c = document.createElement('div'); c.id = 'cm84Scc'; c.className = 'cm84-scc'; mapEl.appendChild(c); c.addEventListener('click', (ev) => { if (ev.target.closest('.scx')){ c.hidden = true; if (c.dataset.kind === 'elem' && scSel){ scSel = null; drawSchool(); } if (c.dataset.kind === 'mid' && midSel93){ midSel93 = null; styleMid93(); } } }); }
    c.dataset.kind = kind; c.innerHTML = '<button type="button" class="scx" aria-label="닫기">✕</button>' + html; c.hidden = false;
  }
  function drawElem91(){
    if (!SCP){ loadSchoolPts(); return; }
    const S = SC.style.elem, zm = map.getZoom(), v = view(), tok = scTok95;
    scPolys.forEach((p, k) => { if (k.startsWith('elem|') && !(scSel && scSel.zones.includes(k.slice(5)))) p.setMap(null); });
    if (scSel){ const f = SC.zone.elem.replace('%s', scSel.sd); scJson(f).then(j => { scDec(j, f); if (!j || !scSel || !scOn.elem) return;
      j._dec.filter(z => scSel.zones.includes(z.zid)).forEach(z => { const k = 'elem|' + z.zid; let p = scPolys.get(k);
        if (!p){ p = new NV.Polygon({ paths: z.ll.map(r => r.map(([y, x]) => new NV.LatLng(y, x))), fillColor: S.c, fillOpacity: .10, strokeColor: S.c, strokeWeight: 2.4, strokeOpacity: .95, strokeStyle: 'solid', clickable: false, zIndex: 16 }); scPolys.set(k, p); }
        if (!p.getMap()) p.setMap(map);
        if (l95() && tok === scTok95 && scSel.lat != null){ const v3 = view(); if (!inView(v3, scSel.lat, scSel.lng)){ const q = labelPos95(z, v3);   // 묶음 L95: 학교 이름표가 화면 밖이면 보이는 범위 안쪽에 학구 이름표
          if (q){ const m = new NV.Marker({ map, position: new NV.LatLng(q[0], q[1]), zIndex: 35, clickable: false, icon: { content: `<div class="cm84-scl" style="--s:${S.c}">${esc(shortSch(scSel.name))} 학구</div>`, anchor: new NV.Point(0, 0) } }); scMarks.push(m); } } } }); }); }
    if (zm < L91CFG.schoolZoom) return;
    let n = 0;
    for (const e of SCP.elem){
      if (n >= L91CFG.schoolMax) break; if (!inView(v, e[1], e[2])) continue; n++;
      const on = scSel && scSel.name === e[0];
      const m = new NV.Marker({ map, position: new NV.LatLng(e[1], e[2]), zIndex: on ? 90 : 36, title: e[0], icon: { content: `<div class="cm84-sch${on ? ' on' : ''}" style="--s:${S.c}">${esc(shortSch(e[0]))}</div>`, anchor: new NV.Point(0, 0) } });
      NV.Event.addListener(m, 'click', () => {
        if (scSel && scSel.name === e[0]){ scSel = null; scCard(null, 'elem'); }
        else elemSel91(e);
        drawSchool(); });
      scMarks.push(m);
    }
    window.CALC_MAP_L84.scLast91 = { labels: n, sel: scSel ? scSel.name : null };
  }
  function elemSel91(e){   // 초등학교 하나 고르기(지도에서 학교 누르기 · 묶음 L95 단지 정보 줄 누르기가 같이 씀)
    scSel = { name: e[0], sd: e[3], zones: e[4], lat: e[1], lng: e[2] };
    const zs = e[4].map(z => (scAttr.elem || {})[z]).filter(Boolean).map(a => String(a[0]));
    const near = (k) => rate94() && typeof elemNearL94 === 'function' ? `<div class="sc94">${elemNearL94(e[0], e[1], e[2], e[3])}</div>` : '';   // 묶음 L94: 가까운 중학교(추정) 남 3·여 3과 진학률
    const card = () => scCard(`<b>${esc(e[0])}</b><div class="scs">배정 범위: ${zs.length ? zs.map(esc).join(', ') : '학구도 자료에 연결된 통학구역 없음'}${e[4].length > 1 ? ' <small>(여러 구역)</small>' : ''}</div>${near()}<div class="scn">${esc(SC.note)}</div>`, 'elem');
    card(); if (rate94() && rateStateL94(e[3]) !== 'loaded') loadRateL94(e[3]).then(() => { if (scSel && scSel.name === e[0]) card(); });
    window.CALC_MAP_L84.elemCard = { name: e[0], sd: e[3] };
  }
  // ---- 묶음 L95: 학군·학구 이름표 = 지금 보이는 화면과 그 범위가 겹친 부분 안쪽(지도를 옮기면 다시 그릴 때 따라옴) ----
  //   겹친 네모(화면 가장자리 8% 안쪽)의 가운데가 범위 안이면 거기, 아니면 격자 점 가운데 범위 안에 든 점 중 네모 가운데에 가장 가까운 점. 없으면 이름표 없음
  function inRings95(ll, y, x){ let c = false; ll.forEach(r => { for (let i = 0, j = r.length - 1; i < r.length; j = i++){ const yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } }); return c; }
  function labelPos95(z, v){
    let s = Math.max(z.bb.s, v.sw.lat()), n = Math.min(z.bb.n, v.ne.lat()), w = Math.max(z.bb.w, v.sw.lng()), e = Math.min(z.bb.e, v.ne.lng());
    if (!(s < n && w < e)) return null;
    const vy = (v.ne.lat() - v.sw.lat()) * .08, vx = (v.ne.lng() - v.sw.lng()) * .08;   // 화면 가장자리에 붙어 잘리지 않게
    s = Math.max(s, v.sw.lat() + vy); n = Math.min(n, v.ne.lat() - vy); w = Math.max(w, v.sw.lng() + vx); e = Math.min(e, v.ne.lng() - vx);
    if (!(s < n && w < e)) return null;
    const G = L95CFG.labelGrid, cy = (s + n) / 2, cx = (w + e) / 2; let best = null, bd = Infinity;
    if (inRings95(z.ll, cy, cx)) return [cy, cx];
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++){
      const y = s + (n - s) * (i + .5) / G, x = w + (e - w) * (j + .5) / G; if (!inRings95(z.ll, y, x)) continue;
      const d = (y - cy) * (y - cy) + (x - cx) * (x - cx); if (d < bd){ bd = d; best = [y, x]; }
    }
    return best;
  }
  // ---- 묶음 L95: 단지 정보 줄에서 지도로 — 초등 = [초등 학구도] 켜고 그 학교 범위 + 이동, 중학교 = [중학교 학군] 켜고 학군 창·음영 + 이동 ----
  function fitBB95(bb, extra){
    if (!map || !bb) return;
    const mob = window.innerWidth < 768;
    if (mob && panel && panel.classList.contains('on')){ panel.classList.remove('full'); panel.classList.add('mini95'); setTimeout(resize, 220); }   // 폰: 시트를 낮춰 지도가 보이게(시트 머리를 누르면 원래대로)
    let s = bb.s, w = bb.w, n = bb.n, e = bb.e; if (extra){ s = Math.min(s, extra[0]); n = Math.max(n, extra[0]); w = Math.min(w, extra[1]); e = Math.max(e, extra[1]); }
    const go = () => { try { map.fitBounds(new NV.LatLngBounds(new NV.LatLng(s, w), new NV.LatLng(n, e)), mob ? { top: 110, right: 70, bottom: 20, left: 20 } : { top: 60, right: 60, bottom: 40, left: 370 }); } catch (er) { map.setCenter(new NV.LatLng((s + n) / 2, (w + e) / 2)); }
      if (map.getZoom() < L91CFG.schoolZoom) map.setZoom(L91CFG.schoolZoom); };   // 학교 이름표가 보이는 단계까지는 가까이
    if (mob) setTimeout(go, 260); else go();
  }
  function showElem95(name, sd, id){
    if (!map || !SC.on()) return false;
    if (!scOn.elem) toggleSchool('elem');
    Promise.all([loadSchoolPts(), scAttr.elem ? null : scJson(SC.attr.elem).then(a => { scAttr.elem = a || {}; })]).then(() => {
      if (!SCP) return;
      let c = SCP.elem.filter(x => x[0] === name && (!sd || x[3] === sd)); if (!c.length) c = SCP.elem.filter(x => x[0] === name);
      if (!c.length){ window.CALC_MAP_L84.go95 = { kind: 'elem', name, miss: true }; return; }
      const it = itemsById.get(id), d2 = (x) => it ? (x[1] - it.lat) * (x[1] - it.lat) + (x[2] - it.lng) * (x[2] - it.lng) : 0;
      const e = c.slice().sort((a, b) => d2(a) - d2(b))[0];   // 같은 이름 학교가 여럿이면 단지에서 가까운 곳
      elemSel91(e); drawSchool();
      const f = SC.zone.elem.replace('%s', e[3]);
      scJson(f).then(j => { scDec(j, f); const zs = j && j._dec ? j._dec.filter(z => e[4].includes(z.zid)) : [];
        const bb = zs.length ? zs.reduce((m, z) => ({ s: Math.min(m.s, z.bb.s), w: Math.min(m.w, z.bb.w), n: Math.max(m.n, z.bb.n), e: Math.max(m.e, z.bb.e) }), { s: 90, w: 180, n: -90, e: -180 }) : { s: e[1], w: e[2], n: e[1], e: e[2] };
        fitBB95(bb, [e[1], e[2]]); window.CALC_MAP_L84.go95 = { kind: 'elem', name: e[0], sd: e[3], zones: zs.length, cands: c.length }; });
    });
    return true;
  }
  function showMid95(id, sd){
    if (!map || !SC.on()) return false;
    if (!scOn.mid) toggleSchool('mid');
    loadAssign().then(([, M]) => {
      const zid = M && id && String(id)[0] !== '_' && Object.prototype.hasOwnProperty.call(M, id) ? M[id] : null; if (!zid){ window.CALC_MAP_L84.go95 = { kind: 'mid', id, miss: true }; return; }
      const it = itemsById.get(id); sd = sd || (it ? (SC.sido.find(([, b]) => it.lat >= b[0] && it.lat <= b[2] && it.lng >= b[1] && it.lng <= b[3]) || ['서울'])[0] : '서울');
      midSel93 = zid; styleMid93(); midCard(zid, sd, l96() && it ? { lat: it.lat, lng: it.lng, nm: it.name } : null);   // 묶음 L96: 단지에서 연 경우만 단지 좌표
      const f = SC.zone.mid.replace('%s', sd);
      scJson(f).then(j => { scDec(j, f); const z = j && j._dec ? j._dec.find(q => q.zid === zid) : null;
        fitBB95(z ? z.bb : (it ? { s: it.lat, w: it.lng, n: it.lat, e: it.lng } : null), null);
        window.CALC_MAP_L84.go95 = { kind: 'mid', zid, sd, found: !!z }; });
    });
    return true;
  }
  const rate94 = () => l94() && typeof rateTableL94 === 'function' && typeof loadRateL94 === 'function';   // 묶음 L94: 진학률 표는 계산기 HTML 함수를 같이 씀
  function midCard(zid, sd, from){
    Promise.all([loadAssign(), loadSchoolPts(), rate94() ? loadRateL94(sd) : null]).then(([AM]) => {
      if (rate94()){   // 묶음 L94: 학교별 특목·자사고 진학률·시도 안 상위 %·과·외·자 인원·시도 평균 + 남·여·공학(나이스)
        const M = AM ? AM[1] : null, zn = M && M._zones ? M._zones[zid] : null, nm = zn ? zn[0] : (((scAttr.mid || {})[zid] || [])[0] || '중학교 학군'), list = zn ? zn[2] || [] : [];
        const gu = /중학구$/.test(nm) ? '중학구' : '학교군', R = SC.rule;
        scCard(`<b>${esc(nm)}</b>${zn && zn[1] ? ' <small>(공동)</small>' : ''}<div class="scs">소속 중학교 ${list.length}곳</div>` + rateTableL94(list, sd, from || null)
          + `<div class="scr"><b>배정 원리</b><p>${esc(R[gu])}</p>${gu === '학교군' ? `<p>${esc(R.중학구)}</p>` : ''}<p>${esc(R[sd] || '')}</p></div>`
          + `<div class="scn">출처: ${esc([R.src.공통, R.src[sd]].filter(Boolean).join(' · '))} · ${esc(SC.note)}</div>`, 'mid');
        window.CALC_MAP_L84.midCard = { zid, nm, n: list.length, rate: rateStateL94(sd), from96: !!from };
        return;
      }
      const M = AM ? AM[1] : null, zn = M && M._zones ? M._zones[zid] : null, nm = zn ? zn[0] : (((scAttr.mid || {})[zid] || [])[0] || '중학교 학군'), list = zn ? zn[2] || [] : [];
      const gu = /중학구$/.test(nm) ? '중학구' : '학교군', R = SC.rule;
      const rows = list.map(n => { const q = SCP && SCP.mid ? SCP.mid[n] : null; return `<tr><td>${esc(n)}</td><td>${q ? esc(q[0]) : '-'}</td><td>${q && q[1] ? (q[1] === '여' ? '여중' : '남중') : '<span class="scq">확인 중</span>'}</td></tr>`; }).join('');
      scCard(`<b>${esc(nm)}</b>${zn && zn[1] ? ' <small>(공동)</small>' : ''}<div class="scs">소속 중학교 ${list.length}곳</div>`
        + (rows ? `<table class="sct"><thead><tr><th>학교</th><th>설립</th><th>남·여·공학</th></tr></thead><tbody>${rows}</tbody></table>` : '')
        + `<div class="scs"><span class="sl">진학률</span>준비 중(자료가 오면 채워요)</div>`
        + `<div class="scr"><b>배정 원리</b><p>${esc(R[gu])}</p>${gu === '학교군' ? `<p>${esc(R.중학구)}</p>` : ''}<p>${esc(R[sd] || '')}</p></div>`
        + `<div class="scn">출처: ${esc([R.src.공통, R.src[sd]].filter(Boolean).join(' · '))} · 남·여·공학은 학교 위치 자료에 없어 이름에 '여자'·'남자'가 있는 학교만 표시 · ${esc(SC.note)}</div>`, 'mid');
      window.CALC_MAP_L84.midCard = { zid, nm, n: list.length };
    });
  }
  // 묶음 L93: 중학교 학군을 누르면 그 학군에 음영(초등 학구도처럼), 나머지 학군은 흐리게 — 다시 누르거나 창을 닫으면 원래대로
  let midSel93 = null;
  function styleMid93One(p, zid){
    const c = SC.style.mid.c;
    try { p.setOptions(!midSel93 ? { fillColor: c, fillOpacity: .01, strokeOpacity: .9, strokeWeight: 2.4, strokeStyle: SC.style.mid.dash, zIndex: 15 }
      : zid === midSel93 ? { fillColor: c, fillOpacity: .16, strokeOpacity: 1, strokeWeight: 3.2, strokeStyle: 'solid', zIndex: 17 }
      : { fillColor: '#868E96', fillOpacity: .06, strokeOpacity: .28, strokeWeight: 1.5, strokeStyle: SC.style.mid.dash, zIndex: 15 }); } catch (e) {}
  }
  function styleMid93(){ scPolys.forEach((p, k) => { if (k.startsWith('mid|')) styleMid93One(p, k.slice(4)); }); window.CALC_MAP_L84.midSel = midSel93; }
  let scTok95 = 0;   // 묶음 L95: 다시 그릴 때마다 하나씩 — 늦게 온 옛 그리기는 이름표를 놓지 않음
  function drawSchool(){
    scMarks.forEach(m => m.setMap(null)); scMarks = []; scTok95++; const tok = scTok95;
    const zm = map ? map.getZoom() : 0;
    if (!map || !SC.on() || zm < SC.minZoom || (!scOn.elem && !scOn.mid)){ scPolys.forEach(p => p.setMap(null)); return; }
    const v = view(), vis = (bb) => !(bb.n < v.sw.lat() || bb.s > v.ne.lat() || bb.e < v.sw.lng() || bb.w > v.ne.lng()), want = new Set(), t0 = performance.now();
    ['elem', 'mid'].forEach(kind => {
      if (!scOn[kind]) return; const S = SC.style[kind];
      if (kind === 'elem' && l91()){ drawElem91(); return; }   // 묶음 L91: 초등은 학교 이름표 + 고른 학교 범위만
      scVisSido().forEach(sd => {
        const f = SC.zone[kind].replace('%s', sd);
        scJson(f).then(j => {
          if (!j || !scOn[kind] || !map) return; if (!j._dec){ j._dec = j.학구.map(([zid, joint, rings]) => { const ll = rings.map(scDecode); let s = 90, w = 180, n = -90, e = -180; ll.forEach(r => r.forEach(([y, x]) => { if (y < s) s = y; if (y > n) n = y; if (x < w) w = x; if (x > e) e = x; })); return { zid, joint, ll, bb: { s, w, n, e } }; }); window.CALC_MAP_L84.scLoaded = (window.CALC_MAP_L84.scLoaded || []).concat(f); }
          const z2 = map.getZoom(), v2 = view(), vis2 = (bb) => !(bb.n < v2.sw.lat() || bb.s > v2.ne.lat() || bb.e < v2.sw.lng() || bb.w > v2.ne.lng());
          j._dec.forEach(z => {
            const k = kind + '|' + z.zid; let p = scPolys.get(k);
            if (!vis2(z.bb) || z2 < SC.minZoom){ if (p) p.setMap(null); return; }
            if (!p){ const ck = kind === 'mid' && l91();   // 묶음 L91: 학군을 누르면 소속 중학교·배정 원리
              p = new NV.Polygon({ paths: z.ll.map(r => r.map(([y, x]) => new NV.LatLng(y, x))), fillColor: S.c, fillOpacity: ck ? .01 : 0, strokeColor: S.c, strokeWeight: kind === 'mid' ? 2.4 : 1.6, strokeOpacity: .9, strokeStyle: S.dash, clickable: ck, zIndex: 15 }); scPolys.set(k, p);
              if (ck) NV.Event.addListener(p, 'click', () => { if (l93()){ if (midSel93 === z.zid){ midSel93 = null; styleMid93(); scCard(null, 'mid'); return; } midSel93 = z.zid; styleMid93(); } midCard(z.zid, sd); });
              if (kind === 'mid' && l93()) styleMid93One(p, z.zid); }
            if (!p.getMap()) p.setMap(map);
            if ((z2 >= SC.labelZoom || (l95() && kind === 'mid' && z.zid === midSel93)) && scMarks.length < SC.labelMax){   // 묶음 L95: 고른 학군은 한 단계 멀리서도 이름표
              const a = (scAttr[kind] || {})[z.zid], nm = a ? String(a[0]) : '';
              const L95m = l95() && kind === 'mid', q95 = L95m && nm && tok === scTok95 ? labelPos95(z, v2) : null;   // 묶음 L95: 중학교 학군 이름표 = 보이는 부분 안쪽
              if (nm && (!L95m || q95)){ const m = new NV.Marker({ map, position: q95 ? new NV.LatLng(q95[0], q95[1]) : new NV.LatLng((z.bb.s + z.bb.n) / 2, (z.bb.w + z.bb.e) / 2), zIndex: 35, clickable: false, icon: { content: `<div class="cm84-scl" style="--s:${S.c}">${esc(nm)}</div>`, anchor: new NV.Point(0, 0) } }); scMarks.push(m); }
            }
          });
          window.CALC_MAP_L84.scLast = { polys: [...scPolys.values()].filter(p => p.getMap()).length, labels: scMarks.length, ms: Math.round(performance.now() - t0) };
        });
      });
    });
  }
  function loadAssign(){ if (scAssign) return scAssign; scAssign = Promise.all([SC.elem, SC.mid].map(([f, v]) => loadScript(SC.base + encodeURIComponent(f)).then(() => window[v] || null, () => null))); return scAssign; }
  function renderSchool(el, id){
    if (!el || !SC.on()) return;
    loadAssign().then(([E, M]) => {
      if (!el.isConnected) return;
      const e = E && id && id[0] !== '_' ? E[id] : null, m = M && id && id[0] !== '_' ? M[id] : null, flag = E && E._표시 ? E._표시[id] : null, z = m && M._zones ? M._zones[m] : null;
      if (!e && !z){ el.innerHTML = ''; return; }
      const ex = e ? (e[2] && e[2].length > 1 ? `<b>배정 후보 여러 곳</b> ${e[2].map(c => esc(c[0]) + ` <small>(직선 ${Math.round(c[1])}m)</small>`).join(', ')}` : `<b>${esc(e[0])}</b> <small>(직선 ${Math.round(e[1])}m)</small>`) : '-';
      el.innerHTML = `<div class="rtsc"><div><span class="sl">배정 초등학교</span>${ex}${flag ? `<div class="sf">${esc(flag)}</div>` : ''}</div>`
        + (z ? `<div><span class="sl">중학교 학군</span><b>${esc(z[0])}</b><div class="sm">${(z[2] || []).map(esc).join(' · ')}</div></div>` : '')
        + `<div class="rts">${esc(SC.note)} 출처: ${esc(SC.src)}(${esc(((E && E._meta && E._meta.받은날) || ''))} 받음, 2026-09-20판)</div></div>`;
    });
  }

  function initMap(){
    NV = naver.maps;
    map = new NV.Map(mapEl, { center: new NV.LatLng(37.5665, 126.978), zoom: 13, minZoom: 8, maxZoom: 19, zoomControl: true,
      zoomControlOptions: { position: l89() ? NV.Position.RIGHT_CENTER : NV.Position.LEFT_CENTER, style: NV.ZoomControlStyle.SMALL }, scaleControl: false, mapDataControl: false });   // 묶음 L89: 확대·축소 버튼은 재개발 지도처럼 오른쪽 가운데
    NV.Event.addListener(map, 'idle', () => { clearTimeout(lt); lt = setTimeout(drawAll, 60); });
    window.addEventListener('resize', () => setTimeout(() => { if (map && !root.closest('[hidden]')) resize(); }, 50));
    root.querySelector('#cm84Basis').textContent = '가격 34평 기준(34평 시세가 없는 단지는 25평) · ' + seedMonthText() + ' 시세 · 좌표 있는 단지 ' + items.length.toLocaleString('ko-KR') + '곳';
    ready = true; clearTimeout(failTimer);
    if (l89()) syncBasis();   // 묶음 L89: 고른 평형 기준 줄
    drawCx(); window.CALC_MAP_L84.readyAt = performance.now();
    if (pendingOpen){ const [id, p, opt] = pendingOpen; pendingOpen = null; openById(id, p, opt); }
    probeZones(); renderRecent();
    if (RT.on()){ const go2 = () => loadTradeIdx(); if (window.requestIdleCallback) requestIdleCallback(go2, { timeout: 2500 }); else setTimeout(go2, 600); }   // 지도 1-2: 말풍선 꼬리표 색인(첫 그림 뒤)
    // 묶음 L86: 첫 지도·말풍선을 그린 뒤 시세 이력을 받기 시작(지도 그림 조각과 겹치지 않게 잠깐 뒤)
    if (seedsPending() && typeof loadSeedsL86 === 'function'){ const go = () => loadSeedsL86(); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300); }
  }
  function seedMonthText(){
    if (LIGHT && LIGHT.meta && LIGHT.meta.month){ const p = LIGHT.meta.month.split('-'); return p[0] + '년 ' + (+p[1]) + '월'; }   // 묶음 L86
    try { const m = computeDataAsOfRange().max; return Math.floor(m / 100) + '년 ' + (m % 100) + '월'; } catch (e) { return ''; }
  }

  window.CALC_MAP_L84 = {
    open(sec){
      if (!built) build(sec);
      if (map){ setTimeout(resize, 30); return; }
      if (started) return; started = true; addFont();
      window.CALC_MAP_L84.openAt = performance.now();
      failTimer = setTimeout(() => { if (!ready) fail('timeout'); }, MAP_TIMEOUT_MS);
      loadData().then(initMap, (e) => { started = false; fail(e && e.message === 'config' ? 'config' : 'load'); });
    },
    drawCx: () => drawAll(), openById: (id, p, opt) => openById(id, p, opt), openZone: (k) => openZone(k), toggleZones: () => toggleZones(), loadZones: () => loadZones(),
    search: (q) => search(q), get map(){ return map; }, get ready(){ return ready; }, enterFull: () => enterFull(), exitFull: () => exitFull(),
    setFilter: (o) => setFilter(o || {}), passFilter: (it) => passFilter(it), cfg88: L88CFG,
    cfg89: L89CFG, zm: () => ZM(), shownInfo: (it) => shownInfo(it), items: () => items,   // 묶음 L89(시험용)
    cfg91: L91CFG, midCard: (zid, sd, from) => midCard(zid, sd, from),   // 묶음 L91(시험용)
    showElem95: (name, sd, id) => showElem95(name, sd, id), showMid95: (id, sd) => showMid95(id, sd), cfg95: L95CFG, labelPos95: (z, v) => labelPos95(z, v),   // 묶음 L95
    twinWide: (on) => twinWide(on), twinClose94: () => closeTwin94(), twinShown94: () => twinShown94(), renderRecent: () => renderRecent(), setDistBar: (on) => { L87CFG.distBar = !!on; groupsBy.clear(); drawAll(); }, cfg: L87CFG, layout: () => { syncL87(); layoutL87(); renderRecent(); resize(); },
  };
})();
