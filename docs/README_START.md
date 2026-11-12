# 초등학생 시뮬레이터 — Claude Code 제작 패키지

이 패키지는 **완성 게임이 아니라 게임을 제작하기 위한 상세 설명서 + 작업 지시 + 프로젝트 스킬 + 에셋 출처 목록**입니다.

## 파일 안내
- `GAME_DESIGN.md` — 전체 스토리, 오전 수업, 사건별 조작, 기술, 배포, QA 통합 제작 설명서.
- `CLAUDE.md` — Claude Code가 개발 중 항상 참고할 프로젝트 규칙.
- `CLAUDE_CODE_KICKOFF_PROMPT.md` — 처음 Claude Code에 복사할 작업 지시문.
- `MCP_SETUP.md` — 외부 연결 도구와 스킬의 추천·설치 명령.
- `ASSET_MANIFEST.csv` — 무료 3D/사운드/UI 에셋의 원본 링크와 라이선스.
- `.claude/skills/*/SKILL.md` — 별도 설치 없이 프로젝트에 넣는 개발 보조 스킬.

## 사용 순서
1. 새 게임 프로젝트 폴더를 만든다.
2. 패키지 안의 파일과 `.claude/` 폴더를 프로젝트 루트에 복사한다.
3. 가능하면 공식 지침에 따라 Context7과 Chrome DevTools MCP를 연결한다(선택 사항).
4. Claude Code를 그 폴더에서 실행한다.
5. `CLAUDE_CODE_KICKOFF_PROMPT.md`의 내용을 복사해 전달한다.
6. 처음부터 전체 게임을 만들지 말고 **Phase 0 → Phase 1 → Phase 2** 순서로 진행한다.

## 중요한 안내
- 기술 스택: Vite + TypeScript + Three.js.
- 1차 버전: 1인 플레이/브라우저 로컬 저장, 컴퓨터 8대 독립 실행. Firebase 방 만들기 불필요.
- 무료 자산도 각각 라이선스가 다르다. 특히 Quaternius의 2026년 QAL을 확인하고 원본 묶음을 그대로 재배포하지 않는다.
- 실제 에셋 파일은 이 ZIP에 넣지 않았다. 공식 링크에서 필요한 것만 골라 다운로드한다.
- 모든 장면이 실제로 조작 가능한지 단계별로 검증한다.
