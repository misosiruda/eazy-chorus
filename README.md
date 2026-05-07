# eazy-chorus

Eazy Chorus는 백엔드 없이 동작하는 프론트엔드 전용 화음 가이드 웹앱입니다.

현재 단계는 Milestone 3 가사 import입니다.

## 개발 환경

- Node.js 22 이상 권장
- npm

## 실행

```powershell
npm install
npm run dev
```

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

## 기획 문서

- [Docs Index](./docs/README.md)
- [제품 기획](./docs/product-plan.md)
- [파일 포맷 v1](./docs/file-format-v1.md)
- [오디오 엔진](./docs/audio-engine.md)
- [가사 가져오기 및 편집기](./docs/lyrics-import-and-editor.md)
- [보기/연습 모드](./docs/viewer-mode.md)
- [구현 로드맵](./docs/implementation-roadmap.md)
- [Milestone 0 실행 계획](./docs/milestones/milestone-0-project-bootstrap.md)
- [Milestone 1 실행 결과](./docs/milestones/milestone-1-file-format-project-io.md)
- [Milestone 2 실행 결과](./docs/milestones/milestone-2-audio-engine.md)
- [Milestone 3 실행 결과](./docs/milestones/milestone-3-lyrics-import.md)
- [용어집](./docs/glossary.md)
