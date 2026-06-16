import type {
  DriveProjectFileLocator,
  GoogleDriveProjectFileMetadata,
} from './types'

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services-script'
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3'
const GOOGLE_DRIVE_PROJECT_FIELDS =
  'id,name,mimeType,resourceKey,version,modifiedTime,headRevisionId,capabilities(canDownload,canEdit,canModifyContent)'
const GOOGLE_IDENTITY_SCRIPT_LOAD_TIMEOUT_MS = 30_000
const GOOGLE_TOKEN_REQUEST_TIMEOUT_MS = 120_000
const GOOGLE_DRIVE_TOKEN_CACHE_KEY = 'eazy-chorus.google-drive-token-cache.v1'
const GOOGLE_DRIVE_TOKEN_EXPIRY_BUFFER_MS = 60_000

export const GOOGLE_DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly'
export const GOOGLE_DRIVE_WRITE_SCOPE = 'https://www.googleapis.com/auth/drive'

type GoogleTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

type GoogleTokenClientConfig = {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: unknown) => void
}

type GoogleIdentityApi = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

export type GoogleDriveAccessToken = {
  accessToken: string
  expiresIn?: number
  scope?: string
  tokenType?: string
}

type GoogleDriveAccessTokenCacheEntry = {
  accessToken: string
  expiresAt: number
  scope?: string
  tokenType?: string
}

type GoogleDriveAccessTokenCache = {
  entries?: Record<string, GoogleDriveAccessTokenCacheEntry>
}

export type GoogleDriveClientErrorReason =
  | 'download-request-failed'
  | 'google-identity-load-failed'
  | 'google-identity-unavailable'
  | 'metadata-request-failed'
  | 'oauth-error'
  | 'upload-request-failed'
  | 'upload-session-missing-location'
  | 'upload-session-request-failed'

export class GoogleDriveClientError extends Error {
  readonly reason: GoogleDriveClientErrorReason
  readonly status?: number

  constructor(
    reason: GoogleDriveClientErrorReason,
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'GoogleDriveClientError'
    this.reason = reason
    this.status = status
  }
}

let googleIdentityScriptPromise: Promise<void> | null = null

export function isGoogleDriveIdentityReady(): boolean {
  return !!window.google?.accounts?.oauth2?.initTokenClient
}

export function preloadGoogleDriveIdentityScript(): Promise<void> {
  return loadGoogleIdentityScript()
}

export async function requestGoogleDriveAccessToken({
  clientId,
  prompt = '',
  scope = GOOGLE_DRIVE_READONLY_SCOPE,
}: {
  clientId: string
  prompt?: 'consent' | 'none' | ''
  scope?: string
}): Promise<GoogleDriveAccessToken> {
  const trimmedClientId = clientId.trim()
  const trimmedScope = scope.trim()
  if (prompt !== 'consent') {
    const cachedToken = readCachedGoogleDriveAccessToken({
      clientId: trimmedClientId,
      scope: trimmedScope,
    })
    if (cachedToken) {
      return cachedToken
    }
  }

  const tokenFactory = window.google?.accounts?.oauth2?.initTokenClient
  if (!tokenFactory) {
    throw new GoogleDriveClientError(
      'google-identity-unavailable',
      'Google Identity Services를 사용할 수 없습니다.',
    )
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => {
      settle(() => {
        reject(
          new GoogleDriveClientError(
            'oauth-error',
            'Google 로그인 요청이 완료되지 않았습니다.',
          ),
        )
      })
    }, GOOGLE_TOKEN_REQUEST_TIMEOUT_MS)

    function settle(callback: () => void) {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      callback()
    }

    const tokenClient = tokenFactory({
      client_id: trimmedClientId,
      scope: trimmedScope,
      callback: (response) => {
        const accessToken = response.access_token
        if (response.error || !accessToken) {
          settle(() => {
            reject(
              new GoogleDriveClientError(
                'oauth-error',
                response.error_description ??
                  response.error ??
                  'Google 로그인 토큰을 가져올 수 없습니다.',
              ),
            )
          })
          return
        }

        settle(() => {
          const token = {
            accessToken,
            expiresIn: response.expires_in,
            scope: response.scope,
            tokenType: response.token_type,
          }
          writeCachedGoogleDriveAccessToken({
            clientId: trimmedClientId,
            scope: trimmedScope,
            token,
          })
          resolve(token)
        })
      },
      error_callback: (error) => {
        settle(() => {
          reject(
            new GoogleDriveClientError(
              'oauth-error',
              error instanceof Error
                ? error.message
                : 'Google 로그인 요청이 실패했습니다.',
            ),
          )
        })
      },
    })

    tokenClient.requestAccessToken({ prompt })
  })
}

