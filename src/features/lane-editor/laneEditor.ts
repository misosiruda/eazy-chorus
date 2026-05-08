import type {
  EazyChorusProject,
  LyricCue,
  LyricCueSourceRange,
  LyricDraftLine,
  LyricLane,
  LyricRole,
  LyricSegment,
  PartMark,
} from '../project-file'

export const MIN_CUE_DURATION_MS = 1

export type LaneEditorSnapshot = Pick<
  EazyChorusProject,
  'lyricDraft' | 'lyricLanes' | 'cues' | 'partMarks'
>

type NewLyricLaneOptions = {
  name: string
  defaultRole: LyricRole
  existingLanes: readonly LyricLane[]
  partId?: string
}

type NewCueFromDraftOptions = {
  draftLine: LyricDraftLine
  lane: LyricLane
  existingCues: readonly LyricCue[]
}

type NewCueFromTextSelectionOptions = {
  text: string
  lane: LyricLane
  existingCues: readonly LyricCue[]
  linkId?: string
  sourceId?: string
  sourceRange?: LyricCueSourceRange
  role?: LyricRole
}

export function createLyricLane({
  name,
  defaultRole,
  existingLanes,
  partId,
}: NewLyricLaneOptions): LyricLane {
  const trimmedName = name.trim() || `Lane ${existingLanes.length + 1}`
  const baseId = slugify(trimmedName) || `lane-${existingLanes.length + 1}`
  const order =
    existingLanes.length === 0
      ? 1
      : Math.max(...existingLanes.map((lane) => lane.order)) + 1

  return {
    id: createUniqueId(baseId, new Set(existingLanes.map((lane) => lane.id))),
    name: trimmedName,
    order,
    defaultRole,
    ...(partId ? { partId } : {}),
  }
}

export function createCueFromDraftLine({
  draftLine,
  lane,
  existingCues,
}: NewCueFromDraftOptions): LyricCue {
  return createCueFromTextSelection({
    text: draftLine.text,
    lane,
    existingCues,
    sourceId: draftLine.id,
  })
}

export function createCueFromTextSelection({
  text,
  lane,
  existingCues,
  linkId,
  sourceId,
  sourceRange,
  role,
}: NewCueFromTextSelectionOptions): LyricCue {
  const normalizedText = text.trim()
  const cueId = createUniqueId(
    `cue-${sourceId ? slugify(sourceId) : slugify(normalizedText) || 'selection'}`,
    new Set(existingCues.map((cue) => cue.id)),
  )
  const segment: LyricSegment = {
    id: `${cueId}-seg-1`,
    role: role ?? lane.defaultRole,
    text: normalizedText,
    partIds: lane.partId ? [lane.partId] : [],
  }

  return {
    id: cueId,
    laneId: lane.id,
    ...(linkId ? { linkId } : {}),
    startMs: 0,
    endMs: MIN_CUE_DURATION_MS,
    segments: [segment],
    ...(sourceRange ? { sourceRange } : {}),
  }
}

export function placeDraftLineOnLane(
  project: EazyChorusProject,
  draftLineId: string,
  laneId: string,
): EazyChorusProject {
  const draftLine = project.lyricDraft.find((line) => line.id === draftLineId)
  const lane = project.lyricLanes.find((item) => item.id === laneId)
  if (!draftLine || !lane) {
    return project
  }

  const cue = createCueFromDraftLine({
    draftLine,
    lane,
    existingCues: project.cues,
  })

  return {
    ...project,
    lyricDraft: project.lyricDraft.filter((line) => line.id !== draftLineId),
    cues: [...project.cues, cue],
  }
}

export function placeAllDraftLinesOnLane(
  project: EazyChorusProject,
  laneId: string,
): EazyChorusProject {
  const lane = project.lyricLanes.find((item) => item.id === laneId)
  if (!lane || project.lyricDraft.length === 0) {
    return project
  }

  const nextCues = [...project.cues]
  project.lyricDraft.forEach((draftLine) => {
    nextCues.push(
      createCueFromDraftLine({
        draftLine,
        lane,
        existingCues: nextCues,
      }),
    )
  })

  return {
    ...project,
    lyricDraft: [],
    cues: nextCues,
  }
}

export function syncCueStart(
  project: EazyChorusProject,
  cueId: string,
  positionMs: number,
): EazyChorusProject {
  const cue = project.cues.find((item) => item.id === cueId)
  if (!cue) {
    return project
  }

  const safePositionMs = normalizePositionMs(positionMs)
  const cueSequence = getLaneCueSequence(project, cue.laneId)
  const cueIndex = cueSequence.findIndex((item) => item.id === cueId)
  const previousCueId = cueIndex > 0 ? cueSequence[cueIndex - 1].id : null

  return {
    ...project,
    cues: project.cues.map((item) => {
      if (item.id === cueId) {
        return {
          ...item,
          startMs: safePositionMs,
          endMs:
            item.endMs <= safePositionMs || isCueOpenForSync(item)
              ? safePositionMs + MIN_CUE_DURATION_MS
              : item.endMs,
        }
      }

      if (
        previousCueId &&
        item.id === previousCueId &&
        isCueOpenForSync(item)
      ) {
        return {
          ...item,
          endMs: Math.max(item.startMs + MIN_CUE_DURATION_MS, safePositionMs),
        }
      }

      return item
    }),
  }
}

