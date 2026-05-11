export const EAZY_CHORUS_APP_ID = 'eazy-chorus'
export const PROJECT_SCHEMA_VERSION = 2
export const SUPPORTED_PROJECT_SCHEMA_VERSIONS = [
  1,
  PROJECT_SCHEMA_VERSION,
] as const

export type ProjectSchemaVersion =
  (typeof SUPPORTED_PROJECT_SCHEMA_VERSIONS)[number]

export type MediaRole = 'mr' | 'part-audio'

export type MediaVariant =
  | 'fx'
  | 'no-fx'
  | 'pitch-corrected'
  | 'guide'
  | 'custom'

export type GuidePosition = 'none' | 'above' | 'below'

export type MarkStyle = 'line-above' | 'line-below' | 'highlight'

export type LyricRole = 'main' | 'sub'

export type ProjectMeta = {
  id: string
  title: string
  artist?: string
  key?: string
  bpm?: number
  memo?: string
  createdAt: string
  updatedAt: string
}

export type ProjectSettings = {
  clickPreRollMs: number
  defaultPlaybackRate: number
  fileSizeWarningMb?: number
  mobileFileSizeWarningMb?: number
}

export type MediaTrack = {
  id: string
  role: MediaRole
  partId?: string
  title: string
  variant?: MediaVariant
  path: string
  mimeType?: string
  durationMs?: number
  sizeBytes?: number
  volume: number
  muted: boolean
  solo: boolean
  enabled: boolean
  offsetMs?: number
}

export type Part = {
  id: string
  name: string
  color: string
  description?: string
  defaultTrackId?: string
  guidePosition: GuidePosition
  defaultMarkStyle: MarkStyle
  harmonyLevel: number
}

export type LyricLane = {
  id: string
  name: string
  order: number
  defaultRole: LyricRole
  partId?: string
}

export type LyricSegment = {
  id: string
  role: LyricRole
  text: string
  partIds: string[]
  source?: LyricSegmentSource
}

export type LyricSegmentSource = {
  draftLineId: string
  startChar: number
  endChar: number
  wholeLine?: boolean
}

export type LyricCueSourceRange = {
  startChar: number
  endChar: number
}

export type LyricCue = {
  id: string
  laneId: string
  linkId?: string
  startMs: number
  endMs: number
  segments: LyricSegment[]
  sourceRange?: LyricCueSourceRange
}

export type PartMark = {
  id: string
  cueId: string
  segmentId: string
  partId: string
  lineIndex?: number
  startChar: number
  endChar: number
  style: MarkStyle
  note?: string
}

export type LyricDraftLine = {
  id: string
  text: string
}

export type EazyChorusProject = {
  schemaVersion: ProjectSchemaVersion
  app: typeof EAZY_CHORUS_APP_ID
  project: ProjectMeta
  settings: ProjectSettings
  media: MediaTrack[]
  parts: Part[]
  lyricDraft: LyricDraftLine[]
  lyricLanes: LyricLane[]
  cues: LyricCue[]
  partMarks: PartMark[]
}

export type ProjectMediaFiles = Record<string, Blob>

export type ProjectPackage = {
  project: EazyChorusProject
  mediaFiles: ProjectMediaFiles
}
