import type { MediaTrack, ProjectMediaFiles } from '../project-file'
import {
  getEffectiveTrackGain,
  getEnabledTracks,
  type TrackDecodeResult,
} from './mix'

export type AudioParamHandle = {
  value: number
  setValueAtTime?: (value: number, startTime: number) => void
}

export type AudioBufferHandle = {
  duration: number
}

export type GainNodeHandle = {
  gain: AudioParamHandle
  connect: (destination: unknown) => unknown
  disconnect?: () => void
}

export type AudioBufferSourceHandle = {
  buffer: AudioBufferHandle | null
  playbackRate: AudioParamHandle
  connect: (destination: GainNodeHandle) => unknown
  start: (when: number, offset?: number) => void
  stop: () => void
  disconnect?: () => void
}

export type AudioContextHandle = {
  currentTime: number
  destination: unknown
  state: AudioContextState
  createBufferSource: () => AudioBufferSourceHandle
  createGain: () => GainNodeHandle
  decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBufferHandle>
  resume: () => Promise<void>
  close?: () => Promise<void>
}

export type AudioPlaybackEngineOptions = {
  createContext?: () => AudioContextHandle
  startLatencySeconds?: number
}

export type AudioPlaybackRequest = {
  tracks: readonly MediaTrack[]
  mediaFiles: ProjectMediaFiles
  positionMs?: number
  playbackRate?: number
}

export type AudioPlaybackState = {
  isPlaying: boolean
  positionMs: number
  playbackRate: number
}

export class AudioPlaybackEngine {
  private readonly createContext: () => AudioContextHandle
  private readonly startLatencySeconds: number
  private context: AudioContextHandle | null = null
  private readonly buffersByTrackId = new Map<string, AudioBufferHandle>()
  private readonly gainsByTrackId = new Map<string, GainNodeHandle>()
  private readonly sourcesByTrackId = new Map<string, AudioBufferSourceHandle>()
  private activeTrackIds = new Set<string>()
  private isPlaying = false
  private startedAtContextTime = 0
  private startedAtPositionMs = 0
  private positionMs = 0
  private playbackRate = 1

  constructor(options: AudioPlaybackEngineOptions = {}) {
    this.createContext = options.createContext ?? createBrowserAudioContext
    this.startLatencySeconds = options.startLatencySeconds ?? 0.05
  }

  getState(): AudioPlaybackState {
    return {
      isPlaying: this.isPlaying,
      positionMs: this.getPositionMs(),
      playbackRate: this.playbackRate,
    }
  }

  getPositionMs(): number {
    if (!this.isPlaying || !this.context) {
      return this.positionMs
    }

    const elapsedSeconds = Math.max(
      0,
      this.context.currentTime - this.startedAtContextTime,
    )
    return this.startedAtPositionMs + elapsedSeconds * 1000 * this.playbackRate
  }

  async play(request: AudioPlaybackRequest): Promise<TrackDecodeResult[]> {
    const context = this.getContext()
    await this.resumeContext(context)

    const requestedPositionMs = request.positionMs ?? this.positionMs
    this.positionMs = Math.max(0, requestedPositionMs)
    this.playbackRate = request.playbackRate ?? this.playbackRate

    try {
      const results = await this.startEnabledTracks(request, context)
      this.isPlaying = true
      return results
    } catch (error) {
      this.isPlaying = false
      this.stopSources()
      throw error
    }
  }

  async seek(
    positionMs: number,
    request: AudioPlaybackRequest,
  ): Promise<TrackDecodeResult[]> {
    this.positionMs = Math.max(0, positionMs)
    if (!this.isPlaying) {
      return []
    }

    return this.play({
      ...request,
      positionMs: this.positionMs,
    })
  }

  pause(): number {
    this.positionMs = this.getPositionMs()
    this.isPlaying = false
    this.stopSources()
    return this.positionMs
  }

  stop(): void {
    this.positionMs = 0
    this.isPlaying = false
    this.stopSources()
  }

  async replay(request: AudioPlaybackRequest): Promise<TrackDecodeResult[]> {
    return this.play({ ...request, positionMs: 0 })
  }

  async sync(request: AudioPlaybackRequest): Promise<TrackDecodeResult[]> {
    this.applyMix(request.tracks)
    if (!this.isPlaying) {
      return []
    }

    const nextPlaybackRate = request.playbackRate ?? this.playbackRate
    const nextActiveTrackIds = new Set(
      getEnabledTracks(request.tracks).map((track) => track.id),
    )

    if (
      nextPlaybackRate === this.playbackRate &&
      equalTrackSets(nextActiveTrackIds, this.activeTrackIds)
    ) {
      return []
    }

    return this.play({
      ...request,
      positionMs: this.getPositionMs(),
      playbackRate: nextPlaybackRate,
    })
  }

