# 파일 포맷 v1

## 1. 개요

`.eazychorus`는 ZIP 기반 단일 프로젝트 파일이다. 확장자는 `.eazychorus`를 사용하지만 내부는 표준 ZIP 구조를 따른다.

파일 포맷의 목표는 다음과 같다.

- 서버 없이 프로젝트 전체를 공유한다.
- MR과 파트별 음원을 프로젝트 파일 안에 포함한다.
- 가사, 싱크, 파트, 표시 규칙을 재현 가능하게 저장한다.
- 향후 schema migration을 위해 버전을 명시한다.

## 2. ZIP 내부 구조

v1 기본 구조:

```txt
song.eazychorus
├─ project.json
├─ media/
│  ├─ mr.mp3
│  ├─ main-vocal-fx.mp3
│  ├─ main-vocal-no-fx.mp3
│  ├─ upper-guide.mp3
│  └─ lower-guide.mp3
└─ waveform/
   └─ mr.peaks.json
```

`waveform/`은 선택 사항이다. v1 초기 구현에서는 생략할 수 있다.

## 3. 저장 원칙

- `project.json`은 UTF-8 JSON이다.
- 음원 바이너리는 base64로 JSON에 넣지 않는다.
- 음원은 `media/` 아래에 원본 바이너리로 저장한다.
- 파일명 충돌은 앱이 안전한 이름으로 변환해 처리한다.
- 모든 참조는 ZIP 내부 상대 경로를 사용한다.

금지:

```json
{
  "audioBase64": "..."
}
```

허용:

```json
{
  "path": "media/main-vocal-fx.mp3"
}
```

## 4. `project.json` 최상위 구조

```ts
type EazyChorusProject = {
  schemaVersion: 1
  app: 'eazy-chorus'
  project: ProjectMeta
  settings: ProjectSettings
  media: MediaTrack[]
  parts: Part[]
  lyricDraft: LyricDraftLine[]
  lyricLanes: LyricLane[]
  cues: LyricCue[]
  partMarks: PartMark[]
}
```

## 5. ProjectMeta

```ts
type ProjectMeta = {
  id: string
  title: string
  artist?: string
  key?: string
  bpm?: number
  memo?: string
  createdAt: string
  updatedAt: string
}
```

- `id`는 프로젝트 내부 식별자다.
- `createdAt`, `updatedAt`은 ISO 8601 문자열이다.

## 6. ProjectSettings

```ts
type ProjectSettings = {
  clickPreRollMs: number
  defaultPlaybackRate: number
  fileSizeWarningMb?: number
  mobileFileSizeWarningMb?: number
}
```

기본값:

```json
{
  "clickPreRollMs": 2000,
  "defaultPlaybackRate": 1,
  "fileSizeWarningMb": 300,
  "mobileFileSizeWarningMb": 100
}
```

## 7. MediaTrack

MediaTrack은 프로젝트에 포함된 실제 오디오 파일이다.

```ts
type MediaTrack = {
  id: string
  role: 'mr' | 'part-audio'
  partId?: string
  title: string
  variant?: 'fx' | 'no-fx' | 'pitch-corrected' | 'guide' | 'custom'
  path: string
  mimeType?: string
  durationMs?: number
  sizeBytes?: number
  volume: number
  muted: boolean
  solo: boolean
  enabled: boolean
  offsetMs?: number
}
```

규칙:

- `role: 'mr'`이면 `partId`가 없어야 한다.
- `role: 'part-audio'`이면 `partId`가 있어야 한다.
- `offsetMs`는 v1 UI에는 노출하지 않는다. 미래 호환성을 위해 optional로 둔다.
- v1은 모든 음원이 같은 시작점과 길이로 export되었다고 간주한다.

## 8. Part

Part는 범례와 역할 단위다. 실제 오디오 파일이 아니라, 사람이 부르는 역할을 표현한다.

```ts
type Part = {
  id: string
  name: string
  color: string
  description?: string
  defaultTrackId?: string
  guidePosition: 'none' | 'above' | 'below'
  defaultMarkStyle: 'line-above' | 'line-below' | 'highlight'
  harmonyLevel: number
}
```

