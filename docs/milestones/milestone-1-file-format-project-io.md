# Milestone 1 실행 결과: 파일 포맷과 프로젝트 입출력

## 1. 목표

Milestone 1의 목표는 `.eazychorus` ZIP 프로젝트 파일을 만들고 다시 열 수 있는 최소 프로젝트 파일 워크스페이스를 구현하는 것이다.

구현은 `docs/file-format-v1.md`의 v1 구조를 기준으로 한다.

## 2. 포함 범위

- 새 프로젝트 생성
- 프로젝트 meta 편집
- Part 추가와 Part 이름/색상 편집
- MR 파일 추가
- Part audio 파일 추가
- `.eazychorus` ZIP export
- `.eazychorus` ZIP import
- `project.json` schema/reference validation
- ZIP 내부 `media/` 파일 누락 에러 표시
- 프로젝트 파일 입출력 단위 테스트

## 3. 제외 범위

- Web Audio API 재생
- waveform 생성
- lyric import
- tap sync
- Part Mark 편집 UI
- 모바일 viewer mode

## 4. 구현 구조

```txt
src/features/project-file/
├─ index.ts
├─ projectFactory.ts
├─ projectFile.test.ts
├─ types.ts
├─ validation.ts
└─ zipProject.ts
```

- `types.ts`는 `project.json` v1 타입을 정의한다.
- `projectFactory.ts`는 새 프로젝트, Part, MediaTrack 생성과 media path 충돌 방지를 담당한다.
- `validation.ts`는 스키마와 참조 무결성을 검사한다.
- `zipProject.ts`는 JSZip 기반 import/export를 담당한다.

## 5. Acceptance criteria 확인

- MR과 보컬 음원이 포함된 프로젝트 파일을 저장할 수 있다.
- 저장된 파일을 다시 열면 project meta, media, parts가 복원된다.
- 누락된 media 파일이 있으면 validation error로 표시된다.

## 6. 검증 명령

```powershell
npm run lint
npm run test
npm run build
```