function readCachedGoogleDriveAccessToken({
  clientId,
  scope,
}: {
  clientId: string
  scope: string
}): GoogleDriveAccessToken | null {
  const cacheKey = createGoogleDriveAccessTokenCacheKey(clientId, scope)
  const cache = readGoogleDriveAccessTokenCache()
  const entry = cache.entries?.[cacheKey]
  if (!entry) {
    return null
  }

  if (
    !entry.accessToken ||
    entry.expiresAt - GOOGLE_DRIVE_TOKEN_EXPIRY_BUFFER_MS <= Date.now()
  ) {
    delete cache.entries?.[cacheKey]
    writeGoogleDriveAccessTokenCache(cache)
    return null
  }

  return {
    accessToken: entry.accessToken,
    expiresIn: Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000)),
    scope: entry.scope,
    tokenType: entry.tokenType,
  }
}

function writeCachedGoogleDriveAccessToken({
  clientId,
  scope,
  token,
}: {
  clientId: string
  scope: string
  token: GoogleDriveAccessToken
}) {
  if (!token.expiresIn || token.expiresIn <= 0) {
    return
  }

  const cache = readGoogleDriveAccessTokenCache()
  const entries = cache.entries ?? {}
  entries[createGoogleDriveAccessTokenCacheKey(clientId, scope)] = {
    accessToken: token.accessToken,
    expiresAt: Date.now() + token.expiresIn * 1000,
    scope: token.scope,
    tokenType: token.tokenType,
  }
  writeGoogleDriveAccessTokenCache({ entries })
}

function createGoogleDriveAccessTokenCacheKey(
  clientId: string,
  scope: string,
): string {
  return `${clientId}\n${scope}`
}

function readGoogleDriveAccessTokenCache(): GoogleDriveAccessTokenCache {
  try {
    const rawCache = window.localStorage.getItem(GOOGLE_DRIVE_TOKEN_CACHE_KEY)
    if (!rawCache) {
      return {}
    }

    const parsedCache = JSON.parse(rawCache) as GoogleDriveAccessTokenCache
    if (!parsedCache || typeof parsedCache !== 'object') {
      return {}
    }

    return parsedCache
  } catch {
    return {}
  }
}

function writeGoogleDriveAccessTokenCache(cache: GoogleDriveAccessTokenCache) {
  try {
    if (!cache.entries || Object.keys(cache.entries).length === 0) {
      window.localStorage.removeItem(GOOGLE_DRIVE_TOKEN_CACHE_KEY)
      return
    }

    window.localStorage.setItem(
      GOOGLE_DRIVE_TOKEN_CACHE_KEY,
      JSON.stringify(cache),
    )
  } catch {
    // Token caching is an optimization; Drive actions can still request OAuth.
  }
}

export async function fetchGoogleDriveFileMetadata({
  accessToken,
  fetchImpl = fetch,
  locator,
}: {
  accessToken: string
  fetchImpl?: typeof fetch
  locator: DriveProjectFileLocator
}): Promise<GoogleDriveProjectFileMetadata> {
  const response = await fetchImpl(createDriveFileMetadataUrl(locator.fileId), {
    headers: createDriveRequestHeaders(accessToken, locator),
  })

  if (!response.ok) {
    throw new GoogleDriveClientError(
      'metadata-request-failed',
      'Google Drive 파일 정보를 불러올 수 없습니다.',
      response.status,
    )
  }

  return (await response.json()) as GoogleDriveProjectFileMetadata
}

export async function downloadGoogleDriveFile({
  accessToken,
  fetchImpl = fetch,
  locator,
}: {
  accessToken: string
  fetchImpl?: typeof fetch
  locator: DriveProjectFileLocator
}): Promise<Blob> {
  const response = await fetchImpl(createDriveFileDownloadUrl(locator.fileId), {
    headers: createDriveRequestHeaders(accessToken, locator),
  })

  if (!response.ok) {
    throw new GoogleDriveClientError(
      'download-request-failed',
      'Google Drive 파일을 다운로드할 수 없습니다.',
      response.status,
    )
  }

  return response.blob()
}

