/*
 * 공용 "의견 보내기" 위젯 (Task 60) — 모든 계산기 페이지에서 이 파일 하나만 불러오면
 * 우측 하단 플로팅 버튼 + 모달이 자동으로 삽입된다. 페이지별 CSS와 충돌하지 않도록
 * 모든 스타일을 fw-(feedback widget) 접두사로 스코프하고, 이 파일이 직접 <style>/DOM을
 * 만들어 넣으므로 각 페이지는 :root 색상변수를 맞출 필요가 없다.
 *
 * 사용법 (각 페이지의 </body> 직전 또는 <head> 안, gate.js 이후 아무 곳에나):
 *   <script src="../feedback-widget.js" data-calculator="rate-simulator"></script>
 *
 * data-calculator 값은 아래 CALCULATORS 목록의 key와 정확히 일치해야 그 계산기가
 * 드롭다운에서 자동 선택된다. 아직 만들어지지 않은 계산기(재개발 목록표/시세보정
 * 계산기)는 페이지가 생기면 그때 같은 방식으로 data-calculator="redevelopment-list"
 * 또는 data-calculator="price-correction"을 넣은 <script> 태그만 추가하면 된다 —
 * 이 위젯 파일과 드롭다운 옵션은 이미 준비돼 있으므로 수정할 필요가 없다.
 */
