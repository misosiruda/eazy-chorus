import {
  EAZY_CHORUS_APP_ID,
  type EazyChorusProject,
  PROJECT_SCHEMA_VERSION,
} from './types'

export type ValidationIssue = {
  severity: 'error' | 'warning'
  path: string
  message: string
}

export type ProjectValidationResult = {
  project: EazyChorusProject | null
  issues: ValidationIssue[]
}

const MEDIA_ROLES = ['mr', 'part-audio'] as const
const MEDIA_VARIANTS = [
  'fx',
  'no-fx',
  'pitch-corrected',
  'guide',
  'custom',
] as const
const GUIDE_POSITIONS = ['none', 'above', 'below'] as const
const MARK_STYLES = ['line-above', 'line-below', 'highlight'] as const
const LYRIC_ROLES = ['main', 'sub'] as const
const DURATION_WARNING_THRESHOLD_MS = 3000

export function validateProjectPayload(
  payload: unknown,
  mediaPaths?: ReadonlySet<string>,
): ProjectValidationResult {
  const issues: ValidationIssue[] = []
  const root = asRecord(payload)

  if (!root) {
    addError(issues, 'project.json', 'project.json은 JSON 객체여야 합니다.')
    return { project: null, issues }
  }

  validateRoot(root, issues)
  validateProjectMeta(root.project, issues)
  validateSettings(root.settings, issues)

  const mediaItems = readArray(root.media, 'media', issues)
  const partItems = readArray(root.parts, 'parts', issues)
  const lyricDraftItems = readOptionalArray(
    root.lyricDraft,
    'lyricDraft',
    issues,
  )
  const laneItems = readArray(root.lyricLanes, 'lyricLanes', issues)
  const cueItems = readArray(root.cues, 'cues', issues)
  const markItems = readArray(root.partMarks, 'partMarks', issues)

  const mediaIds = validateMedia(mediaItems, mediaPaths, issues)
  const partIds = validateParts(partItems, mediaIds, issues)
  validateLyricDraft(lyricDraftItems, issues)
  const laneIds = validateLanes(laneItems, issues)
  const segmentTexts = validateCues(cueItems, laneIds, partIds, issues)

  validateMediaPartReferences(mediaItems, partIds, issues)
  validatePartMarks(markItems, partIds, segmentTexts, issues)
  validateDurationWarning(mediaItems, issues)

  return {
    project: hasValidationErrors(issues)
      ? null
      : normalizeProjectPayload(payload as EazyChorusProject, root),
    issues,
  }
}

export function hasValidationErrors(
  issues: readonly ValidationIssue[],
): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

export function formatValidationIssue(issue: ValidationIssue): string {
  return `${issue.path}: ${issue.message}`
}

function validateRoot(
  root: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  if (root.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    addError(
      issues,
      'schemaVersion',
      `schemaVersion은 ${PROJECT_SCHEMA_VERSION}이어야 합니다.`,
    )
  }

  if (root.app !== EAZY_CHORUS_APP_ID) {
    addError(issues, 'app', `app은 "${EAZY_CHORUS_APP_ID}"이어야 합니다.`)
  }
}

function validateProjectMeta(value: unknown, issues: ValidationIssue[]): void {
  const meta = asRecord(value)
  if (!meta) {
    addError(issues, 'project', 'project meta가 필요합니다.')
    return
  }

  requireString(meta.id, 'project.id', issues)
  requireString(meta.title, 'project.title', issues)
  if (typeof meta.title === 'string' && meta.title.trim() === '') {
    addError(issues, 'project.title', '프로젝트 제목은 비어 있을 수 없습니다.')
  }

  optionalString(meta.artist, 'project.artist', issues)
  optionalString(meta.key, 'project.key', issues)
  optionalString(meta.memo, 'project.memo', issues)
  optionalNumber(meta.bpm, 'project.bpm', issues)
  requireString(meta.createdAt, 'project.createdAt', issues)
  requireString(meta.updatedAt, 'project.updatedAt', issues)
}

function validateSettings(value: unknown, issues: ValidationIssue[]): void {
  const settings = asRecord(value)
  if (!settings) {
    addError(issues, 'settings', 'settings가 필요합니다.')
    return
  }

  requireNumber(settings.clickPreRollMs, 'settings.clickPreRollMs', issues)
  requireNumber(
    settings.defaultPlaybackRate,
    'settings.defaultPlaybackRate',
    issues,
  )
  optionalNumber(
    settings.fileSizeWarningMb,
    'settings.fileSizeWarningMb',
    issues,
  )
  optionalNumber(
    settings.mobileFileSizeWarningMb,
    'settings.mobileFileSizeWarningMb',
    issues,
  )
}

