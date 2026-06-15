import { vi } from 'vitest'
import {
  GOOGLE_DRIVE_WRITE_SCOPE,
  createDriveResourceKeyHeader,
  downloadGoogleDriveFile,
  fetchGoogleDriveFileMetadata,
  isGoogleDriveIdentityReady,
  preloadGoogleDriveIdentityScript,
  requestGoogleDriveAccessToken,
  updateGoogleDriveFileContent,
} from './googleDriveClient'

describe('googleDriveClient', () => {
  const originalGoogle = window.google

  afterEach(() => {
    window.google = originalGoogle
    document.getElementById('google-identity-services-script')?.remove()
    vi.useRealTimers()
  })

  it('requests an access token through Google Identity Services', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config) => ({
            requestAccessToken: vi.fn(() => {
              config.callback({
                access_token: 'access-token',
                expires_in: 3600,
                scope: 'drive-scope',
                token_type: 'Bearer',
              })
            }),
          })),
        },
      },
    }

    await expect(
      requestGoogleDriveAccessToken({ clientId: 'client-id' }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      expiresIn: 3600,
      scope: 'drive-scope',
      tokenType: 'Bearer',
    })
  })

  it('uses the Drive write scope for user-initiated Drive saves', () => {
    expect(GOOGLE_DRIVE_WRITE_SCOPE).toBe(
      'https://www.googleapis.com/auth/drive',
    )
  })

  it('rejects token requests before Google Identity Services is preloaded', async () => {
    window.google = undefined

    await expect(
      requestGoogleDriveAccessToken({ clientId: 'client-id' }),
    ).rejects.toMatchObject({
      reason: 'google-identity-unavailable',
    })
  })

  it('rejects an access token request when Google never calls back', async () => {
    vi.useFakeTimers()
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => ({
            requestAccessToken: vi.fn(),
          })),
        },
      },
    }

    const tokenPromise = requestGoogleDriveAccessToken({
      clientId: 'client-id',
    })
    const rejectionExpectation = expect(tokenPromise).rejects.toMatchObject({
      reason: 'oauth-error',
    })
    await vi.advanceTimersByTimeAsync(120_000)

    await rejectionExpectation
  })

  it('removes a failed Google Identity script before retrying', async () => {
    window.google = undefined

    const firstTokenRequest = preloadGoogleDriveIdentityScript()
    const firstScript = document.getElementById(
      'google-identity-services-script',
    )
    firstScript?.dispatchEvent(new Event('error'))

    await expect(firstTokenRequest).rejects.toMatchObject({
      reason: 'google-identity-load-failed',
    })
    expect(
      document.getElementById('google-identity-services-script'),
    ).toBeNull()
    expect(isGoogleDriveIdentityReady()).toBe(false)

    const secondTokenRequest = preloadGoogleDriveIdentityScript()
    const secondScript = document.getElementById(
      'google-identity-services-script',
    )
    expect(secondScript).not.toBeNull()
    expect(secondScript).not.toBe(firstScript)
    secondScript?.dispatchEvent(new Event('error'))

    await expect(secondTokenRequest).rejects.toMatchObject({
      reason: 'google-identity-load-failed',
    })
  })

  it('builds a Drive resource key header only when a resource key exists', () => {
    expect(
      createDriveResourceKeyHeader({
        fileId: '1AbC_def-GHIjkl',
        resourceKey: '0-AbC_def-GHIjkl',
      }),
    ).toBe('1AbC_def-GHIjkl/0-AbC_def-GHIjkl')
    expect(
      createDriveResourceKeyHeader({ fileId: '1AbC_def-GHIjkl' }),
    ).toBeNull()
  })

  it('requests Drive metadata with selected fields and resource key header', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: '1AbC_def-GHIjkl',
        name: 'song.eazychorus',
        capabilities: { canDownload: true },
      }),
    )

    const metadata = await fetchGoogleDriveFileMetadata({
      accessToken: 'access-token',
      fetchImpl: fetchMock,
      locator: {
        fileId: '1AbC_def-GHIjkl',
        resourceKey: '0-AbC_def-GHIjkl',
      },
    })

    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBeInstanceOf(URL)
    expect((url as URL).searchParams.get('supportsAllDrives')).toBe('true')
    expect((url as URL).searchParams.get('fields')).toContain(
      'capabilities(canDownload,canEdit,canModifyContent)',
    )
    expect(request?.headers).toEqual({
      Authorization: 'Bearer access-token',
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-AbC_def-GHIjkl',
    })
    expect(metadata.name).toBe('song.eazychorus')
  })

  it('downloads Drive file content with alt=media', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('project', {
          headers: { 'Content-Type': 'application/zip' },
        }),
    )

    const blob = await downloadGoogleDriveFile({
      accessToken: 'access-token',
      fetchImpl: fetchMock,
      locator: { fileId: '1AbC_def-GHIjkl' },
    })

    const [url, request] = fetchMock.mock.calls[0]
    expect((url as URL).searchParams.get('alt')).toBe('media')
    expect(request?.headers).toEqual({
      Authorization: 'Bearer access-token',
    })
    expect(await blob.text()).toBe('project')
  })

  it('updates Drive file content through a resumable upload session', async () => {
    const content = new Blob(['project'], { type: 'application/zip' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: 'https://upload.example/session' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: '1AbC_def-GHIjkl',
          name: 'song.eazychorus',
          version: '2',
          capabilities: {
            canDownload: true,
            canEdit: true,
            canModifyContent: true,
          },
        }),
      )

    const metadata = await updateGoogleDriveFileContent({
      accessToken: 'access-token',
      content,
      fetchImpl: fetchMock,
      locator: {
        fileId: '1AbC_def-GHIjkl',
        resourceKey: '0-AbC_def-GHIjkl',
      },
    })

    const [sessionUrl, sessionRequest] = fetchMock.mock.calls[0]
    expect(sessionUrl).toBeInstanceOf(URL)
    expect((sessionUrl as URL).origin).toBe('https://www.googleapis.com')
    expect((sessionUrl as URL).pathname).toBe(
      '/upload/drive/v3/files/1AbC_def-GHIjkl',
    )
    expect((sessionUrl as URL).searchParams.get('uploadType')).toBe('resumable')
    expect((sessionUrl as URL).searchParams.get('supportsAllDrives')).toBe(
      'true',
    )
    expect((sessionUrl as URL).searchParams.get('fields')).toContain(
      'headRevisionId',
    )
    expect(sessionRequest?.method).toBe('PATCH')
    expect(sessionRequest?.headers).toEqual({
      Authorization: 'Bearer access-token',
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-AbC_def-GHIjkl',
      'X-Upload-Content-Length': '7',
      'X-Upload-Content-Type': 'application/zip',
    })
    expect(sessionRequest?.body).toBeUndefined()

    const [uploadUrl, uploadRequest] = fetchMock.mock.calls[1]
    expect(uploadUrl).toBe('https://upload.example/session')
    expect(uploadRequest?.method).toBe('PUT')
    expect(uploadRequest?.headers).toEqual({
      'Content-Type': 'application/zip',
    })
    expect(uploadRequest?.body).toBe(content)
    expect(metadata.version).toBe('2')
  })

  it('throws a typed error when the resumable upload session has no location', async () => {
    const fetchMock = vi.fn(async () => new Response(null))

    await expect(
      updateGoogleDriveFileContent({
        accessToken: 'access-token',
        content: new Blob(['project'], { type: 'application/zip' }),
        fetchImpl: fetchMock,
        locator: { fileId: '1AbC_def-GHIjkl' },
      }),
    ).rejects.toMatchObject({
      reason: 'upload-session-missing-location',
    })
  })

  it('throws typed errors when Drive upload requests fail', async () => {
    await expect(
      updateGoogleDriveFileContent({
        accessToken: 'access-token',
        content: new Blob(['project'], { type: 'application/zip' }),
        fetchImpl: vi.fn(async () => new Response(null, { status: 403 })),
        locator: { fileId: '1AbC_def-GHIjkl' },
      }),
    ).rejects.toMatchObject({
      reason: 'upload-session-request-failed',
      status: 403,
    })

    await expect(
      updateGoogleDriveFileContent({
        accessToken: 'access-token',
        content: new Blob(['project'], { type: 'application/zip' }),
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce(
            new Response(null, {
              headers: { Location: 'https://upload.example/session' },
            }),
          )
          .mockResolvedValueOnce(new Response(null, { status: 500 })),
        locator: { fileId: '1AbC_def-GHIjkl' },
      }),
    ).rejects.toMatchObject({
      reason: 'upload-request-failed',
      status: 500,
    })
  })

  it('throws a typed error when Drive metadata requests fail', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))

    await expect(
      fetchGoogleDriveFileMetadata({
        accessToken: 'access-token',
        fetchImpl: fetchMock,
        locator: { fileId: '1AbC_def-GHIjkl' },
      }),
    ).rejects.toMatchObject({
      reason: 'metadata-request-failed',
      status: 403,
    })
  })
})
