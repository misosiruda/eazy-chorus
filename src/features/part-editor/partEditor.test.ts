import { createNewProject } from '../project-file'
import {
  splitSegmentTextByPartMarks,
  togglePartMark,
  upsertPartMarkAnnotation,
  updateCueSegmentRole,
} from './partEditor'

describe('part-editor feature', () => {
  it('updates Main/Sub role on cue segments', () => {
    const project = createProjectWithCue()

    const nextProject = updateCueSegmentRole(project, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      role: 'sub',
    })

    expect(nextProject.cues[0].segments[0].role).toBe('sub')
  })

  it('toggles the same Part Mark range on and off', () => {
    const project = createProjectWithCue()

    const markedProject = togglePartMark(project, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 5,
    })
    const unmarkedProject = togglePartMark(markedProject, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 5,
    })

    expect(markedProject.partMarks).toEqual([
      expect.objectContaining({
        cueId: 'cue-1',
        segmentId: 'seg-1',
        partId: 'main-vocal',
        startChar: 0,
        endChar: 5,
        style: 'highlight',
      }),
    ])
    expect(unmarkedProject.partMarks).toEqual([])
  })

  it('splits segment text into mark-aware fragments', () => {
    const project = createProjectWithCue()
    const markedProject = togglePartMark(project, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 2,
      endChar: 5,
    })

    expect(
      splitSegmentTextByPartMarks(
        markedProject.cues[0].segments[0],
        markedProject.partMarks,
      ).map((fragment) => ({
        text: fragment.text,
        markCount: fragment.marks.length,
      })),
    ).toEqual([
      { text: '첫번', markCount: 0 },
      { text: '째 가', markCount: 1 },
      { text: '사', markCount: 0 },
    ])
  })

  it('adds and updates a note on a selected Part Mark range', () => {
    const project = createProjectWithCue()

    const annotatedProject = upsertPartMarkAnnotation(project, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 3,
      note: '첫 호흡을 짧게',
    })
    const updatedProject = upsertPartMarkAnnotation(annotatedProject, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 3,
      note: '첫 호흡을 길게',
    })

    expect(annotatedProject.partMarks).toEqual([
      expect.objectContaining({
        cueId: 'cue-1',
        segmentId: 'seg-1',
        partId: 'main-vocal',
        startChar: 0,
        endChar: 3,
        note: '첫 호흡을 짧게',
      }),
    ])
    expect(updatedProject.partMarks).toHaveLength(1)
    expect(updatedProject.partMarks[0]).toEqual(
      expect.objectContaining({
        note: '첫 호흡을 길게',
      }),
    )
  })

  it('keeps annotation marks separate from visual Part Mark toggles', () => {
    const project = createProjectWithCue()

    const annotatedProject = upsertPartMarkAnnotation(project, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 3,
      note: '첫 호흡을 짧게',
    })
    const markedProject = togglePartMark(annotatedProject, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 3,
    })
    const unmarkedProject = togglePartMark(markedProject, {
      cueId: 'cue-1',
      segmentId: 'seg-1',
      partId: 'main-vocal',
      startChar: 0,
      endChar: 3,
    })

    expect(markedProject.partMarks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          note: '첫 호흡을 짧게',
        }),
        expect.not.objectContaining({
          note: expect.any(String),
        }),
      ]),
    )
    expect(markedProject.partMarks).toHaveLength(2)
    expect(unmarkedProject.partMarks).toEqual([
      expect.objectContaining({
        note: '첫 호흡을 짧게',
      }),
    ])
  })
})

function createProjectWithCue() {
  return {
    ...createNewProject({
      id: 'project-001',
      now: new Date('2026-05-06T00:00:00.000Z'),
    }),
    cues: [
      {
        id: 'cue-1',
        laneId: 'lead',
        startMs: 1000,
        endMs: 3000,
        segments: [
          {
            id: 'seg-1',
            role: 'main' as const,
            text: '첫번째 가사',
            partIds: [],
          },
        ],
      },
    ],
  }
}
