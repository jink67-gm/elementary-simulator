# AI 에셋 생성 기록

AI로 만든 에셋마다 한 줄씩 남긴다. 실제 실행한 것만 적는다.

| 날짜 | 에셋ID | 도구 · 모델 | 프롬프트 / 입력 | 옵션 | 소모 크레딧 | 결과 파일 | 결과 |
|---|---|---|---|---|---|---|---|
| 2026-11-12 | concept 4장 | Higgsfield · gpt_image_2_6 (medium) | 남학생·여학생·담임 선생님·반 친구 3명 설정화 (가상 인물, 실존 인물·기존 캐릭터 아님 명시) | 16:9 | 0.5 × 4 = 2 | assets/concept/*.png | 성공 |
| 2026-11-12 | A01-01 시험 | Higgsfield · sam_3_3d | assets/concept/boy_front.png (설정화 정면 잘라냄) | textured GLB | 1 | assets/source/ai/boy_sam3d.glb | 앞모습·옷·색은 시안과 비슷, 얼굴이 거칠고(약 5,600 삼각형) 뒷면이 어두움 → 게임 적용 보류 |

## 도구 점검 기록

| 날짜 | 내용 | 결과 |
|---|---|---|
| 2026-11-12 | 헤드리스 Blender(bpy 5.3.0)로 메시+뼈대+자동 웨이트+키프레임 애니메이션 → GLB 내보내기 | 성공 (애니메이션 `RaiseHand` 포함 GLB 생성, gltf-transform로 확인). 크레딧 0 |
| 2026-11-12 | Higgsfield 접속 확인 | 실패: 세션에 커넥터 없음, `higgsfield.ai` 네트워크 차단 |
| 2026-11-12 | Higgsfield 커넥터 연결 확인, 잔액 10크레딧, 3D 모델별 견적 조회 (`docs/ASSET_PLAN.md`) | 성공. 생성은 아직 없음 (소모 0) |
| 2026-11-12 | 환경 네트워크 허용: `upload.higgsfield.ai`, `d2ol7oe51mr4n9.cloudfront.net` (결과 GLB 내려받기·올리기) | 허용됨 |
| 2026-11-12 | MakeHuman(CC0) 인체를 코드로 가공한 캐릭터 11종 (tools/character/build_character.py) | 뼈대·동작은 정상 동작, 게임 안 걷기·앉기·손들기 확인. 사용자 평가: 얼굴·체형이 기괴함 → 게임 적용 보류, assets/source/procedural 에 보관 |
| 2026-11-12 | 무료 자동 리깅 (tools/character/rig_mesh.py)로 sam_3_3d 결과에 뼈대·동작 추가 | 걷기는 동작, 앉기에서 팔 늘어짐 문제 있음 (수정 필요) |

