# Milestone 2 실행 결과: 오디오 엔진

## 1. 목표

Milestone 2의 목표는 `.eazychorus` 프로젝트에 포함된 media 파일을 Web Audio API로 디코딩하고, 여러 트랙을 같은 시점과 같은 seek offset에서 동시에 재생하는 것이다.

구현은 `docs/audio-engine.md`의 Web Audio 재생 방식과 lazy decode 정책을 기준으로 한다.

## 2. 포함 범위

- Web Audio API 기반 재생 엔진
- 활성 media track lazy decode
- 여러 트랙 동시 start scheduling
- play, pause, stop, replay
- seek 후 활성 트랙 재시작
- mute, solo, volume 즉시 반영
- MR active toggle
- Part별 audio variant 단일 선택
- decode된 duration을 `media.durationMs`에 반영
- 오디오 엔진 단위 테스트
- 홈 화면 transport/mixer UI

## 3. 제외 범위

- waveform 생성
- 모바일 대용량 파일 최적화
- cue 기반 반복 재생
- A-B 반복 재생
- pitch 보존 time-stretch
- 트랙별 offset 보정 UI

## 4. 구현 구조

```txt
src/features/audio-engine/
├─ audioEngine.test.ts
├─ audioEngine.ts
├─ index.ts
└─ mix.ts
```

- `audioEngine.ts`는 Web Audio context, buffer cache, gain node, source node scheduling을 담당한다.
- `mix.ts`는 mute/solo/volume effective gain 계산, Part variant 선택, decode duration 반영 helper를 담당한다.
- `HomePage.tsx`는 기존 프로젝트 파일 워크스페이스에 transport, seek, mixer, Part variant 선택 UI를 제공한다.

## 5. Acceptance criteria 확인

- MR과 보컬 트랙이 같은 `AudioContext.currentTime` 기준 start time에 재생된다.
- seek 후 재생 중인 활성 트랙들이 같은 offset에서 다시 시작한다.
- mute/solo/volume은 gain node 값으로 즉시 반영된다.
- 같은 Part의 FX/No FX 등 audio variant를 단일 선택으로 전환할 수 있다.

## 6. 검증 명령

```powershell
npm run lint
npm run test
npm run build
```
