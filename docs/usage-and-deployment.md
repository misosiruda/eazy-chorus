# 사용법과 배포

## Public URL

Eazy Chorus는 GitHub Pages에서 정적 프론트엔드로 배포한다.

- 앱 URL: <https://misosiruda.github.io/eazy-chorus/>
- 샘플 프로젝트: <https://misosiruda.github.io/eazy-chorus/samples/eazy-chorus-demo.eazychorus>

## 샘플 프로젝트 열기

1. 앱을 연다.
2. Project File 영역의 `샘플 열기` 버튼을 누른다.
3. 연습자 화면으로 이동해 `Viewer Mode`의 cue 강조, Part Mark, Mixer, Parts 패널을 확인한다.
4. 직접 파일로 확인하려면 샘플 `.eazychorus` 파일을 내려받은 뒤 `파일 열기`로 불러온다.

샘플 프로젝트에는 다음 항목이 포함된다.

- 12초 길이의 WAV 기반 MR
- Main Vocal, Upper Harmony, Lower Harmony guide track
- 4개 cue와 gap 구간
- Main/Sub segment role
- highlight, line-above, line-below Part Mark

## 프로젝트 파일 열기와 저장

Project File 섹션에서 기기에 저장된 `.eazychorus` 프로젝트를 연다. 로그인이나 클라우드 연동 설정은 필요하지 않다.

1. `파일 열기`를 눌러 `.eazychorus` 파일을 선택한다.
2. 편집자 화면에서는 프로젝트를 수정하고, 연습자 화면에서는 재생과 연습을 진행한다. 파일을 열어도 현재 화면은 유지된다.
3. 편집 내용을 보관하려면 편집자 화면의 `.eazychorus 저장`을 눌러 파일을 내려받는다.

## 프로젝트 공유

1. 작성자는 편집한 프로젝트를 `.eazychorus` 파일로 저장한다.
2. 메신저나 메일 등으로 파일을 전달한다.
3. 받은 사람은 파일을 기기에 다운로드한 뒤 앱의 `파일 열기`로 불러온다.

앱은 로컬 파일을 자동으로 덮어쓰거나 클라우드에 동기화하지 않는다. 수정 후에는 파일을 다시 저장해 전달한다.

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