export async function updateGoogleDriveFileContent({
  accessToken,
  content,
  fetchImpl = fetch,
  locator,
}: {
  accessToken: string
  content: Blob
  fetchImpl?: typeof fetch
  locator: DriveProjectFileLocator
}): Promise<GoogleDriveProjectFileMetadata> {
  const uploadContentType = content.type || 'application/zip'
  const sessionResponse = await fetchImpl(
    createDriveFileResumableUpdateUrl(locator.fileId),
    {
      method: 'PATCH',
      headers: {
        ...createDriveRequestHeaders(accessToken, locator),
        'X-Upload-Content-Length': String(content.size),
        'X-Upload-Content-Type': uploadContentType,
      },
    },
  )

  if (!sessionResponse.ok) {
    throw new GoogleDriveClientError(
      'upload-session-request-failed',
      'Google Drive 업로드 세션을 만들 수 없습니다.',
      sessionResponse.status,
    )
  }

  const uploadUrl = sessionResponse.headers.get('Location')
  if (!uploadUrl) {
    throw new GoogleDriveClientError(
      'upload-session-missing-location',
      'Google Drive 업로드 세션 위치를 확인할 수 없습니다.',
    )
  }

  const uploadResponse = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': uploadContentType,
    },
    body: content,
  })

  if (!uploadResponse.ok) {
    throw new GoogleDriveClientError(
      'upload-request-failed',
      'Google Drive 파일을 업로드할 수 없습니다.',
      uploadResponse.status,
    )
  }

  return (await uploadResponse.json()) as GoogleDriveProjectFileMetadata
}

export function createDriveResourceKeyHeader(
  locator: DriveProjectFileLocator,
): string | null {
  if (!locator.resourceKey) {
    return null
  }

  return `${locator.fileId}/${locator.resourceKey}`
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve()
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise
  }

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID)
    if (existingScript) {
      if (existingScript.dataset.eazyChorusLoadState === 'loaded') {
        resolve(undefined)
        return
      }

      if (existingScript.dataset.eazyChorusLoadState !== 'failed') {
        bindGoogleIdentityScriptEvents(existingScript, resolve, reject)
        return
      }

      existingScript.remove()
    }

    const script = document.createElement('script')
    script.id = GOOGLE_IDENTITY_SCRIPT_ID
    script.src = GOOGLE_IDENTITY_SCRIPT_URL
    script.async = true
    script.defer = true
    bindGoogleIdentityScriptEvents(script, resolve, reject)

    document.head.append(script)
  }).catch((error) => {
    googleIdentityScriptPromise = null
    throw error
  })

  googleIdentityScriptPromise = scriptPromise
  return scriptPromise
}

function bindGoogleIdentityScriptEvents(
  script: HTMLElement,
  resolve: () => void,
  reject: (reason: GoogleDriveClientError) => void,
) {
  let settled = false
  const timeoutId = window.setTimeout(
    () => failGoogleIdentityScriptLoad(),
    GOOGLE_IDENTITY_SCRIPT_LOAD_TIMEOUT_MS,
  )

  function finish(callback: () => void) {
    if (settled) {
      return
    }

    settled = true
    window.clearTimeout(timeoutId)
    callback()
  }

  function failGoogleIdentityScriptLoad() {
    finish(() => {
      script.dataset.eazyChorusLoadState = 'failed'
      script.remove()
      reject(
        new GoogleDriveClientError(
          'google-identity-load-failed',
          'Google Identity Services script를 불러올 수 없습니다.',
        ),
      )
    })
  }

  script.addEventListener(
    'load',
    () => {
      finish(() => {
        script.dataset.eazyChorusLoadState = 'loaded'
        resolve()
      })
    },
    { once: true },
  )
  script.addEventListener('error', () => failGoogleIdentityScriptLoad(), {
    once: true,
  })
}

function createDriveRequestHeaders(
  accessToken: string,
  locator: DriveProjectFileLocator,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  }
  const resourceKeyHeader = createDriveResourceKeyHeader(locator)
  if (resourceKeyHeader) {
    headers['X-Goog-Drive-Resource-Keys'] = resourceKeyHeader
  }

  return headers
}

function createDriveFileMetadataUrl(fileId: string): URL {
  const url = new URL(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`,
  )
  url.searchParams.set('fields', GOOGLE_DRIVE_PROJECT_FIELDS)
  url.searchParams.set('supportsAllDrives', 'true')
  return url
}

function createDriveFileDownloadUrl(fileId: string): URL {
  const url = new URL(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`,
  )
  url.searchParams.set('alt', 'media')
  url.searchParams.set('supportsAllDrives', 'true')
  return url
}

function createDriveFileResumableUpdateUrl(fileId: string): URL {
  const url = new URL(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      fileId,
    )}`,
  )
  url.searchParams.set('uploadType', 'resumable')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', GOOGLE_DRIVE_PROJECT_FIELDS)
  return url
}
