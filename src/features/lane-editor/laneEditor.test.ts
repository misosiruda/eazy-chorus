import { createNewProject } from '../project-file'
import {
  createLyricLane,
  findActiveCueIds,
  getNextCueId,
  getNextSyncCueId,
  getSyncCueSequence,
  getTimelineCues,
  placeAllDraftLinesOnLane,
  placeDraftLineOnLane,
  syncCueEnd,
  syncCueStart,
} from './laneEditor'

describe('lane-editor feature', () => {
  it('creates ordered lyric lanes with unique ids', () => {
    const project = createNewProject({
      id: 'project-001',
      now: new Date('2026-05-06T00:00:00.000Z'),
    })

    const lane = createLyricLane({
      name: 'Lead',
      defaultRole: 'sub',
      existingLanes: project.lyricLanes,
    })

    expect(lane).toEqual({
      id: 'lead-2',
      name: 'Lead',
      order: 2,
      defaultRole: 'sub',
    })
  })

  it('places lyric draft lines into lane cues and removes them from draft', () => {
    const project = {
      ...createNewProject({
        id: 'project-001',
        now: new Date('2026-05-06T00:00:00.000Z'),
      }),
      lyricDraft: [
        { id: 'line-1', text: '첫번째 가사' },
        { id: 'line-2', text: '두번째 가사' },
      ],
    }

    const nextProject = placeDraftLineOnLane(project, 'line-1', 'lead')

    expect(nextProject.lyricDraft).toEqual([
      { id: 'line-2', text: '두번째 가사' },
    ])
    expect(nextProject.cues).toEqual([
      expect.objectContaining({
        id: 'cue-line-1',
        laneId: 'lead',
        startMs: 0,
        endMs: 1,
        segments: [
          {
            id: 'cue-line-1-seg-1',
            role: 'main',
            text: '첫번째 가사',
            partIds: ['main-vocal'],
          },
        ],
      }),
    ])
  })

  it('tap-syncs cue start, previous cue end, and explicit gap end', () => {
    const project = placeAllDraftLinesOnLane(
      {
        ...createNewProject({
          id: 'project-001',
          now: new Date('2026-05-06T00:00:00.000Z'),
        }),
        lyricDraft: [
          { id: 'line-1', text: '첫번째 가사' },
          { id: 'line-2', text: '두번째 가사' },
        ],
      },
      'lead',
    )
    const firstCueId = project.cues[0].id
    const secondCueId = getNextCueId(project, firstCueId)

    const firstSynced = syncCueStart(project, firstCueId, 3000)
    const gapSynced = syncCueEnd(firstSynced, firstCueId, 7500)
    const secondSynced = syncCueStart(gapSynced, secondCueId ?? '', 12000)

    expect(secondSynced.cues[0]).toEqual(
      expect.objectContaining({ startMs: 3000, endMs: 7500 }),
    )
    expect(secondSynced.cues[1]).toEqual(
      expect.objectContaining({ startMs: 12000, endMs: 12001 }),
    )
  })

  it('sorts timeline cues and finds active cues by playback position', () => {
    const project = {
      ...createNewProject({
        id: 'project-001',
        now: new Date('2026-05-06T00:00:00.000Z'),
      }),
      lyricLanes: [
        { id: 'lead', name: 'Lead', order: 1, defaultRole: 'main' },
        { id: 'sub', name: 'Sub', order: 2, defaultRole: 'sub' },
      ],
      cues: [
        {
          id: 'cue-sub',
          laneId: 'sub',
          startMs: 1000,
          endMs: 3000,
          segments: [
            { id: 'cue-sub-seg-1', role: 'sub', text: '네?', partIds: [] },
          ],
        },
        {
          id: 'cue-lead',
          laneId: 'lead',
          startMs: 1000,
          endMs: 2400,
          segments: [
            {
              id: 'cue-lead-seg-1',
              role: 'main',
              text: '아가씨',
              partIds: [],
            },
          ],
        },
      ],
    }

    expect(getTimelineCues(project).map((cue) => cue.id)).toEqual([
      'cue-lead',
      'cue-sub',
    ])
    expect(findActiveCueIds(project, 2500)).toEqual(new Set(['cue-sub']))
  })

  it('orders sync cues by lyric source position instead of cue id or time', () => {
    const project = {
      ...createNewProject({
        id: 'project-001',
        now: new Date('2026-05-06T00:00:00.000Z'),
      }),
      cues: [
        {
          id: 'cue-lyric-selection-10-15',
          laneId: 'lead',
          startMs: 0,
          endMs: 1,
          sourceRange: { startChar: 10, endChar: 15 },
          segments: [
            {
              id: 'cue-lyric-selection-10-15-seg-1',
              role: 'main',
              text: '두번째',
              partIds: ['main-vocal'],
            },
          ],
        },
        {
          id: 'cue-lyric-selection-2-7',
          laneId: 'lead',
          startMs: 9000,
          endMs: 12000,
          sourceRange: { startChar: 2, endChar: 7 },
          segments: [
            {
              id: 'cue-lyric-selection-2-7-seg-1',
              role: 'main',
              text: '첫번째',
              partIds: ['main-vocal'],
            },
          ],
        },
      ],
    }

    expect(getSyncCueSequence(project).map((cue) => cue.id)).toEqual([
      'cue-lyric-selection-2-7',
      'cue-lyric-selection-10-15',
    ])
    expect(getNextSyncCueId(project, 'cue-lyric-selection-2-7')).toBe(
      'cue-lyric-selection-10-15',
    )
  })
})
