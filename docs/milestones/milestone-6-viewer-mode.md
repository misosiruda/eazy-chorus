# Milestone 6: Viewer Mode 실행 결과

## 목표

- 전체 cue를 시간순 줄글 문서처럼 표시한다.
- 현재 재생 위치에 해당하는 cue를 강조한다.
- 재생 중 auto-scroll로 현재 cue를 따라가고, 수동 스크롤 시 일시정지한다.
- 하단 재생바에서 play/pause, seek, playback rate, A-B 반복, cue 반복을 제공한다.
- 가사 cue 클릭 시 cue 시작 2초 전부터 재생한다.
- Mixer와 Parts 패널을 Viewer 안에서 전환할 수 있게 한다.
- 모바일에서도 보기/재생/믹서/파트 설명이 가능하도록 반응형 레이아웃을 제공한다.

## 구현 결과

- `src/features/viewer-mode`에 cue click pre-roll, active cue 해석, A-B loop, cue loop 판정 유틸을 추가했다.
- `HomePage`에 독립 `Viewer Mode` 영역을 추가해 전체 cue를 줄글 흐름으로 렌더링한다.
- active cue는 재생 위치 기준으로 강조하고, Part Mark는 기존 highlight/line-above/line-below 스타일을 그대로 표시한다.
- Viewer stage를 사용자가 직접 스크롤하면 auto-scroll을 일시정지하고, `현재 위치로` 버튼으로 다시 현재 cue 추적을 재개한다.
- cue 클릭은 프로젝트의 `settings.clickPreRollMs`를 적용해 cue 시작 2초 전으로 이동하며, 음원이 준비된 경우 해당 지점부터 재생한다.
- 하단 Viewer playbar는 play/pause, seek, A/B 지점 지정, A-B Loop, Cue Loop, playback rate를 제공한다.
- Viewer side panel은 Parts와 Mixer를 전환하며, Parts에서는 색상/설명/mark style/variant를 확인하고 Mixer에서는 volume/mute/solo 및 part audio variant를 조작한다.
- Viewer 전용 키 입력은 Viewer 영역에 포커스가 있을 때만 처리해 기존 tap-sync 전역 단축키와 충돌하지 않게 했다.

## 파일 포맷 영향

새 schemaVersion이나 `project.json` 필드는 추가하지 않았다.

Viewer Mode는 기존 필드를 읽어서 동작한다.

```ts
type ProjectSettings = {
  clickPreRollMs: number
  defaultPlaybackRate: number
}

type LyricCue = {
  id: string
  laneId: string
  startMs: number
  endMs: number
  segments: LyricSegment[]
}
```

## 검증

- `src/features/viewer-mode/viewerMode.test.ts`에서 cue click pre-roll, active cue 선택, A-B loop, cue loop 판정을 검증한다.
- `src/pages/HomePage.test.tsx`에서 Viewer Mode 렌더링과 cue 클릭 pre-roll 흐름을 검증한다.
- 전체 검증 명령:

```powershell
npm run lint
npm run test
npm run build
```
