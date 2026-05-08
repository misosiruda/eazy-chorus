# 보기/연습 모드

## 1. 목표

Viewer Mode는 사용자가 `.eazychorus` 파일을 열어 노래를 들으며 가사와 화음 가이드를 따라가는 화면이다. 화면의 중심은 항상 가사다.

## 2. 기본 화면 원칙

- 전체 가사를 줄글로 보여준다.
- 현재 재생 위치에 해당하는 cue를 강조한다.
- 직전/직후 cue만 보여주는 방식은 사용하지 않는다.
- Part 설명, 믹서, 설정은 가사 영역을 침범하지 않는 보조 패널에 둔다.
- 진행 seek bar와 현재/전체 시간은 하단 고정 재생바 안에 둔다.
- 하단 고정 재생바는 유튜브 뮤직처럼 재생 컨트롤과 진행 amount를 한 덩어리로 보여준다.
- Viewer 화면은 내부 스크롤을 만들지 않고 페이지 스크롤 하나로 긴 가사와 범례를 탐색한다.

## 3. 레이아웃

데스크탑:

```txt
┌──────────────────────────────────────────────┬─────────────────┐
│ Lyrics Stage                                  │ Right Sidebar   │
│ 전체 줄글 가사 / 현재 cue 강조 / auto-scroll   │ Parts / Mixer   │
└──────────────────────────────────────────────┴─────────────────┘
Fixed Bottom Playbar: seek, current/duration, play, loop, rate
```

모바일:

```txt
┌───────────────────────────────┐
│ Lyrics Stage                   │
│ 전체 줄글 가사                  │
│ 현재 cue 강조                   │
│ auto-scroll                    │
├───────────────────────────────┤
│ Bottom Playbar                 │
└───────────────────────────────┘

Floating / Bottom Sheet:
- Parts
- Mixer
- Settings
```

## 4. 가사 표시

전체 cue를 시간순으로 정렬해 문서처럼 보여준다.

정렬 기준:

```txt
startMs ascending
lane.order ascending
cue.id fallback
```

현재 시간에 활성화된 cue:

```ts
const activeCues = cues.filter(
  (cue) => cue.startMs <= currentMs && currentMs < cue.endMs,
)
```

강조 규칙:

- active cue는 크기, weight, opacity로 강조한다.
- 이전/다음 cue는 줄글 흐름 안에서 자연스럽게 위아래로 밀린다.
- active cue가 여러 개면 모두 강조한다.
- gap 구간에서는 가장 가까운 다음 cue로 auto-scroll할지, 현재 위치를 유지할지 UX로 결정한다.

권장 v1:

```txt
gap 구간에서는 마지막 active cue 강조를 해제하고, auto-scroll은 멈추지 않는다.
```

## 5. Main/Sub 표시

Main/Sub는 lyric segment의 role이다. 둘 다 독립 가사다.

시각 규칙:

```txt
Main: 기본 글자색, 더 큰 크기, 중심 weight
Sub: 별도 글자색, 약간 작은 크기, 구분되는 weight
```

예:

```txt
아가씨        네?
아가씨~       왜불러요?
who am I 너에게 물어볼게        어째서?
who am I 잘 모르겠어
        who are you 내가 물어볼게
```

Sub는 화음 표시가 아니다. 화음/파트 표시는 Part Mark로 처리한다.

## 6. Part Mark 표시

Part Mark는 텍스트 위에 추가되는 시각 정보다.

스타일:

- `line-above`: 텍스트 위 색상 줄
- `line-below`: 텍스트 아래 색상 줄
- `highlight`: 텍스트 배경 형광펜

규칙:

- Part 색상은 Part Mark 색상으로 사용한다.
- 글자색은 Main/Sub 구분용으로 사용한다.
- Part Mark는 글자색을 직접 바꾸지 않는다.
- 같은 위치에 여러 Part Mark가 있으면 줄을 쌓거나 priority를 적용한다.
- 편집자 Notes 단계에서는 선택한 Part에 대해 가사 범위를 드래그해 `PartMark.note` 주석을 남길 수 있다.
- `PartMark.note`는 가사 본문에 항상 펼치지 않고 Part 색상의 주석 말풍선으로 표시한다. 말풍선을 hover하면 해당 가사 범위를 형광펜처럼 강조하고, 주석 본문을 tooltip으로 노출한다.
- `PartMark.note`가 있는 항목은 Sub의 위줄/밑줄/형광펜 표시로 렌더링하지 않는다. Notes 드래그는 Sub 표시 토글과 분리한다.

