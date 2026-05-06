# 구현 로드맵

## 1. 개발 원칙

- 먼저 데이터 모델과 파일 입출력을 안정화한다.
- 그 다음 오디오 재생 엔진을 만든다.
- 편집기는 단계를 나눠 구현한다.
- 뷰어는 초기부터 모바일을 고려한다.
- 백엔드 없이 정적 프론트엔드만으로 동작해야 한다.

## 2. 추천 기술 스택

- Vite
- React
- TypeScript
- Web Audio API
- ZIP 처리 라이브러리
- 상태 관리 라이브러리 또는 React 상태 기반 store
- GitHub Pages 배포

후보 라이브러리:

- ZIP: `fflate` 또는 `JSZip`
- 파일 저장: File System Access API 지원 시 사용, fallback으로 download link
- 대용량 임시 저장: 후순위로 IndexedDB 또는 OPFS 검토

## 3. Milestone 0: 프로젝트 부트스트랩

목표:

- 프론트엔드 프로젝트 생성
- TypeScript strict 환경 구성
- 기본 라우팅 구성
- GitHub Pages 배포 가능 상태 구성

Acceptance criteria:

- 로컬 dev server가 실행된다.
- 기본 홈 화면이 표시된다.
- GitHub Pages 또는 정적 build 결과를 생성할 수 있다.

## 4. Milestone 1: 파일 포맷과 프로젝트 입출력

목표:

- `.eazychorus` ZIP 읽기/쓰기
- `project.json` schema validation
- media 파일 포함 저장
- 다시 열었을 때 동일한 프로젝트 복원

필수 기능:

- 새 프로젝트 생성
- media 추가
- `.eazychorus` export
- `.eazychorus` import
- validation error 표시

Acceptance criteria:

- MR과 보컬 음원이 포함된 프로젝트 파일을 저장할 수 있다.
- 저장된 파일을 다시 열면 project meta, media, parts가 복원된다.
- 누락된 media 파일이 있으면 에러를 표시한다.

## 5. Milestone 2: 오디오 엔진

목표:

- 포함된 media를 Web Audio API로 재생
- 여러 트랙 동시 시작
- seek, stop, replay 구현
- mute/solo/volume 구현
- Part별 audio variant 선택

Acceptance criteria:

- MR과 보컬 트랙이 같은 시점에 동시에 재생된다.
- seek 후에도 활성 트랙들이 같은 offset에서 시작한다.
- mute/solo/volume이 즉시 반영된다.
- 같은 Part의 FX/No FX variant를 전환할 수 있다.

## 6. Milestone 3: 가사 import

목표:

- 원본 가사 붙여넣기
- 일본어/차음/해석 형식에서 차음 추출
- 영어 단독 줄 예외 처리
- 좌우 비교 confirm 화면

Acceptance criteria:

- 3줄 패턴에서 두 번째 줄을 추출한다.
- 영어 단독 2줄 패턴에서 첫 번째 줄을 추출한다.
- 사용자가 추출 결과를 직접 수정할 수 있다.
- confirm 후 lyric draft가 생성된다.
- 좌우 스크롤 싱크가 동작한다.

## 7. Milestone 4: Lane 편집과 Tap Sync

목표:

- lyric draft를 lane별로 배치
- cue 생성
- tap-sync로 start/end 입력
- gap 지정
- undo/redo 최소 지원

Acceptance criteria:

- 사용자가 lane을 만들고 가사를 배치할 수 있다.
- Space 또는 클릭으로 다음 cue 시작을 찍을 수 있다.
- G 입력으로 현재 cue 종료/gap 시작을 찍을 수 있다.
- Backspace로 마지막 sync 입력을 취소할 수 있다.
- 저장된 cue가 Viewer에서 시간에 맞게 활성화된다.

## 8. Milestone 5: Part와 Part Mark 편집

목표:

- MR 제외 음원 기반 Part 구성
- Part 이름/색상/설명 설정
- audio variant 연결
- Main/Sub lyric segment role 편집
- Part Mark 드래그 추가/삭제

Acceptance criteria:

- 하나의 Part가 여러 audio variant를 가질 수 있다.
- Main/Sub segment가 글자 스타일로 구분된다.
- 가사 일부를 드래그해 Part Mark를 추가할 수 있다.
- 같은 범위를 다시 드래그하면 Part Mark가 제거된다.
- Part Mark가 저장/불러오기 후 유지된다.

## 9. Milestone 6: Viewer Mode

목표:

- 전체 줄글 가사 표시
- 현재 cue 강조
- auto-scroll
- 하단 재생바
- 반복 재생
- Mixer/Parts 패널
- 모바일 보기 지원

Acceptance criteria:

- 전체 가사가 문서처럼 표시된다.
- 현재 cue가 재생 위치에 맞춰 강조된다.
- 사용자가 직접 스크롤하면 auto-scroll이 일시정지된다.
- [현재 위치로] 버튼으로 auto-scroll을 재개할 수 있다.
- 가사 클릭 시 cue 시작 2초 전부터 재생된다.
- A-B 반복과 cue 반복을 사용할 수 있다.
- 모바일에서 보기/재생/믹서/파트 설명이 가능하다.

## 10. Milestone 7: 배포와 문서

목표:

- 정적 build
- GitHub Pages 배포
- 사용법 문서 작성
- 샘플 프로젝트 생성

Acceptance criteria:

- public URL에서 앱을 열 수 있다.
- 사용자는 샘플 `.eazychorus` 파일을 열어 기능을 확인할 수 있다.
- README에 실행/빌드/배포 방법이 있다.

## 11. 우선순위

1. 프로젝트 파일 입출력
2. 오디오 동시 재생
3. Viewer 최소 기능
4. 가사 import
5. tap-sync 편집기
6. Part Mark 편집
7. 모바일 polish
8. 배포 자동화

이 순서를 추천하는 이유는 파일 포맷과 오디오 엔진이 흔들리면 편집기와 뷰어 전체가 다시 흔들리기 때문이다.

## 12. v1 완료 조건

v1은 다음 조건을 모두 만족하면 완료로 본다.

- 백엔드 없이 배포된 정적 웹앱으로 동작한다.
- 사용자는 새 프로젝트를 만들고 `.eazychorus`로 저장할 수 있다.
- 사용자는 `.eazychorus` 파일을 열어 같은 프로젝트를 볼 수 있다.
- 프로젝트 파일 안에 MR과 파트별 audio variant가 포함된다.
- 여러 audio track이 Web Audio API로 동시에 재생된다.
- mute/solo/volume/variant 선택이 가능하다.
- 일본어 가사 import와 confirm이 가능하다.
- 가사를 lane별로 나누고 tap-sync할 수 있다.
- Main/Sub lyric role과 Part Mark를 구분해 표시할 수 있다.
- Viewer에서 줄글 가사, 현재 cue 강조, auto-scroll, 반복 재생이 가능하다.
- 모바일에서는 보기/재생이 가능하고 편집은 제한된다.