  applyMix(tracks: readonly MediaTrack[]): void {
    for (const track of tracks) {
      const gainNode = this.gainsByTrackId.get(track.id)
      if (!gainNode) {
        continue
      }

      const gain = getEffectiveTrackGain(track, tracks)
      if (gainNode.gain.setValueAtTime && this.context) {
        gainNode.gain.setValueAtTime(gain, this.context.currentTime)
      } else {
        gainNode.gain.value = gain
      }
    }
  }

  releaseMissingTracks(trackIds: ReadonlySet<string>): void {
    for (const trackId of this.buffersByTrackId.keys()) {
      if (!trackIds.has(trackId)) {
        this.buffersByTrackId.delete(trackId)
      }
    }

    for (const [trackId, gainNode] of this.gainsByTrackId.entries()) {
      if (trackIds.has(trackId)) {
        continue
      }

      gainNode.disconnect?.()
      this.gainsByTrackId.delete(trackId)
    }
  }

  async dispose(): Promise<void> {
    this.stop()
    this.buffersByTrackId.clear()
    this.gainsByTrackId.clear()
    await this.context?.close?.()
    this.context = null
  }

  private async startEnabledTracks(
    request: AudioPlaybackRequest,
    context: AudioContextHandle,
  ): Promise<TrackDecodeResult[]> {
    const enabledTracks = getEnabledTracks(request.tracks)
    if (enabledTracks.length === 0) {
      throw new AudioPlaybackError('재생할 활성 음원이 없습니다.')
    }

    this.stopSources()
    const startAt = context.currentTime + this.startLatencySeconds
    this.startedAtContextTime = startAt
    this.startedAtPositionMs = this.positionMs
    this.activeTrackIds = new Set(enabledTracks.map((track) => track.id))

    const results = await Promise.all(
      enabledTracks.map((track) => this.startTrack(track, request, startAt)),
    )

    this.applyMix(request.tracks)
    return results.map(({ trackId, durationMs }) => ({ trackId, durationMs }))
  }

  private async startTrack(
    track: MediaTrack,
    request: AudioPlaybackRequest,
    startAt: number,
  ): Promise<TrackDecodeResult> {
    const buffer = await this.getTrackBuffer(track, request.mediaFiles)
    const durationMs = Math.round(buffer.duration * 1000)
    const offsetSeconds = this.positionMs / 1000

    if (offsetSeconds >= buffer.duration) {
      return { trackId: track.id, durationMs }
    }

    const source = this.getContext().createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = this.playbackRate
    source.connect(this.getGainNode(track.id))
    source.start(startAt, offsetSeconds)
    this.sourcesByTrackId.set(track.id, source)

    return { trackId: track.id, durationMs }
  }

  private async getTrackBuffer(
    track: MediaTrack,
    mediaFiles: ProjectMediaFiles,
  ): Promise<AudioBufferHandle> {
    const cachedBuffer = this.buffersByTrackId.get(track.id)
    if (cachedBuffer) {
      return cachedBuffer
    }

    const mediaFile = mediaFiles[track.path]
    if (!mediaFile) {
      throw new AudioPlaybackError(
        `${track.title} 음원 파일을 찾을 수 없습니다.`,
      )
    }

    try {
      const arrayBuffer = await mediaFile.arrayBuffer()
      const decodedBuffer = await this.getContext().decodeAudioData(
        arrayBuffer.slice(0),
      )
      this.buffersByTrackId.set(track.id, decodedBuffer)
      return decodedBuffer
    } catch {
      throw new AudioPlaybackError(
        `${track.title} 음원은 현재 브라우저에서 열 수 없습니다. MP3 또는 WAV로 변환한 뒤 다시 추가해 주세요.`,
      )
    }
  }

  private getGainNode(trackId: string): GainNodeHandle {
    const existingGainNode = this.gainsByTrackId.get(trackId)
    if (existingGainNode) {
      return existingGainNode
    }

    const gainNode = this.getContext().createGain()
    gainNode.connect(this.getContext().destination)
    this.gainsByTrackId.set(trackId, gainNode)
    return gainNode
  }

  private getContext(): AudioContextHandle {
    if (!this.context) {
      this.context = this.createContext()
    }

    return this.context
  }

  private async resumeContext(context: AudioContextHandle): Promise<void> {
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  private stopSources(): void {
    for (const source of this.sourcesByTrackId.values()) {
      try {
        source.stop()
      } catch {
        // Already-stopped Web Audio source nodes throw in some browsers.
      }
      source.disconnect?.()
    }

    this.sourcesByTrackId.clear()
  }
}

export class AudioPlaybackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AudioPlaybackError'
  }
}

function createBrowserAudioContext(): AudioContextHandle {
  const browserWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext
  }
  const AudioContextConstructor =
    window.AudioContext ?? browserWindow.webkitAudioContext

  if (!AudioContextConstructor) {
    throw new AudioPlaybackError(
      '이 브라우저는 Web Audio API를 지원하지 않습니다.',
    )
  }

  return new AudioContextConstructor() as unknown as AudioContextHandle
}

function equalTrackSets(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const item of left) {
    if (!right.has(item)) {
      return false
    }
  }

  return true
}