function validateMedia(
  mediaItems: readonly unknown[],
  mediaPaths: ReadonlySet<string> | undefined,
  issues: ValidationIssue[],
): Set<string> {
  const mediaIds = new Set<string>()
  const zipPaths = new Set<string>()

  mediaItems.forEach((item, index) => {
    const pathPrefix = `media[${index}]`
    const media = asRecord(item)
    if (!media) {
      addError(issues, pathPrefix, 'media 항목은 객체여야 합니다.')
      return
    }

    const id = requireString(media.id, `${pathPrefix}.id`, issues)
    if (id) {
      if (mediaIds.has(id)) {
        addError(issues, `${pathPrefix}.id`, `중복 media id입니다: ${id}`)
      }
      mediaIds.add(id)
    }

    const role = requireEnum(
      media.role,
      MEDIA_ROLES,
      `${pathPrefix}.role`,
      issues,
    )
    if (role === 'mr' && 'partId' in media) {
      addError(
        issues,
        `${pathPrefix}.partId`,
        'MR 트랙은 partId를 가질 수 없습니다.',
      )
    }
    if (role === 'part-audio') {
      requireString(media.partId, `${pathPrefix}.partId`, issues)
    }

    requireString(media.title, `${pathPrefix}.title`, issues)
    optionalEnum(media.variant, MEDIA_VARIANTS, `${pathPrefix}.variant`, issues)
    const mediaPath = requireString(media.path, `${pathPrefix}.path`, issues)
    if (mediaPath) {
      if (!mediaPath.startsWith('media/')) {
        addError(
          issues,
          `${pathPrefix}.path`,
          'media path는 media/ 아래 상대 경로여야 합니다.',
        )
      }
      if (zipPaths.has(mediaPath)) {
        addError(
          issues,
          `${pathPrefix}.path`,
          `중복 media path입니다: ${mediaPath}`,
        )
      }
      zipPaths.add(mediaPath)
      if (mediaPaths && !mediaPaths.has(mediaPath)) {
        addError(
          issues,
          `${pathPrefix}.path`,
          `ZIP 내부에 media 파일이 없습니다: ${mediaPath}`,
        )
      }
    }

    optionalString(media.mimeType, `${pathPrefix}.mimeType`, issues)
    optionalNumber(media.durationMs, `${pathPrefix}.durationMs`, issues)
    optionalNumber(media.sizeBytes, `${pathPrefix}.sizeBytes`, issues)
    requireNumber(media.volume, `${pathPrefix}.volume`, issues)
    requireBoolean(media.muted, `${pathPrefix}.muted`, issues)
    requireBoolean(media.solo, `${pathPrefix}.solo`, issues)
    requireBoolean(media.enabled, `${pathPrefix}.enabled`, issues)
    optionalNumber(media.offsetMs, `${pathPrefix}.offsetMs`, issues)
  })

  return mediaIds
}

function validateParts(
  partItems: readonly unknown[],
  mediaIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): Set<string> {
  const partIds = new Set<string>()

  partItems.forEach((item, index) => {
    const pathPrefix = `parts[${index}]`
    const part = asRecord(item)
    if (!part) {
      addError(issues, pathPrefix, 'part 항목은 객체여야 합니다.')
      return
    }

    const id = requireString(part.id, `${pathPrefix}.id`, issues)
    if (id) {
      if (partIds.has(id)) {
        addError(issues, `${pathPrefix}.id`, `중복 part id입니다: ${id}`)
      }
      partIds.add(id)
    }
    requireString(part.name, `${pathPrefix}.name`, issues)
    requireString(part.color, `${pathPrefix}.color`, issues)
    optionalString(part.description, `${pathPrefix}.description`, issues)
    const defaultTrackId = optionalString(
      part.defaultTrackId,
      `${pathPrefix}.defaultTrackId`,
      issues,
    )
    if (defaultTrackId && !mediaIds.has(defaultTrackId)) {
      addError(
        issues,
        `${pathPrefix}.defaultTrackId`,
        `존재하지 않는 media id입니다: ${defaultTrackId}`,
      )
    }
    requireEnum(
      part.guidePosition,
      GUIDE_POSITIONS,
      `${pathPrefix}.guidePosition`,
      issues,
    )
    requireEnum(
      part.defaultMarkStyle,
      MARK_STYLES,
      `${pathPrefix}.defaultMarkStyle`,
      issues,
    )
  })

  return partIds
}

