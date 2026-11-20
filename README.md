# AI Game Hub — 개발 1단계 (내부 프로토타입)

> **중요:** 현재 앱은 로그인·AI·Godot·공유 기능이 없는 **내부 개발용 화면 시제품**입니다. 일반 서비스로 배포하지 마세요. 원본 요구사항 문서의 상시 인터넷/로그인 필수 정책은 변경되지 않았으며 4단계 이전에는 서비스 운영이 금지됩니다.

## 포함된 기능
- Electron + React + TypeScript + Vite Windows 데스크톱 앱 기반
- 홈, AI 게임 만들기(입력 UI 예시만), 내 게임(빈 상태), 설정
- 한국어/영어 화면 전환(일시적 UI 상태만 유지)
- 로그인/게임 실행/공유 등 미완성 기능 명시 및 작동 차단
- Electron 렌더러 기본 격리, 제한된 읽기 전용 IPC, 탐색 및 외부 팝업 차단
- 이전 설계 문서 `docs/` 보존

## Windows 원클릭 설치 및 실행
프로젝트 폴더에서 **`START_AI_GAME_HUB.bat`을 더블클릭**하세요. 첫 실행은 Node.js와 npm을 사용해 의존성을 설치합니다. 이후 빌드한 화면을 Electron 창에 표시합니다. 의존성을 처음 내려받을 때는 인터넷 연결이 필요합니다.

선택적으로 Windows PC에서 `BUILD_WINDOWS_INSTALLER.bat`을 더블클릭하면 내부 테스트용 설치 EXE를 빌드할 수 있습니다. 이 EXE는 ZIP에 포함되어 있지 않으며 빌드하면 `release/`에 생성됩니다.

수동 실행 방법도 계속 지원합니다.

사전 준비: Windows 10/11, Node.js LTS 및 npm, 인터넷 연결 (최초 의존성 설치에 필요).

PowerShell 또는 CMD에서 이 README가 있는 폴더로 이동한 다음:

```bat
npm install
npm run dev
```

개발 서버와 Electron 창을 같이 실행합니다. 종료할 때 터미널에서 `Ctrl+C`를 누르세요.

배포 전과 동일한 로컬 빌드에서 확인하려면:
```bat
npm run test
npm run build
npm start
```

**내부 테스트용 Windows 설치 파일을 만들고 싶을 때만** `npm run package:win`을 사용하세요. Windows에서 실행하는 것이 권장되며, 결과물은 `release/`에 생성됩니다. 내부 테스트용 설치 프로그램입니다.

## 테스트
`npm run test`는 Node.js의 내장 테스트 러너로 소스의 화면 메뉴/범위/보안 설정을 검사합니다. `npm run build`는 TypeScript 타입 검증과 Vite 빌드를 수행합니다. Windows 실행 결과는 아래 점검 기록을 참고하세요.

## 프로젝트 구조
```
src/main/        Electron 실행/보안 정책
src/preload/     제한된 읽기 전용 연결
src/renderer/    React 화면/i18n/CSS
src/shared/      후속 개발을 위한 안내
scripts/         테스트 유틸리티 (향후 확장)
tests/           자동 검사
docs/            명세·아키텍처·단계별 계획·검증 기록
```

## 범위 밖
Ollama 모델 설치/실행, Godot 연동, 게임 생성/저장, SQLite, 계정/Google 로그인, 인터넷 기능, 공개 게임 실행, API 서버, 채팅, 멀티플레이는 **구현되지 않았습니다**.

## 🎨 1단계 UI 리디자인 (2026-11-18)
기존 1단계 범위는 유지하면서 **다크 게임 플랫폼 스타일**로 전체 화면을 개선했습니다.

- 홈: 퍼플/네이비 그라데이션 대형 배너, 코드로 그린 일러스트, 빠른 메뉴, 콘셉트 카드
- AI 게임 만들기: 자연어 아이디어 입력창, UI 체험용 2D/3D 선택, 예시 문구 클릭 입력, 콘셉트 미리보기 (실제 게임 아님)
- 내 게임: 프로젝트 0개 안내 및 빈 라이브러리 화면
- 설정: 한국어/영어 전환, 움직임 줄이기, 앱 버전 및 안전 안내
- 키보드 포커스 표시와 창 크기에 따른 반응형 레이아웃
- `START_AI_GAME_HUB.bat`과 `BUILD_WINDOWS_INSTALLER.bat`을 유지

이전에 전달한 ZIP의 `previews/`에 디자인을 렌더링한 PNG 4개가 있습니다. **PNG는 컴포넌트의 JSX와 CSS를 정적 렌더링한 디자인 미리보기이며, 실제 Windows Electron 창에서 찍은 사진이나 실행 테스트 증거가 아닙니다.**

설계 및 검증 내용은 [docs/07_phase1_ui_redesign.md](docs/07_phase1_ui_redesign.md)에서 확인할 수 있습니다.


## 2026-11-20 Windows 1단계 점검

다운로드 폴더 이름에 포함된 문자 그대로의 `%`를 파일 URL에서 올바르게 인코딩하도록 수정했습니다. 원클릭 실행은 빌드된 화면 파일을 열며, 개발 중 변경을 바로 반영하려면 `npm run dev`를 사용하세요. 이전 개발 서버 우회 조치는 [검은 화면 대응 기록](docs/09_windows_blank_screen_workaround.md)에 남아 있습니다.

메뉴를 이동하면 새 화면 상단에서 시작합니다. 최소 창 크기에서도 하단 안내가 표시됩니다. 자동 검사에서는 설치된 npm 의존성을 허용하면서 후속 단계 소스 경로가 없는지 계속 점검합니다.

- `npm run check`에서 자동 검사 16개와 TypeScript·Vite 빌드를 통과했습니다.
- Windows Electron에서 홈, AI 게임 만들기, 내 게임, 설정을 확인했습니다. 언어 전환, 움직임 줄이기, 예시 입력, 2D·3D 선택, AI 제작 버튼 비활성화를 확인했습니다.
- 기존에 오류가 난 폴더에서 Electron이 빌드된 화면을 열고 읽기 전용 앱 정보 IPC가 응답하는 것을 확인했습니다.
- 오류가 발생했던 경로에서 `START_AI_GAME_HUB.bat`으로 앱을 열고 정상 종료했습니다.
- Windows NSIS 설치 파일을 빌드하고 압축 해제된 패키지에서 Electron 화면을 확인했습니다. 설치 마법사 실행은 미검증입니다.
