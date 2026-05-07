# eazy-chorus

Eazy Chorus는 백엔드 없이 동작하는 프론트엔드 전용 화음 가이드 웹앱입니다.

현재 단계는 Milestone 7 배포와 문서입니다.

배포 URL: [https://misosiruda.github.io/eazy-chorus/](https://misosiruda.github.io/eazy-chorus/)

샘플 프로젝트: [eazy-chorus-demo.eazychorus](https://misosiruda.github.io/eazy-chorus/samples/eazy-chorus-demo.eazychorus)

## 개발 환경

- Node.js 22 이상 권장
- npm

## 실행

```powershell
npm install
npm run dev
```

로컬 dev server에서 앱을 연 뒤 `샘플 열기`를 누르면 포함된 샘플 `.eazychorus` 프로젝트를 바로 불러올 수 있습니다.

## 품질 검증

```powershell
npm run lint
npm run test
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.

## 빌드 결과 미리보기

```powershell
npm run preview
```

## 배포

GitHub Pages 배포 경로는 repository path 기반인 `/eazy-chorus/`로 설정되어 있습니다.

`main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml` workflow가 lint, test, build를 실행한 뒤 `dist/`를 GitHub Pages artifact로 배포합니다.

GitHub repository의 Pages source는 `GitHub Actions`로 설정되어 있어야 합니다.

## 샘플 프로젝트 갱신

샘플 파일은 `public/samples/eazy-chorus-demo.eazychorus`에 포함되어 있고 정적 build 결과에 같이 복사됩니다.

```powershell
npm run sample:project
```

샘플을 갱신한 뒤에는 `npm run lint`, `npm run test`, `npm run build`로 검증합니다.

## 기획 문서

- [Docs Index](./docs/README.md)
- [제품 기획](./docs/product-plan.md)
- [파일 포맷 v1](./docs/file-format-v1.md)
- [오디오 엔진](./docs/audio-engine.md)
- [가사 가져오기 및 편집기](./docs/lyrics-import-and-editor.md)
- [보기/연습 모드](./docs/viewer-mode.md)
- [사용법과 배포](./docs/usage-and-deployment.md)
- [구현 로드맵](./docs/implementation-roadmap.md)
- [Milestone 0 실행 계획](./docs/milestones/milestone-0-project-bootstrap.md)
- [Milestone 1 실행 결과](./docs/milestones/milestone-1-file-format-project-io.md)
- [Milestone 2 실행 결과](./docs/milestones/milestone-2-audio-engine.md)
- [Milestone 3 실행 결과](./docs/milestones/milestone-3-lyrics-import.md)
- [Milestone 4 실행 결과](./docs/milestones/milestone-4-lane-tap-sync.md)
- [Milestone 5 실행 결과](./docs/milestones/milestone-5-part-mark-editor.md)
- [Milestone 6 실행 결과](./docs/milestones/milestone-6-viewer-mode.md)
- [Milestone 7 실행 결과](./docs/milestones/milestone-7-deployment-docs.md)
- [용어집](./docs/glossary.md)