## 7. Auto-scroll

재생 중에는 현재 cue가 화면 중앙 근처에 오도록 자동 스크롤한다.

사용자 수동 스크롤 처리:

```txt
사용자가 직접 스크롤
-> auto-scroll 일시정지
-> [현재 위치로] 버튼 표시
-> 버튼 클릭 시 auto-scroll 재개
```

v1에서는 자동 복귀보다 명시적 복귀 버튼을 우선한다.

## 8. 하단 재생바

필수 요소:

```txt
Play/Pause
현재 시간 / 전체 시간
Seek bar
A-B loop
현재 cue loop
Playback rate
Mixer 버튼
Parts 버튼
```

예:

```txt
[▶] 01:23 / 03:42  ━━━━━●━━━━━  [A] [B] [Loop] [1.0x] [Mixer] [Parts]
```

## 9. 반복 재생

### 9.1 A-B 반복

- 사용자가 A 지점과 B 지점을 지정한다.
- 재생 위치가 B 이상이 되면 A로 돌아간다.
- A/B는 하단 재생바에서 설정한다.

### 9.2 현재 cue 반복

- 선택한 cue의 `startMs`~`endMs`를 반복한다.
- 모바일에서는 가사 long press로 설정할 수 있다.
- 데스크탑에서는 버튼 또는 단축키로 설정할 수 있다.

## 10. 가사 클릭

가사 cue 클릭 시 해당 cue 시작 2초 전부터 재생한다.

```txt
targetMs = max(0, cue.startMs - clickPreRollMs)
```

기본 `clickPreRollMs`는 2000이다.

## 11. Mixer 패널

Mixer는 가사 화면을 방해하지 않도록 사이드바 또는 bottom sheet로 연다.

표시 항목:

- MR volume/mute/solo
- 연결된 track별 volume/mute/solo
- 전체 mute/solo 상태
- Part/audio variant 링크 변경은 Audio 단계에서만 처리한다.

Track 예:

```txt
메인 보컬 guide
Volume: 80%
[Mute] [Solo]
```

## 12. Parts 패널

Parts 패널은 범례와 설명을 보여준다.

표시 항목:

- Part 이름
- 색상
- 설명
- 표시 방식: 위줄, 밑줄, 형광펜
- 연결된 audio variant

메인 가사 화면에는 이 정보가 상시 노출되지 않는다.

## 13. 단축키

Viewer 권장 단축키:

```txt
Space: play/pause
ArrowLeft: 2초 뒤로
ArrowRight: 2초 앞으로
Shift + ArrowLeft: 이전 cue
Shift + ArrowRight: 다음 cue
L: loop on/off
M: mixer 열기
P: parts 열기
F: fullscreen
Esc: panel 닫기
```

## 14. 모바일 정책

모바일에서 지원:

- `.eazychorus` 열기
- 재생/일시정지
- seek
- 가사 auto-scroll
- 가사 클릭/탭 재생
- 반복 재생
- mute/solo/volume 조절
- Part 설명 보기

모바일에서 지원하지 않음:

- 가사 import
- lane 편집
- tap-sync
- Part Mark 편집
- 프로젝트 구조 편집

편집 진입 시 메시지:

```txt
이 프로젝트의 편집은 데스크탑 화면에서만 지원됩니다. 현재 기기에서는 보기 모드만 사용할 수 있습니다.
```

## 15. 접근성 고려

- 색상만으로 의미를 전달하지 않는다.
- Part Mark에는 hover/focus 시 Part 이름을 보여준다.
- Main/Sub는 색상 외에도 크기/weight 차이를 둔다.
- 재생바 버튼에는 텍스트 label 또는 aria-label을 제공한다.
- 키보드로 기본 재생 조작이 가능해야 한다.
