import { createNewProject, type EazyChorusProject } from '../project-file'
import {
  getCueClickTargetMs,
  getFirstActiveTimelineCue,
  getViewerLoopSeekTarget,
  isAbLoopRangeReady,
} from './viewerMode'

describe('viewer-mode feature', () => {
  it('starts cue click playback from the configured pre-roll without going below zero', () => {
    const project = createViewerFixture()

    expect(getCueClickTargetMs(project.cues[0], 2000)).toBe(0)
    expect(getCueClickTargetMs(project.cues[1], 2000)).toBe(4000)
  })

  it('resolves the first active cue in timeline order', () => {
    const project = createViewerFixture()

    expect(getFirstActiveTimelineCue(project, 6500)?.id).toBe('cue-main-2')
  })

  it('loops to A when playback reaches the B boundary', () => {
    const project = createViewerFixture()

    expect(
      getViewerLoopSeekTarget(project, 9000, {
        mode: 'ab',
        abLoop: { startMs: 2500, endMs: 9000 },
        cueId: null,
      }),
    ).toBe(2500)
  })

  it('loops to the selected cue start when cue repeat reaches cue end', () => {
    const project = createViewerFixture()

    expect(
      getViewerLoopSeekTarget(project, 11000, {
        mode: 'cue',
        abLoop: { startMs: null, endMs: null },
        cueId: 'cue-main-2',
      }),
    ).toBe(6000)
  })

  it('requires A-B loop end to be later than start', () => {
    expect(isAbLoopRangeReady({ startMs: 9000, endMs: 2500 })).toBe(false)
    expect(isAbLoopRangeReady({ startMs: 2500, endMs: 9000 })).toBe(true)
  })
})

function createViewerFixture(): EazyChorusProject {
  return {
    ...createNewProject({
      id: 'project-001',
      now: new Date('2026-05-06T00:00:00.000Z'),
    }),
    lyricLanes: [
      { id: 'main', name: 'Main', order: 1, defaultRole: 'main' },
      { id: 'sub', name: 'Sub', order: 2, defaultRole: 'sub' },
    ],
    cues: [
      {
        id: 'cue-main-1',
        laneId: 'main',
        startMs: 1000,
        endMs: 5000,
        segments: [
          {
            id: 'cue-main-1-seg-1',
            role: 'main',
            text: '첫번째 가사',
            partIds: [],
          },
        ],
      },
      {
        id: 'cue-sub-1',
        laneId: 'sub',
        startMs: 6000,
        endMs: 10000,
        segments: [
          {
            id: 'cue-sub-1-seg-1',
            role: 'sub',
            text: '어째서?',
            partIds: [],
          },
        ],
      },
      {
        id: 'cue-main-2',
        laneId: 'main',
        startMs: 6000,
        endMs: 11000,
        segments: [
          {
            id: 'cue-main-2-seg-1',
            role: 'main',
            text: '두번째 가사',
            partIds: [],
          },
        ],
      },
    ],
  }
}