예:

```json
{
  "id": "upper",
  "name": "상성부",
  "color": "#3B82F6",
  "description": "메인보다 높은 화음. 후렴에서 중심적으로 들어온다.",
  "defaultTrackId": "upper-fx",
  "guidePosition": "above",
  "defaultMarkStyle": "line-above",
  "harmonyLevel": 2
}
```

`harmonyLevel`은 같은 표시 방향 안에서 화음 표시가 쌓이는 순서를 정한다. `line-above`에서는 값이 클수록 더 위에, `line-below`에서는 값이 클수록 더 아래에 표시된다. 이전 파일처럼 값이 없으면 import 시 `1`로 보정한다.

## 9. LyricDraftLine

LyricDraftLine은 import confirm 이후 아직 lane/cue 편집에 배치되지 않은 가사 초안이다.

```ts
type LyricDraftLine = {
  id: string
  text: string
}
```

규칙:

- 원본 import 전체를 저장하지 않고, 사용자가 confirm한 추출 결과만 저장한다.
- 빈 줄은 저장하지 않는다.
- Milestone 4 이후 lane/cue 편집기는 `lyricDraft`를 입력 자료로 사용한다.

## 10. LyricLane

Lane은 편집과 싱크를 위한 논리적 가사 흐름이다.

```ts
type LyricLane = {
  id: string
  name: string
  order: number
  defaultRole: 'main' | 'sub'
}
```

예:

```json
{
  "id": "duet-b",
  "name": "듀엣 B",
  "order": 2,
  "defaultRole": "sub"
}
```

## 11. LyricCue

Cue는 특정 시간 범위에 표시되는 가사 단위다.

```ts
type LyricCue = {
  id: string
  laneId: string
  startMs: number
  endMs: number
  segments: LyricSegment[]
}
```

## 12. LyricSegment

Segment는 cue 내부의 텍스트 조각이다. Main/Sub lyric role은 segment에 부여한다.

```ts
type LyricSegment = {
  id: string
  role: 'main' | 'sub'
  text: string
  partIds: string[]
}
```

뮤지컬식 예시:

```json
{
  "id": "cue-001",
  "laneId": "main-dialogue",
  "startMs": 3000,
  "endMs": 4500,
  "segments": [
    {
      "id": "seg-001-main",
      "role": "main",
      "text": "아가씨 ",
      "partIds": ["actor-a"]
    },
    {
      "id": "seg-001-sub",
      "role": "sub",
      "text": "네?",
      "partIds": ["actor-b"]
    }
  ]
}
```

## 13. PartMark

PartMark는 독립 가사 텍스트가 아니라, 기존 가사 구간에 붙는 시각 표시 또는 Notes 주석이다.

```ts
type PartMark = {
  id: string
  cueId: string
  segmentId: string
  partId: string
  lineIndex?: number
  startChar: number
  endChar: number
  style: 'line-above' | 'line-below' | 'highlight'
  note?: string
}
```

규칙:

- `startChar`는 inclusive다.
- `endChar`는 exclusive다.
- 하나의 segment 전체를 표시하려면 `startChar: 0`, `endChar: text.length`를 사용한다.
- Sub 단계에서 같은 범위를 다시 드래그하면 동일 시각 PartMark를 제거한다.
- `note`는 Notes 단계에서 편집자가 특정 Part와 가사 범위에 남기는 선택 주석이다.
- `note`가 있는 PartMark는 주석 말풍선으로 표시하며, `style` 값은 Sub의 위줄/밑줄/형광펜 렌더링에 사용하지 않는다. 같은 범위에 Sub 표시가 필요하면 `note` 없는 별도 PartMark로 저장한다.

## 14. 예시 `project.json`