function validateLanes(
  laneItems: readonly unknown[],
  issues: ValidationIssue[],
): Set<string> {
  const laneIds = new Set<string>()

  laneItems.forEach((item, index) => {
    const pathPrefix = `lyricLanes[${index}]`
    const lane = asRecord(item)
    if (!lane) {
      addError(issues, pathPrefix, 'lyric lane 항목은 객체여야 합니다.')
      return
    }

    const id = requireString(lane.id, `${pathPrefix}.id`, issues)
    if (id) {
      if (laneIds.has(id)) {
        addError(issues, `${pathPrefix}.id`, `중복 lane id입니다: ${id}`)
      }
      laneIds.add(id)
    }
    requireString(lane.name, `${pathPrefix}.name`, issues)
    requireNumber(lane.order, `${pathPrefix}.order`, issues)
    requireEnum(
      lane.defaultRole,
      LYRIC_ROLES,
      `${pathPrefix}.defaultRole`,
      issues,
    )
  })

  return laneIds
}

function validateLyricDraft(
  draftItems: readonly unknown[],
  issues: ValidationIssue[],
): void {
  const draftIds = new Set<string>()

  draftItems.forEach((item, index) => {
    const pathPrefix = `lyricDraft[${index}]`
    const draftLine = asRecord(item)
    if (!draftLine) {
      addError(issues, pathPrefix, 'lyric draft 항목은 객체여야 합니다.')
      return
    }

    const id = requireString(draftLine.id, `${pathPrefix}.id`, issues)
    if (id) {
      if (draftIds.has(id)) {
        addError(issues, `${pathPrefix}.id`, `중복 lyric draft id입니다: ${id}`)
      }
      draftIds.add(id)
    }

    const text = requireString(draftLine.text, `${pathPrefix}.text`, issues)
    if (text !== undefined && text.trim() === '') {
      addError(
        issues,
        `${pathPrefix}.text`,
        'draft text는 비어 있을 수 없습니다.',
      )
    }
  })
}

function validateCues(
  cueItems: readonly unknown[],
  laneIds: ReadonlySet<string>,
  partIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): Map<string, string> {
  const cueIds = new Set<string>()
  const segmentTexts = new Map<string, string>()

  cueItems.forEach((item, cueIndex) => {
    const cuePath = `cues[${cueIndex}]`
    const cue = asRecord(item)
    if (!cue) {
      addError(issues, cuePath, 'cue 항목은 객체여야 합니다.')
      return
    }

    const cueId = requireString(cue.id, `${cuePath}.id`, issues)
    if (cueId) {
      if (cueIds.has(cueId)) {
        addError(issues, `${cuePath}.id`, `중복 cue id입니다: ${cueId}`)
      }
      cueIds.add(cueId)
    }

    const laneId = requireString(cue.laneId, `${cuePath}.laneId`, issues)
    if (laneId && !laneIds.has(laneId)) {
      addError(
        issues,
        `${cuePath}.laneId`,
        `존재하지 않는 lane id입니다: ${laneId}`,
      )
    }

    const startMs = requireNumber(cue.startMs, `${cuePath}.startMs`, issues)
    const endMs = requireNumber(cue.endMs, `${cuePath}.endMs`, issues)
    if (startMs !== undefined && endMs !== undefined && startMs >= endMs) {
      addError(issues, cuePath, 'cue startMs는 endMs보다 작아야 합니다.')
    }

    const segmentItems = readArray(cue.segments, `${cuePath}.segments`, issues)
    segmentItems.forEach((segmentItem, segmentIndex) => {
      const segmentPath = `${cuePath}.segments[${segmentIndex}]`
      const segment = asRecord(segmentItem)
      if (!segment) {
        addError(issues, segmentPath, 'segment 항목은 객체여야 합니다.')
        return
      }

      const segmentId = requireString(segment.id, `${segmentPath}.id`, issues)
      requireEnum(segment.role, LYRIC_ROLES, `${segmentPath}.role`, issues)
      const text = requireString(segment.text, `${segmentPath}.text`, issues)
      if (text !== undefined && text.trim() === '') {
        addError(
          issues,
          `${segmentPath}.text`,
          'segment text는 비어 있을 수 없습니다.',
        )
      }
      if (cueId && segmentId && text !== undefined) {
        const segmentKey = createSegmentKey(cueId, segmentId)
        if (segmentTexts.has(segmentKey)) {
          addError(
            issues,
            `${segmentPath}.id`,
            `동일 cue 안에서 중복 segment id입니다: ${segmentId}`,
          )
        }
        segmentTexts.set(segmentKey, text)
      }

      const segmentPartIds = readArray(
        segment.partIds,
        `${segmentPath}.partIds`,
        issues,
      )
      segmentPartIds.forEach((partId, partIndex) => {
        const partIdPath = `${segmentPath}.partIds[${partIndex}]`
        if (typeof partId !== 'string' || partId.trim() === '') {
          addError(
            issues,
            partIdPath,
            'partIds 항목은 비어 있지 않은 문자열이어야 합니다.',
          )
          return
        }
        if (!partIds.has(partId)) {
          addError(issues, partIdPath, `존재하지 않는 part id입니다: ${partId}`)
        }
      })
    })
  })

  return segmentTexts
}

