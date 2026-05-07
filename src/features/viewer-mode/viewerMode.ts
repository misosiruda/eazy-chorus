import { findActiveCueIds, getTimelineCues } from '../lane-editor'
import type { EazyChorusProject, LyricCue } from '../project-file'

export type ViewerPanel = 'mixer' | 'parts'

export type ViewerLoopMode = 'off' | 'ab' | 'cue'

export type AbLoopRange = {
  startMs: number | null
  endMs: number | null
}

export type ViewerLoopState = {
  mode: ViewerLoopMode
  abLoop: AbLoopRange
  cueId: string | null
}

export function getCueClickTargetMs(
  cue: LyricCue,
  clickPreRollMs: number,
): number {
  const safePreRollMs = Number.isFinite(clickPreRollMs)
    ? Math.max(0, Math.round(clickPreRollMs))
    : 0

  return Math.max(0, cue.startMs - safePreRollMs)
}

export function getFirstActiveTimelineCue(
  project: EazyChorusProject,
  positionMs: number,
): LyricCue | null {
  const activeCueIds = findActiveCueIds(project, positionMs)
  return (
    getTimelineCues(project).find((cue) => activeCueIds.has(cue.id)) ?? null
  )
}

export function getCueById(
  project: EazyChorusProject,
  cueId: string | null,
): LyricCue | null {
  if (!cueId) {
    return null
  }

  return project.cues.find((cue) => cue.id === cueId) ?? null
}

export function getViewerLoopSeekTarget(
  project: EazyChorusProject,
  positionMs: number,
  loopState: ViewerLoopState,
): number | null {
  const safePositionMs = normalizePositionMs(positionMs)

  if (loopState.mode === 'ab') {
    const normalizedLoop = normalizeAbLoopRange(loopState.abLoop)
    if (!normalizedLoop || safePositionMs < normalizedLoop.endMs) {
      return null
    }

    return normalizedLoop.startMs
  }

  if (loopState.mode === 'cue') {
    const cue = getCueById(project, loopState.cueId)
    if (!cue || cue.endMs <= cue.startMs || safePositionMs < cue.endMs) {
      return null
    }

    return cue.startMs
  }

  return null
}

export function isAbLoopRangeReady(abLoop: AbLoopRange): boolean {
  return normalizeAbLoopRange(abLoop) !== null
}

export function normalizeAbLoopRange(
  abLoop: AbLoopRange,
): { startMs: number; endMs: number } | null {
  const startMs =
    abLoop.startMs === null ? null : normalizePositionMs(abLoop.startMs)
  const endMs = abLoop.endMs === null ? null : normalizePositionMs(abLoop.endMs)

  if (startMs === null || endMs === null || endMs <= startMs) {
    return null
  }

  return { startMs, endMs }
}

function normalizePositionMs(positionMs: number): number {
  return Number.isFinite(positionMs) ? Math.max(0, Math.round(positionMs)) : 0
}
