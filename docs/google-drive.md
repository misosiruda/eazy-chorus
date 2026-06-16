# Google Drive 연동

Eazy Chorus는 백엔드 없이 브라우저에서 Google Drive API를 직접 호출한다. OAuth access token은 브라우저 런타임에서만 사용하며, 서버 저장소나 refresh token을 사용하지 않는다.

## 사용자 흐름

### 공유 링크로 열기

1. Google Drive에서 `.eazychorus` 파일의 공유 링크를 만든다.
2. Eazy Chorus의 Project File 섹션에 공유 링크를 붙여 넣는다.
3. 필요하면 `Google로 연결`을 눌러 Google OAuth 흐름을 먼저 완료한다.
4. `Drive 열기`를 누른다.
5. Google 로그인을 완료하면 Drive metadata와 파일 내용을 가져온다.
6. Drive capability에 따라 편집 가능 파일은 Editor로, 다운로드만 가능한 파일은 Practice Viewer로 열린다.

공유 링크로 연 파일을 다시 Drive에 저장할 때는 사용자가 명시적으로 저장을 누르는 시점에 `https://www.googleapis.com/auth/drive` scope를 요청한다. 공유 링크는 앱이 Picker로 선택한 파일이 아니므로 `drive.file`만으로 update 권한이 보장되지 않는다.

### Google Picker로 선택

1. Project File 섹션에서 `Google로 연결` 또는 `Drive 선택`을 누른다.
2. Google 로그인을 완료한다.
3. Google Picker에서 `.eazychorus` 또는 ZIP 호환 파일을 선택한다.
4. 선택 파일은 `drive.file` scope로 열리고, 같은 파일에 대한 이후 저장도 `drive.file` scope를 재사용한다.

Picker로 선택한 파일은 Google의 per-file 접근 모델을 사용한다. 앱이 선택받은 파일에 대해서만 열기와 저장 권한을 갖는다.

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
- Google Picker API

### OAuth client

Application type은 Web application을 사용한다. Authorized JavaScript origins에는 로컬 개발과 배포 origin을 등록한다.

```text
http://localhost:5173
http://127.0.0.1:5173
https://misosiruda.github.io
```

GitHub Pages는 path가 `/eazy-chorus/`이지만 OAuth origin에는 origin만 등록한다.

### API key

Google Picker builder에는 developer key가 필요하다. API key는 브라우저에 노출되는 public key이므로 HTTP referrer 제한을 설정한다.

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://misosiruda.github.io/eazy-chorus/*
```

배포 path나 preview origin을 추가로 사용하면 같은 규칙으로 referrer를 추가한다.

### App ID

Google Picker의 app id는 Google Cloud project number를 사용한다. OAuth client id나 API key와 다른 값이다.

## 환경 변수

로컬 개발에서는 `.env.local`을 사용한다. `.env.local`은 `.gitignore`의 `*.local` 규칙으로 commit 대상에서 제외된다.

```text
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
VITE_GOOGLE_PICKER_API_KEY=AIza...
VITE_GOOGLE_PICKER_APP_ID=123456789012
```

fallback 이름도 지원한다.

```text
VITE_GOOGLE_API_KEY=AIza...
VITE_GOOGLE_APP_ID=123456789012
```

`VITE_GOOGLE_PICKER_API_KEY`와 `VITE_GOOGLE_PICKER_APP_ID`가 있으면 fallback보다 우선한다.

GitHub Pages 배포 workflow는 같은 이름의 GitHub Actions repository/environment variable을 Vite build에 주입한다. `vars`가 비어 있으면 같은 이름의 `secrets`를 fallback으로 읽는다. Vite `VITE_*` 값은 정적 번들에 포함되는 public 설정이므로, API key에는 Google Cloud HTTP referrer 제한을 반드시 적용한다.

## Scope 정책

| 흐름          | 열기 scope       | 저장 scope   |
| ------------- | ---------------- | ------------ |
| 공유 링크     | `drive.readonly` | `drive`      |
| Google Picker | `drive.file`     | `drive.file` |

공유 링크 저장에 broad Drive scope를 쓰는 이유는 사용자가 임의의 공유 링크를 붙여 넣을 수 있기 때문이다. 반대로 Picker 흐름은 사용자가 Google Picker에서 앱에 파일을 명시적으로 선택해 주므로 per-file scope로 저장까지 처리한다.

## 제한 사항

- refresh token을 저장하지 않으므로 브라우저 세션이 바뀌면 다시 Google 로그인이 필요할 수 있다.
- 백그라운드 동기화나 자동 저장은 하지 않는다.
- 같은 Drive 파일을 다른 탭이나 다른 사용자가 먼저 수정하면 충돌로 보고 Drive 저장을 막는다.
- 파일의 Drive 권한이 보기 전용이면 Practice Viewer로 열리고 Drive 저장은 제공하지 않는다.
- API key는 secret이 아니지만 referrer 제한이 필요하다.

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
- Picker로 파일 선택 후 열기
- Picker로 선택한 편집 권한 파일을 `Drive에 저장`
- 다른 위치에서 파일을 수정한 뒤 충돌 메시지 표시