export function syncCueEnd(
  project: EazyChorusProject,
  cueId: string,
  positionMs: number,
): EazyChorusProject {
  const cue = project.cues.find((item) => item.id === cueId)
  if (!cue) {
    return project
  }

  const safePositionMs = normalizePositionMs(positionMs)

  return {
    ...project,
    cues: project.cues.map((item) =>
      item.id === cueId
        ? {
            ...item,
            endMs: Math.max(item.startMs + MIN_CUE_DURATION_MS, safePositionMs),
          }
        : item,
    ),
  }
}

export function getSortedLanes(project: EazyChorusProject): LyricLane[] {
  return [...project.lyricLanes].sort(
    (first, second) =>
      first.order - second.order || first.id.localeCompare(second.id),
  )
}

export function getLaneCueSequence(
  project: EazyChorusProject,
  laneId: string,
): LyricCue[] {
  return project.cues.filter((cue) => cue.laneId === laneId)
}

export function getTimelineCues(project: EazyChorusProject): LyricCue[] {
  const laneOrderById = new Map(
    project.lyricLanes.map((lane) => [lane.id, lane.order]),
  )

  return [...project.cues].sort(
    (first, second) =>
      first.startMs - second.startMs ||
      (laneOrderById.get(first.laneId) ?? 0) -
        (laneOrderById.get(second.laneId) ?? 0) ||
      first.id.localeCompare(second.id),
  )
}

export function getSyncCueSequence(project: EazyChorusProject): LyricCue[] {
  const laneOrderById = new Map(
    project.lyricLanes.map((lane) => [lane.id, lane.order]),
  )
  const cueIndexById = new Map(
    project.cues.map((cue, index) => [cue.id, index]),
  )

  return [...project.cues].sort(
    (first, second) =>
      getCueSourceOrder(first) - getCueSourceOrder(second) ||
      getCueSourceEndOrder(first) - getCueSourceEndOrder(second) ||
      (laneOrderById.get(first.laneId) ?? 0) -
        (laneOrderById.get(second.laneId) ?? 0) ||
      (cueIndexById.get(first.id) ?? 0) - (cueIndexById.get(second.id) ?? 0),
  )
}

export function getNextCueId(
  project: EazyChorusProject,
  cueId: string,
): string | null {
  const cue = project.cues.find((item) => item.id === cueId)
  if (!cue) {
    return null
  }

  const cueSequence = getLaneCueSequence(project, cue.laneId)
  const cueIndex = cueSequence.findIndex((item) => item.id === cueId)

  return cueSequence[cueIndex + 1]?.id ?? null
}

export function getNextSyncCueId(
  project: EazyChorusProject,
  cueId: string,
): string | null {
  const cueSequence = getSyncCueSequence(project)
  const cueIndex = cueSequence.findIndex((item) => item.id === cueId)

  return cueSequence[cueIndex + 1]?.id ?? null
}

export function getPreviousCueId(
  project: EazyChorusProject,
  cueId: string,
): string | null {
  const cue = project.cues.find((item) => item.id === cueId)
  if (!cue) {
    return null
  }

  const cueSequence = getLaneCueSequence(project, cue.laneId)
  const cueIndex = cueSequence.findIndex((item) => item.id === cueId)

  return cueIndex > 0 ? cueSequence[cueIndex - 1].id : null
}

export function findActiveCueIds(
  project: EazyChorusProject,
  positionMs: number,
): Set<string> {
  const safePositionMs = normalizePositionMs(positionMs)
  return new Set(
    project.cues
      .filter(
        (cue) => cue.startMs <= safePositionMs && safePositionMs < cue.endMs,
      )
      .map((cue) => cue.id),
  )
}

export function createLaneEditorSnapshot(
  project: EazyChorusProject,
): LaneEditorSnapshot {
  return {
    lyricDraft: project.lyricDraft,
    lyricLanes: project.lyricLanes,
    cues: project.cues,
    partMarks: project.partMarks,
  }
}

export function restoreLaneEditorSnapshot(
  project: EazyChorusProject,
  snapshot: LaneEditorSnapshot,
): EazyChorusProject {
  return {
    ...project,
    lyricDraft: snapshot.lyricDraft,
    lyricLanes: snapshot.lyricLanes,
    cues: snapshot.cues,
    partMarks: snapshot.partMarks,
  }
}

export function isCueOpenForSync(cue: LyricCue): boolean {
  return cue.endMs - cue.startMs <= MIN_CUE_DURATION_MS
}

export function getCueText(cue: LyricCue): string {
  return cue.segments.map((segment) => segment.text).join(' ')
}

export function getPartMarksForCue(
  partMarks: readonly PartMark[],
  cueId: string,
): PartMark[] {
  return partMarks.filter((mark) => mark.cueId === cueId)
}

function normalizePositionMs(positionMs: number): number {
  return Number.isFinite(positionMs) ? Math.max(0, Math.round(positionMs)) : 0
}

function getCueSourceOrder(cue: LyricCue): number {
  return cue.sourceRange?.startChar ?? Number.MAX_SAFE_INTEGER
}

function getCueSourceEndOrder(cue: LyricCue): number {
  return cue.sourceRange?.endChar ?? Number.MAX_SAFE_INTEGER
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
