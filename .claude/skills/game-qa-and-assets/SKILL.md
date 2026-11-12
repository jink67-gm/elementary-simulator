---
name: game-qa-and-assets
description: 어린이 PC 게임의 진행 불가 버그, 8대 컴퓨터 독립 실행, 저장, 성능, 에셋 라이선스를 검사한다.
---

# Game QA and Assets

- 모든 챕터에서 진행 막힘 가능성을 찾고 재시도/리셋/자동 저장 복구 확인.
- 브라우저 콘솔, 에셋 다운로드 404, 모델 크기, FPS, 메모리, 컷신 스킵 점검.
- 로딩 중에는 단계 표시, 실패 시 명확한 한국어 안내와 재시도 제공.
- 학교 컴퓨터 8대에서 로그인·방 입장 없이 독립 실행하는지 테스트.
- `ASSET_MANIFEST.csv` 및 `assets/SOURCES.md`를 대조해 라이선스·원본 URL 확인.
- Kenney/Poly Haven CC0와 Quaternius QAL, Mixamo 이용 조건을 구별.
- 실명·학생 사진·개인 식별 데이터나 외부 API 키 저장/전송 금지.
- 완료 보고 때 `수행한 테스트 / 검증 완료 / 미검증 위험`을 구분.
