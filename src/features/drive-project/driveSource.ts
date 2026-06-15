import type {
  DriveProjectAccessResolution,
  DriveProjectFileLocator,
  DriveProjectSource,
  GoogleDriveProjectFileMetadata,
} from './types'

type OpenDriveProjectAccess = Extract<
  DriveProjectAccessResolution,
  { canOpen: true }
>

export type DriveProjectSourceConflictField =
  | 'version'
  | 'modifiedTime'
  | 'headRevisionId'

const DRIVE_SOURCE_REVISION_FIELDS: readonly DriveProjectSourceConflictField[] =
  ['version', 'headRevisionId', 'modifiedTime']

export function createDriveProjectSource({
  access,
  locator,
  metadata,
}: {
  access: OpenDriveProjectAccess
  locator: DriveProjectFileLocator
  metadata: GoogleDriveProjectFileMetadata
}): DriveProjectSource {
  return {
    provider: 'google-drive',
    locator: {
      fileId: locator.fileId,
      resourceKey: locator.resourceKey ?? metadata.resourceKey,
    },
    name: metadata.name,
    accessMode: access.mode,
    canSaveToDrive: access.canSaveToDrive,
    version: metadata.version,
    modifiedTime: metadata.modifiedTime,
    headRevisionId: metadata.headRevisionId,
  }
}

export function getDriveProjectSourceConflictField(
  source: DriveProjectSource,
  metadata: GoogleDriveProjectFileMetadata,
): DriveProjectSourceConflictField | null {
  const conflictField = DRIVE_SOURCE_REVISION_FIELDS.find((field) => {
    const sourceValue = source[field]
    const latestValue = metadata[field]
    return !!sourceValue && !!latestValue && sourceValue !== latestValue
  })

  return conflictField ?? null
}
