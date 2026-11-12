# 초등학생 시뮬레이터: 오늘도 무사히 하교하기

평범한 월요일 오전을 보내다가, AI 학교생활 도우미가 소원을 **문자 그대로** 이뤄 주면서 학교가 엉망이 되는 3인칭 3D 브라우저 게임.
지금 버전은 **1장(Phase 0~1): 등교 → 1교시 국어 → 쉬는 시간 → 2교시 수학 → 3교시 모둠 → 4교시 미술 → 급식실 거대 돈가스 등장**까지예요.

- 기획서: [`GAME_DESIGN.md`](GAME_DESIGN.md) · 개발 규칙: [`CLAUDE.md`](CLAUDE.md) · 에셋 출처: [`assets/SOURCES.md`](assets/SOURCES.md)
- 1인 플레이, 브라우저에만 저장. 로그인·방 만들기·실명 입력 없음 → 학교 컴퓨터 8대에서 각자 바로 실행.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173/elementary-simulator/
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + `dist/`에 배포용 파일 |
| `npm test` | 로직 단위 테스트 (Vitest) |
| `npm run e2e` | 빌드된 게임을 브라우저로 처음부터 끝까지 자동 플레이 (Playwright 필요, 스크린샷은 `test-results/`) |

### GitHub Pages 배포
1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꾼다.
2. `main` 브랜치에 올리면 `.github/workflows/deploy.yml`이 테스트·빌드 후 배포한다.
3. 주소: `https://<계정>.github.io/elementary-simulator/` (저장소 이름을 바꾸면 `vite.config.ts`의 `base`도 바꿔야 함)

## 조작

| 키 | 동작 |
|---|---|
| WASD / Shift | 이동 / 달리기 |
| 마우스 (화면 클릭) · 방향키 · 휠 | 둘러보기 · 카메라 거리 |
| **E** | 조사·줍기·대화 |
| **F** | 들고 있는 물건 사용·놓기 (빈손일 때 손 들기 등) |
| Space | 점프 / 종이비행기를 들고 꾹 눌렀다 떼면 던지기 |
| 1~4 / Tab | 소지품 고르기 / 설명 |
| Enter · Q | 대사 넘기기 · 모두 넘기기 |
| Esc | 메뉴 (설정·자리로 돌아가기·물건 다시 챙기기·저장 파일 내보내기) |

## 1장에서 할 수 있는 것

선택지 버튼이 아니라 **실제로 물건을 만지고 친구와 말하는 행동**이 기록(플래그)으로 남고, 1장 끝 화면과 다음 사건에 이어집니다.

| 구간 | 실제 행동 | 남는 기록 |
|---|---|---|
| 알람 | E 일어나기 / Space 5분만 더 | `overslept` (선생님 대사 변화) |
| 등교 | 가방 들고 책상에 F, 17번 사물함에서 국어책, 급식표 3번 보기, 복도에서 준호 필통 찾아 돌려주기 | `bagOnDesk` `lunchExpert` `helpedFriend` |
| 1교시 국어 | 교과서 넘겨 86쪽 찾기(한 장/뭉텅이), 서아에게 쪽수 알려 주기, 단서 문장 찾기, 짝과 의견 나누기, F로 손 들고 발표 (안 해도 자연스럽게 진행) | `helpedPageFriend` `foundClue` `consultedPartner` `spokeInClass` |
| 쉬는 시간 60초 | 준호 종이비행기 받아 복도에서 날리기(거리 기록), 민재와 가위바위보, 공차기, "쉬는 시간 100분" 복선 | `planeBest` `rpsGames` |
| 2교시 수학 | 충전함에서 태블릿 → 책상에 놓고 켜기, 서아 3% 배터리: 선생님 서랍 충전기 찾아 주기 또는 같이 보기, 퀴즈 3문제(4~6학년 설정), AI 소원 설문 | `helpedDevice` `quizScore` `playerWish` |
| 3교시 모둠 | 역할 카드 집기 → 발표(문장 카드 배열) / 제작(포스터 스티커 끌어 놓기) / 자료(게시판·전자칠판·학급 문고 조사, AI 설명서 단서) / 정리(재료 6개를 바구니에 분류) | `groupRole` `schoolPosterTheme` `foundAIManual` |
| 4교시 미술 | 색종이 → 종이비행기 접기(화살표) 또는 도화지 → 하린에게 풀 빌려 미니 포스터, 게시판 전시, 풀 돌려주기, 친구들 초고속 정리, 종이 조각 분리수거 | `artPlane/artPoster` `exhibited` `returnedGlue` |
| 점심 | 급식실 앞 AI 방송 → 문이 열리고 거대 돈가스 등장 → 1장 기록 요약 | `chapter1Done` |

진행 막힘 방지: 교시마다 시간 제한이 지나면 선생님·친구가 정리해 주고 다음으로 넘어가요. 메뉴의 「자리로 돌아가기」「필요한 물건 다시 챙기기」로 길을 잃거나 물건을 떨어뜨려도 복구돼요.
저장: 교시가 시작될 때마다 자동 저장(localStorage). 새로고침하면 「이어하기」로 그 교시 처음부터. 메뉴에서 JSON 내보내기 → 다른 컴퓨터 타이틀에서 불러오기.

## 파일 구조

```
src/
  main.ts                 시작 · 디버그 API(?debug)
  core/                   Game(루프·렌더러), Input, Audio(합성 효과음), SaveData·SaveManager, Settings
  world/                  SchoolMap(교실·복도·급식실), Character(블록 인물), Collision, NavGrid(A*), Toys(종이비행기·공), merge(그리기 호출 줄이기)
  player/                 Player, ThirdPersonCamera, Inventory(4칸)
  npc/Npc.ts              걷기·앉기·손들기, 취소 가능한 이동
  interact/Interaction.ts E/F 대상 고르기(거리 + 바라보는 방향)
  story/                  Morning(1장 진행·대사·플래그), schedule(시간표·시계)
  minigames/              Textbook, Tablet(퀴즈·설문), Poster, SmallGames(가위바위보·문장 카드·접기)
  ui/                     Hud, Dialogue, Panel, Menus
tests/logic.test.ts       저장·소지품·충돌·길찾기·쪽수·퀴즈·시간표 단위 테스트
scripts/e2e.mjs           브라우저 자동 플레이 테스트
```

## 다음 단계 (Phase 2)
- 사건 1 「거대 돈가스」: 급식실 내부, 안전 절단 패널 + 프리컷 조각, 식판 배식 6명, 음식 크기 조절기(논리 퍼즐), 돈가스 축제 경로.
- 오전 기록 반영: `helpedFriend`면 준호가 돕기, `foundAIManual`이면 조절기 힌트, `playerWish`에 따라 AI 방송 변화 등.
- 임시 도형을 Kenney CC0 모델로 교체할지 결정 (출처는 `assets/SOURCES.md`에 기록).
