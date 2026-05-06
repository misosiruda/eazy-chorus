# Milestone 0 실행 계획: 프로젝트 부트스트랩

## 1. 목표

Milestone 0의 목표는 Eazy Chorus를 실제 구현 가능한 프론트엔드 프로젝트 상태로 만드는 것이다.

완료 시점에는 로컬 개발 서버, TypeScript strict 기반 코드 작성 환경, 기본 라우팅, 정적 빌드, GitHub Pages 배포 준비가 모두 갖춰져 있어야 한다.

## 2. 참조 문서

- [제품 기획](../product-plan.md)
- [구현 로드맵](../implementation-roadmap.md)
- [파일 포맷 v1](../file-format-v1.md)
- [오디오 엔진](../audio-engine.md)
- [보기/연습 모드](../viewer-mode.md)

## 3. 범위

### 3.1 포함

- Vite 기반 React + TypeScript 프로젝트 생성
- TypeScript strict 설정
- lint/format 기본 설정
- 테스트 러너 기본 설정
- 기본 앱 레이아웃과 홈 화면
- 최소 라우팅 구조
- 정적 빌드 설정
- GitHub Pages 배포 가능 설정
- README 실행/빌드 명령 갱신
- 기본 품질 검증 명령 정리

### 3.2 제외

- `.eazychorus` 파일 import/export 구현
- Web Audio API 재생 엔진 구현
- 가사 import/parsing 구현
- tap-sync 편집기 구현
- Part Mark 편집 구현
- 모바일 최종 UI polish
- 백엔드, 로그인, 서버 저장, 클라우드 저장

## 4. 기술 결정 초안

Milestone 0에서는 기능 구현보다 이후 milestone을 안전하게 얹을 수 있는 기반을 우선한다.

- Build tool: Vite
- UI framework: React
- Language: TypeScript
- Routing: React Router
- Styling: 초기에는 CSS Modules 또는 전역 CSS 중 하나로 단순하게 시작
- Test: Vitest + React Testing Library
- Lint/format: ESLint + Prettier
- Deploy target: GitHub Pages

상태 관리는 Milestone 1에서 프로젝트 파일 입출력과 내부 모델을 만들 때 확정한다. Milestone 0에서는 React state만으로 충분한 placeholder 화면을 구성한다.

## 5. 작업 순서

### 5.1 프로젝트 생성

1. Vite React TypeScript 템플릿으로 프로젝트를 생성한다.
2. 기존 문서 폴더와 충돌하지 않도록 루트 구조를 정리한다.
3. `package.json` scripts를 다음 기준으로 정리한다.
   - `dev`: 로컬 개발 서버
   - `build`: TypeScript 검사와 정적 빌드
   - `preview`: 빌드 결과 preview
   - `lint`: lint 검사
   - `test`: 단위 테스트

### 5.2 TypeScript와 품질 도구 설정

1. `tsconfig`에서 strict 계열 옵션을 활성화한다.
2. 브라우저 앱에 필요한 path alias 여부를 결정한다.
3. ESLint를 React/TypeScript 기준으로 설정한다.
4. Prettier를 추가할 경우 lint와 책임을 분리한다.
5. Vitest와 Testing Library를 연결해 최소 smoke test를 작성한다.

### 5.3 앱 골격 구성

1. 기본 라우팅을 만든다.
2. 첫 화면은 실제 앱 진입점으로 구성한다.
3. 홈 화면에는 다음 액션의 자리만 마련한다.
   - 새 프로젝트 만들기
   - 프로젝트 파일 열기
   - 샘플 프로젝트 열기
4. 아직 구현되지 않은 액션은 disabled 또는 placeholder 상태로 둔다.
5. 백엔드 의존성 없이 정적 앱으로 동작해야 한다.

### 5.4 디렉터리 구조 초안

초기 구조는 과도하게 세분화하지 않는다. Milestone 1에서 파일 포맷과 프로젝트 모델이 들어올 수 있도록 최소한의 경계만 잡는다.

```txt
src/
├─ app/
│  ├─ App.tsx
│  └─ routes.tsx
├─ pages/
│  └─ HomePage.tsx
├─ shared/
│  ├─ components/
│  └─ styles/
├─ main.tsx
└─ vite-env.d.ts
```

Milestone 1 이후에는 `features/project-file`, `features/audio`, `features/lyrics`, `features/viewer` 같은 기능 단위 폴더를 필요할 때 추가한다.

### 5.5 정적 빌드와 GitHub Pages 준비

1. Vite `base` 값을 GitHub Pages 배포 경로에 맞게 설정한다.
2. repository 이름이 배포 URL path가 될 가능성을 고려한다.
3. GitHub Actions workflow를 추가할지, 수동 build artifact만 만들지 결정한다.
4. 최소 기준은 `npm run build` 결과가 정적 파일로 생성되는 것이다.

## 6. 산출물

- React + TypeScript 앱 골격
- 기본 라우팅
- 홈 화면
- lint/test/build 명령
- 최소 smoke test
- GitHub Pages 배포 준비 설정
- README 실행/빌드/배포 섹션

## 7. Acceptance criteria

Milestone 0은 다음을 모두 만족하면 완료로 본다.

- 로컬 개발 서버가 실행된다.
- 기본 홈 화면이 표시된다.
- TypeScript strict 설정에서 빌드가 통과한다.
- lint가 통과한다.
- 최소 테스트가 통과한다.
- 정적 build 결과를 생성할 수 있다.
- GitHub Pages 배포 경로에 맞춘 설정이 존재한다.
- README에 로컬 실행, 테스트, 빌드, preview 방법이 적혀 있다.

## 8. 검증 명령

구현 완료 후 다음 명령을 기준으로 검증한다.

```powershell
npm install
npm run lint
npm run test
npm run build
npm run preview
```

패키지 매니저를 `npm`이 아닌 다른 도구로 확정할 경우 이 문서와 README의 명령을 함께 갱신한다.

## 9. 리스크와 결정 대기 항목

- GitHub Pages 배포 URL이 repository path 기반인지 custom domain 기반인지 아직 확정되지 않았다.
- 기본 디자인 톤과 색상 팔레트는 제품 기획에서 보류 상태다.
- CSS Modules, 전역 CSS, utility CSS 중 어떤 방식을 쓸지 Milestone 0 구현 중 결정해야 한다.
- 상태 관리 라이브러리는 Milestone 1의 프로젝트 모델 구현 전까지 도입하지 않는다.

## 10. 다음 milestone 연결

Milestone 0이 끝나면 Milestone 1에서 `.eazychorus` ZIP import/export, `project.json` schema validation, media 포함 저장을 구현한다.

따라서 Milestone 0의 앱 구조는 파일 입출력과 내부 프로젝트 모델이 자연스럽게 들어올 수 있도록 유지하되, 아직 확정되지 않은 추상화를 미리 만들지 않는다.
