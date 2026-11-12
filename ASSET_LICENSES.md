# 에셋 이용 조건과 출처 표시

확인일: 2026-11-12. 라이선스가 불확실한 파일은 게임에 넣지 않는다.

## 이용 중

| 대상 | 라이선스 | 출처 표시 의무 | 비고 |
|---|---|---|---|
| three.js | MIT | 저작권 고지 유지 (npm 패키지에 포함) | |
| 코드로 만든 모델·텍스처·효과음 (`src/`) | 이 프로젝트 | 없음 | Phase 1 전부 |

## 사용 예정 — 확인 결과

| 대상 | 조건 | 확인 상태 |
|---|---|---|
| **Higgsfield 생성물** | 공식 도움말: 회사가 입력·출력의 소유권을 주장하지 않음, 이용약관이 출력물의 상업적 이용을 제한하지 않음, 요금제와 무관. 출력물로 AI 모델 학습 금지. 회사는 서비스 운영 범위의 비독점 라이선스와 마케팅 사용 권한을 가짐 | ⚠️ 2026-08-27 개정 약관 원문과 **무료 체험 결과물 조건(워터마크·개인용 제한 여부)** 은 로그인 후 확인 필요. 확인 전에는 배포본에 넣지 않음 |
| Poly Haven 모델·재질 | CC0 (출처 표시 의무 없음, 재배포 가능) | ✅ 다운로드 가능 확인. 그래도 파일별 출처를 기록 |
| Kenney | CC0 | 이 환경에서 접속 불가 |
| Quaternius | QAL v1.0 (2026-08-28 개정) 원문 확인: 개인·교육·상업 게임에 무료, 출처 표시 불필요, **수정 허용**, 게임에 넣어 배포·판매 허용. 금지: 에셋 자체를 단독 에셋·에셋 팩·템플릿으로 재배포(수정해도 동일), 직접 만들었다고 주장. 7항: 받은 시점의 라이선스가 적용. 팩 페이지·FAQ는 아직 'CC0'로 표기 → 받는 날짜와 표기를 기록해 둘 것 | 사용 시 공개 저장소에는 게임에 쓰는 가공본만 두고 원본 팩(zip/blend/fbx)은 올리지 않기 + `assets/` 안내문에 '이 게임 밖에서 재사용 금지' 명시 |
| Mixamo | Adobe 계정, 원본 재배포 제한 | 사용 안 함 |

## 지켜야 할 것

- 실제 학생·인물 사진, 유명 게임·애니메이션 캐릭터를 프롬프트나 참고 이미지로 쓰지 않는다.
- 파일을 추가할 때마다 `ASSET_MANIFEST.csv`의 출처 URL·라이선스·파일 경로를 채운다.
- 모든 에셋은 저장소에 파일로 들어가 있어야 한다 (외부 서비스 해지 후에도 실행).

## 참고한 자료

- Quaternius 라이선스: https://quaternius.com/license.html · FAQ: https://quaternius.com/faq.html

- Higgsfield CLI 모델 목록: https://github.com/higgsfield-ai/cli/blob/main/MODELS.md
- Higgsfield 도움말 (생성물 소유권·상업적 이용): https://higgsfield.ai/creator-hub/help-center/account-and-privacy/who-owns-my-generations-and-can-i-use-them-commercially
- Higgsfield 약관 개정 안내: https://higgsfield.ai/es/blog/terms-of-use-privacy-policy-update
- Poly Haven 라이선스: https://polyhaven.com/license
