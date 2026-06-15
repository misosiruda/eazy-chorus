import type {
  DriveProjectAccessResolution,
  GoogleDriveFileCapabilities,
  GoogleDriveProjectFileMetadata,
} from './types'

const EAZY_CHORUS_DRIVE_FILE_EXTENSION = '.eazychorus'
const ZIP_COMPATIBLE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
])

export function resolveDriveProjectAccess(
  capabilities: GoogleDriveFileCapabilities | undefined,
): DriveProjectAccessResolution {
  if (!capabilities) {
    return {
      canOpen: false,
      mode: null,
      canSaveToDrive: false,
      reason: 'missing-capabilities',
    }
  }

  if (!capabilities.canDownload) {
    return {
      canOpen: false,
      mode: null,
      canSaveToDrive: false,
      reason: 'download-disabled',
    }
  }

  if (capabilities.canModifyContent) {
    return {
      canOpen: true,
      mode: 'editor',
      canSaveToDrive: true,
      reason: 'can-modify-content',
    }
  }

  if (capabilities.canEdit) {
    return {
      canOpen: true,
      mode: 'editor',
      canSaveToDrive: true,
      reason: 'can-edit',
    }
  }

  return {
    canOpen: true,
    mode: 'viewer',
    canSaveToDrive: false,
    reason: 'download-only',
  }
}

export function isDriveProjectPackageCandidate(
  metadata: Pick<GoogleDriveProjectFileMetadata, 'mimeType' | 'name'>,
): boolean {
  const normalizedName = metadata.name.trim().toLowerCase()
  if (normalizedName.endsWith(EAZY_CHORUS_DRIVE_FILE_EXTENSION)) {
    return true
  }

  return metadata.mimeType
    ? ZIP_COMPATIBLE_MIME_TYPES.has(metadata.mimeType)
    : false
}
