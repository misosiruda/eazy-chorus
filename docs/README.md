# Eazy Chorus Docs

Eazy Chorus는 백엔드 없이 동작하는 프론트엔드 전용 화음 가이드 웹앱이다. 사용자는 MR과 파트별 보컬 음원을 포함한 `.eazychorus` 프로젝트 파일을 만들고, 그 파일을 공유해서 같은 웹사이트에서 동일한 가사/싱크/파트 가이드를 볼 수 있다.

## 문서 목록

- [제품 기획](./product-plan.md)
  - 제품 목표, MVP 범위, 사용자 흐름, 고정/보류/미정 항목을 정의한다.
- [용어집](./glossary.md)
  - 프로젝트에서 사용하는 주요 용어를 고정한다.
- [파일 포맷 v1](./file-format-v1.md)
  - `.eazychorus` ZIP 패키지 구조와 `project.json` 스키마를 정의한다.
- [오디오 엔진](./audio-engine.md)
  - Web Audio 기반 재생, RAM 디코딩, mute/solo, audio variant 정책을 정의한다.
- [가사 가져오기 및 편집기](./lyrics-import-and-editor.md)
  - 일본어 가사 import, 한글 차음 추출, 파트 분리, tap-sync, part mark 편집을 정의한다.
- [보기/연습 모드](./viewer-mode.md)
  - 줄글 가사 표시, 현재 가사 강조, 반복 재생, 모바일 UX를 정의한다.
- [구현 로드맵](./implementation-roadmap.md)
  - 실제 개발 순서, milestone, acceptance criteria를 정의한다.

## Milestone 계획

- [Milestone 0: 프로젝트 부트스트랩](./milestones/milestone-0-project-bootstrap.md)
  - 프론트엔드 프로젝트 생성, strict TypeScript 환경, 기본 라우팅, 정적 빌드와 배포 준비 계획을 정의한다.
- [Milestone 1: 파일 포맷과 프로젝트 입출력](./milestones/milestone-1-file-format-project-io.md)
  - `.eazychorus` ZIP import/export, `project.json` validation, media 포함 저장 구현 결과를 정의한다.
- [Milestone 2: 오디오 엔진](./milestones/milestone-2-audio-engine.md)
  - Web Audio 기반 동시 재생, seek, mixer, Part audio variant 전환 구현 결과를 정의한다.
- [Milestone 3: 가사 import](./milestones/milestone-3-lyrics-import.md)
  - 일본어/한글 차음/해석 패턴 추출, 영어 단독 줄 예외, confirm draft 저장 구현 결과를 정의한다.
- [Milestone 4: Lane 편집과 Tap Sync](./milestones/milestone-4-lane-tap-sync.md)
  - lyric draft의 lane 배치, cue 생성, tap-sync, gap 지정, undo/redo, Viewer preview 구현 결과를 정의한다.

## v1 핵심 결정

- 백엔드는 만들지 않는다.
- 정적 프론트엔드 웹앱으로 배포한다.
- `.eazychorus`는 ZIP 기반 단일 프로젝트 파일이다.
- 음원은 `.eazychorus` 파일 내부에 포함한다.
- 음원은 스트리밍하지 않고, 필요한 트랙만 Web Audio API로 RAM에 디코딩해 재생한다.
- MR을 제외한 보컬/파트 음원은 범례 Part의 audio variant가 될 수 있다.
- 편집은 데스크탑 전용이다.
- 모바일은 보기/재생/연습 중심이다.
- 가사는 전체 줄글로 보여주고, 현재 싱크에 해당하는 줄을 강조한다.
- Main/Sub lyric role은 글자 색/스타일로 구분한다.
- 화음/파트 표시는 위줄/밑줄/형광펜 계열의 Part Mark로 표현한다.
