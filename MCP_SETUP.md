# Claude Code 추천 스킬 · MCP · 외부 커넥터 설정

기준: 2026-11-12 공식 문서 확인. **실제 컴퓨터에 자동 설치된 상태가 아니다.** 아래는 설치 지침이다.

## 우선순위
1. **Context7**: 최신 Three.js/Vite API 문서 검색.
2. **Chrome DevTools MCP**: 실 브라우저 화면/콘솔/네트워크/성능 확인. 플러그인 설치 시 관련 스킬 포함.
3. **프로젝트 자체 Skills**: 패키지 `.claude/skills/`에 사전 포함, 추가 다운로드 불필요.
4. Playwright MCP: 여러 동작 자동화/테스트를 추가할 때.
5. Blender MCP: 무료 모델의 학교 버전 수정/GLB 변환 자동화가 필요할 때만.
6. Frontend Design Skill: HUD/타이틀/설정 화면의 디자인 개선. 공식 마켓플레이스에서 최신 설치 경로 확인.

## Context7 (Claude Code 내부 명령)
```text
/plugin marketplace add upstash/context7
/plugin install context7@context7-marketplace
```
대안 터미널 설정: `npx ctx7 setup --claude` (CLI 또는 MCP 선택). `/mcp`로 확인, 안내되는 인증 진행.
- https://github.com/upstash/context7/blob/master/docs/clients/claude-code.mdx

## Chrome DevTools MCP (Claude Code 내부 명령)
```text
/plugin marketplace add ChromeDevTools/chrome-devtools-mcp
/plugin install chrome-devtools-mcp@chrome-devtools-plugins
```
한 번만 설치. 이미 플러그인에 포함된 MCP를 중복 설치하지 않는다. 브라우저의 개인정보·학생정보 노출에 유의.
- https://github.com/ChromeDevTools/chrome-devtools-mcp

## Playwright MCP (터미널 명령)
```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```
- https://github.com/microsoft/playwright-mcp

## Blender MCP (선택·터미널 명령)
```bash
# Blender 설치와 uvx 준비가 선행되어야 함
uvx blender-mcp install-addon
claude mcp add blender -- uvx mcp-for-blender
```
※ 저장소/배포판 리브랜딩에 따라 `uvx blender-mcp`와 `uvx mcp-for-blender` 지침이 함께 보일 수 있다. 사용 전 공식 저장소의 최신 설치 절차를 확인하고 일관된 버전으로 설치한다. Blender에서 애드온을 활성화한 뒤 MCP 서버를 시작해야 한다. Python 실행 권한이 있으므로 신뢰할 수 있는 환경에서만 사용.
- https://github.com/ahujasid/mcp-for-blender

## Frontend Design Skill
- 공식 파일: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Claude Code `/plugin`의 공식 마켓플레이스에서 `frontend-design`을 찾고 안내에 따라 설치.
- 동일한 이름의 다른 제작자 스킬을 중복 설치하지 않는다.

## 프로젝트 자체 Skills
- `.claude/skills/classroom-life-design/SKILL.md`
- `.claude/skills/threejs-vertical-slice/SKILL.md`
- `.claude/skills/game-qa-and-assets/SKILL.md`
문서: https://code.claude.com/docs/en/skills

## 연결/해제/보안
```bash
claude mcp list
claude mcp get playwright
claude mcp remove playwright
```
프로젝트/계정에 따라 권한 승인 화면이 나타난다. 외부 서비스 커넥터가 게임을 자동 완성하는 것은 아니다. 비밀번호/토큰/학생 실명/사진을 외부 MCP에 보내지 않는다.
