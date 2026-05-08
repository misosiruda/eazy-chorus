# 오디오 엔진

## 1. 목표

Eazy Chorus의 오디오 엔진은 DAW가 아니라 연습용 동시 재생 엔진이다. 목표는 여러 음원을 같은 시작점에서 안정적으로 동시에 재생하고, 사용자가 필요한 파트만 듣도록 mute/solo/variant 조작을 제공하는 것이다.

## 2. 기본 전제

- 음원 파일들은 외부 DAW나 편집 도구에서 이미 싱크와 길이를 맞춰 export한다.
- 앱은 트랙별 세밀한 offset 보정 UI를 제공하지 않는다.
- 재생은 HTML `<audio>` 스트리밍 방식이 아니라 Web Audio API를 사용한다.
- 필요한 트랙만 `AudioBuffer`로 RAM에 디코딩한다.
- 모든 활성 트랙은 같은 `AudioContext.currentTime` 기준으로 시작한다.

## 3. 로딩 전략

`.eazychorus` 파일을 열 때 모든 음원을 즉시 디코딩하지 않는다.

권장 순서:

```txt
1. ZIP 파일 열기
2. project.json 파싱
3. media 목록 표시
4. 사용자가 재생할 track만 Blob/ArrayBuffer로 읽기
5. decodeAudioData로 AudioBuffer 생성
6. 재생에 사용하지 않는 AudioBuffer는 해제
```

이유:

- 300MB 프로젝트 파일은 가능하지만, 디코딩 후 PCM RAM 사용량은 훨씬 커질 수 있다.
- 모바일 Safari/Chrome에서는 큰 파일 전체 디코딩이 불안정할 수 있다.
- 사용자가 실제로 듣는 variant만 디코딩해야 한다.

## 4. 재생 방식

재생 시 각 트랙마다 `AudioBufferSourceNode`를 만든다. `AudioBufferSourceNode`는 일회성 노드이므로 seek나 재시작 때 새로 생성한다.

개념 코드:

```ts
const startAt = audioContext.currentTime + 0.05
const offsetSeconds = currentPositionMs / 1000

for (const track of activeTracks) {
  const source = audioContext.createBufferSource()
  source.buffer = track.audioBuffer
  source.connect(track.gainNode)
  source.start(startAt, offsetSeconds)
}
```

## 5. Seek

Seek 시 기존 source들을 모두 정지하고 새 source들을 같은 시점에 다시 시작한다.

```txt
seek(targetMs)
-> stop all current sources
-> currentPositionMs = targetMs
-> if playing, create sources and start at targetMs
```

## 6. 가사 클릭 재생

가사 cue 클릭 시 기본 2초 전부터 재생한다.

```txt
targetMs = max(0, cue.startMs - project.settings.clickPreRollMs)
seekAndPlay(targetMs)
```

기본값은 2000ms다.

## 7. Mute / Solo / Volume

Mute/Solo/Volume은 실제 재생되는 MediaTrack 기준으로 적용한다.

볼륨 계산 규칙:

```ts
const hasSolo = tracks.some((track) => track.solo)

function getEffectiveGain(track: MediaTrack) {
  if (!track.enabled) return 0
  if (hasSolo) return track.solo ? track.volume : 0
  return track.muted ? 0 : track.volume
}
```

규칙:

- Solo가 하나라도 있으면 solo track만 들린다.
- 여러 track을 동시에 solo할 수 있다.
- Solo가 없으면 muted track은 들리지 않는다.
- `enabled: false`인 variant는 재생 대상이 아니다.

## 8. Part와 Audio Variant

Part와 음원 파일은 분리한다.

```txt
Part = 사람이 부르는 역할/범례
Audio Variant = 그 Part를 들을 수 있는 음원 버전
```

예:

```txt
Part: 메인 보컬
- 메인 보컬 FX
- 메인 보컬 No FX
```

v1 기본 UX:

- 하나의 Part에서 기본적으로 하나의 variant만 enabled 상태다.
- 편집자는 Audio 단계에서 Part audio variant를 전환할 수 있다.
- Preview/연습자 Mixer는 이미 연결된 track의 volume/mute/solo만 조절한다.
- 고급 기능으로 여러 variant 동시 재생을 허용할 수 있지만, MVP 기본은 단일 선택이다.

## 9. 반복 재생

v1 Viewer는 두 종류의 반복을 지원한다.

### 9.1 A-B 반복

사용자가 반복 시작점 A와 끝점 B를 직접 지정한다.

```txt
if loop.enabled && currentMs >= loop.endMs:
  seekAndPlay(loop.startMs)
```

### 9.2 Cue 반복

현재 cue 또는 선택한 cue를 반복한다. 클릭 pre-roll과 별도로 반복 범위는 cue의 실제 `startMs`, `endMs`를 사용한다.

옵션:

- 반복 시작을 `cue.startMs`로 할지
- 연습 편의를 위해 `cue.startMs - preRollMs`로 할지

v1 기본은 사용자가 선택한 반복 모드에 따라 명확히 표시한다.

## 10. 재생 속도

연습용으로 playback rate를 제공할 수 있다.

권장 프리셋:

```txt
0.75x, 0.9x, 1.0x, 1.1x
```

주의:

- Web Audio에서 pitch 보존 time-stretch는 별도 처리가 필요하다.
- v1에서는 단순 playbackRate 변경으로 시작할 수 있다.
- pitch 보존은 후순위 기능으로 둔다.

## 11. 음원 포맷

권장:

- MP3
- WAV
- M4A/AAC

주의:

- 브라우저별 decode 지원이 다를 수 있다.
- v1에서는 브라우저가 `decodeAudioData`로 처리 가능한 파일을 허용한다.
- 실패 시 사용자에게 다른 포맷으로 변환하라는 메시지를 보여준다.

## 12. 파일 크기 정책

권장 경고 기준:

```txt
Desktop: 300MB 초과 시 경고
Mobile: 100MB 초과 시 경고
```

이 기준은 강제 제한이 아니라 UX 경고다.

## 13. 에러 처리

필수 에러 케이스:

- ZIP 내부 media 파일 누락
- 오디오 decode 실패
- 브라우저 메모리 부족
- 재생 전 AudioContext unlock 필요
- 모바일에서 대형 파일 열기 실패

사용자 메시지는 기술 용어보다 행동 중심이어야 한다.

예:

```txt
이 음원은 현재 브라우저에서 열 수 없습니다. MP3 또는 WAV로 변환한 뒤 다시 추가해 주세요.
```
