import type { DriveProjectLinkParseResult } from './types'

const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const GOOGLE_DRIVE_HOSTS = new Set([
  'drive.google.com',
  'drive.usercontent.google.com',
])

export function parseGoogleDriveProjectLink(
  input: string,
): DriveProjectLinkParseResult {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return { ok: false, reason: 'empty' }
  }

  if (isValidDriveFileId(trimmedInput)) {
    return { ok: true, fileId: trimmedInput, source: 'raw-id' }
  }

  let url: URL
  try {
    url = new URL(trimmedInput)
  } catch {
    return { ok: false, reason: 'invalid-file-id' }
  }

  if (!GOOGLE_DRIVE_HOSTS.has(url.hostname)) {
    return { ok: false, reason: 'unsupported-host' }
  }

  const pathFileId = getFileIdFromPath(url.pathname)
  if (pathFileId) {
    if (!isValidDriveFileId(pathFileId)) {
      return { ok: false, reason: 'invalid-file-id' }
    }

    return { ok: true, fileId: pathFileId, source: 'file-path' }
  }

  if (url.pathname.startsWith('/drive/folders/')) {
    return { ok: false, reason: 'folder-link' }
  }

  const queryFileId = url.searchParams.get('id')
  if (!queryFileId) {
    return { ok: false, reason: 'missing-file-id' }
  }

  if (!isValidDriveFileId(queryFileId)) {
    return { ok: false, reason: 'invalid-file-id' }
  }

  return {
    ok: true,
    fileId: queryFileId,
    source: getQueryLinkSource(url.pathname),
  }
}

export function isValidDriveFileId(fileId: string): boolean {
  return DRIVE_FILE_ID_PATTERN.test(fileId)
}

function getFileIdFromPath(pathname: string): string | null {
  const [, fileId] = pathname.match(/^\/file\/d\/([^/]+)/) ?? []
  return fileId ?? null
}

function getQueryLinkSource(pathname: string) {
  if (pathname === '/open') {
    return 'open-query'
  }

  if (pathname === '/uc' || pathname === '/download') {
    return 'download-query'
  }

  return 'query-id'
}
