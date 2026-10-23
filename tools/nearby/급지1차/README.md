# 급지 1차 NEARBY 점검 도구

목록표(`redevelopment-list/재개발_목록표.html`)의 `const NEARBY` 줄은 급지 1차 빌드 결과입니다(`nearby_급지1차_1028.js`, `meta.basis = '급지1차'`). 예전 `tools/nearby/check_nearby.js`는 옛 빌더(`build_nearby.js`)로 다시 계산해 비교하므로, 이 판에서는 '재생성 필요'로 나옵니다. 배포 전 점검은 아래 도구를 씁니다.

| 도구 | 사용 | 보는 것 |
|---|---|---|
| `check_nearby_1차.js` | `node check_nearby_1차.js <저장소> <목록표 HTML> <작업 tools 폴더>` | 입력 13개 해시(`입력목록_1028.json`) · 목록표 NEARBY = 빌드 결과 파일 · 공개용 지정 파일 열 |
| `nb_1차_verify.py` | `python nb_1차_verify.py <목록표 HTML> <작업 tools 폴더> [저장소]` | B0~B10(급지 = 계산 평균 구간, 지정 66곳, 초고가 단지 사용 지역, 경기 단지는 구로·금천만, 개봉동 목록, 표시값, 구역 지정 포함, 신축 확인값, 인천 구역 경기 단지 0, 메타 글자) |
| `l3_check_1차.py`, `public_check_1차.py` | 작업 tools 폴더(저장소 밖) | 화면 점검 · 공개 글자 점검(단지 이름 예외 포함) |

- 빌드 스크립트·입력 목록(구역별·법정동별 포함/제외, 신축 확인값)은 작업 tools 폴더 `nearby/급지1차/`에 있습니다.
- 송파 8곳 경기 단지는 기본 제외입니다. 빌드할 때 `SONGPA_GI=1`을 주면 포함(확인 필요 표시)으로 바뀝니다(`meta.songpaGi` 기록).
