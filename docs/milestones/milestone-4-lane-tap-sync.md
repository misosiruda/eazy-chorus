# Milestone 4: Lane 편집과 Tap Sync 실행 결과

## 목표

- lyric draft를 lane별 cue로 배치한다.
- lane을 생성하고 Main/Sub 기본 role을 지정한다.
- 재생 위치를 기준으로 cue start/end를 입력한다.
- gap은 이전 cue end와 다음 cue start의 차이로 저장한다.
- lane/cue 편집에 대해 최소 undo/redo를 제공한다.
- 저장된 cue를 Viewer preview에서 재생 위치에 맞춰 활성화한다.

## 구현 결과

- `src/features/lane-editor`에 lane 생성, draft 배치, cue 생성, tap-sync, timeline 정렬, active cue 판정 유틸을 추가했다.
- `HomePage`에 `Lane & Tap Sync` 작업 영역을 추가했다.
- 확정된 `lyricDraft` 라인을 선택한 lane에 cue로 배치할 수 있다.
- 새 lane 생성 시 lane 이름과 기본 role을 지정할 수 있다.
- `현재 시간 시작`은 선택 cue의 `startMs`를 현재 재생 위치로 저장하고 다음 cue로 이동한다.
- `현재 cue 종료`는 선택 cue의 `endMs`를 현재 재생 위치로 저장해 gap 구간을 만들 수 있다.
- 전역 단축키는 form 입력 중이 아닐 때만 동작한다.
  - Space: 선택 cue 시작 입력
  - G: 선택 cue 종료 입력
  - Backspace: lane 편집 undo
  - ArrowLeft/ArrowRight: 2초 seek
  - Enter: play/pause
- Viewer preview는 `cues`를 `startMs`, `lane.order`, `cue.id` 기준으로 정렬하고 현재 재생 위치의 cue를 강조한다.
- Viewer preview의 cue를 클릭하면 `clickPreRollMs`를 적용해 cue 시작 전 위치로 seek한다.

## 파일 포맷 영향

기존 v1 스키마의 필드를 그대로 사용한다.

```ts
type LyricLane = {
  id: string
  name: string
  order: number
  defaultRole: 'main' | 'sub'
}

type LyricCue = {
  id: string
  laneId: string
  startMs: number
  endMs: number
  segments: LyricSegment[]
}
```

새 schemaVersion은 추가하지 않았다. Milestone 3 이전 파일처럼 `lyricDraft`만 있는 프로젝트도 그대로 열 수 있고, Milestone 4에서 배치하면 `lyricLanes`와 `cues`에 저장된다.

## 검증

- `src/features/lane-editor/laneEditor.test.ts`에서 lane 생성, draft 배치, tap-sync gap, timeline active cue 판정을 검증한다.
- `src/pages/HomePage.test.tsx`에서 확정된 lyric draft를 selected lane cue로 배치하는 흐름을 검증한다.
- 전체 검증 명령:

```powershell
npm run lint
npm run test
npm run build
```
