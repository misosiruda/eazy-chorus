import { vi } from 'vitest'
import {
  openDriveProjectFromLink,
  openDriveProjectFromLocator,
  DriveProjectOpenError,
} from './index'
import type { GoogleDriveProjectFileMetadata } from './types'

describe('openDriveProjectFromLink', () => {
  it('opens a Drive project and preserves link resource keys for API calls', async () => {
    const fetchMock = createDriveFetchMock({
      id: '1AbC_def-GHIjkl',
      name: 'song.eazychorus',
      capabilities: {
        canDownload: true,
        canEdit: true,
        canModifyContent: true,
      },
    })

    const result = await openDriveProjectFromLink({
      accessTokenProvider: async () => ({ accessToken: 'access-token' }),
      clientId: 'client-id',
      fetchImpl: fetchMock,
      link: 'https://drive.google.com/file/d/1AbC_def-GHIjkl/view?resourcekey=0-AbC_def-GHIjkl',
    })

    expect(result.access.mode).toBe('editor')
    expect(result.access.canSaveToDrive).toBe(true)
    expect(result.file.name).toBe('song.eazychorus')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-AbC_def-GHIjkl',
    })
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-AbC_def-GHIjkl',
    })
  })

  it('uses metadata resource keys for the download request when the link omits it', async () => {
    const fetchMock = createDriveFetchMock({
      id: '1AbC_def-GHIjkl',
      name: 'song.eazychorus',
      resourceKey: '0-MetadataKey',
      capabilities: { canDownload: true },
    })

    const result = await openDriveProjectFromLink({
      accessTokenProvider: async () => ({ accessToken: 'access-token' }),
      clientId: 'client-id',
      fetchImpl: fetchMock,
      link: 'https://drive.google.com/open?id=1AbC_def-GHIjkl',
    })

    expect(result.access.mode).toBe('viewer')
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(
      'X-Goog-Drive-Resource-Keys',
    )
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-MetadataKey',
    })
  })

  it('opens a Drive project from a picked file locator without requesting OAuth', async () => {
    const fetchMock = createDriveFetchMock({
      id: '1AbC_def-GHIjkl',
      name: 'picked-song.eazychorus',
      capabilities: {
        canDownload: true,
        canEdit: true,
        canModifyContent: true,
      },
    })

    const result = await openDriveProjectFromLocator({
      accessToken: 'picker-token',
      fetchImpl: fetchMock,
      locator: {
        fileId: '1AbC_def-GHIjkl',
        resourceKey: '0-PickerKey',
      },
    })

    expect(result.access.mode).toBe('editor')
    expect(result.file.name).toBe('picked-song.eazychorus')
    expect(result.locator).toEqual({
      fileId: '1AbC_def-GHIjkl',
      resourceKey: '0-PickerKey',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer picker-token',
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-PickerKey',
    })
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer picker-token',
      'X-Goog-Drive-Resource-Keys': '1AbC_def-GHIjkl/0-PickerKey',
    })
  })

  it('rejects unsupported Drive files before downloading content', async () => {
    const fetchMock = createDriveFetchMock({
      id: '1AbC_def-GHIjkl',
      name: 'notes.txt',
      mimeType: 'text/plain',
      capabilities: { canDownload: true },
    })

    await expect(
      openDriveProjectFromLink({
        accessTokenProvider: async () => ({ accessToken: 'access-token' }),
        clientId: 'client-id',
        fetchImpl: fetchMock,
        link: 'https://drive.google.com/open?id=1AbC_def-GHIjkl',
      }),
    ).rejects.toMatchObject({
      reason: 'unsupported-file',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects Drive files without download capability', async () => {
    const fetchMock = createDriveFetchMock({
      id: '1AbC_def-GHIjkl',
      name: 'song.eazychorus',
      capabilities: { canDownload: false, canEdit: true },
    })

    await expect(
      openDriveProjectFromLink({
        accessTokenProvider: async () => ({ accessToken: 'access-token' }),
        clientId: 'client-id',
        fetchImpl: fetchMock,
        link: 'https://drive.google.com/open?id=1AbC_def-GHIjkl',
      }),
    ).rejects.toMatchObject({
      access: {
        reason: 'download-disabled',
      },
      reason: 'access-denied',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not request OAuth when Google client id is missing', async () => {
    const accessTokenProvider = vi.fn(async () => ({
      accessToken: 'access-token',
    }))

    await expect(
      openDriveProjectFromLink({
        accessTokenProvider,
        clientId: '',
        link: 'https://drive.google.com/open?id=1AbC_def-GHIjkl',
      }),
    ).rejects.toBeInstanceOf(DriveProjectOpenError)
    expect(accessTokenProvider).not.toHaveBeenCalled()
  })
})

function createDriveFetchMock(metadata: GoogleDriveProjectFileMetadata) {
  return vi
    .fn()
    .mockResolvedValueOnce(Response.json(metadata))
    .mockResolvedValueOnce(
      new Response('project', {
        headers: { 'Content-Type': 'application/zip' },
      }),
    )
}
