# 용어집

## Project

하나의 곡 연습 자료 전체를 의미한다. 곡 정보, 음원, 가사, 싱크, 파트, 범례, 표시 규칙을 포함한다.

## `.eazychorus`

Eazy Chorus 프로젝트 파일 확장자다. 실제 형식은 ZIP 패키지이며, 내부에 `project.json`, `media/*`, 선택적 `waveform/*` 등을 포함한다.

## Backing Track / MR

노래의 반주 트랙이다. 범례 Part로 표시하지 않는다. 믹서에서는 mute, solo, volume 조작 대상이다.

## Part

사람이 부르는 역할 또는 범례 단위다. 예: 메인 보컬, 듀엣 B, 상성부, 하성부, 코러스.

Part는 다음 정보를 가진다.

- 이름
- 색상
- 설명
- 표시 위치 기본값
- 연결된 audio variant 목록

Part는 음원 파일 그 자체가 아니다.

## Audio Variant

하나의 Part를 들을 수 있는 음원 버전이다. 하나의 Part는 여러 audio variant를 가질 수 있다.

예:

```txt
Part: 메인 보컬
- Variant: 메인 보컬 FX
- Variant: 메인 보컬 No FX
```

## Media Track

프로젝트 파일에 포함된 실제 오디오 파일 엔트리다. MR일 수도 있고, Part의 audio variant일 수도 있다.

## Lyric Cue

특정 시간 범위에 표시되는 가사 단위다. `startMs`, `endMs`를 가진다.

## Lyric Segment

하나의 cue 안에 들어 있는 텍스트 조각이다. Main/Sub role을 가진다.

예:

```txt
아가씨 네?
```

이 경우 하나의 cue 안에 다음 segment가 있을 수 있다.

```txt
main: 아가씨
sub: 네?
```

## Main Lyric Role

곡의 전체적인 가사 흐름을 담당하는 주 가사 role이다. 실제 메인 보컬인지 여부와 완전히 동일한 개념은 아니다. 화면에서는 기본 글자색과 큰 중심 스타일로 표시한다.

## Sub Lyric Role

메인 가사와 겹치거나 사이에 끼어드는 독립 가사 role이다. 뮤지컬, 듀엣, 콜앤리스폰스처럼 별도 가사를 부르는 경우에 사용한다. 화면에서는 글자색/크기/스타일 차이로 Main과 구분한다.

Sub는 화음 보조 표시가 아니다. Sub도 독립 텍스트다.

## Part Mark

특정 Part가 특정 가사 구간을 부르거나 화음으로 들어온다는 표시다. 독립 가사 줄을 만들지 않고, 기존 텍스트 위에 시각 표시만 붙인다.

표시 방식:

- 위줄
- 밑줄
- 형광펜

## Harmony Mark

Part Mark 중 화음 표시 목적이 강한 것을 의미한다. 예: 상성부는 위줄, 하성부는 밑줄.

## Lane

가사 편집과 싱크를 위해 사용하는 논리적 가사 줄 그룹이다. 돌림노래, 듀엣, 독립 서브 가사처럼 싱크가 다를 수 있는 흐름을 분리한다.

## Tap Sync

노래를 재생하면서 Space 또는 마우스 입력으로 다음 가사 시작점을 찍는 싱크 입력 방식이다.

## Gap

이전 cue가 끝난 뒤 다음 cue가 시작되기 전까지 가사를 표시하지 않는 공백 구간이다. 간주, 쉬는 구간, 무가사 구간을 표현한다.

## Viewer Mode

프로젝트 파일을 열어 연습하는 화면이다. 전체 줄글 가사를 보여주고 현재 싱크에 해당하는 cue를 강조한다.

## Editor Mode

프로젝트를 만드는 화면이다. 가사 import, lane 분리, tap-sync, Part Mark 지정, audio variant 설정을 포함한다. v1에서는 데스크탑 전용이다.
