# AI Game Hub 인수인계

AI Game Hub는 Windows용 Electron·React 앱입니다. 사용자는 **AI 게임 만들기**에서 로컬 Ollama에 게임을 설명하고, 같은 앱에서 게임을 플레이하고 대화로 수정합니다. 기존 Godot 게임은 **내 게임**에서 엽니다.

## 새 계정에서 소스 열기

현재 [GitHub 저장소](https://github.com/dmdkr4107/ai-game-hub)는 비공개입니다. 학교에서 관리하는 계정이 GitHub 저장소 소유자라면, 사용 권한을 확인한 뒤 계정 삭제 전에 새 개인 GitHub 계정으로 소유권을 이전하고 새 계정에서 확인 메일을 수락하세요. [GitHub 저장소 이전 안내](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)

오프라인 백업 `ai-game-hub.bundle`을 받았다면, GitHub에 로그인하기 전에도 전체 소스와 커밋 기록을 복원할 수 있습니다. 새 폴더의 상위 경로에서 실행하세요.

```powershell
git clone -b main .\ai-game-hub.bundle ai-game-hub
Set-Location ai-game-hub
```

백업에서 복구한 소스를 개인 GitHub 계정에 올리려면 그 계정에서 빈 비공개 저장소를 만든 뒤 `origin`을 해당 저장소 주소로 바꾸고 푸시하세요.

```powershell
git remote set-url origin https://github.com/YOUR_ACCOUNT/ai-game-hub.git
git push -u origin main
```

## 실행과 테스트

1. Windows, Git, Node.js 22.12 이상과 Ollama를 준비합니다.
2. Ollama를 실행하고 `ollama pull qwen3:8b`로 모델을 준비합니다.
3. 프로젝트의 `START_AI_GAME_HUB.bat`을 실행합니다.
4. 코드 변경 후 `npm run check`, `npm run test:smoke`, `npm run test:free`를 실행합니다. Electron 검사 창은 화면에 표시하지 않습니다.

게임 저장 데이터가 필요한 경우 기존 앱을 닫고 Electron의 사용자 데이터 폴더 아래 `free-games`와 `games` 폴더를 따로 복사하세요. 이 PC의 소스 실행 데이터 폴더는 `%APPDATA%\AI Game Hub`입니다. 소스 백업에는 사용자별 게임 저장, 로그인 정보, 설치된 모델, Godot 실행 파일이 들어 있지 않습니다. Godot 재설치 방법과 자세한 실행 절차는 [README](../README.md)를 참고하세요.

## 새 개발 대화에 붙여넣을 요청

> 이 폴더의 AI Game Hub를 이어서 개발해 줘. README.md, docs/HANDOFF.md, docs/DEV_LOG.md를 먼저 읽고 현재 Git 상태와 실행을 확인해. 앱은 Electron + React + Ollama를 사용하고, 사용자가 AI와 대화하며 게임을 만들고 같은 창에서 플레이하고 수정해. Qwen3 8B가 기본 제작 모델이야. 기존 저장 데이터를 보존하고, 테스트는 숨김 창에서 돌려 줘. GitHub에 저장하기 전에는 내 승인을 확인해. 개발 기록에는 실제로 변경하고 검증한 내용을 남겨 줘.

## 다음 개발 후보

두 로컬 모델 비교에서 Qwen3 8B 미리보기는 10개 모두 열렸으나 전체 규칙을 충족한 결과는 없었습니다. 다음 작업은 생성된 게임이 실제로 입력에 반응하고 승패 규칙을 지키는지 검사하는 것입니다. 첫 검사 예시로 자동차 방향키 한 번당 한 차선 이동, 퍼즐 가운데 클릭으로 십자 전등 점등, 승리 후 한 수 되돌리기를 사용하세요.
