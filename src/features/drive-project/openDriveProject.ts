import {
  downloadGoogleDriveFile,
  fetchGoogleDriveFileMetadata,
  requestGoogleDriveAccessToken,
  type GoogleDriveAccessToken,
} from './googleDriveClient'
import {
  isDriveProjectPackageCandidate,
  resolveDriveProjectAccess,
} from './driveAccess'
import { parseGoogleDriveProjectLink } from './driveLink'
import type {
  DriveProjectAccessResolution,
  DriveProjectFileLocator,
  GoogleDriveProjectFileMetadata,
} from './types'

export type DriveProjectOpenErrorReason =
  | 'access-denied'
  | 'invalid-link'
  | 'missing-google-client-id'
  | 'unsupported-file'

export class DriveProjectOpenError extends Error {
  readonly reason: DriveProjectOpenErrorReason
  readonly access?: DriveProjectAccessResolution

  constructor(
    reason: DriveProjectOpenErrorReason,
    message: string,
    access?: DriveProjectAccessResolution,
  ) {
    super(message)
    this.name = 'DriveProjectOpenError'
    this.reason = reason
    this.access = access
  }
}

export type DriveProjectOpenResult = {
  access: Extract<DriveProjectAccessResolution, { canOpen: true }>
  file: File
  locator: DriveProjectFileLocator
  metadata: GoogleDriveProjectFileMetadata
}

export type DriveProjectAccessTokenProvider =
  () => Promise<GoogleDriveAccessToken>

export async function openDriveProjectFromLink({
  accessTokenProvider,
  clientId,
  fetchImpl,
  link,
}: {
  accessTokenProvider?: DriveProjectAccessTokenProvider
  clientId: string
  fetchImpl?: typeof fetch
  link: string
}): Promise<DriveProjectOpenResult> {
  const trimmedClientId = clientId.trim()
  if (!trimmedClientId) {
    throw new DriveProjectOpenError(
      'missing-google-client-id',
      'Google Drive client id가 설정되지 않았습니다.',
    )
  }

  const parsedLink = parseGoogleDriveProjectLink(link)
  if (!parsedLink.ok) {
    throw new DriveProjectOpenError(
      'invalid-link',
      'Google Drive 공유 링크를 해석할 수 없습니다.',
    )
  }

  const initialLocator: DriveProjectFileLocator = {
    fileId: parsedLink.fileId,
    resourceKey: parsedLink.resourceKey,
  }
  const token = await (
    accessTokenProvider ??
    (() => requestGoogleDriveAccessToken({ clientId: trimmedClientId }))
  )()
  const metadata = await fetchGoogleDriveFileMetadata({
    accessToken: token.accessToken,
    fetchImpl,
    locator: initialLocator,
  })
  const locator: DriveProjectFileLocator = {
    fileId: parsedLink.fileId,
    resourceKey: parsedLink.resourceKey ?? metadata.resourceKey,
  }
  const access = resolveDriveProjectAccess(metadata.capabilities)
  if (!access.canOpen) {
    throw new DriveProjectOpenError(
      'access-denied',
      'Google Drive 파일을 열 수 없습니다.',
      access,
    )
  }

  if (!isDriveProjectPackageCandidate(metadata)) {
    throw new DriveProjectOpenError(
      'unsupported-file',
      'Eazy Chorus 프로젝트 파일이 아닙니다.',
    )
  }

  const blob = await downloadGoogleDriveFile({
    accessToken: token.accessToken,
    fetchImpl,
    locator,
  })
  const file = new File([blob], metadata.name, {
    type: blob.type || metadata.mimeType || 'application/zip',
  })

  return {
    access,
    file,
    locator,
    metadata,
  }
}
