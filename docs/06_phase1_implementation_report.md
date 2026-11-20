# 06. 개발 1단계 구현/검증 보고서

- 작성일: 2026-11-17
- 구현 대상: Windows 내부 개발용 Electron + React 기본 화면
- 상태: **소스 구현 / 정적 검사 통과 / 실제 Windows 실행 미검증 — 1단계 최종 완료 아님**
- 원본 요구사항 v0.2 및 docs/01~05 보존

## 구현 항목
| 1단계 작업 | 결과 | 근거 |
|---|---|---|
| 1-01 앱 소스/스크립트 | 소스 작성 | package.json, tsconfig, vite.config, README |
| 1-02 Electron/React 분리 | 소스 작성 | src/main, src/preload, src/renderer |
| 1-03 4개 화면 | 소스 작성 | 홈/AI 만들기/내 게임/설정 React UI |
| 1-04 한국어 및 영어 확장 | 소스 작성 | src/renderer/i18n/messages.ts, 설정에서 UI 언어 전환 |
| 1-05 미구현 기능 차단 | 소스 작성 | AI 제출 비활성화, 실제 게임/서버 액션 없음 |
| 1-06 기본 보안 설정 | 정적 검사 통과 | renderer sandbox/context isolation, 팝업/이동/권한 거부, 단일 읽기 전용 IPC, CSP |
| 1-07 문서/로그 | 완료 | 기존 docs 유지, 이 보고서, 실행 안내 |
| 1-08 자동 테스트 | **6/6 통과** | `npm test` (Node.js 내장 테스트 러너) |
| 1-09 Windows 실행 확인 | **미검증** | 현재 실행 환경은 Windows가 아니며 npm 레지스트리 연결 불가 |

## 실행한 테스트
- `npm test`: **6개 통과, 0개 실패**. 항목: 화면 존재/메뉴 연결, 한국어·영어 텍스트, 미구현 기능 비활성화/IPC 범위, Electron 렌더러 보안 설정, 개발 주소 검증, 원본 docs 및 2~5단계 범위 부재
- `node --check` on main/security/preload: **통과**
- TypeScript `transpileModule` 구문 검사(App.tsx/main.tsx/messages.ts/vite.config.ts): **4개 모두 통과**
- `npm run build`: **완료되지 않음**. `npm install`을 수행할 수 없어 React, Vite, `@types/react` 등 필수 종속성이 없어 TS2307 및 후속 JSX 타입 오류가 발생. 이는 성공한 빌드가 아니며 의존성 설치 후 재검증해야 함.
- Electron 창 실행/실제 클릭/Windows 설치 패키지: **미실행 / 미검증**

## 빌드 장애
2026-11-17 `npm view electron version --fetch-retries=0 --fetch-timeout=8000` 실행 시 `EAI_AGAIN registry.npmjs.org` 네트워크 DNS 오류. 이 환경은 npm 종속성을 설치하지 못함. 실제 패키지 설치 후 버전/호환성/라이선스와 보안 취약점 확인 필요.

## 사용자 PC 검증 체크리스트
1. Windows 10/11에서 Node.js LTS와 npm 준비, 이 압축을 빈 폴더에 압축 해제
2. `npm install`
3. `npm test` — 6개 테스트 통과 확인
4. `npm run build` — TypeScript/Vite 실제 빌드 확인
5. `npm run dev` — 데스크톱 창이 뜨는지 확인
6. 네 메뉴를 마우스와 Tab/Enter 키로 왕복, 한국어/영어 변경
7. AI 생성 버튼이 비활성화되어 있고 게임/로그인 기능이 작동하지 않는지 확인
8. 오류가 있다면 터미널 메시지와 Windows 버전 기록

## 중요 주의
- 이 단계의 내부 시제품은 실서비스에 사용하거나 불특정 사용자에게 공개 배포하면 안 됨. 로그인/상시 연결 정책은 향후 단계에서 실제 구현되며 **현재 예외를 허용한 것은 내부 개발 테스트뿐**.
- CSP, Electron UI renderer의 격리 설정은 구현했지만 **임의 생성 게임 실행 안전성을 보장하지 않음**. Godot/AI/외부 게임 실행은 아예 구현하지 않음.
- 사용자가 다음 단계를 승인하기 전에는 2단계 AI 기능을 구현하지 않음.
- Windows에서 `npm install`로 해결 가능한지 추가 검증 전에는 "최종 완료"로 보고하지 않음.


## 원클릭 실행 보조 도구 (추가)
- `START_AI_GAME_HUB.bat`: Node.js/npm 확인 → 필요 시 `npm install` → `npm run build` → `npm start`. 오류가 생기면 창을 유지하고 안내 표시.
- `BUILD_WINDOWS_INSTALLER.bat`: 사용자의 Windows PC에서 서명되지 않은 내부 테스트 설치 파일 생성 지원. 완성 EXE가 ZIP 안에 들어 있는 것은 아님.
- 검증 범위: 파일 존재 및 명령 흐름 정적 검사, 기존 Node 테스트. Windows에서 실제 더블클릭, npm 설치, Electron 창 생성 및 설치 패키징은 미검증.
