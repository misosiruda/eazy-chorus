import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createMediaTrack,
  createNewProject,
  exportProjectPackage,
  importProjectPackage,
  validateProjectPayload,
  type EazyChorusProject,
  type ProjectMediaFiles,
} from '.'

describe('project-file feature', () => {
  it('validates project.json references against included media paths', () => {
    const { project, mediaFiles } = createProjectPackageFixture()

    const validation = validateProjectPayload(
      project,
      new Set(Object.keys(mediaFiles)),
    )

    expect(validation.project?.project.title).toBe('Roundtrip Song')
    expect(validation.issues).toEqual([])
  })

  it('normalizes missing part harmony levels from older project payloads', () => {
    const { project, mediaFiles } = createProjectPackageFixture()
    const legacyProject = {
      ...project,
      parts: project.parts.map((part) => {
        const legacyPart = { ...part } as Record<string, unknown>
        delete legacyPart.harmonyLevel
        return legacyPart
      }),
    }

    const validation = validateProjectPayload(
      legacyProject,
      new Set(Object.keys(mediaFiles)),
    )

    expect(validation.issues).toEqual([])
    expect(validation.project?.parts[0].harmonyLevel).toBe(1)
  })

  it('rejects invalid part harmony levels', () => {
    const { project, mediaFiles } = createProjectPackageFixture()

    const validation = validateProjectPayload(
      {
        ...project,
        parts: project.parts.map((part) =>
          part.id === 'main-vocal' ? { ...part, harmonyLevel: 0 } : part,
        ),
      },
      new Set(Object.keys(mediaFiles)),
    )

    expect(validation.project).toBeNull()
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        path: 'parts[0].harmonyLevel',
        message: '1 이상의 정수여야 합니다.',
      }),
    )
  })

  it('exports and imports a .eazychorus ZIP package with media restored', async () => {
    const packageFixture = createProjectPackageFixture()

    const exportedBlob = await exportProjectPackage(packageFixture)
    const exportedFile = await createProjectFile(
      exportedBlob,
      'roundtrip.eazychorus',
    )
    const imported = await importProjectPackage(exportedFile)

    expect(imported.issues).toEqual([])
    expect(imported.package?.project.project.title).toBe('Roundtrip Song')
    expect(imported.package?.project.lyricDraft).toEqual([
      { id: 'lyric-draft-1', text: '키미노 나오 욘다' },
    ])
    expect(imported.package?.project.partMarks).toEqual([
      {
        id: 'mark-1',
        cueId: 'cue-001',
        segmentId: 'seg-001',
        partId: 'main-vocal',
        startChar: 0,
        endChar: 5,
        style: 'highlight',
        note: '첫 호흡을 짧게',
      },
    ])
    expect(imported.package?.project.media).toHaveLength(2)
    expect(Object.keys(imported.package?.mediaFiles ?? {}).sort()).toEqual([
      'media/mr.mp3',
      'media/vocal-fx.wav',
    ])
  })

  it('reports a validation error when project.json references missing media', async () => {
    const { project } = createProjectPackageFixture()
    const zip = new JSZip()
    zip.file('project.json', JSON.stringify(project))
    zip.file('media/mr.mp3', 'mr-audio')
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    const imported = await importProjectPackage(
      await createProjectFile(zipBlob, 'missing-media.eazychorus'),
    )

    expect(imported.package).toBeNull()
    expect(imported.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          path: 'media[1].path',
          message: 'ZIP 내부에 media 파일이 없습니다: media/vocal-fx.wav',
        }),
      ]),
    )
  })

  it('validates lyric lane part references', () => {
    const { project, mediaFiles } = createProjectPackageFixture()
    const invalidProject: EazyChorusProject = {
      ...project,
      lyricLanes: [{ ...project.lyricLanes[0], partId: 'ghost-part' }],
    }

    const validation = validateProjectPayload(
      invalidProject,
      new Set(Object.keys(mediaFiles)),
    )

    expect(validation.project).toBeNull()
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          path: 'lyricLanes[0].partId',
          message: '존재하지 않는 part id입니다: ghost-part',
        }),
      ]),
    )
  })

  it('imports the published sample .eazychorus package', async () => {
    const sampleBytes = await readFile(
      resolve('public/samples/eazy-chorus-demo.eazychorus'),
    )
    const imported = await importProjectPackage(
      new File([copyBytes(sampleBytes)], 'eazy-chorus-demo.eazychorus', {
        type: 'application/zip',
      }),
    )

    expect(
      imported.issues.filter((issue) => issue.severity === 'error'),
    ).toEqual([])
    expect(imported.package?.project.project.title).toBe('Eazy Chorus Demo')
    expect(imported.package?.project.cues).toHaveLength(4)
    expect(imported.package?.project.partMarks).toHaveLength(3)
    expect(Object.keys(imported.package?.mediaFiles ?? {}).sort()).toEqual([
      'media/lower-harmony-guide.wav',
      'media/main-vocal-guide.wav',
      'media/sample-mr.wav',
      'media/upper-harmony-guide.wav',
    ])
  })
})

function createProjectPackageFixture(): {
  project: EazyChorusProject
  mediaFiles: ProjectMediaFiles
} {
  const baseProject = createNewProject({
    id: 'project-001',
    now: new Date('2026-05-06T00:00:00.000Z'),
  })
  const mrFile = new File(['mr-audio'], 'mr.mp3', { type: 'audio/mpeg' })
  const vocalFile = new File(['vocal-audio'], 'vocal-fx.wav', {
    type: 'audio/wav',
  })
  const mrTrack = createMediaTrack({
    file: mrFile,
    role: 'mr',
    variant: 'custom',
    existingPaths: new Set(),
    defaultTitle: 'MR',
  })
  const vocalTrack = createMediaTrack({
    file: vocalFile,
    role: 'part-audio',
    partId: 'main-vocal',
    variant: 'fx',
    existingPaths: new Set([mrTrack.path]),
    defaultTitle: 'Main Vocal FX',
  })

  const project: EazyChorusProject = {
    ...baseProject,
    project: {
      ...baseProject.project,
      title: 'Roundtrip Song',
    },
    media: [mrTrack, vocalTrack],
    parts: baseProject.parts.map((part) =>
      part.id === 'main-vocal'
        ? { ...part, defaultTrackId: vocalTrack.id }
        : part,
    ),
    lyricDraft: [{ id: 'lyric-draft-1', text: '키미노 나오 욘다' }],
    cues: [
      {
        id: 'cue-001',
        laneId: 'lead',
        startMs: 1000,
        endMs: 3000,
        segments: [
          {
            id: 'seg-001',
            role: 'main',
            text: '키미노 나오 욘다',
            partIds: ['main-vocal'],
          },
        ],
      },
    ],
    partMarks: [
      {
        id: 'mark-1',
        cueId: 'cue-001',
        segmentId: 'seg-001',
        partId: 'main-vocal',
        startChar: 0,
        endChar: 5,
        style: 'highlight',
        note: '첫 호흡을 짧게',
      },
    ],
  }

  return {
    project,
    mediaFiles: {
      [mrTrack.path]: mrFile,
      [vocalTrack.path]: vocalFile,
    },
  }
}

async function createProjectFile(blob: Blob, fileName: string): Promise<File> {
  return new File(
    [copyBytes(new Uint8Array(await blob.arrayBuffer()))],
    fileName,
  )
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}
