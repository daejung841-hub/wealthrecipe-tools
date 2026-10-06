/*
 * 사용법 팝업 — 언제 자동으로 열지 정하는 순수 함수 모음 (화면과 무관, node 에서 테스트)
 *
 * 저장 위치(둘 다 imjang_ 로 시작, 기록 백업 파일·모든 기록 삭제·구역 삭제와 무관한 별도 키):
 *   localStorage['imjang_help_seen_v1']    "다시 보지 않기"를 체크하고 닫았을 때 — 값은 그때 본 내용 version(숫자 글자). help.json 의 version 이 더 크면 한 번 다시 연다.
 *   sessionStorage['imjang_help_session_v1'] 체크 없이 닫았을 때 — 이번 세션(탭을 닫을 때까지)만 자동으로 열지 않는다.
 * 저장소를 못 쓰는 환경(시크릿 모드 등)에서는 예외를 삼키고 "처음 방문"으로 본다(앱은 그대로 동작).
 *
 * shouldAutoOpen(ls, ss, version)       자동으로 열어야 하나
 * isSeen(ls, version)                   이 version 이상을 "다시 보지 않기"로 저장했나 (다시 보기 팝업의 체크 상태)
 * closeWith(ls, ss, version, checked)   닫을 때의 저장 처리: 체크 → 영구 저장 / 체크 해제 → 영구 저장 지움 + 이번 세션만 열지 않음
 */
(function (root) {
  'use strict';
  const SEEN_KEY = 'imjang_help_seen_v1', SESSION_KEY = 'imjang_help_session_v1';

  function readSeen(ls) {
    try { const v = ls.getItem(SEEN_KEY); if (v == null) return 0; const n = parseInt(v, 10); return Number.isFinite(n) && String(n) === String(v).trim() && n > 0 ? n : 0; } catch (e) { return 0; }
  }
  const isSeen = (ls, version) => readSeen(ls) >= Number(version) && readSeen(ls) > 0;
  function sessionSkipped(ss) { try { return ss.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  const shouldAutoOpen = (ls, ss, version) => !isSeen(ls, version) && !sessionSkipped(ss);

  function closeWith(ls, ss, version, checked) {
    try {
      if (checked) ls.setItem(SEEN_KEY, String(version));
      else { ls.removeItem(SEEN_KEY); }
    } catch (e) { /* 저장 불가: 이번 화면에서만 닫힘 */ }
    if (!checked) { try { ss.setItem(SESSION_KEY, '1'); } catch (e) { /* */ } }
  }

  const api = { SEEN_KEY, SESSION_KEY, readSeen, isSeen, sessionSkipped, shouldAutoOpen, closeWith };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangHelp = api;
})(typeof window !== 'undefined' ? window : globalThis);
