# Milestone 3 실행 결과: 가사 import

## 1. 목표

Milestone 3의 목표는 일본어 원문/한글 차음/한국어 해석 형식에서 사용자가 실제로 볼 가사 초안을 추출하고, 좌우 비교 confirm 이후 프로젝트에 저장하는 것이다.

구현은 `docs/lyrics-import-and-editor.md`의 ImportBlock, 영어 단독 줄 예외, Lyric Draft 정책을 기준으로 한다.

## 2. 포함 범위

- 원본 가사 붙여넣기
- line kind 휴리스틱 분류
- 3줄 `일본어/한글 차음/해석` 패턴에서 두 번째 줄 추출
- 일본어 원문에 영어 문구가 섞인 3줄 패턴 처리
- 영어 단독 2줄 패턴에서 첫 번째 줄 추출
- unknown block low confidence 표시
- 좌우 비교 confirm UI
- 좌우 preview scroll 동기화
- 오른쪽 추출 결과 직접 수정
- confirm 결과를 `project.lyricDraft`에 저장
- `.eazychorus` import/export 시 `lyricDraft` 보존
- parser, project-file, HomePage 테스트

## 3. 제외 범위

- lane 배치
- cue 생성과 tap-sync
- undo/redo
- 원본 import 전문 저장
- 고급 자연어 판별

## 4. 구현 구조

```txt
src/features/lyrics-import/
├─ index.ts
├─ lyricsImport.test.ts
└─ lyricsImport.ts
```

- `lyricsImport.ts`는 line kind 분류, ImportBlock 생성, edited output 정규화, lyric draft 생성을 담당한다.
- `project-file`은 `LyricDraftLine` 타입과 validation을 포함한다.
- `HomePage.tsx`는 붙여넣기, 추출, 좌우 비교, 수정, confirm 저장 UI를 제공한다.

## 5. Acceptance criteria 확인

- 3줄 패턴에서 두 번째 줄을 추출한다.
- 영어 단독 2줄 패턴에서 첫 번째 줄을 추출한다.
- 사용자가 추출 결과를 직접 수정할 수 있다.
- confirm 후 lyric draft가 생성된다.
- 좌우 스크롤 싱크가 동작한다.

## 6. 검증 명령

```powershell
npm run lint
npm run test
npm run build
```
