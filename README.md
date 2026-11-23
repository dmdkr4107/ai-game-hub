# AI Game Hub — Windows 내부 테스트

AI Game Hub는 Electron과 React로 만든 Windows 게임 제작 앱입니다. **AI 게임 만들기**에서 Ollama와 대화해 2D 게임을 만들고, 같은 창에서 플레이하며 수정할 수 있습니다. 이전에 저장한 2D·3D 발판 게임은 **내 게임**에서 열 수 있습니다.

## Windows에서 시작하기

1. ZIP을 받은 경우 새 폴더에 모두 압축을 풉니다. 기존 버전이 열려 있다면 먼저 닫으세요.
2. 소스에서 실행하려면 Windows 10/11과 Node.js 22.12.0 이상 및 npm이 필요합니다. [Node.js LTS 다운로드](https://nodejs.org/en/download)
3. 프로젝트 폴더의 `START_AI_GAME_HUB.bat`을 더블클릭합니다. 첫 실행과 잠금 파일 변경 시 잠금 파일에 기록된 버전으로 npm 의존성을 준비합니다. 첫 다운로드에는 인터넷 연결이 필요합니다.
4. Ollama를 실행하고 **설정 → 로컬 AI 설정**에서 지원 모델을 준비하세요. [Ollama 공식 다운로드](https://ollama.com/download/windows)

자유 제작은 설치가 확인된 Qwen3 8B를 우선 사용합니다. 모델을 준비하는 동안에는 설치된 Qwen2.5-Coder로 제작할 수 있습니다. [Ollama Qwen3 8B](https://ollama.com/library/qwen3:8b)

### 빈 게임에서 시작

1. **AI 게임 만들기**를 열고 만들고 싶은 게임을 설명합니다. `레이싱 게임 만들어줘`처럼 짧은 요청으로 시작하거나, 조작과 목표를 추가할 수 있습니다.
2. 게임이 준비되면 같은 창에서 플레이합니다. **바꾸고 싶은 점**에 변경을 요청할 수 있습니다. 생성 중에는 **중지**를 사용할 수 있습니다.
3. 게임 화면이 시작된 버전은 이 PC에 저장됩니다. **저장된 자유 제작 게임**에서 다시 열 수 있고, 수정 전 버전으로도 돌아갈 수 있습니다.

자유 제작은 키보드와 포인터를 사용하는 작은 2D 게임용입니다. 로컬 모델과 요청 복잡도에 따라 시간이 걸립니다. 앱이 화면이 그려지며 실행되는지 확인하고, 조작과 승리 조건은 플레이하며 확인할 수 있습니다. 게임 코드와 제작 대화는 앱 데이터 폴더의 `free-games`에 저장합니다.

**레이싱 게임 만들어줘**처럼 장르만 요청하면 앱이 조작과 진행 조건을 보강합니다. 상세한 요청이나 여러 장르를 섞은 요청에는 입력한 규칙이 우선합니다. 저장한 자유 제작 게임에서 **HTML로 저장**을 누르면 Chrome이나 Edge에서 오프라인으로 열 수 있는 파일 한 개를 만듭니다.

자유 제작 오류를 확인하려면 `START_AI_GAME_HUB.bat`을 실행한 터미널에서 `[AI Game Hub] Ollama free-game`을 찾으세요. 재생성 또는 거절된 시도마다 `attempt`, `reason`, 수신한 `rawResponse`가 표시됩니다. 연결을 받지 못했거나 응답 한도를 넘으면 수신한 부분까지만 표시합니다. 응답에는 생성된 코드와 텍스트가 포함됩니다.

### Windows Godot 설정

이 과정은 이전에 저장한 Godot 게임을 다시 플레이할 때 사용합니다.

1. Godot Windows 64비트 **Standard**를 받습니다. 압축을 풀고 콘솔용이 아닌 실행 파일 이름을 `Godot.exe`로 바꿉니다. [Godot 4.7.2 공식 배포](https://godotengine.org/download/archive/4.7.2-stable/)
2. 소스 실행에서는 프로젝트의 `tools/godot/`에, 설치 앱에서는 앱 사용자 데이터 폴더의 `runtime`에 복사합니다.
3. 같은 공식 배포 페이지의 **Export templates → Standard**에서 받는 `.tpz`는 ZIP 형식입니다. Windows 탐색기에서 열리지 않으면 확장자를 `.zip`으로 바꾼 뒤 열고, 내부 `templates` 폴더의 `web_nothreads_release.zip`을 **압축을 풀지 않고** `Godot.exe` 옆에 복사합니다.
4. 파일을 추가한 뒤 앱을 다시 열고 **내 게임 → 미리 플레이**를 누릅니다.

이미 `AI_HUB_GODOT_PATH` 환경 변수에 실행 파일의 절대 경로를 지정했다면 해당 경로가 우선합니다. 소스로 실행할 때는 프로젝트의 `tools/godot/Godot.exe`에 둔 엔진도 인식합니다. Godot 실행 파일과 Web 템플릿은 소스 ZIP과 내부 테스트 설치 패키지에 포함되지 않습니다.

## 이전 Godot 게임 열기

**내 게임 → 미리 플레이**를 누르면 기존 발판 게임이 같은 창에서 열립니다. 화살표 또는 WASD로 이동하고 Space로 점프하세요. 별을 모두 모아 출구에 닿으면 완료됩니다. R로 다시 시작할 수 있습니다. **내 게임**에서 제목 검색, 2D·3D 필터, 문장으로 수정, 이전 버전 복원을 사용할 수 있습니다.

## 내부 테스트용 설치 EXE

소스가 있는 Windows PC에서 `BUILD_WINDOWS_INSTALLER.bat`을 더블클릭하거나 `npm run package:win`을 실행합니다. 이 EXE는 ZIP에 포함되어 있지 않으며 빌드하면 `release/`에 생성됩니다. 설치 앱에는 Electron이 포함되어 실행할 PC에 Node.js와 npm을 따로 설치할 필요가 없습니다. 제작·플레이에 필요한 Godot은 해당 PC에서 준비합니다. 자연어 제작과 채팅을 사용하려면 Ollama와 지원 모델도 준비하세요.

출력 파일은 서명되지 않은 내부 테스트용이며 Windows가 경고를 표시할 수 있습니다. 설치 마법사 완료까지는 별도 검증이 필요합니다. 빌드는 결과물을 업로드하지 않습니다.

## 개발 및 검증

소스 변경을 즉시 반영하는 개발 모드를 시작하려면 프로젝트 폴더에서 실행합니다.

```bat
npm ci
npm run dev
```

개발 서버는 `127.0.0.1:5173`에서만 열리며 앱이 닫히면 함께 종료됩니다. 원클릭 런처는 빌드한 화면 파일을 직접 엽니다. [이전 Windows 검은 화면 대응](docs/09_windows_blank_screen_workaround.md)

- `npm run check`로 자동 검사, 렌더러와 프리로드·보안·설치 안내 코드의 타입 검사, Vite 빌드를 실행합니다.
- `npm run test:smoke`는 화면에 표시하지 않는 Electron과 별도 임시 프로필을 사용합니다. 화면 이동, 환경설정, 제작 대화 진입과 기존 게임 목록을 확인합니다.
- `npm run test:free`는 숨김 Electron에서 자유 제작 게임의 그리기·조작, 실행에 실패한 후보의 폐기, 수정·복원·다시 열기를 확인합니다. 생성 응답에는 테스트용 모델을 사용합니다.
- `npm run test:games`는 실제 Godot으로 2D·3D 게임 생성, 미리보기 준비, 수정과 복원을 확인합니다. `npm run test:games -- --live`에는 설치된 Ollama 모델의 자연어 처리도 포함됩니다.

현재 변경과 검증 기록은 [개발 기록](docs/DEV_LOG.md)을 참고하세요. [설계 문서 모음](docs/README.md)에 이전 단계의 명세와 검증이 있습니다.

다른 GitHub 계정이나 PC에서 이어서 개발하려면 [인수인계 안내](docs/HANDOFF.md)를 참고하세요.

```text
src/main/        Electron, 보안 경계, Ollama 및 Godot 실행
src/preload/     앱 화면에 허용된 최소 IPC 연결
src/renderer/    React 화면, 번역, CSS
src/shared/      화면과 메인 프로세스 간 데이터 형식
scripts/         개발 서버와 Windows 실행 준비
tests/           자동 검사와 실제 실행 검사
docs/            명세, 아키텍처, 단계별 계획과 개발 기록
```
