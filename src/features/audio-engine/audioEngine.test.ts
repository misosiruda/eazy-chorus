import {
  AudioPlaybackEngine,
  getEffectiveTrackGain,
  getSyncPlaybackTracks,
  selectPartAudioVariant,
  type AudioBufferHandle,
  type AudioBufferSourceHandle,
  type AudioContextHandle,
  type AudioParamHandle,
  type GainNodeHandle,
} from '.'
import {
  createMediaTrack,
  createNewProject,
  type MediaTrack,
} from '../project-file'

describe('audio-engine feature', () => {
  it('calculates mute, solo, volume, and enabled gain rules', () => {
    const tracks = [
      createTrack({ id: 'mr', volume: 1, muted: true, solo: false }),
      createTrack({ id: 'vocal', volume: 0.6, muted: false, solo: true }),
      createTrack({
        id: 'disabled',
        volume: 1,
        muted: false,
        solo: true,
        enabled: false,
      }),
    ]

    expect(getEffectiveTrackGain(tracks[0], tracks)).toBe(0)
    expect(getEffectiveTrackGain(tracks[1], tracks)).toBe(0.6)
    expect(getEffectiveTrackGain(tracks[2], tracks)).toBe(0)
  })

  it('selects one enabled audio variant for a part', () => {
    const project = createNewProject({
      id: 'project-001',
      now: new Date('2026-05-06T00:00:00.000Z'),
    })
    const fxTrack = createTrack({
      id: 'main-fx',
      partId: 'main-vocal',
      variant: 'fx',
      enabled: true,
    })
    const noFxTrack = createTrack({
      id: 'main-no-fx',
      partId: 'main-vocal',
      variant: 'no-fx',
      enabled: false,
    })

    const nextProject = selectPartAudioVariant(
      {
        ...project,
        media: [fxTrack, noFxTrack],
        parts: project.parts.map((part) =>
          part.id === 'main-vocal'
            ? { ...part, defaultTrackId: fxTrack.id }
            : part,
        ),
      },
      'main-vocal',
      noFxTrack.id,
    )

    expect(
      nextProject.media.find((track) => track.id === fxTrack.id)?.enabled,
    ).toBe(false)
    expect(
      nextProject.media.find((track) => track.id === noFxTrack.id)?.enabled,
    ).toBe(true)
    expect(nextProject.parts[0].defaultTrackId).toBe(noFxTrack.id)
  })

  it('uses selected part defaults as active tracks for sync playback', () => {
    const project = createNewProject({
      id: 'project-001',
      now: new Date('2026-05-06T00:00:00.000Z'),
    })
    const mrTrack = createTrack({
      id: 'mr',
      path: 'media/mr.mp3',
      role: 'mr',
      volume: 0.7,
    })
    const selectedTrack = createTrack({
      id: 'main-guide',
      path: 'media/main-guide.wav',
      role: 'part-audio',
      partId: 'main-vocal',
      volume: 0.4,
      enabled: false,
    })
    const unusedTrack = createTrack({
      id: 'main-alt',
      path: 'media/main-alt.wav',
      role: 'part-audio',
      partId: 'main-vocal',
      volume: 0.9,
      enabled: false,
    })

    const playbackTracks = getSyncPlaybackTracks({
      ...project,
      media: [mrTrack, selectedTrack, unusedTrack],
      parts: project.parts.map((part) =>
        part.id === 'main-vocal'
          ? { ...part, defaultTrackId: selectedTrack.id }
          : part,
      ),
    })

    expect(playbackTracks.find((track) => track.id === 'mr')).toEqual(
      expect.objectContaining({ enabled: true, volume: 0.7 }),
    )
    expect(playbackTracks.find((track) => track.id === 'main-guide')).toEqual(
      expect.objectContaining({ enabled: true, volume: 0.4 }),
    )
    expect(playbackTracks.find((track) => track.id === 'main-alt')).toEqual(
      expect.objectContaining({ enabled: false, volume: 0.9 }),
    )
    expect(selectedTrack.enabled).toBe(false)
  })

  it('starts enabled tracks at the same context time and seek offset', async () => {
    const context = new FakeAudioContext()
    const engine = new AudioPlaybackEngine({
      createContext: () => context,
      startLatencySeconds: 0.1,
    })
    const tracks = [
      createTrack({ id: 'mr', path: 'media/mr.mp3', role: 'mr' }),
      createTrack({
        id: 'vocal',
        path: 'media/vocal.wav',
        role: 'part-audio',
        partId: 'main-vocal',
      }),
      createTrack({
        id: 'disabled',
        path: 'media/disabled.wav',
        role: 'part-audio',
        partId: 'main-vocal',
        enabled: false,
      }),
    ]

    const decodedTracks = await engine.play({
      tracks,
      mediaFiles: {
        'media/mr.mp3': new Blob(['mr']),
        'media/vocal.wav': new Blob(['vocal']),
        'media/disabled.wav': new Blob(['disabled']),
      },
      positionMs: 5000,
    })

    expect(decodedTracks).toEqual([
      { trackId: 'mr', durationMs: 30000 },
      { trackId: 'vocal', durationMs: 30000 },
    ])
    expect(context.sources).toHaveLength(2)
    expect(context.sources.map((source) => source.startedAt)).toEqual([
      12.1, 12.1,
    ])
    expect(context.sources.map((source) => source.offsetSeconds)).toEqual([
      5, 5,
    ])
  })
})

function createTrack(patch: Partial<MediaTrack>): MediaTrack {
  const file = new File(['audio'], `${patch.id ?? 'track'}.wav`, {
    type: 'audio/wav',
  })

  return {
    ...createMediaTrack({
      file,
      role: patch.role ?? 'part-audio',
      partId: patch.partId ?? 'main-vocal',
      variant: patch.variant ?? 'fx',
      existingPaths: new Set(),
    }),
    ...patch,
  }
}

class FakeAudioContext implements AudioContextHandle {
  currentTime = 12
  destination = {}
  state: AudioContextState = 'running'
  readonly sources: FakeAudioBufferSource[] = []

  createBufferSource(): AudioBufferSourceHandle {
    const source = new FakeAudioBufferSource()
    this.sources.push(source)
    return source
  }

  createGain(): GainNodeHandle {
    return new FakeGainNode()
  }

  decodeAudioData(): Promise<AudioBufferHandle> {
    return Promise.resolve({ duration: 30 })
  }

  resume(): Promise<void> {
    return Promise.resolve()
  }
}

class FakeAudioParam implements AudioParamHandle {
  value = 1

  setValueAtTime(value: number): void {
    this.value = value
  }
}

class FakeGainNode implements GainNodeHandle {
  gain = new FakeAudioParam()

  connect(): unknown {
    return undefined
  }
}

class FakeAudioBufferSource implements AudioBufferSourceHandle {
  buffer: AudioBufferHandle | null = null
  playbackRate = new FakeAudioParam()
  startedAt: number | null = null
  offsetSeconds: number | undefined
  stopped = false

  connect(): unknown {
    return undefined
  }

  start(when: number, offset?: number): void {
    this.startedAt = when
    this.offsetSeconds = offset
  }

  stop(): void {
    this.stopped = true
  }
}