(function(){
  var FORMSPREE_ENDPOINT = 'https://formspree.io/f/xljdgbgj';

  // key: data-calculator 값(페이지마다 지정) / label: 드롭다운에 보이는 이름
  var CALCULATORS = [
    { key: 'geup-jipyo', label: '급지표' },
    { key: 'redevelopment-list', label: '재개발 목록표' },
    { key: 'price-correction', label: '시세보정 계산기' },
    { key: 'benchmark-calculator', label: '저평가 단지 계산기' },
    { key: 'rate-simulator', label: '추가분담금 · 비례율 계산기' },
    { key: 'imjang', label: '임장 체크리스트' },
  ];

  // document.currentScript는 DOMContentLoaded 이후(비동기 init 경로)에는 항상 null이라
  // 믿을 수 없다 — 대신 data-calculator 속성이 붙은 <script> 태그를 직접 찾는다
  // (페이지당 이 위젯 스크립트는 하나만 넣는 것을 전제로 한다).
  function currentCalculatorKey(){
    var script = document.querySelector('script[data-calculator]');
    return script ? script.getAttribute('data-calculator') : null;
  }

  function injectStyle(){
    var style = document.createElement('style');
    style.textContent = [
      '.fw-fab{position:fixed;right:20px;bottom:20px;z-index:9998;',
        'background:#0E5C6B;color:#fff;border:none;border-radius:999px;',
        'padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer;',
        'box-shadow:0 4px 14px rgba(0,0,0,.22);font-family:sans-serif;',
        'display:flex;align-items:center;gap:6px;transition:transform .12s,box-shadow .12s;}',
      '.fw-fab:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.28);}',
      '.fw-overlay{position:fixed;inset:0;background:rgba(15,20,25,.5);z-index:9999;',
        'display:flex;align-items:center;justify-content:center;padding:16px;}',
      '.fw-overlay[hidden]{display:none;}',
      '.fw-modal{background:#fff;color:#182430;border-radius:14px;max-width:420px;width:100%;',
        'padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:sans-serif;',
        'max-height:90vh;overflow-y:auto;box-sizing:border-box;}',
      '.fw-modal h2{font-size:17px;margin:0 0 14px;color:#182430;}',
      '.fw-field{margin-bottom:12px;}',
      '.fw-field label{display:block;font-size:12.5px;color:#61707D;margin-bottom:5px;}',
      '.fw-field select,.fw-field textarea{width:100%;box-sizing:border-box;',
        'border:1px solid #C6D0D7;border-radius:8px;padding:9px 10px;font-size:13.5px;',
        'font-family:inherit;color:#182430;background:#fff;}',
      '.fw-field textarea{resize:vertical;min-height:100px;}',
      '.fw-field select:focus,.fw-field textarea:focus{outline:2px solid #0E5C6B;outline-offset:1px;}',
      '.fw-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}',
      '.fw-btn{border:none;border-radius:8px;padding:9px 16px;font-size:13.5px;font-weight:600;',
        'cursor:pointer;font-family:inherit;}',
      '.fw-btn-cancel{background:#EDF2F4;color:#61707D;}',
      '.fw-btn-cancel:hover{background:#DCE3E9;}',
      '.fw-btn-submit{background:#0E5C6B;color:#fff;}',
      '.fw-btn-submit:hover{background:#0a4550;}',
      '.fw-btn-submit:disabled{opacity:.6;cursor:default;}',
      '.fw-status{font-size:12.5px;margin-top:10px;line-height:1.5;}',
      '.fw-status.fw-ok{color:#1F7A3F;}',
      '.fw-status.fw-err{color:#B3261E;}',
      '.fw-close{position:absolute;top:14px;right:14px;background:none;border:none;',
        'font-size:18px;line-height:1;color:#93A1AC;cursor:pointer;padding:4px;}',
      '.fw-modal{position:relative;}',
    ].join('');
    document.head.appendChild(style);
  }

  function buildModal(selectedKey){
    var overlay = document.createElement('div');
    overlay.className = 'fw-overlay';
    overlay.id = 'fwOverlay';
    overlay.hidden = true;

    var optionsHtml = CALCULATORS.map(function(c){
      return '<option value="' + c.key + '"' + (c.key === selectedKey ? ' selected' : '') + '>' + c.label + '</option>';
    }).join('');

    overlay.innerHTML =
      '<div class="fw-modal" role="dialog" aria-modal="true" aria-labelledby="fwTitle">' +
        '<button class="fw-close" type="button" id="fwCloseBtn" aria-label="닫기">&times;</button>' +
        '<h2 id="fwTitle">💬 의견 보내기</h2>' +
        '<div class="fw-field">' +
          '<label for="fwCalcSelect">어떤 계산기에 대한 의견인가요?</label>' +
          '<select id="fwCalcSelect">' + optionsHtml + '</select>' +
        '</div>' +
        '<div class="fw-field">' +
          '<label for="fwMessage">의견 내용</label>' +
          '<textarea id="fwMessage" placeholder="불편한 점, 원하시는 기능, 오류 신고 등 자유롭게 적어주세요"></textarea>' +
        '</div>' +
        '<div class="fw-actions">' +
          '<button class="fw-btn fw-btn-cancel" type="button" id="fwCancelBtn">취소</button>' +
          '<button class="fw-btn fw-btn-submit" type="button" id="fwSubmitBtn">보내기</button>' +
        '</div>' +
        '<div class="fw-status" id="fwStatus" hidden></div>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function buildFab(){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fw-fab';
    btn.id = 'fwFabBtn';
    btn.innerHTML = '💬 의견 보내기';
    document.body.appendChild(btn);
    return btn;
  }

  function init(){
    var calcKey = currentCalculatorKey();
    injectStyle();
    var fab = buildFab();
    var overlay = buildModal(calcKey);

    var select = overlay.querySelector('#fwCalcSelect');
    var textarea = overlay.querySelector('#fwMessage');
    var submitBtn = overlay.querySelector('#fwSubmitBtn');
    var cancelBtn = overlay.querySelector('#fwCancelBtn');
    var closeBtn = overlay.querySelector('#fwCloseBtn');
    var statusEl = overlay.querySelector('#fwStatus');

    function resetStatus(){
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.className = 'fw-status';
    }

    function openModal(){
      resetStatus();
      textarea.value = '';
      submitBtn.disabled = false;
      submitBtn.textContent = '보내기';
      overlay.hidden = false;
      textarea.focus();
    }

    function closeModal(){
      overlay.hidden = true;
    }

    fab.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    submitBtn.addEventListener('click', function(){
      var message = textarea.value.trim();
      if (!message){
        resetStatus();
        statusEl.hidden = false;
        statusEl.className = 'fw-status fw-err';
        statusEl.textContent = '의견 내용을 입력해주세요.';
        textarea.focus();
        return;
      }
      var calcOption = CALCULATORS.filter(function(c){ return c.key === select.value; })[0];
      var payload = {
        calculator: calcOption ? calcOption.label : select.value,
        message: message,
        submitted_at: new Date().toISOString(),
        page_url: location.href,
      };

      submitBtn.disabled = true;
      submitBtn.textContent = '전송 중...';
      resetStatus();

      fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function(res){
        if (res.ok){
          statusEl.hidden = false;
          statusEl.className = 'fw-status fw-ok';
          statusEl.textContent = '의견이 전달되었습니다. 감사합니다!';
          setTimeout(closeModal, 1400);
        } else {
          return res.json().catch(function(){ return null; }).then(function(data){
            throw new Error((data && data.error) || ('요청 실패 (상태 ' + res.status + ')'));
          });
        }
      }).catch(function(err){
        submitBtn.disabled = false;
        submitBtn.textContent = '보내기';
        statusEl.hidden = false;
        statusEl.className = 'fw-status fw-err';
        statusEl.textContent = '전송에 실패했습니다 (' + err.message + '). 잠시 후 다시 시도해주세요.';
      });
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
