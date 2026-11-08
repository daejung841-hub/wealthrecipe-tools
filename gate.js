/*
 * 세션 인증 게이트 — 이것도 보안이 아니라 무작위 유입을 막기 위한 장치입니다.
 * config.js를 먼저 로드해서 SITE_PASSWORD가 정의된 뒤에 이 파일을 불러와야 합니다.
 * 인증 상태는 sessionStorage에 저장되므로 같은 탭/세션 안에서 다른 도구 페이지로
 * 이동해도 다시 묻지 않지만, 브라우저를 완전히 닫으면 초기화됩니다.
 *
 * 11-07 로그인 뒤 원래 주소로 돌아가기: 도구 페이지에서 첫 화면으로 보낼 때 원래 주소(폴더 아래 경로·검색어·# 뒤 값)를
 * 첫 화면 주소의 ?ret=에 담아 보내고, 첫 화면에서 비밀번호를 맞게 넣으면(grantSiteAuth) 그 주소로 돌려보낸다.
 * 같은 사이트 안, 아래 SITE_RETURN_DIRS 폴더 아래 주소만 받는다(바깥 주소·다른 폴더·이상한 주소는 무시하고 첫 화면에 남음).
 * 목록표(redevelopment-list)·재개발 지도(redevelopment-map)는 그 창 담당이라 넣지 않았다(지금처럼 첫 화면으로만).
 */
var SITE_AUTH_KEY = 'siteAuthed';
var SITE_RETURN_DIRS = ['benchmark-calculator/', 'price-correction/', 'rate-simulator/', 'imjang/'];

function isSiteAuthed(){
  try { return sessionStorage.getItem(SITE_AUTH_KEY) === '1'; } catch (e) { return false; }
}

function grantSiteAuth(){
  try { sessionStorage.setItem(SITE_AUTH_KEY, '1'); } catch (e) {}
  siteGoReturn();
}

// 사이트 폴더 기준 상대 주소(예: 'benchmark-calculator/벤치마크_배율_계산기.html?id=…#…')가 돌아가도 되는 주소인지
function siteReturnOk(rel){
  if (typeof rel !== 'string' || !rel || rel.length > 2000) return false;
  if (/[\u0000-\u001f\\]/.test(rel)) return false;
  var path = rel.split(/[?#]/)[0];
  if (/\/\/|(^|\/)\.\.?(\/|$)|%2e%2e|%2f|%5c/i.test(path)) return false;
  for (var i = 0; i < SITE_RETURN_DIRS.length; i++) if (path.indexOf(SITE_RETURN_DIRS[i]) === 0) return true;
  return false;
}

// 첫 화면(?ret=…)에서 로그인했을 때: 원래 주소로 보낸다. 받을 주소가 없거나 맞지 않으면 아무것도 하지 않는다(첫 화면에 남음).
function siteGoReturn(){
  try {
    if (window.top !== window) return;
    var m = /[?&]ret=([^&#]*)/.exec(location.search); if (!m) return;
    var rel = decodeURIComponent(m[1]);
    if (!siteReturnOk(rel)) return;
    var base = new URL('./', location.href), to = new URL(rel, base);
    if (to.origin !== location.origin || to.pathname.indexOf(base.pathname) !== 0) return;
    location.replace(to.href);
  } catch (e) {}
}

// 도구 페이지 최상단에서 호출: 인증 안 됐으면 즉시 랜딩페이지로 되돌려보낸다(원래 주소는 ?ret=로 같이).
function requireSiteAuth(indexPath){
  if (!isSiteAuthed()){
    var to = indexPath;
    try {
      if (window.top === window){
        var base = new URL('./', new URL(indexPath, location.href)).href, here = location.href;
        if (here.indexOf(base) === 0){
          var rel = here.slice(base.length);
          if (siteReturnOk(rel)) to = indexPath + (indexPath.indexOf('?') < 0 ? '?' : '&') + 'ret=' + encodeURIComponent(rel);
        }
      }
    } catch (e) {}
    location.replace(to);
  }
}
