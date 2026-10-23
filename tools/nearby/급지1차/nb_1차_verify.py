# 53차(배포용, 1028): 내용은 1027판과 같음
# 52차(27차용): B9 인천 구역은 경기 단지(인천 밖 비서울 단지)를 계산에 쓰지 않음 · B10 meta.rule에 '대표님' 없음
# 51차(26차용): B4 송파 제외면 구로·금천만 · B7 구역 지정 포함 위치(zi) = 구역별 포함 목록 · B8 신축 확인값 = 신축_시세_확인값.csv
# 급지 1차 판 NEARBY 자료 점검(49차, nb18_verify의 급지 1차 기준판). 화면 쪽은 gj_shot.py가 봄
#   사용: python nb_1차_verify.py <목록표 HTML> <tools 폴더>
#   B1 지정 아닌 구역: 급지 = 계산 평균(c[1], 뺀 위치, 대장 가중)이 들어가는 급지 구간
#   B2 지정 급지 = 공개용 지정 파일과 같은 급지·같은 수(66) · 자동 급지는 6번째 값에 남음
#   B3 초고가 단지: 래미안원베일리·아크로리버파크 반포동만, 트리마제 성수동만, 한남더힐 없음, 자기 법정동만 9곳
#   B4 경기 단지(표시 4)를 쓰는 서울 구역 = 구로·금천(광명만)·송파(확인 필요)뿐
#   B5 개봉동 법정동 목록 구역에 래미안목동아델리체·철산자이브리에르 없음
#   B6 표시값: 연식 보정(1)이면 KB 현재가(c[5]) 있음 · 확인값(2)·실거래(8)는 신축(준공 2024~)
import json, re, sys, csv, os, collections
sys.stdout.reconfigure(encoding='utf-8')
LIST, TOOLS = sys.argv[1:3]
h = open(LIST, encoding='utf-8').read().replace('\r\n', '\n')
m = re.search(r'\n  const NEARBY = (\{.*?\});   //', h); N = json.loads(m.group(1))
a = h.index('const REDEV_DATA = ') + 19; R = json.loads(h[a:h.index(';\n', a)])
uid = lambda r: '|'.join([r.get('sheet') or '', r.get('name') or '', '' if r.get('subCode') is None else str(r['subCode'])])
Z = {}; [Z.setdefault(uid(r), r) for r in R]
rows = N['grade']['rows']; fails = []
def chk(ok, msg, ex=None):
    print(('✓ ' if ok else '✗ ') + msg + ('' if ok or ex is None else ' ' + json.dumps(ex, ensure_ascii=False)[:300]))
    if not ok: fails.append(msg)
chk(N['meta'].get('basis') == '급지1차', 'B0 급지 1차 판')
bad = []; n = 0
for k, v in N['z'].items():
    g = N['g'][k][0]
    if not g or len(g) > 5: continue
    lead, mode, gi, cut, w = g; ps = [(i, N['c'][ci][1]) for i, (ci, d) in enumerate(v) if not (cut >> i & 1)]
    sw = sum((w if i == lead else 1) for i, _ in ps); avg = sum(p * (w if i == lead else 1) for i, p in ps) / sw / 10000; lo, hi = rows[gi]['range']; n += 1
    if not ((lo is None or avg > lo) and (hi is None or avg <= hi)): bad.append((k, round(avg, 2), rows[gi]['label']))
