/*
 * 보내기 — 폰의 공유창·클립보드·파일 저장을 쓰는 부분. 브라우저 기능이 없는 환경을 위한 대체 경로를 모두 여기서 정한다.
 * env 를 바꿔 끼울 수 있게 해서(node 테스트에서는 가짜 navigator) 환경별 동작을 시험한다.
 *
 * 결과 코드
 *   sendText : 'shared'(공유창으로 보냄) | 'cancel'(사용자가 공유창을 닫음 — 오류 아님) | 'copied'(복사함) | 'manual'(직접 복사하도록 화면에 보여 줘야 함)
 *   sendFiles: 'shared' | 'cancel' | 'unsupported'(이 환경은 파일 공유 불가 → 저장 안내) | 'failed'(실패 → 나눠 보내기 안내)
 *
 * 참고: navigator.share / navigator.clipboard 는 HTTPS(또는 localhost)에서만 동작한다.
 */
(function (root) {
  'use strict';

  function create(env) {
    const nav = env.navigator || {}, doc = env.document;
    // 공유창을 사용자가 닫으면 브라우저가 AbortError 로 알려 준다 — 오류가 아니라 "취소"로 다룬다
    const isAbort = (e) => !!e && e.name === 'AbortError';

    function caps() {
      return {
        secure: env.isSecureContext !== false,
        share: typeof nav.share === 'function',
        canShareFiles: (files) => typeof nav.share === 'function' && typeof nav.canShare === 'function' && !!safe(() => nav.canShare({ files })),
        clipboard: !!(nav.clipboard && typeof nav.clipboard.writeText === 'function'),
      };
    }
    const safe = (fn) => { try { return fn(); } catch (e) { return false; } };

    // 복사: 클립보드 API → (안 되면) 숨은 입력칸 + execCommand('copy') → (그것도 안 되면) 'manual'
    async function copyText(text) {
      if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        try { await nav.clipboard.writeText(text); return 'copied'; } catch (e) { /* 아래 대체 */ }
      }
      if (doc && typeof doc.execCommand === 'function') {
        const ta = doc.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        doc.body.appendChild(ta);
        try { ta.select(); ta.setSelectionRange(0, text.length); const ok = doc.execCommand('copy'); if (ok) return 'copied'; } catch (e) { /* manual */ }
        finally { ta.remove(); }
      }
      return 'manual';
    }

    async function sendText(text) {
      if (typeof nav.share === 'function') {
        try { await nav.share({ text }); return 'shared'; }
        catch (e) { if (isAbort(e)) return 'cancel'; /* 그 밖의 오류는 복사로 대체 */ }
      }
      return copyText(text);
    }

    // 파일(이미지·txt·사진) 공유. 호출 전에 파일을 미리 만들어 둬야 한다(공유는 사용자가 누른 직후에만 허용되는 브라우저가 있다).
    async function sendFiles(files, extra) {
      if (!caps().canShareFiles(files)) return 'unsupported';
      try { await nav.share(Object.assign({ files }, extra || {})); return 'shared'; }
      catch (e) { return isAbort(e) ? 'cancel' : 'failed'; }
    }

    // 공유가 안 되는 환경에서 파일을 내려받게 한다(이미지 저장·txt 저장)
    function download(blob, filename) {
      const url = env.URL.createObjectURL(blob), a = doc.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none'; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => env.URL.revokeObjectURL(url), 4000);
    }

    return { caps, copyText, sendText, sendFiles, download };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImjangSend = api;
})(typeof window !== 'undefined' ? window : globalThis);
