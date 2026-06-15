import { vi } from 'vitest'
import {
  createDriveResourceKeyHeader,
  downloadGoogleDriveFile,
  fetchGoogleDriveFileMetadata,
  requestGoogleDriveAccessToken,
} from './googleDriveClient'

describe('googleDriveClient', () => {
  const originalGoogle = window.google

  afterEach(() => {
    window.google = originalGoogle
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
