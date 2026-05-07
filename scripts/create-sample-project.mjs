import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const outputDir = path.join(rootDir, 'public', 'samples')
const outputPath = path.join(outputDir, 'eazy-chorus-demo.eazychorus')
const durationMs = 12000

const mediaBuffers = {
  'media/sample-mr.wav': createWavBuffer({
    durationMs,
    tones: [
      { frequency: 110, gain: 0.18 },
      { frequency: 220, gain: 0.08 },
      { frequency: 330, gain: 0.04 },
    ],
  }),
  'media/main-vocal-guide.wav': createWavBuffer({
    durationMs,
    tones: [{ frequency: 330, gain: 0.22 }],
  }),
  'media/upper-harmony-guide.wav': createWavBuffer({
    durationMs,
    tones: [{ frequency: 440, gain: 0.2 }],
  }),
  'media/lower-harmony-guide.wav': createWavBuffer({
    durationMs,
    tones: [{ frequency: 247, gain: 0.2 }],
  }),
}

const cues = [
  createCue({
    id: 'cue-001',
    startMs: 1000,
    endMs: 3000,
    segments: [
      createSegment({
        id: 'seg-001-main',
        role: 'main',
        text: '오래 기다린 이 밤',
        partIds: ['main-vocal'],
      }),
    ],
  }),
  createCue({
    id: 'cue-002',
    startMs: 3000,
    endMs: 5500,
    segments: [
      createSegment({
        id: 'seg-002-main',
        role: 'main',
        text: '우리 목소리',
        partIds: ['main-vocal'],
      }),
      createSegment({
        id: 'seg-002-sub',
        role: 'sub',
        text: '겹쳐',
        partIds: ['upper-harmony'],
      }),
    ],
  }),
  createCue({
    id: 'cue-003',
    startMs: 6500,
    endMs: 8500,
    segments: [
      createSegment({
        id: 'seg-003-main',
        role: 'main',
        text: '높이 올라가',
        partIds: ['main-vocal', 'upper-harmony'],
      }),
    ],
  }),
  createCue({
    id: 'cue-004',
    startMs: 8500,
    endMs: 11000,
    segments: [
      createSegment({
        id: 'seg-004-main',
        role: 'main',
        text: '다시 한 번 chorus',
        partIds: ['main-vocal', 'lower-harmony'],
      }),
    ],
  }),
]

const project = {
  schemaVersion: 1,
  app: 'eazy-chorus',
  project: {
    id: 'sample-project-eazy-chorus-demo',
    title: 'Eazy Chorus Demo',
    artist: 'Sample Guide',
    key: 'C',
    bpm: 92,
    memo: 'Milestone 7 검증용 샘플 프로젝트입니다.',
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  },
  settings: {
    clickPreRollMs: 2000,
    defaultPlaybackRate: 1,
    fileSizeWarningMb: 300,
    mobileFileSizeWarningMb: 100,
  },
  media: [
    createMediaTrack({
      id: 'sample-mr',
      role: 'mr',
      title: 'Sample MR',
      variant: 'custom',
      path: 'media/sample-mr.wav',
      volume: 0.8,
    }),
    createMediaTrack({
      id: 'main-vocal-guide',
      role: 'part-audio',
      partId: 'main-vocal',
      title: 'Main Vocal Guide',
      variant: 'guide',
      path: 'media/main-vocal-guide.wav',
      volume: 0.75,
    }),
    createMediaTrack({
      id: 'upper-harmony-guide',
      role: 'part-audio',
      partId: 'upper-harmony',
      title: 'Upper Harmony Guide',
      variant: 'guide',
      path: 'media/upper-harmony-guide.wav',
      volume: 0.7,
    }),
    createMediaTrack({
      id: 'lower-harmony-guide',
      role: 'part-audio',
      partId: 'lower-harmony',
      title: 'Lower Harmony Guide',
      variant: 'guide',
      path: 'media/lower-harmony-guide.wav',
      volume: 0.7,
    }),
  ],
  parts: [
    {
      id: 'main-vocal',
      name: 'Main Vocal',
      color: '#2563EB',
      description: '전체 가사 흐름을 담당하는 기본 멜로디입니다.',
      defaultTrackId: 'main-vocal-guide',
      guidePosition: 'none',
      defaultMarkStyle: 'highlight',
    },
    {
      id: 'upper-harmony',
      name: 'Upper Harmony',
      color: '#0F766E',
      description: '후렴에서 위쪽으로 쌓이는 화음입니다.',
      defaultTrackId: 'upper-harmony-guide',
      guidePosition: 'above',
      defaultMarkStyle: 'line-above',
    },
    {
      id: 'lower-harmony',
      name: 'Lower Harmony',
      color: '#B45309',
      description: '마지막 구간에서 아래쪽을 받쳐 주는 화음입니다.',
      defaultTrackId: 'lower-harmony-guide',
      guidePosition: 'below',
      defaultMarkStyle: 'line-below',
    },
  ],
  lyricDraft: [
    { id: 'draft-001', text: '오래 기다린 이 밤' },
    { id: 'draft-002', text: '우리 목소리 겹쳐' },
    { id: 'draft-003', text: '높이 올라가' },
    { id: 'draft-004', text: '다시 한 번 chorus' },
  ],
  lyricLanes: [
    {
      id: 'lead',
      name: 'Lead',
      order: 1,
      defaultRole: 'main',
    },
  ],
  cues,
  partMarks: [
    createWholeSegmentMark({
      id: 'mark-upper-cue-002',
      cueId: 'cue-002',
      segmentId: 'seg-002-sub',
      partId: 'upper-harmony',
      style: 'line-above',
    }),
    createWholeSegmentMark({
      id: 'mark-upper-cue-003',
      cueId: 'cue-003',
      segmentId: 'seg-003-main',
      partId: 'upper-harmony',
      style: 'highlight',
    }),
    createWholeSegmentMark({
      id: 'mark-lower-cue-004',
      cueId: 'cue-004',
      segmentId: 'seg-004-main',
      partId: 'lower-harmony',
      style: 'line-below',
    }),
  ],
}

