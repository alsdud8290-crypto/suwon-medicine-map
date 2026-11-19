# 수원시 폐의약품 수거지도

수원시 폐의약품 수거함·보건소·수거 약국을 지도와 검색으로 찾는 사이트예요. 빌드 과정 없이 정적 파일로 동작해요.

## 폴더 구성

```
website/
  index.html        화면 구조
  css/style.css     디자인
  js/app.js         지도·검색·필터 동작
  img/              일러스트(SVG)
  data/data.js      자동 생성 데이터 — 직접 고치지 말 것
tools/
  build_data.py     원본 CSV·XLSX → data/data.js 변환
  xlsx_reader.py    엑셀 읽기 (추가 설치 불필요)
  suwon_dong_boundary_20261001.json   수원시 행정동 경계
```

## 데이터 갱신

1. 프로젝트 폴더의 원본 파일(`경기도_수원시_폐의약품수거함.csv`, `수원시_폐의약품_수거처.xlsx`, `수원시 폐의약품 수거함 설치장소.xlsx`)을 새 파일로 교체해요.
2. 프로젝트 폴더에서 `python3 tools/build_data.py`를 실행해요.
3. 출력에 `gu mismatches`가 나오면 주소의 구와 좌표 위치가 다른 곳이니 확인이 필요해요.

## 미리보기

`website` 폴더에서 `python3 -m http.server`를 실행한 뒤 http://localhost:8000 을 열어요.
(`index.html`을 더블클릭해도 열리지만, '내 주변 순'은 http 주소에서만 동작할 수 있어요.)

## 공개(배포)

GitHub Pages로 공개돼 있어요.

- 사이트: https://alsdud8290-crypto.github.io/suwon-medicine-map/
- 저장소: https://github.com/alsdud8290-crypto/suwon-medicine-map

수정한 뒤 다시 올릴 때는 `website` 폴더에서 아래처럼 실행해요. 1~2분 뒤 사이트에 반영돼요.

`css/style.css`, `js/app.js`, `data/data.js`를 고쳤다면 `index.html`에서 그 파일 주소 뒤의 `?v=숫자`도 바꿔 주세요. 안 바꾸면 휴대폰이 예전 파일을 최대 10분 동안 계속 써요.

```
git add -A
git commit -m "수정 내용"
git push
```

원본 엑셀·CSV와 `tools` 폴더는 저장소에 올리지 않아요(엑셀에 담당자 이름·연락처가 있어요).

포스터용 링크 예시 (QR코드는 이 주소로 만들어요):
- 첫 화면: `https://alsdud8290-crypto.github.io/suwon-medicine-map/`
- 약국만 보기: `…/?type=pharmacy`
- 영통구만 보기: `…/?gu=영통구`
- 특정 장소 바로 열기: `…/#p=번호` (장소를 누르면 주소창에 번호가 표시돼요)

## 출처 표시 (지우지 마세요)

- 수거함·보건소: 공공데이터포털 전국폐의약품수거함표준데이터 (수원시, 기준일 2026-07-14)
- 행정경계: 통계청 행정동 경계, vuski/admdongkor ver20261001 — CC BY 4.0 (출처 표시 필요)
- 배경지도: © OpenStreetMap 기여자
