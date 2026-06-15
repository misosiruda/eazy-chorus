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
  resourceKey?: string
  version?: string
  modifiedTime?: string
  headRevisionId?: string
  capabilities?: GoogleDriveFileCapabilities
}

export type DriveProjectFileLocator = {
  fileId: string
  resourceKey?: string
}

export type DriveProjectSourceMethod = 'shared-link' | 'picker'

export type DriveProjectSource = {
  provider: 'google-drive'
  locator: DriveProjectFileLocator
  name: string
  accessMode: DriveProjectAccessMode
  canSaveToDrive: boolean
  sourceMethod: DriveProjectSourceMethod
  saveScope?: string
  version?: string
  modifiedTime?: string
  headRevisionId?: string
}

export type DriveProjectAccessReason =
  | 'can-modify-content'
  | 'can-edit'
  | 'content-modification-disabled'
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
  | 'invalid-resource-key'
  | 'missing-file-id'
  | 'unsupported-host'

export type DriveProjectLinkParseResult =
  | {
      ok: true
      fileId: string
      resourceKey?: string
      source: DriveProjectLinkSource
    }
  | {
      ok: false
      reason: DriveProjectLinkParseError
    }
