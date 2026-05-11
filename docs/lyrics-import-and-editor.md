# 가사 가져오기 및 편집기

## 1. 편집기 범위

Editor Mode는 v1에서 데스크탑 전용이다. 모바일에서는 프로젝트 보기와 재생만 지원한다.

Editor Mode는 다음 단계를 포함한다.

```txt
1. 원본 가사 import
2. 한글 차음 자동 추출
3. 좌우 비교 및 confirm
4. lyric lane 구성
5. tap-sync
6. gap 지정
7. Main/Sub lyric segment 편집
8. Part Mark 지정
9. 프로젝트 내보내기
```

## 2. 일본어 가사 import

일본 노래 가사는 자주 다음 형식으로 제공된다.

```txt
일본어 가사
한글 차음
한국어 해석
```

Eazy Chorus는 이 형식에서 한글 차음만 추출한다.

예:

```txt
君の名を呼んだ
키미노 나오 욘다
너의 이름을 불렀어
```

추출 결과:

```txt
키미노 나오 욘다
```

## 3. 영어 단독 줄 예외

일본어 가사 중간에 영어가 섞이면 일반 3줄 패턴으로 처리할 수 있다.

```txt
君と I believe 歩いてく
키미토 I believe 아루이테쿠
너와 I believe 걸어가
```

추출 결과:

```txt
키미토 I believe 아루이테쿠
```

하지만 한 줄 전체가 영어인 경우 보통 다음처럼 2줄만 제공될 수 있다.

```txt
I still remember you
나는 아직 너를 기억해
```

이 경우 추출 결과는 첫 번째 줄이다.

```txt
I still remember you
```

## 4. 라인 분류 휴리스틱

자동 추출은 완전한 자연어 이해가 아니라 휴리스틱으로 처리한다.

```ts
type LineKind =
  | 'japanese'
  | 'korean'
  | 'english'
  | 'mixed'
  | 'empty'
  | 'unknown'
```

판단 기준:

- 일본어: 히라가나, 가타카나, 한자가 포함됨
- 한글: 한글 비율이 높음
- 영어: 알파벳, 공백, 문장부호 중심
- mixed: 일본어+영어 또는 한글+영어 등
- empty: 빈 줄

## 5. ImportBlock

자동 추출 결과는 사용자가 confirm하기 전까지 ImportBlock으로 관리한다.

```ts
type ImportBlock = {
  id: string
  sourceLines: string[]
  exportedLines: string[]
  pattern: 'jp-ko-translation' | 'english-translation' | 'manual' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}
```

## 6. Confirm 화면

Confirm 화면은 좌우 비교 구조다.

```txt
┌──────────────────────────────┬──────────────────────────────┐
│ 원본 가사                     │ 추출된 가사                   │
│                              │                              │
│ 君の名を呼んだ                │ 키미노 나오 욘다              │
│ 키미노 나오 욘다              │                              │
│ 너의 이름을 불렀어            │                              │
│                              │                              │
│ I still remember you         │ I still remember you         │
│ 나는 아직 너를 기억해          │                              │
└──────────────────────────────┴──────────────────────────────┘
```

요구사항:

- 좌우 스크롤 싱크
- 원본 block과 추출 block 매칭
- low confidence block 강조
- 오른쪽 추출 결과 직접 수정 가능
- confirm 이후 오른쪽 결과만 lyric draft로 저장
- 저장된 lyric draft는 Lyrics 단계에서 다시 직접 수정 가능

## 7. Lyric Draft

Confirm 이후 원본 전체를 프로젝트에 필수 저장하지 않는다. 확정된 가사만 lyric draft로 저장하거나 곧바로 lane/cue 편집에 사용한다.

```ts
type LyricDraftLine = {
  id: string
  text: string
}
```

## 8. Lane 구성

가사는 싱크가 독립적으로 움직일 수 있는 흐름별로 lane에 배치한다.

예:

```txt
Lead lane
- 첫번째 가사
- 두번째 가사

Duet B lane
- 네?
- 왜불러요?
- 어째서?
```

Lane은 편집용 구조이면서 cue의 소속을 나타낸다.

편집 화면에서는 전체 가사를 중앙 작업면에 두고, Lane 범례와 추가/수정 컨트롤은 오른쪽 사이드바에 둔다. 범례는 작업 카드 안에 중첩하지 않는다.

