import {
  EAZY_CHORUS_APP_ID,
  type EazyChorusProject,
  type MarkStyle,
  type MediaRole,
  type MediaTrack,
  type MediaVariant,
  PROJECT_SCHEMA_VERSION,
  type Part,
  type ProjectSettings,
} from './types'

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  clickPreRollMs: 2000,
  defaultPlaybackRate: 1,
  fileSizeWarningMb: 300,
  mobileFileSizeWarningMb: 100,
}

const DEFAULT_PART_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#C026D3',
  '#DC2626',
  '#475569',
]

type NewProjectOptions = {
  now?: Date
  id?: string
}

type NewPartOptions = {
  name: string
  color?: string
  existingParts: readonly Part[]
}

type NewMediaTrackOptions = {
  file: File
  role: MediaRole
  existingPaths: ReadonlySet<string>
  partId?: string
  variant?: MediaVariant
  defaultTitle?: string
}

export function createNewProject(
  options: NewProjectOptions = {},
): EazyChorusProject {
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    app: EAZY_CHORUS_APP_ID,
    project: {
      id: options.id ?? createEntityId('project'),
      title: 'Untitled Chorus Project',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    media: [],
    parts: [
      {
        id: 'main-vocal',
        name: 'Main Vocal',
        color: DEFAULT_PART_COLORS[0],
        guidePosition: 'none',
        defaultMarkStyle: 'highlight',
      },
    ],
    lyricLanes: [
      {
        id: 'lead',
        name: 'Lead',
        order: 1,
        defaultRole: 'main',
      },
    ],
    cues: [],
    partMarks: [],
  }
}

export function touchProject(project: EazyChorusProject): EazyChorusProject {
  return {
    ...project,
    project: {
      ...project.project,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function createPart({
  name,
  color,
  existingParts,
}: NewPartOptions): Part {
  const trimmedName = name.trim() || `Part ${existingParts.length + 1}`
  const baseId = slugify(trimmedName) || `part-${existingParts.length + 1}`
  const id = createUniqueId(
    baseId,
    new Set(existingParts.map((part) => part.id)),
  )

  return {
    id,
    name: trimmedName,
    color:
      color ??
      DEFAULT_PART_COLORS[existingParts.length % DEFAULT_PART_COLORS.length],
    guidePosition: 'none',
    defaultMarkStyle: defaultMarkStyleForIndex(existingParts.length),
  }
}

export function createMediaTrack({
  file,
  role,
  existingPaths,
  partId,
  variant,
  defaultTitle,
}: NewMediaTrackOptions): MediaTrack {
  const path = createUniqueMediaPath(file.name, existingPaths)
  const fileTitle = stripExtension(file.name).trim()

  return {
    id: createEntityId(role === 'mr' ? 'mr' : 'track'),
    role,
    ...(role === 'part-audio' && partId ? { partId } : {}),
    title: defaultTitle ?? (fileTitle || file.name),
    ...(variant ? { variant } : {}),
    path,
    ...(file.type ? { mimeType: file.type } : {}),
    sizeBytes: file.size,
    volume: role === 'mr' ? 1 : 0.8,
    muted: false,
    solo: false,
    enabled: true,
  }
}

export function createUniqueMediaPath(
  fileName: string,
  existingPaths: ReadonlySet<string>,
): string {
  const safeFileName = sanitizeFileName(fileName)
  const extensionIndex = safeFileName.lastIndexOf('.')
  const baseName =
    extensionIndex > 0 ? safeFileName.slice(0, extensionIndex) : safeFileName
  const extension = extensionIndex > 0 ? safeFileName.slice(extensionIndex) : ''

  let index = 1
  let candidate = `media/${safeFileName}`
  while (existingPaths.has(candidate)) {
    index += 1
    candidate = `media/${baseName}-${index}${extension}`
  }

  return candidate
}

export function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim()
  const safeName = removeControlCharacters(trimmed)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')

  return safeName || 'audio-file'
}

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
}

function createEntityId(prefix: string): string {
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12)

  return `${prefix}-${randomId}`
}

function createUniqueId(
  baseId: string,
  existingIds: ReadonlySet<string>,
): string {
  let index = 1
  let candidate = baseId
  while (existingIds.has(candidate)) {
    index += 1
    candidate = `${baseId}-${index}`
  }

  return candidate
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function stripExtension(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
}

function defaultMarkStyleForIndex(index: number): MarkStyle {
  const styles: MarkStyle[] = ['highlight', 'line-above', 'line-below']
  return styles[index % styles.length]
}
