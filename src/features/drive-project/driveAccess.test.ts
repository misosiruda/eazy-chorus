import {
  isDriveProjectPackageCandidate,
  resolveDriveProjectAccess,
} from './driveAccess'

describe('drive-project access resolution', () => {
  it.each([
    [
      { canDownload: true, canModifyContent: true, canEdit: true },
      {
        canOpen: true,
        mode: 'editor',
        canSaveToDrive: true,
        reason: 'can-modify-content',
      },
    ],
    [
      { canDownload: true, canEdit: true, canModifyContent: false },
      {
        canOpen: true,
        mode: 'viewer',
        canSaveToDrive: false,
        reason: 'content-modification-disabled',
      },
    ],
    [
      { canDownload: true, canEdit: true },
      {
        canOpen: true,
        mode: 'editor',
        canSaveToDrive: true,
        reason: 'can-edit',
      },
    ],
    [
      { canDownload: true },
      {
        canOpen: true,
        mode: 'viewer',
        canSaveToDrive: false,
        reason: 'download-only',
      },
    ],
    [
      { canDownload: false, canEdit: true, canModifyContent: true },
      {
        canOpen: false,
        mode: null,
        canSaveToDrive: false,
        reason: 'download-disabled',
      },
    ],
    [
      undefined,
      {
        canOpen: false,
        mode: null,
        canSaveToDrive: false,
        reason: 'missing-capabilities',
      },
    ],
  ])(
    'maps Drive capabilities to an app access mode',
    (capabilities, expected) => {
      expect(resolveDriveProjectAccess(capabilities)).toEqual(expected)
    },
  )

  it.each([
    [{ name: 'song.eazychorus' }, true],
    [{ name: 'SONG.EAZYCHORUS' }, true],
    [{ name: 'archive.zip', mimeType: 'application/zip' }, true],
    [{ name: 'archive.zip', mimeType: 'application/x-zip-compressed' }, true],
    [{ name: 'project.txt', mimeType: 'text/plain' }, false],
    [{ name: 'project.zip', mimeType: 'application/octet-stream' }, false],
  ])('identifies Drive project package candidates', (metadata, expected) => {
    expect(isDriveProjectPackageCandidate(metadata)).toBe(expected)
  })
})
