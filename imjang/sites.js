/*
 * 사이트 이름 → 주소 연결 — 순수 함수 모음 (화면과 무관, node 에서 테스트)
 *
 * 이름·별칭·주소는 data/sites.json 한 곳에서만 읽는다. 항목 카드의 "확인할 수 있는 곳" 문구(items.json 의 where)에는 주소를 적지 않는다.
 *   sites  sites.json 의 sites 배열  [{ title, names?, group, desc, url }]   (names 는 where 문구에서 쓰는 다른 이름, url 이 null 이면 글자로만 보여 줌)
 *
 * parseWhere(text, sites)  "A · B(설명) · C" → [{ text, site|null, kind|null }]   " · "(앞뒤 공백 있는 가운뎃점)으로 나눈다. 조합·추진위 처럼 공백 없는 ·는 나누지 않는다.
 * linkKind(url)            'ext'(https 외부 주소) | 'int'(이 사이트 안 상대경로) | null(연결하지 않음: http·javascript:·data:·//호스트 등)
 *
 * 사용자가 입력한 값은 여기로 들어오지 않는다. 링크 주소는 sites.json 의 url 을 그대로 쓰고, 아무것도 덧붙이지 않는다.
 */
(function (root) {
  'use strict';
  const SEP = ' · ';

  function linkKind(url) {
    if (typeof url !== 'string' || !url) return null;
    if (/^https:\/\/[^\s/?#]+/.test(url)) return 'ext';
    if (/^\.{1,2}\//.test(url)) return 'int';
    return null;
  }

  const namesOf = (s) => [s.title].concat(Array.isArray(s.names) ? s.names : []).filter((n) => typeof n === 'string' && n);

  // 이름이 정확히 같거나, 이름 뒤에 공백·괄호로 설명이 이어지는 경우("정비몽땅 사업장 검색", "부동산 공시가격 알리미(공동주택가격)")만 같은 사이트로 본다. 가장 긴 이름 우선.
  function matchSite(part, sites) {
    let best = null, bestLen = 0;
    (sites || []).forEach((s) => namesOf(s).forEach((n) => {
      if (n.length > bestLen && part.startsWith(n) && (part.length === n.length || /^[\s(]/.test(part.slice(n.length)))) { best = s; bestLen = n.length; }
    }));
    return best;
  }

  function parseWhere(text, sites) {
    return String(text || '').split(SEP).map((p) => p.trim()).filter(Boolean).map((part) => {
      const site = matchSite(part, sites), kind = site ? linkKind(site.url) : null;
      return { text: part, site: kind ? site : null, kind };
    });
  }

  const api = { parseWhere, linkKind, matchSite, SEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangSites = api;
})(typeof window !== 'undefined' ? window : globalThis);
