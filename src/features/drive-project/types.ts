export type DriveProjectAccessMode = 'editor' | 'viewer'

export type GoogleDriveFileCapabilities = {
  canDownload?: boolean
  canEdit?: boolean
  canModifyContent?: boolean
}

export type GoogleDriveProjectFileMetadata = {
  id: string
  name: string
  mimeType?: string
  version?: string
  modifiedTime?: string
  headRevisionId?: string
  capabilities?: GoogleDriveFileCapabilities
}

export type DriveProjectAccessReason =
  | 'can-modify-content'
  | 'can-edit'
  | 'download-only'

export type DriveProjectAccessDeniedReason =
  | 'missing-capabilities'
  | 'download-disabled'

export type DriveProjectAccessResolution =
  | {
      canOpen: true
      mode: DriveProjectAccessMode
      canSaveToDrive: boolean
      reason: DriveProjectAccessReason
    }
  | {
      canOpen: false
      mode: null
      canSaveToDrive: false
      reason: DriveProjectAccessDeniedReason
    }

export type DriveProjectLinkSource =
  | 'raw-id'
  | 'file-path'
  | 'open-query'
  | 'download-query'
  | 'query-id'

export type DriveProjectLinkParseError =
  | 'empty'
  | 'folder-link'
  | 'invalid-file-id'
  | 'missing-file-id'
  | 'unsupported-host'

export type DriveProjectLinkParseResult =
  | {
      ok: true
      fileId: string
      source: DriveProjectLinkSource
    }
  | {
      ok: false
      reason: DriveProjectLinkParseError
    }
