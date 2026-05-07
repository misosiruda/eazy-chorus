# Milestone 5: Part와 Part Mark 편집 실행 결과

## 목표

- MR을 제외한 음원을 Part의 audio variant로 구성한다.
- Part 이름, 색상, 설명, 기본 mark style을 편집한다.
- Part별 기본 audio variant를 연결한다.
- cue segment의 Main/Sub lyric role을 편집한다.
- 가사 범위를 드래그해 Part Mark를 추가하고 같은 범위를 다시 선택하면 제거한다.
- 저장된 Part Mark가 `.eazychorus` export/import 이후에도 유지된다.

## 구현 결과

- `src/features/part-editor`에 segment role 변경, Part Mark 토글, Part Mark 기반 텍스트 fragment 분리 유틸을 추가했다.
- `HomePage`의 `Part Mark Editor` 작업 영역에서 선택 cue의 segment role을 Main/Sub로 바꿀 수 있다.
- 선택한 Part와 기본 mark style을 기준으로 segment 텍스트 범위를 선택해 Part Mark를 추가한다.
- 같은 cue/segment/part/startChar/endChar 범위를 다시 선택하면 기존 Part Mark를 제거한다.
- Viewer preview는 segment role에 따라 Main/Sub 글자 스타일을 다르게 표시하고, Part Mark style에 따라 highlight, line-above, line-below를 렌더링한다.
- `Parts` 작업 영역에서 Part 설명, guide position, 기본 mark style, 연결 audio variant를 편집할 수 있다.
- Part별 audio variant 연결은 기존 Web Audio mixer의 enabled/defaultTrackId 계약을 그대로 사용한다.

## 파일 포맷 영향

기존 v1 스키마의 `Part`, `LyricSegment`, `PartMark` 필드를 그대로 사용한다.

```ts
type LyricSegment = {
  id: string
  role: 'main' | 'sub'
  text: string
  partIds: string[]
}

type PartMark = {
  id: string
  cueId: string
  segmentId: string
  partId: string
  lineIndex?: number
  startChar: number
  endChar: number
  style: 'line-above' | 'line-below' | 'highlight'
}
```

새 schemaVersion은 추가하지 않았다. Milestone 5의 편집 결과는 기존 `parts`, `cues[].segments`, `partMarks`에 저장된다.

## 검증

- `src/features/part-editor/partEditor.test.ts`에서 segment role 변경, Part Mark 추가/제거, mark-aware text fragment 분리를 검증한다.
- `src/features/project-file/projectFile.test.ts`에서 Part Mark가 `.eazychorus` export/import 이후 유지되는지 검증한다.
- `src/pages/HomePage.test.tsx`에서 Part Mark Editor의 segment role 편집 흐름을 검증한다.
- 전체 검증 명령:

```powershell
npm run lint
npm run test
npm run build
```
