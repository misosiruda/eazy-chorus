import {
  createDriveProjectSource,
  getDriveProjectSourceConflictField,
} from './driveSource'

describe('driveSource', () => {
  it('creates a Drive project source from open metadata and access', () => {
    expect(
      createDriveProjectSource({
        access: {
          canOpen: true,
          canSaveToDrive: true,
          mode: 'editor',
          reason: 'can-modify-content',
        },
        locator: {
          fileId: '1AbC_def-GHIjkl',
        },
        metadata: {
          id: '1AbC_def-GHIjkl',
          name: 'song.eazychorus',
          resourceKey: '0-MetadataKey',
          version: '1',
          modifiedTime: '2026-06-15T01:00:00.000Z',
          headRevisionId: 'head-1',
        },
      }),
    ).toEqual({
      provider: 'google-drive',
      locator: {
        fileId: '1AbC_def-GHIjkl',
        resourceKey: '0-MetadataKey',
      },
      name: 'song.eazychorus',
      accessMode: 'editor',
      canSaveToDrive: true,
      sourceMethod: 'shared-link',
      version: '1',
      modifiedTime: '2026-06-15T01:00:00.000Z',
      headRevisionId: 'head-1',
    })
  })

  it('detects Drive source revision conflicts with available metadata fields', () => {
    const source = createDriveProjectSource({
      access: {
        canOpen: true,
        canSaveToDrive: true,
        mode: 'editor',
        reason: 'can-modify-content',
      },
      locator: { fileId: '1AbC_def-GHIjkl' },
      metadata: {
        id: '1AbC_def-GHIjkl',
        name: 'song.eazychorus',
        version: '1',
        modifiedTime: '2026-06-15T01:00:00.000Z',
        headRevisionId: 'head-1',
      },
    })

    expect(
      getDriveProjectSourceConflictField(source, {
        id: '1AbC_def-GHIjkl',
        name: 'song.eazychorus',
        version: '2',
        modifiedTime: '2026-06-15T01:00:00.000Z',
        headRevisionId: 'head-1',
      }),
    ).toBe('version')
    expect(
      getDriveProjectSourceConflictField(source, {
        id: '1AbC_def-GHIjkl',
        name: 'song.eazychorus',
        version: '1',
        modifiedTime: '2026-06-15T01:00:00.000Z',
        headRevisionId: 'head-1',
      }),
    ).toBeNull()
    expect(
      getDriveProjectSourceConflictField(source, {
        id: '1AbC_def-GHIjkl',
        name: 'song.eazychorus',
      }),
    ).toBeNull()
  })
})
