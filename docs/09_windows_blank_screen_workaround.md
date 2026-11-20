# Windows 검은 화면 오류 대응 (2026-11-20)

## 재현 정보
사용자가 Windows에서 `START_AI_GAME_HUB.bat`을 실행했을 때 `npm run build`의 Vite 빌드는 정상 종료되었으나 Electron에서 `.../dist/index.html` 파일 URL을 로드하는 과정에 `ERR_FILE_NOT_FOUND`가 보고되고 검은 창이 표시됨. 실제 파일이 OS 상에서 존재했는지까지는 확인되지 않았으므로 근본 원인은 단정하지 않음.

## 범위 내 변경
- 원클릭 스크립트의 실행 단계만 `npm start`(직접 file URL)에서 `npm run dev`(Vite loopback HTTP + Electron)로 변경
- 기존 `npm run build`로 기본 타입 검증·빌드 수행 후 개발 서버를 띄움
- 보안 설정에서 허용된 개발 URL은 `http://127.0.0.1:5173/` 하나이며, 외부 네트워크 인터페이스로 서버를 열지 않음
- Electron / React 화면, 로그인 미구현 정책, docs, 설정·창 권한 정책 유지

## 검증 상태
- `node --test tests/*.test.cjs`의 소스·동작 구조 점검 수행
- Windows 실제 실행 여부는 테스트 PC에서 확인 필요
- 설치 프로그램의 `file://` 로딩 경로는 별도 실기기 점검이 필요하며 이 수정만으로 해결을 보장하지 않음

## 사용자 안내
1. 열린 Electron/CMD 창 종료
2. 별도 폴더에 새 ZIP 전체 압축 풀기
3. `START_AI_GAME_HUB.bat` 더블클릭
4. 실행 중 CMD 창 유지, 화면 또는 새 로그 확인
