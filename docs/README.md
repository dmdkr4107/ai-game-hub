# AI Game Hub — 설계 문서 모음

- 기준 문서: `AI_Game_Hub_요구사항_명세서_v0.2(1).docx` (2026-11-04)
- 작성일: 2026-11-17
- 상태: **1·2단계 Windows 검증 / 3단계 Godot 템플릿과 AI 자유 제작**
- 확정된 요구사항과 권장 기술을 혼동하지 않는다.

## 읽는 순서
1. [요구사항 검토](01_requirements_review.md): 확정·제안·검증 필요·결정 필요
2. [기술 아키텍처](02_architecture.md): 앱과 엔진, AI, 서버의 경계
3. [개발 로드맵](03_roadmap.md): 다섯 단계 및 단계별 승인
4. [1단계 명세와 완료 조건](04_phase1_definition.md): 첫 개발 범위와 테스트
5. [위험·미결정·근거](05_risks_decisions.md): 리스크, 사용자 질문, 공식 기술 출처
6. [1단계 구현 및 검증 보고서](06_phase1_implementation_report.md): 최초 구현 범위 및 당시 검증 기록
7. [1단계 UI 리디자인](07_phase1_ui_redesign.md): 새 화면과 예시·설정 상호작용
8. [UI 전달 검증 기록](08_ui_delivery_verification.md): 당시 자동 검사 및 전달 범위
9. [검은 화면 대응 기록](09_windows_blank_screen_workaround.md): 이전 개발 서버 우회 조치
10. [Windows 시작 안내](../README.md#windows에서-시작하기): 현재 실행 방식과 준비 절차
11. [개발 기록](DEV_LOG.md): 결정 사항, 변경 내용과 검증 결과
12. [2단계 로컬 AI](10_phase2_local_ai.md): 사용 방법, 실행 경계, 검증 결과
13. [3단계 게임 제작](11_phase3_game_creation.md): 템플릿, 저장 및 복원, 검증
14. [AI 자유 제작 사용 방법](../README.md#빈-게임에서-시작): 빈 프로젝트, 같은 창 플레이와 대화 수정

## 현재 한 일
- [x] 원문 v0.2 요구사항 분석
- [x] 기술 위험과 정책 간 긴장 관계 분석
- [x] 전체 시스템 설계 및 단계별 작업 정의
- [x] 문서 작성
- [x] 1단계 앱 기본 소스 작성 및 최초 정적 테스트 6개 통과
- [x] Windows에서 1단계 앱 빌드·실행 및 화면 이동 검증
- [x] Electron 의존성, Windows 실행 및 화면 자동 검사 보완
- [x] 2단계 로컬 채팅 및 모델 관리 구현
- [x] 3단계 2D·3D 게임 제작과 Godot 실행 구현
- [x] 별도 2D 자유 제작 모드와 격리 실행 구현
- [ ] 4단계 이후 개발 (사용자 추가 승인 필수)

> 최초 검증 상태는 [구현 및 검증 보고서](06_phase1_implementation_report.md)에 보존되어 있습니다.
