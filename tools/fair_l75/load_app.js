// 벤치마크 계산기 HTML의 인라인 스크립트를 Node vm에 로드하는 테스트용 하네스(DOM 없이 순수 계산 함수만 쓴다).
// DOM 없이 순수 계산 함수(buildComplex/computeSlot/getVirtualBenchmarkComplex 등)만 쓸 목적.
// loadState()/applyUrlParams()/wireStaticEvents() 호출(파일 맨 끝 3줄)은 DOM이 없어 제외한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadApp(appDir, extra){
  // extra: 스크립트를 읽기 전에 sandbox에 미리 넣을 값(예: { BUNDLE_URL_OVERRIDE:'none' } = 주소의 ?bundles=none과 같다)
  const sandbox = Object.assign({}, extra || {});
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.console = console;
  sandbox.Math = Math;
  sandbox.Date = Date;
  sandbox.JSON = JSON;
  sandbox.Map = Map;
  sandbox.Set = Set;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;
  sandbox.RegExp = RegExp;
  sandbox.Promise = Promise;
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  sandbox.navigator = { userAgent: 'node' };
  sandbox.addEventListener = function(){};
  sandbox.removeEventListener = function(){};
  sandbox.localStorage = {
    _data: {},
    getItem(k){ return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem(k, v){ this._data[k] = String(v); },
    removeItem(k){ delete this._data[k]; },
  };

  const fakeStyle = new Proxy({}, { get(){ return ''; }, set(){ return true; } });
  const fakeClassList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
  function makeFakeEl(){
    const el = {
      style: fakeStyle,
      classList: fakeClassList,
      dataset: {},
      children: [],
      childNodes: [],
      attributes: {},
      value: '',
      textContent: '',
      innerHTML: '',
      addEventListener(){},
      removeEventListener(){},
      appendChild(){},
      removeChild(){},
      setAttribute(){},
      getAttribute(){ return null; },
      querySelector(){ return makeFakeEl(); },
      querySelectorAll(){ return []; },
      getContext(){ return {}; },
      focus(){},
      click(){},
      closest(){ return null; },
      remove(){},
    };
    return el;
  }
  sandbox.document = {
    documentElement: makeFakeEl(),
    body: makeFakeEl(),
    createElement(){ return makeFakeEl(); },
    getElementById(){ return makeFakeEl(); },
    querySelector(){ return makeFakeEl(); },
    querySelectorAll(){ return []; },
    addEventListener(){},
    removeEventListener(){},
  };
  sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
  sandbox.confirm = () => true;
  sandbox.alert = () => {};
  sandbox.matchMedia = () => ({ matches: false, addListener(){}, addEventListener(){} });

  class FakeChart {
    constructor(){ this.data = {}; this.options = {}; }
    destroy(){}
    update(){}
    static register(){}
  }
  FakeChart.instances = {};
  FakeChart.defaults = { plugins: {}, layout: {} };
  sandbox.Chart = FakeChart;
  sandbox.XLSX = { utils: {}, write: () => Buffer.from('') };

  vm.createContext(sandbox);

  const load = (rel) => {
    const code = fs.readFileSync(path.join(appDir, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  };
  load('shared.js');
  load('seedComplexes.js');
  if (fs.existsSync(path.join(appDir, 'seedDisplayNames.js'))) load('seedDisplayNames.js'); // 묶음 K4 표시 이름 표
  load('m2Series.js');

  const htmlPath = path.join(appDir, '벤치마크_배율_계산기.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  // 83단계(L52): 머리에 스크립트 로더(버전 표에 'shared.js' 글자가 있음)가 생겨, 본문 스크립트는 첫 </style> 뒤의 첫 <script>로 찾는다
  // (예전 기준 'shared.js' 태그 뒤 첫 <script>와 같은 위치).
  const scriptStart = html.indexOf('<script>', html.indexOf('</style>')) + '<script>'.length;
  const scriptEnd = html.lastIndexOf('</script>');
  let inline = html.slice(scriptStart, scriptEnd);
  const cut = inline.lastIndexOf('loadState();');
  if (cut === -1) throw new Error('loadState(); 호출을 찾지 못했습니다');
  inline = inline.slice(0, cut);
  vm.runInContext(inline, sandbox, { filename: '벤치마크_배율_계산기.html(inline)' });

  return sandbox;
}

module.exports = { loadApp, APP_DIR: path.join(__dirname, '..', '..') };
