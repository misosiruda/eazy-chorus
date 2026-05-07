# Milestone 7: 배포와 문서 실행 결과

## 목표

- 정적 build 결과를 생성한다.
- GitHub Pages로 public URL을 배포한다.
- 사용자가 앱을 실행하고 프로젝트 파일을 열 수 있는 사용법 문서를 작성한다.
- 기능 확인용 샘플 `.eazychorus` 프로젝트를 제공한다.

## 구현 결과

- `vite.config.ts`의 repository path 기반 `base: '/eazy-chorus/'` 설정과 GitHub Pages workflow를 milestone 7 기준 배포 계약으로 정리했다.
- 상단 작업 액션에 `샘플 열기` 버튼을 추가해 배포된 정적 sample package를 앱에서 바로 import할 수 있게 했다.
- `public/samples/eazy-chorus-demo.eazychorus` 샘플 프로젝트를 추가했다.
- `scripts/create-sample-project.mjs`와 `npm run sample:project`를 추가해 샘플 package를 재현 가능하게 생성한다.
- `docs/usage-and-deployment.md`에 public URL, 샘플 열기, 로컬 실행, 품질 검증, preview, GitHub Pages 배포, 샘플 갱신 절차를 정리했다.
- README와 docs index를 milestone 7 상태에 맞게 갱신했다.

## 샘플 프로젝트 구성

샘플 프로젝트는 v1 파일 포맷을 그대로 사용한다. 새 schemaVersion이나 `project.json` 필드는 추가하지 않았다.

```text
public/samples/eazy-chorus-demo.eazychorus
├─ project.json
└─ media/
   ├─ sample-mr.wav
   ├─ main-vocal-guide.wav
   ├─ upper-harmony-guide.wav
   └─ lower-harmony-guide.wav
```

샘플 `project.json`에는 다음 확인 지점이 포함된다.

- 4개 cue와 1개 gap 구간
- Main/Sub lyric segment role
- Main Vocal, Upper Harmony, Lower Harmony part
- highlight, line-above, line-below Part Mark
- Viewer Mixer에서 선택 가능한 MR과 part guide track

## 배포 계약

- public URL: <https://misosiruda.github.io/eazy-chorus/>
- sample URL: <https://misosiruda.github.io/eazy-chorus/samples/eazy-chorus-demo.eazychorus>
- workflow: `.github/workflows/deploy-pages.yml`
- build artifact: `dist/`
- GitHub Pages source: GitHub Actions

## 검증

전체 검증 명령:

```powershell
npm run sample:project
npm run lint
npm run test
npm run build
```

`src/features/project-file/projectFile.test.ts`에서 배포 대상 sample `.eazychorus` package를 실제로 import해 project validation error가 없고 media/cue/partMark가 복원되는지 검증한다.
