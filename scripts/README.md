# 실행 스크립트

- `dev.mjs`는 Vite가 로컬 포트를 확보하고 화면을 제공하는 것을 확인한 뒤 Electron을 시작합니다. 앱이 닫히면 개발 서버를 종료합니다.
- `prepare-windows.cjs`는 두 Windows 배치 파일이 공통으로 호출합니다. Node.js 버전과 의존성을 확인하고, 첫 실행 또는 잠금 파일 변경 시 `npm ci`를 실행합니다.
