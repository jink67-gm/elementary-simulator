# 에셋·코드 출처와 라이선스

확인일: 2026-11-12

## 지금 게임에 들어 있는 것

| 종류 | 무엇 | 출처 | 라이선스 | 비고 |
|---|---|---|---|---|
| 3D 엔진 | three.js 0.180.0 | https://threejs.org | MIT | npm 패키지 |
| 빌드 | Vite 7, TypeScript 5.9 | https://vite.dev · https://www.typescriptlang.org | MIT · Apache-2.0 | 개발 도구 (게임 파일에는 안 들어감) |
| 테스트 | Vitest 4 | https://vitest.dev | MIT | 개발 도구 |
| 3D 모델 | 교실·복도·급식실 구조, 인물(블록 캐릭터), 돈가스·절단기·크기 조절기 등 | 이 저장소 코드 (`src/world/*.ts`)에서 기본 도형으로 직접 생성 | 이 프로젝트 | |
| 3D 모델 | 책상·의자·가구·급식실 소품 8종 | Poly Haven (아래 표) | CC0 | `public/models/props/` · 못 불러오면 기본 도형으로 대신 |
| 글꼴 | Pretendard (본문, 400·600·700·800, KS X 1001 subset) | https://github.com/orioncactus/pretendard (npm pretendard@1.3.9) | SIL OFL 1.1 | `src/assets/fonts/` · 게임에 포함(인터넷 없이 동작) · 라이선스 `LICENSE-Pretendard.txt` |
| 글꼴 | Jua (제목·이름·시계) | https://fonts.google.com/specimen/Jua (npm @fontsource/jua@5.2.5) | SIL OFL 1.1 | `src/assets/fonts/` · 라이선스 `LICENSE-Jua.txt` |
| PBR 재질 | 인조석 바닥·페인트 벽·참나무·마루 (색·노멀·거칠기) | Poly Haven (아래 표) | CC0 | `public/textures/` · 못 불러오면 단색 재질로 대신 |
| 그림(텍스처) | 칠판·급식표·게시판·시계·바닥 무늬·돈가스 빵가루 | 코드에서 캔버스로 직접 그림 (`canvasTex.ts`) | 이 프로젝트 | 외부 그림 파일 없음 |
| 효과음 | 종소리·줍기·성공·페이지 넘김 등 | WebAudio로 직접 합성 (`src/core/Audio.ts`) | 이 프로젝트 | 외부 소리 파일 없음 |
| 글꼴 | 컴퓨터에 설치된 한글 글꼴 (맑은 고딕 등) | 운영체제 | 각 OS 라이선스 | 글꼴 파일을 배포하지 않음 |

게임에 필요한 파일은 모두 이 저장소 안에 있다. 학교 컴퓨터에서 추가 다운로드·로그인·구독 없이 바로 실행된다.

## 앞으로 쓸 후보 (`docs/ASSET_SOURCE_CANDIDATES.csv`, 전체 목록은 `ASSET_MANIFEST.csv` — 아직 넣지 않음)

넣을 때마다 아래 표에 한 줄씩 추가한다: 파일 경로 · 원본 URL · 제작자 · 라이선스 · 확인일 · 수정 내용.