## 9. Main/Sub lyric role

Main/Sub는 독립 가사 role이다.

- Main: 곡의 전체적인 가사 흐름
- Sub: 메인과 겹치거나 끼어드는 별도 가사

둘 다 실제 텍스트로 표시된다.

예:

```txt
아가씨 네?
아가씨~ 왜불러요?
who am I 너에게 물어볼게 어째서?
who am I 잘 모르겠어
who are you 내가 물어볼게
```

이 경우 `네?`, `왜불러요?`, `어째서?`, `who are you 내가 물어볼게`는 Sub role일 수 있다.

## 10. Segment 편집

하나의 cue 안에 Main/Sub segment가 함께 존재할 수 있다.

```ts
type LyricSegment = {
  id: string
  role: 'main' | 'sub'
  text: string
  partIds: string[]
  source?: {
    draftLineId: string
    startChar: number
    endChar: number
    wholeLine?: boolean
  }
}
```

`source`는 Lyrics 단계에서 수정되는 확정 가사와 Lane/Sub/Preview의 cue text를 다시 연결한다. 이전 v1 파일처럼 segment text만 저장된 cue는 import 시 가능한 경우 lyric draft line 참조로 승격한다.

뮤지컬식 예시:

```json
{
  "segments": [
    {
      "id": "main",
      "role": "main",
      "text": "아가씨 ",
      "partIds": ["actor-a"]
    },
    {
      "id": "sub",
      "role": "sub",
      "text": "네?",
      "partIds": ["actor-b"]
    }
  ]
}
```

## 11. Tap Sync

파트 또는 lane을 선택하고 노래를 재생하면서 싱크를 찍는다.

기본 조작:

```txt
Space 또는 마우스 클릭: 다음 가사 시작 찍기
G: 현재 가사 끝 / gap 시작
Backspace: 마지막 sync 취소
ArrowLeft: 2초 뒤로
ArrowRight: 2초 앞으로
Enter: 재생/일시정지
```

동작:

```txt
Space 입력 시
-> 현재 시간 = 다음 cue.startMs
-> 이전 cue.endMs = 현재 시간
-> 다음 cue로 이동
```

## 12. Gap 처리

간주나 무가사 구간이 있을 수 있으므로, 이전 cue의 끝과 다음 cue의 시작이 항상 같지는 않다.

예:

```txt
00:03.000 Space -> 첫번째 가사 시작
00:07.500 G     -> 첫번째 가사 끝, gap 시작
00:12.000 Space -> 두번째 가사 시작
```

결과:

```txt
첫번째 가사: 00:03.000 ~ 00:07.500
공백: 00:07.500 ~ 00:12.000
두번째 가사: 00:12.000 ~ ...
```

저장 데이터에는 gap 엔트리를 별도로 저장하지 않고, cue의 `startMs`/`endMs` 차이로 표현한다.

## 13. Part Mark 편집

Part Mark는 가사 일부 또는 전체에 붙는 시각 표시다.

사용 방식:

1. Part를 선택한다.
2. 가사 텍스트 일부를 드래그한다.
3. 선택된 Part의 색상과 mark style로 표시가 추가된다.
4. 같은 범위를 다시 드래그하면 표시가 제거된다.

MVP toggle 규칙:

```txt
동일 Part + 동일 cue + 동일 segment에서 겹치는 mark가 없으면 추가
겹치는 mark가 있으면 해당 mark 제거
```

후속 개선:

- 부분 겹침 range split
- 인접 range merge
- mark별 style override

## 14. Undo/Redo

편집기는 최소한 다음 작업에 대해 undo를 지원해야 한다.

- import confirm 결과 수정
- lane 이동
- tap-sync 입력
- gap 입력
- segment role 변경
- Part Mark 추가/삭제
- audio variant 설정 변경

v1에서는 명령 스택 기반 undo/redo를 권장한다.

## 15. 저장 전 검증

Editor에서 내보내기 전 다음을 경고한다.

- 싱크가 없는 cue
- `startMs >= endMs`인 cue
- 비어 있는 segment
- Part가 없는 Part Mark
- Part에 연결된 audio variant가 없음
- media duration 차이가 큼
- 프로젝트 파일 크기가 권장 기준을 초과함