await mkdir(outputDir, { recursive: true })

const zip = new JSZip()
zip.file('project.json', JSON.stringify(project, null, 2))
Object.entries(mediaBuffers).forEach(([mediaPath, buffer]) => {
  zip.file(mediaPath, buffer)
})

const archive = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
})
await writeFile(outputPath, archive)

console.log(
  `Wrote ${path.relative(rootDir, outputPath)} (${archive.length} bytes)`,
)

function createMediaTrack({
  id,
  role,
  partId,
  title,
  variant,
  path: mediaPath,
  volume,
}) {
  return {
    id,
    role,
    ...(partId ? { partId } : {}),
    title,
    variant,
    path: mediaPath,
    mimeType: 'audio/wav',
    durationMs,
    sizeBytes: mediaBuffers[mediaPath].byteLength,
    volume,
    muted: false,
    solo: false,
    enabled: true,
  }
}

function createCue({ id, startMs, endMs, segments }) {
  return {
    id,
    laneId: 'lead',
    startMs,
    endMs,
    segments,
  }
}

function createSegment({ id, role, text, partIds }) {
  return {
    id,
    role,
    text,
    partIds,
  }
}

function createWholeSegmentMark({ id, cueId, segmentId, partId, style }) {
  const cue = cues.find((item) => item.id === cueId)
  const segment = cue?.segments.find((item) => item.id === segmentId)

  if (!segment) {
    throw new Error(
      `Unknown segment for sample part mark: ${cueId}/${segmentId}`,
    )
  }

  return {
    id,
    cueId,
    segmentId,
    partId,
    startChar: 0,
    endChar: segment.text.length,
    style,
  }
}

function createWavBuffer({ durationMs, tones }) {
  const sampleRate = 16000
  const channelCount = 1
  const bytesPerSample = 2
  const frameCount = Math.floor((durationMs / 1000) * sampleRate)
  const dataSize = frameCount * channelCount * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channelCount, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28)
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32)
  buffer.writeUInt16LE(bytesPerSample * 8, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let frame = 0; frame < frameCount; frame += 1) {
    const seconds = frame / sampleRate
    const fadeIn = Math.min(1, frame / (sampleRate * 0.05))
    const fadeOut = Math.min(1, (frameCount - frame) / (sampleRate * 0.08))
    const envelope = Math.min(fadeIn, fadeOut)
    const sample = tones.reduce(
      (sum, tone) =>
        sum + Math.sin(2 * Math.PI * tone.frequency * seconds) * tone.gain,
      0,
    )
    const pcm = Math.max(-1, Math.min(1, sample * envelope))
    buffer.writeInt16LE(Math.round(pcm * 32767), 44 + frame * bytesPerSample)
  }

  return buffer
}