chk(not bad, f'B1 지정 아닌 {n}곳 급지 = 계산 평균 구간', bad[:5])
ov = {k: g[0] for k, g in N['g'].items() if g[0] and len(g[0]) > 5}
pub = list(csv.DictReader(open(os.path.join(TOOLS, 'nearby', '급지_대표님지정_공개.csv'), encoding='utf-8-sig')))
disp = lambda k: k.split('|')[1] + (' ' + k.split('|')[2] if k.split('|')[2] else '')
badov = [(r['구역명'], r['지정 급지']) for r in pub if not any(k.startswith(r['시트'] + '|') and disp(k) == r['구역명'] and rows[ov[k][2]]['label'] == r['지정 급지'] for k in ov)]
chk(len(ov) == len(pub) == 66 and not badov, f'B2 지정 급지 {len(ov)}곳 = 공개용 파일 {len(pub)}곳', badov[:5])
zd = lambda r: re.sub(r'\d.*$', '', (str(r.get('jibun') or '').strip().split() or [''])[0])
U = {'래미안원베일리': ('반포동',), '아크로리버파크': ('반포동',), '트리마제': ('성수동',), '한남더힐': ()}
use = lambda k: [N['c'][ci] for i, (ci, d) in enumerate(N['z'][k]) if not (N['g'][k][0][3] >> i & 1)] if N['g'][k][0] else []
b3 = [(k, c[0]) for k in N['z'] for ci, d in N['z'][k] for c in [N['c'][ci]] if c[0] in U and not any(zd(Z.get(k, {})).startswith(x) for x in U[c[0]])]
chk(not b3, 'B3 초고가 단지 사용 지역(원베일리·아크로 반포동, 트리마제 성수동, 한남더힐 없음)', b3[:5])
GOK = ('구로구', '금천구', '송파구') if N['meta'].get('songpaGi') else ('구로구', '금천구')
b4 = [(k, Z.get(k, {}).get('gu')) for k in N['z'] if (Z.get(k, {}).get('sido') or '서울') == '서울' and any(N['c'][ci][4] & 4 for ci, d in N['z'][k]) and Z.get(k, {}).get('gu') not in GOK]
chk(not b4, 'B4 경기 단지를 쓰는 서울 구역은 ' + '·'.join(g[:2] for g in GOK) + '뿐(송파 ' + ('포함' if N['meta'].get('songpaGi') else '제외') + ')', b4[:5])
b5 = [(k, N['c'][ci][0]) for k in N['z'] if zd(Z.get(k, {})) == '개봉동' for ci, d in N['z'][k] if N['c'][ci][0] in ('래미안목동아델리체', '철산자이브리에르')]
chk(not b5, 'B5 개봉동 법정동 목록 구역에 아델리체·철산브리에르 없음', b5[:5])
b6 = [c[0] for c in N['c'] if (len(c) < 6) or ((c[4] & 1) and c[5] is None) or ((c[4] & 10) and not (isinstance(c[2], int) and c[2] >= 2024))]
chk(not b6, f'B6 표시값(연식 보정·확인값·실거래) {collections.Counter(("보정" if c[4] & 1 else "") + ("확인값" if c[4] & 2 else "") + ("경기" if c[4] & 4 else "") + ("실거래" if c[4] & 8 else "") for c in N["c"] if c[4])}', b6[:5])
INC = collections.defaultdict(set)
for r in csv.DictReader(open(os.path.join(TOOLS, 'nearby', '단지_구역별포함.csv'), encoding='utf-8-sig')): INC[(r['시트'], r['구역명'])].add(r['단지명'])
X = json.load(open(os.path.join(TOOLS, 'nearby', '급지1차', '구역별_포함제외_1025.json'), encoding='utf-8'))
for e in X.get('inc', []): INC[(e['key'].split('|')[0], disp(e['key']))].add(e['name'])
R4 = {'재건축단독|방배14|': {'디에이치방배', '방배롯데캐슬아르떼', '방배그랑자이'}, '신통기획|사당21|': {'방배그랑자이', '방배롯데캐슬아르떼'}}   # 급지1차_빌드의 R4B(방배14 고정 목록·사당21 포함)
zi = N.get('zi', {}); b7 = []
for k, v0 in N['z'].items():
    want = INC.get((k.split('|')[0], disp(k)), set()) | R4.get(k, set()); got = {N['c'][v0[i][0]][0] for i in zi.get(k, [])}
    if got != {N['c'][ci][0] for ci, d in v0 if N['c'][ci][0] in want}: b7.append((k, sorted(got), sorted(want)))
chk(not b7 and len(zi) > 0, f'B7 구역 지정 포함 표시 {len(zi)}곳 = 구역별 포함 목록에 있는 단지', b7[:3])
NC = {r['단지명']: round(float(r['확인값(억)']) * 10000) for r in csv.DictReader(open(os.path.join(TOOLS, '배포준비', '신축_시세_확인값.csv'), encoding='utf-8-sig'))}
b8 = [(c[0], c[1], NC.get(c[0])) for c in N['c'] if (c[4] & 2) and NC.get(c[0]) != c[1]]
chk(not b8 and any(c[4] & 2 for c in N['c']), f'B8 신축 확인값 = 신축_시세_확인값.csv ({", ".join(k + " " + str(v / 10000) + "억" for k, v in NC.items())})', b8[:3])
REPO = sys.argv[3] if len(sys.argv) > 3 else 'C:/Users/druck/repos/wt-stagehist'   # 단지 시·군은 배포 저장소 좌표 원본(읽기만)
GU = {}
for rel in ('price-correction/data/seoul_coords_v3.json', 'price-correction/data/gi_coords_v1.json'):
    for kk, v in json.load(open(os.path.join(REPO, rel), encoding='utf-8')).items():
        if kk != '_meta' and isinstance(v, list):
            for n in (kk, v[2] if len(v) > 2 else None):
                if n and n not in GU: GU[n] = str(v[5] if len(v) > 5 else '')
ic = [k for k in N['z'] if Z.get(k, {}).get('sido') == '인천']
b9 = [(k, N['c'][ci][0], GU.get(N['c'][ci][0])) for k in ic for i, (ci, d) in enumerate(N['z'][k]) if (N['c'][ci][4] & 4) and not (N['g'][k][0][3] >> i & 1) and not GU.get(N['c'][ci][0], '인천').startswith('인천')]
chk(not b9, f'B9 인천 구역 {len(ic)}곳은 경기 단지를 계산에 쓰지 않음', b9[:5])
chk('대표님' not in json.dumps(N['meta'], ensure_ascii=False), 'B10 NEARBY 메타 글자에 "대표님" 없음')
print('시험 결과: 실패', len(fails))
