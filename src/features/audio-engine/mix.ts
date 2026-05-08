import type {
  EazyChorusProject,
  MediaTrack,
  ProjectMediaFiles,
} from '../project-file'

export type TrackDecodeResult = {
  trackId: string
  durationMs: number
}

export function getEnabledTracks(tracks: readonly MediaTrack[]): MediaTrack[] {
  return tracks.filter((track) => track.enabled)
}

export function getSyncPlaybackTracks(
  project: EazyChorusProject,
): MediaTrack[] {
  const defaultTrackIds = new Set(
    project.parts
      .map((part) => part.defaultTrackId)
      .filter((trackId): trackId is string => Boolean(trackId)),
  )

  return project.media.map((track) =>
    track.role === 'part-audio' && defaultTrackIds.has(track.id)
      ? { ...track, enabled: true }
      : track,
  )
}

export function getEffectiveTrackGain(
  track: MediaTrack,
  tracks: readonly MediaTrack[],
): number {
  if (!track.enabled) {
    return 0
  }

  const hasSolo = tracks.some((item) => item.solo)
  if (hasSolo) {
    return track.solo ? clampVolume(track.volume) : 0
  }

  return track.muted ? 0 : clampVolume(track.volume)
}

export function getProjectDurationMs(project: EazyChorusProject): number {
  const durations = project.media
    .map((track) => track.durationMs)
    .filter((duration): duration is number => Number.isFinite(duration))

  return durations.length > 0 ? Math.max(...durations) : 0
}

export function updateProjectWithDecodedDurations(
  project: EazyChorusProject,
  decodedTracks: readonly TrackDecodeResult[],
): EazyChorusProject {
  if (decodedTracks.length === 0) {
    return project
  }

  const decodedDurationById = new Map(
    decodedTracks.map((track) => [track.trackId, track.durationMs]),
  )
  let changed = false
  const media = project.media.map((track) => {
    const durationMs = decodedDurationById.get(track.id)
    if (durationMs === undefined || track.durationMs === durationMs) {
      return track
    }

    changed = true
    return { ...track, durationMs }
  })

  return changed ? { ...project, media } : project
}

export function selectPartAudioVariant(
  project: EazyChorusProject,
  partId: string,
  selectedTrackId: string | null,
): EazyChorusProject {
  const validSelectedTrack = project.media.some(
    (track) =>
      track.id === selectedTrackId &&
      track.role === 'part-audio' &&
      track.partId === partId,
  )
  const nextSelectedTrackId = validSelectedTrack ? selectedTrackId : null

  return {
    ...project,
    media: project.media.map((track) =>
      track.role === 'part-audio' && track.partId === partId
        ? { ...track, enabled: track.id === nextSelectedTrackId }
        : track,
    ),
    parts: project.parts.map((part) =>
      part.id === partId
        ? { ...part, defaultTrackId: nextSelectedTrackId ?? undefined }
        : part,
    ),
  }
}

export function createMediaFilePathSet(
  mediaFiles: ProjectMediaFiles,
): ReadonlySet<string> {
  return new Set(Object.keys(mediaFiles))
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 0
  }

  return Math.min(1, Math.max(0, volume))
}