function validateMediaPartReferences(
  mediaItems: readonly unknown[],
  partIds: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  mediaItems.forEach((item, index) => {
    const media = asRecord(item)
    if (
      !media ||
      media.role !== 'part-audio' ||
      typeof media.partId !== 'string'
    ) {
      return
    }

    if (!partIds.has(media.partId)) {
      addError(
        issues,
        `media[${index}].partId`,
        `존재하지 않는 part id입니다: ${media.partId}`,
      )
    }
  })
}

function validatePartMarks(
  markItems: readonly unknown[],
  partIds: ReadonlySet<string>,
  segmentTexts: ReadonlyMap<string, string>,
  issues: ValidationIssue[],
): void {
  const markIds = new Set<string>()

  markItems.forEach((item, index) => {
    const markPath = `partMarks[${index}]`
    const mark = asRecord(item)
    if (!mark) {
      addError(issues, markPath, 'partMark 항목은 객체여야 합니다.')
      return
    }

    const id = requireString(mark.id, `${markPath}.id`, issues)
    if (id) {
      if (markIds.has(id)) {
        addError(issues, `${markPath}.id`, `중복 partMark id입니다: ${id}`)
      }
      markIds.add(id)
    }

    const cueId = requireString(mark.cueId, `${markPath}.cueId`, issues)
    const segmentId = requireString(
      mark.segmentId,
      `${markPath}.segmentId`,
      issues,
    )
    const partId = requireString(mark.partId, `${markPath}.partId`, issues)
    if (partId && !partIds.has(partId)) {
      addError(
        issues,
        `${markPath}.partId`,
        `존재하지 않는 part id입니다: ${partId}`,
      )
    }

    const startChar = requireNumber(
      mark.startChar,
      `${markPath}.startChar`,
      issues,
    )
    const endChar = requireNumber(mark.endChar, `${markPath}.endChar`, issues)
    optionalNumber(mark.lineIndex, `${markPath}.lineIndex`, issues)
    requireEnum(mark.style, MARK_STYLES, `${markPath}.style`, issues)

    if (!cueId || !segmentId) {
      return
    }

    const segmentText = segmentTexts.get(createSegmentKey(cueId, segmentId))
    if (segmentText === undefined) {
      addError(
        issues,
        markPath,
        `존재하지 않는 cue/segment 참조입니다: ${cueId}/${segmentId}`,
      )
      return
    }

    if (
      startChar !== undefined &&
      endChar !== undefined &&
      (startChar < 0 || endChar <= startChar || endChar > segmentText.length)
    ) {
      addError(
        issues,
        markPath,
        'partMark 범위는 segment text 길이 안의 startChar < endChar 값이어야 합니다.',
      )
    }
  })
}

function validateDurationWarning(
  mediaItems: readonly unknown[],
  issues: ValidationIssue[],
): void {
  const durations = mediaItems
    .map((item) => asRecord(item)?.durationMs)
    .filter((duration): duration is number => isFiniteNumber(duration))

  if (durations.length < 2) {
    return
  }

  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)
  if (maxDuration - minDuration > DURATION_WARNING_THRESHOLD_MS) {
    addWarning(
      issues,
      'media.durationMs',
      '음원 duration 차이가 큽니다. 같은 시작점으로 export된 파일인지 확인하세요.',
    )
  }
}

function readArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): unknown[] {
  if (!Array.isArray(value)) {
    addError(issues, path, `${path}는 배열이어야 합니다.`)
    return []
  }

  return value
}

function readOptionalArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): unknown[] {
  if (value === undefined) {
    return []
  }

  return readArray(value, path, issues)
}

function requireString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    addError(issues, path, '비어 있지 않은 문자열이어야 합니다.')
    return undefined
  }

  return value
}

function optionalString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireString(value, path, issues)
}

function requireNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (!isFiniteNumber(value)) {
    addError(issues, path, '유한한 숫자여야 합니다.')
    return undefined
  }

  return value
}

function optionalNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireNumber(value, path, issues)
}

function requireBoolean(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== 'boolean') {
    addError(issues, path, 'boolean 값이어야 합니다.')
  }
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
): T | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    addError(issues, path, `허용된 값이어야 합니다: ${allowed.join(', ')}`)
    return undefined
  }

  return value as T
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined) {
    requireEnum(value, allowed, path, issues)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeProjectPayload(
  project: EazyChorusProject,
  root: Record<string, unknown>,
): EazyChorusProject {
  return {
    ...project,
    lyricDraft: Array.isArray(root.lyricDraft) ? project.lyricDraft : [],
  }
}

function createSegmentKey(cueId: string, segmentId: string): string {
  return `${cueId}:${segmentId}`
}

function addError(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ severity: 'error', path, message })
}

function addWarning(
  issues: ValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ severity: 'warning', path, message })
}
