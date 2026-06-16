# Google Drive 연동

Eazy Chorus는 백엔드 없이 브라우저에서 Google Drive API를 직접 호출한다. OAuth access token은 현재 페이지 런타임 메모리에서만 사용하며, 서버 저장소나 refresh token은 사용하지 않는다.

## 사용자 흐름

### 공유 링크로 열기

1. Google Drive에서 `.eazychorus` 파일의 공유 링크를 만든다.
2. Eazy Chorus의 Project File 섹션에 공유 링크를 붙여 넣는다.
3. `Drive 열기`를 누른다.
4. 처음 사용하거나 런타임 메모리의 access token이 만료된 경우 Google 로그인을 완료한다.
5. Drive metadata와 파일 내용을 가져온다.
6. Drive capability에 따라 편집 가능 파일은 Editor로, 다운로드만 가능한 파일은 Practice Viewer로 열린다.

공유 링크로 연 파일을 다시 Drive에 저장할 때는 사용자가 명시적으로 저장을 누르는 시점에 `https://www.googleapis.com/auth/drive` scope를 요청한다. 사용자가 임의의 공유 링크를 붙여 넣을 수 있으므로 `drive.file`만으로 update 권한이 보장되지 않는다.

## Editor와 Practice Viewer 권한 매핑

Drive metadata의 `capabilities`를 기준으로 앱 모드를 결정한다.

| Drive capability                                | 앱 동작                                     |
| ----------------------------------------------- | ------------------------------------------- |
| `canDownload`가 `false`                         | 파일을 열지 않는다.                         |
| `canModifyContent`가 `true`                     | Editor로 열고 `Drive에 저장`을 허용한다.    |
| `canModifyContent`가 `false`                    | Practice Viewer로 열고 Drive 저장을 숨긴다. |
| `canEdit`가 `true`, `canModifyContent`가 누락됨 | Editor로 열고 Drive 저장을 허용한다.        |
| 다운로드만 가능                                 | Practice Viewer로 연다.                     |

`Drive에 저장`을 누르면 저장 직전에 metadata를 다시 조회한다. `version`, `headRevisionId`, `modifiedTime` 중 기존 source와 다른 값이 있으면 다른 위치에서 원본이 변경된 것으로 보고 Drive 저장을 막는다.

## Google Cloud 설정

Google Drive 연동을 활성화하려면 Google Cloud project에서 다음 설정이 필요하다.

### API

- Google Drive API

### OAuth client

Application type은 Web application을 사용한다. Authorized JavaScript origins에는 로컬 개발과 배포 origin을 등록한다.

```text
http://localhost:5173
http://127.0.0.1:5173
https://misosiruda.github.io
```

GitHub Pages는 path가 `/eazy-chorus/`이지만 OAuth origin에는 origin만 등록한다.

## 환경 변수

로컬 개발에서는 `.env.local`을 사용한다. `.env.local`은 `.gitignore`의 `*.local` 규칙으로 commit 대상에서 제외된다.

```text
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

GitHub Pages 배포 workflow는 같은 이름의 GitHub Actions repository/environment variable을 Vite build에 주입한다. `vars`가 비어 있으면 같은 이름의 `secrets`를 fallback으로 읽는다. Vite `VITE_*` 값은 정적 번들에 포함되는 public 설정이다.

## Scope 정책

| 흐름      | 열기 scope       | 저장 scope |
| --------- | ---------------- | ---------- |
| 공유 링크 | `drive.readonly` | `drive`    |

공유 링크 저장에 broad Drive scope를 쓰는 이유는 사용자가 임의의 공유 링크를 붙여 넣을 수 있기 때문이다.

## 제한 사항

- refresh token을 저장하지 않으므로 access token이 만료되면 Google 세션을 통해 다시 토큰을 요청한다.
- access token cache는 현재 페이지 런타임 메모리에만 보관되며, 만료 1분 전부터는 재사용하지 않는다.
- 백그라운드 동기화나 자동 저장은 하지 않는다.
- 같은 Drive 파일을 다른 탭이나 다른 사용자가 먼저 수정하면 충돌로 보고 Drive 저장을 막는다.
- 파일의 Drive 권한이 보기 전용이면 Practice Viewer로 열리고 Drive 저장은 제공하지 않는다.

## 검증 체크리스트

Drive 설정을 바꾼 뒤에는 다음을 확인한다.

```powershell
npm run lint
npm run test
npm run build
```

브라우저에서는 다음 흐름을 수동으로 확인한다.

- 공유 링크로 편집 권한 파일 열기
- 공유 링크로 보기 전용 파일 열기
- 편집 권한 파일을 `Drive에 저장`
- 같은 페이지 세션에서 access token 만료 전 재열기 시 로그인 요청 생략
- 다른 위치에서 파일을 수정한 뒤 충돌 메시지 표시