| 파일 | 원본 URL | 제작자 | 라이선스 | 확인일 | 수정 |
|---|---|---|---|---|---|
| public/models/props/SchoolDesk_01.glb | https://polyhaven.com/a/SchoolDesk_01 | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 교실 학생 책상 · 삼각형 900 |
| public/models/props/SchoolChair_01.glb | https://polyhaven.com/a/SchoolChair_01 | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 교실 학생 의자 · 삼각형 899 |
| public/models/props/metal_office_desk.glb | https://polyhaven.com/a/metal_office_desk | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 교사용 책상 · 삼각형 1567 |
| public/models/props/Shelf_01.glb | https://polyhaven.com/a/Shelf_01 | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 학급 문고 책장 · 삼각형 182 |
| public/models/props/plastic_broom.glb | https://polyhaven.com/a/plastic_broom | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 청소 도구(빗자루) · 삼각형 2842 |
| public/models/props/dustpan.glb | https://polyhaven.com/a/dustpan | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 청소 도구(쓰레받기) · 삼각형 1500 |
| public/models/props/WetFloorSign_01.glb | https://polyhaven.com/a/WetFloorSign_01 | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 복도 미끄럼 주의 표지 · 삼각형 228 |
| public/models/props/classic_laptop.glb | https://polyhaven.com/a/classic_laptop | Poly Haven | CC0 | 2026-11-12 | 512px 텍스처·삼각형 줄임·정점 압축 · 방송실 컴퓨터 · 삼각형 3334 |
| public/textures/terrazzo_tiles/ | https://polyhaven.com/a/terrazzo_tiles | Poly Haven | CC0 | 2026-11-13 | 복도 인조석 바닥 · 1024px로 줄임 (색·노멀·거칠기) |
| public/textures/painted_plaster_wall/ | https://polyhaven.com/a/painted_plaster_wall | Poly Haven | CC0 | 2026-11-13 | 페인트 칠한 벽 · 512px로 줄임 (색·노멀·거칠기) |
| public/textures/oak_veneer_01/ | https://polyhaven.com/a/oak_veneer_01 | Poly Haven | CC0 | 2026-11-13 | 나무 문·창틀·게시판 틀 · 512px로 줄임 (색·노멀·거칠기) |
| public/textures/laminate_floor_02/ | https://polyhaven.com/a/laminate_floor_02 | Poly Haven | CC0 | 2026-11-13 | 교실 마루 · 1024px로 줄임 (색·노멀·거칠기) |
| (코드로 그림) 천장 흡음 텍스·코르크 게시판·모서리 그림자·하늘 | — | 직접 제작 (`src/world/pbr.ts`) | 프로젝트 자체 | 2026-11-13 | 캔버스로 그린 텍스처 |

가공 도구: `tools/assets/fetch_polyhaven.mjs` (Poly Haven API에서 1k glTF를 받아 텍스처 512px, 삼각형 줄이기, 정점 압축).
재질 텍스처: `tools/assets/fetch_textures.mjs` (Poly Haven 1k 색·노멀·거칠기 맵을 512~1024px로 줄이고, 인조석은 회색·벽은 흰색으로 색 보정).

## 보류한 것 (게임에 넣지 않음)

- Poly Haven `painted_wooden_cabinet`(미술 재료함), `metal_trash_can`(쓰레기통): 2026-11-13 교실 리모델링 때 교실 재질과 안 어울려 빼고, `src/world/classroomFurniture.ts`로 직접 만든 수납장·분리수거함으로 바꿈. 학급 문고도 창 아래 낮은 책장으로 직접 제작 (Shelf_01은 급식실에서만 씀).
- Poly Haven `dining_table`, `plastic_monobloc_chair_01`: 급식실 리모델링 때 참고 사진처럼 흰 식탁 + 주황 둥근 의자로 직접 제작해 바꿈 (`src/world/CafeteriaHQ.ts`).
- Poly Haven `pot_enamel_01`(불꽃 무늬 냄비), `brass_pan_01`: 급식실 배식대에 안 어울려 스테인리스 국통·식판 더미로 직접 만들어 바꿈.

| 무엇 | 출처 | 라이선스 | 상태 |
|---|---|---|---|
| 사람 캐릭터 (어린이 체형으로 가공 + 옷 칠하기) | Quaternius Universal Base Characters + Universal Animation Library (quaternius.itch.io, 2026-11-12 받음) | QAL v1.0 — 게임 안 사용·수정 가능, 원본 묶음 재배포 금지 | 사용자 평가 「못 쓰겠다」 → 블록 캐릭터로 되돌림. 가공 도구(`tools/character/build_ubc.py`, `pack_models.mjs`)만 저장소에 남기고 모델 파일은 올리지 않음 |
| MakeHuman 절차 생성 캐릭터 | MakeHuman (CC0 자료) | CC0 | 「기괴함」 평가로 보류 |
| AI 설정화·3D 시험 | Higgsfield | 생성물 (유료 플랜 조건) | 설정화만 `assets/concept/`에 보관, 게임 미사용 |

주의
- Kenney / Poly Haven: CC0. 그래도 출처는 기록한다.
- Quaternius: QAL v1.0 (2026-08-28) — CC0가 아님. 게임 안 사용은 가능하나 원본 묶음 재배포 금지.
- Mixamo: Adobe 계정 필요, 원본 파일 재배포 제한.
- Sketchfab·Poly Pizza 등 개별 모델은 모델마다 라이선스 확인 전 사용 금지.
