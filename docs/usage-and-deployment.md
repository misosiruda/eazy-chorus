# 사용법과 배포

## Public URL

Eazy Chorus는 GitHub Pages에서 정적 프론트엔드로 배포한다.

- 앱 URL: <https://misosiruda.github.io/eazy-chorus/>
- 샘플 프로젝트: <https://misosiruda.github.io/eazy-chorus/samples/eazy-chorus-demo.eazychorus>

## 샘플 프로젝트 열기

1. 앱을 연다.
2. 상단의 `샘플 열기` 버튼을 누른다.
3. `Viewer Mode`에서 cue 강조, Part Mark, Mixer, Parts 패널을 확인한다.
4. 직접 파일로 확인하려면 샘플 `.eazychorus` 파일을 내려받은 뒤 `파일 열기`로 불러온다.

샘플 프로젝트에는 다음 항목이 포함된다.

- 12초 길이의 WAV 기반 MR
- Main Vocal, Upper Harmony, Lower Harmony guide track
- 4개 cue와 gap 구간
- Main/Sub segment role
- highlight, line-above, line-below Part Mark

## Google Drive 프로젝트 열기

Project File 섹션에서는 로컬 파일 외에 Google Drive 프로젝트를 열 수 있다.

- `Google로 연결`: Google OAuth 흐름을 명시적으로 시작한다.
- `Drive 열기`: 공유 링크를 붙여 넣어 `.eazychorus` 파일을 연다.
- `Drive 선택`: Google Picker에서 Drive 파일을 직접 선택해 연다.

Drive 파일의 권한에 따라 앱 모드가 달라진다.

- 편집 권한이 있으면 Editor로 열리고 `Drive에 저장`을 사용할 수 있다.
- 다운로드만 가능하거나 보기 전용이면 Practice Viewer로 열린다.
- 다운로드 권한이 없으면 파일을 열 수 없다.

Google Drive 설정, OAuth scope, Google Cloud 환경 변수는 [Google Drive 연동](./google-drive.md)에 정리한다.

## 로컬 실행

```powershell
npm install
npm run dev
```

Vite dev server가 표시하는 URL로 접속한다. repository path 배포를 위해 Vite `base`는 `/eazy-chorus/`로 고정되어 있다.

## 품질 검증

```powershell
npm run lint
npm run test
npm run build
```

`npm run build`는 TypeScript build와 Vite 정적 build를 함께 실행하며 결과는 `dist/`에 생성된다.

## 빌드 결과 미리보기

```powershell
npm run preview
```

`preview`는 `dist/` 결과물을 로컬에서 서빙한다. 배포 전에 sample URL과 앱 routing이 build 결과에서도 동작하는지 확인할 때 사용한다.

## GitHub Pages 배포

배포 workflow는 `.github/workflows/deploy-pages.yml`이다.

- trigger: `main` push 또는 `workflow_dispatch`
- Node.js: 22
- 검증 순서: `npm ci`, `npm run lint`, `npm run test`, `npm run build`
- artifact: `dist/`
- Pages source: GitHub Actions

GitHub repository 설정에서 Pages source가 `GitHub Actions`로 지정되어 있어야 한다. `main`에 병합되면 workflow가 `dist/`를 Pages artifact로 업로드하고 `https://misosiruda.github.io/eazy-chorus/`에 배포한다.

## 샘플 프로젝트 갱신

샘플 `.eazychorus` 파일은 생성 스크립트로 갱신한다.

```powershell
npm run sample:project
```

생성 결과:

```text
public/
└─ samples/
   └─ eazy-chorus-demo.eazychorus
```

샘플을 갱신한 뒤에는 파일 포맷 validation과 build artifact 포함 여부를 확인하기 위해 전체 품질 검증 명령을 다시 실행한다.