```json
{
  "schemaVersion": 1,
  "app": "eazy-chorus",
  "project": {
    "id": "project-001",
    "title": "Example Song",
    "artist": "Example Artist",
    "key": "C",
    "bpm": 92,
    "memo": "연습용 프로젝트",
    "createdAt": "2026-05-06T00:00:00.000Z",
    "updatedAt": "2026-05-06T00:00:00.000Z"
  },
  "settings": {
    "clickPreRollMs": 2000,
    "defaultPlaybackRate": 1,
    "fileSizeWarningMb": 300,
    "mobileFileSizeWarningMb": 100
  },
  "media": [
    {
      "id": "mr",
      "role": "mr",
      "title": "MR",
      "variant": "custom",
      "path": "media/mr.mp3",
      "durationMs": 213000,
      "volume": 1,
      "muted": false,
      "solo": false,
      "enabled": true
    },
    {
      "id": "main-fx",
      "role": "part-audio",
      "partId": "main-vocal",
      "title": "메인 보컬 FX",
      "variant": "fx",
      "path": "media/main-vocal-fx.mp3",
      "durationMs": 213000,
      "volume": 0.8,
      "muted": false,
      "solo": false,
      "enabled": true
    },
    {
      "id": "main-no-fx",
      "role": "part-audio",
      "partId": "main-vocal",
      "title": "메인 보컬 No FX",
      "variant": "no-fx",
      "path": "media/main-vocal-no-fx.mp3",
      "durationMs": 213000,
      "volume": 0.8,
      "muted": false,
      "solo": false,
      "enabled": false
    }
  ],
  "parts": [
    {
      "id": "main-vocal",
      "name": "메인 보컬",
      "color": "#F8FAFC",
      "description": "곡의 전체적인 가사 흐름을 담당한다.",
      "defaultTrackId": "main-fx",
      "guidePosition": "none",
      "defaultMarkStyle": "highlight",
      "harmonyLevel": 1
    },
    {
      "id": "upper",
      "name": "상성부",
      "color": "#38BDF8",
      "description": "메인보다 높은 화음.",
      "defaultTrackId": "upper-fx",
      "guidePosition": "above",
      "defaultMarkStyle": "line-above",
      "harmonyLevel": 2
    }
  ],
  "lyricDraft": [
    {
      "id": "lyric-draft-1",
      "text": "키미노 나오 욘다"
    }
  ],
  "lyricLanes": [
    {
      "id": "lead",
      "name": "Lead",
      "order": 1,
      "defaultRole": "main"
    }
  ],
  "cues": [
    {
      "id": "cue-001",
      "laneId": "lead",
      "startMs": 3000,
      "endMs": 7500,
      "segments": [
        {
          "id": "seg-001",
          "role": "main",
          "text": "첫번째 가사",
          "partIds": ["main-vocal"]
        }
      ]
    }
  ],
  "partMarks": [
    {
      "id": "mark-001",
      "cueId": "cue-001",
      "segmentId": "seg-001",
      "partId": "upper",
      "startChar": 0,
      "endChar": 6,
      "style": "line-above"
    }
  ]
}
```

## 15. Validation 규칙

저장 전 다음을 검사한다.

- `schemaVersion`이 존재하는가.
- `project.title`이 비어 있지 않은가.
- 모든 `media.path`가 ZIP 내부에 실제 존재하는가.
- `part.defaultTrackId`가 존재하는 media를 가리키는가.
- `media.role === 'part-audio'`인 경우 `partId`가 실제 Part를 가리키는가.
- 모든 `lyricDraft` 항목의 `id`, `text`가 비어 있지 않은가.
- 모든 cue의 `startMs < endMs`인가.
- 모든 cue의 `laneId`가 실제 lane을 가리키는가.
- 모든 segment의 `text`가 비어 있지 않은가.
- 모든 PartMark의 `cueId`, `segmentId`, `partId`가 유효한가.
- PartMark의 `startChar`, `endChar`가 segment text 범위 안에 있는가.
- 음원 duration 차이가 큰 경우 경고한다.

## 16. Migration 정책

- 모든 프로젝트 파일은 `schemaVersion`을 가진다.
- 앱은 현재 지원하는 schemaVersion보다 높은 파일을 열 때 경고해야 한다.
- 낮은 schemaVersion은 migration function으로 v1 내부 모델로 변환한다.
- migration은 원본 파일을 직접 수정하지 않는다.
- 사용자가 다시 내보내기할 때 최신 schemaVersion으로 저장한다.
