import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
} from 'react'
import {
  AudioPlaybackEngine,
  createMediaFilePathSet,
  getEffectiveTrackGain,
  getProjectDurationMs,
  selectPartAudioVariant,
  updateProjectWithDecodedDurations,
  type TrackDecodeResult,
} from '../features/audio-engine'
import {
  countExportedLines,
  createLyricDraftLines,
  extractLyricImportBlocks,
  splitEditedLyricLines,
  type ImportBlock,
} from '../features/lyrics-import'
import {
  createLaneEditorSnapshot,
  createLyricLane,
  findActiveCueIds,
  getCueText,
  getLaneCueSequence,
  getNextCueId,
  getPreviousCueId,
  getSortedLanes,
  getTimelineCues,
  placeAllDraftLinesOnLane,
  placeDraftLineOnLane,
  restoreLaneEditorSnapshot,
  syncCueEnd,
  syncCueStart,
  type LaneEditorSnapshot,
} from '../features/lane-editor'
import {
  getPartMarksForSegment,
  splitSegmentTextByPartMarks,
  togglePartMark,
  updateCueSegmentRole,
} from '../features/part-editor'
import {
  createMediaTrack,
  createNewProject,
  createPart,
  exportProjectPackage,
  formatValidationIssue,
  hasValidationErrors,
  importProjectPackage,
  type EazyChorusProject,
  type LyricCue,
  type LyricRole,
  type MediaTrack,
  type MediaVariant,
  type Part,
  type PartMark,
  type ProjectMediaFiles,
  sanitizeFileName,
  touchProject,
  validateProjectPayload,
  type ValidationIssue,
} from '../features/project-file'
import {
  getCueClickTargetMs,
  getFirstActiveTimelineCue,
  getViewerLoopSeekTarget,
  isAbLoopRangeReady,
  type ViewerLoopMode,
  type ViewerPanel,
} from '../features/viewer-mode'

type ProjectMetaTextField = 'title' | 'artist' | 'key' | 'memo'

const MEDIA_VARIANT_OPTIONS: { value: MediaVariant; label: string }[] = [
  { value: 'fx', label: 'FX' },
  { value: 'no-fx', label: 'No FX' },
  { value: 'pitch-corrected', label: 'Pitch corrected' },
  { value: 'guide', label: 'Guide' },
  { value: 'custom', label: 'Custom' },
]

const PLAYBACK_RATE_OPTIONS = [0.75, 0.9, 1, 1.1]
const LANE_ROLE_OPTIONS: { value: LyricRole; label: string }[] = [
  { value: 'main', label: 'Main' },
  { value: 'sub', label: 'Sub' },
]
const PART_MARK_STYLE_OPTIONS: {
  value: Part['defaultMarkStyle']
  label: string
}[] = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'line-above', label: 'Line above' },
  { value: 'line-below', label: 'Line below' },
]
const GUIDE_POSITION_OPTIONS: {
  value: Part['guidePosition']
  label: string
}[] = [
  { value: 'none', label: 'None' },
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
]

type LaneEditorHistory = {
  past: LaneEditorSnapshot[]
  future: LaneEditorSnapshot[]
}

export function HomePage() {
  const [project, setProject] = useState(() => createNewProject())
  const [mediaFiles, setMediaFiles] = useState<ProjectMediaFiles>({})
  const [selectedPartId, setSelectedPartId] = useState(
    () => project.parts[0]?.id ?? '',
  )
  const [selectedVariant, setSelectedVariant] = useState<MediaVariant>('fx')
  const [newPartName, setNewPartName] = useState('')
  const [statusMessage, setStatusMessage] =
    useState('새 프로젝트가 준비되었습니다.')
  const [importIssues, setImportIssues] = useState<ValidationIssue[]>([])
  const [lyricsSource, setLyricsSource] = useState('')
  const [importBlocks, setImportBlocks] = useState<ImportBlock[]>([])
  const [newLaneName, setNewLaneName] = useState('')
  const [newLaneRole, setNewLaneRole] = useState<LyricRole>('main')
  const [selectedLaneId, setSelectedLaneId] = useState(
    () => project.lyricLanes[0]?.id ?? '',
  )
  const [selectedCueId, setSelectedCueId] = useState('')
  const [laneEditorHistory, setLaneEditorHistory] = useState<LaneEditorHistory>(
    {
      past: [],
      future: [],
    },
  )
  const [isExporting, setIsExporting] = useState(false)
  const [audioPositionMs, setAudioPositionMs] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isAudioPreparing, setIsAudioPreparing] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [playbackRate, setPlaybackRate] = useState(
    () => project.settings.defaultPlaybackRate,
  )
  const [viewerPanel, setViewerPanel] = useState<ViewerPanel>('parts')
  const [viewerLoopMode, setViewerLoopMode] = useState<ViewerLoopMode>('off')
  const [abLoopStartMs, setAbLoopStartMs] = useState<number | null>(null)
  const [abLoopEndMs, setAbLoopEndMs] = useState<number | null>(null)
  const [viewerCueLoopId, setViewerCueLoopId] = useState<string | null>(null)
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false)
  const audioEngineRef = useRef<AudioPlaybackEngine | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const mrInputRef = useRef<HTMLInputElement | null>(null)
  const partAudioInputRef = useRef<HTMLInputElement | null>(null)
  const lyricSourcePreviewRef = useRef<HTMLDivElement | null>(null)
  const lyricExtractPreviewRef = useRef<HTMLDivElement | null>(null)
  const viewerStageRef = useRef<HTMLDivElement | null>(null)
  const viewerCueRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const viewerAutoScrollingRef = useRef(false)
  const syncingLyricScrollRef = useRef(false)

  const validationIssues = useMemo(
    () =>
      validateProjectPayload(project, createMediaFilePathSet(mediaFiles))
        .issues,
    [mediaFiles, project],
  )
  const validationErrors = validationIssues.filter(
    (issue) => issue.severity === 'error',
  )
  const validationWarnings = validationIssues.filter(
    (issue) => issue.severity === 'warning',
  )
  const mrTrack = project.media.find((track) => track.role === 'mr')
  const selectedPart =
    project.parts.find((part) => part.id === selectedPartId) ?? project.parts[0]
  const audioDurationMs = getProjectDurationMs(project)
  const activeTrackCount = project.media.filter((track) => track.enabled).length
  const lyricDraft = project.lyricDraft ?? []
  const sortedLanes = useMemo(() => getSortedLanes(project), [project])
  const selectedLane =
    sortedLanes.find((lane) => lane.id === selectedLaneId) ?? sortedLanes[0]
  const selectedLaneCues = useMemo(
    () => (selectedLane ? getLaneCueSequence(project, selectedLane.id) : []),
    [project, selectedLane],
  )
  const selectedCue =
    selectedLaneCues.find((cue) => cue.id === selectedCueId) ??
    selectedLaneCues[0]
  const selectedCueSegmentCount = selectedCue?.segments.length ?? 0
  const timelineCues = useMemo(() => getTimelineCues(project), [project])
  const activeCueIds = useMemo(
    () => findActiveCueIds(project, audioPositionMs),
    [audioPositionMs, project],
  )
  const activeTimelineCue = useMemo(
    () => getFirstActiveTimelineCue(project, audioPositionMs),
    [audioPositionMs, project],
  )
  const selectedTimelineCue =
    timelineCues.find((cue) => cue.id === selectedCueId) ?? timelineCues[0]
  const viewerLoopCue =
    timelineCues.find((cue) => cue.id === viewerCueLoopId) ?? null
  const abLoopReady = isAbLoopRangeReady({
    startMs: abLoopStartMs,
    endMs: abLoopEndMs,
  })
  const canPlayProjectAudio =
    project.media.length > 0 && validationErrors.length === 0
  const extractedLineCount = countExportedLines(importBlocks)
  const partVariantGroups = project.parts
    .map((part) => ({
      part,
      tracks: project.media.filter(
        (track) => track.role === 'part-audio' && track.partId === part.id,
      ),
    }))
    .filter((group) => group.tracks.length > 0)
  const exportDisabled = isExporting || hasValidationErrors(validationIssues)

  function applyDecodedDurations(decodedTracks: readonly TrackDecodeResult[]) {
    setProject((currentProject) =>
      updateProjectWithDecodedDurations(currentProject, decodedTracks),
    )
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableKeyboardTarget(event.target)) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        tapSelectedCueStart()
        return
      }

      if (event.key.toLowerCase() === 'g') {
        event.preventDefault()
        tapSelectedCueEnd()
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        undoLaneEditorChange()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        void seekAudio(audioPositionMs - 2000)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        void seekAudio(audioPositionMs + 2000)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (isAudioPlaying) {
          pauseAudio()
        } else {
          void playAudio()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    audioEngineRef.current?.releaseMissingTracks(
      new Set(project.media.map((track) => track.id)),
    )
  }, [project.media])

  useEffect(() => {
    const audioEngine = audioEngineRef.current
    if (!audioEngine) {
      return
    }

    const syncAudioEngine = async () => {
      try {
        const decodedTracks = await audioEngine.sync({
          tracks: project.media,
          mediaFiles,
          playbackRate,
        })
        applyDecodedDurations(decodedTracks)
        setAudioError('')
      } catch (error) {
        setAudioError(getErrorMessage(error))
        setIsAudioPlaying(false)
      }
    }

    void syncAudioEngine()
  }, [mediaFiles, playbackRate, project.media])

  useEffect(() => {
    if (!isAudioPlaying) {
      return
    }

    const timerId = window.setInterval(() => {
      const audioEngine = audioEngineRef.current
      if (!audioEngine) {
        return
      }

      const nextPositionMs = audioEngine.getPositionMs()
      const loopTargetMs = getViewerLoopSeekTarget(project, nextPositionMs, {
        mode: viewerLoopMode,
        abLoop: {
          startMs: abLoopStartMs,
          endMs: abLoopEndMs,
        },
        cueId: viewerCueLoopId,
      })
      if (loopTargetMs !== null) {
        setAudioPositionMs(loopTargetMs)
        void audioEngine
          .seek(loopTargetMs, {
            tracks: project.media,
            mediaFiles,
            playbackRate,
          })
          .then(applyDecodedDurations)
          .catch((error: unknown) => {
            setAudioError(getErrorMessage(error))
            setIsAudioPlaying(false)
          })
        return
      }

      if (audioDurationMs > 0 && nextPositionMs >= audioDurationMs) {
        audioEngine.pause()
        setAudioPositionMs(audioDurationMs)
        setIsAudioPlaying(false)
        return
      }

      setAudioPositionMs(nextPositionMs)
    }, 120)

    return () => window.clearInterval(timerId)
  }, [
    abLoopEndMs,
    abLoopStartMs,
    audioDurationMs,
    isAudioPlaying,
    mediaFiles,
    playbackRate,
    project,
    viewerCueLoopId,
    viewerLoopMode,
  ])

  useEffect(() => {
    if (isAutoScrollPaused || !activeTimelineCue) {
      return
    }

    const activeCueElement = viewerCueRefs.current[activeTimelineCue.id]
    if (
      !activeCueElement ||
      typeof activeCueElement.scrollIntoView !== 'function'
    ) {
      return
    }

    viewerAutoScrollingRef.current = true
    activeCueElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
    window.setTimeout(() => {
      viewerAutoScrollingRef.current = false
    }, 0)
  }, [activeTimelineCue, isAutoScrollPaused])

  useEffect(() => {
    return () => {
      void audioEngineRef.current?.dispose()
    }
  }, [])

  function getAudioEngine(): AudioPlaybackEngine {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioPlaybackEngine()
    }

    return audioEngineRef.current
  }

  async function playAudio(positionMs = audioPositionMs) {
    if (project.media.length === 0 || validationErrors.length > 0) {
      return
    }

    setIsAudioPreparing(true)
    try {
      const decodedTracks = await getAudioEngine().play({
        tracks: project.media,
        mediaFiles,
        positionMs,
        playbackRate,
      })
      applyDecodedDurations(decodedTracks)
      setAudioPositionMs(positionMs)
      setIsAudioPlaying(true)
      setAudioError('')
      setStatusMessage('오디오 재생을 시작했습니다.')
    } catch (error) {
      setAudioError(getErrorMessage(error))
      setIsAudioPlaying(false)
    } finally {
      setIsAudioPreparing(false)
    }
  }

  function pauseAudio() {
    const nextPositionMs = audioEngineRef.current?.pause() ?? audioPositionMs
    setAudioPositionMs(nextPositionMs)
    setIsAudioPlaying(false)
    setStatusMessage('오디오 재생을 일시정지했습니다.')
  }

  function stopAudio() {
    audioEngineRef.current?.stop()
    setAudioPositionMs(0)
    setIsAudioPlaying(false)
    setStatusMessage('오디오 재생을 정지했습니다.')
  }

  async function replayAudio() {
    await playAudio(0)
  }

  async function seekAudio(positionMs: number) {
    const nextPositionMs = clampPosition(positionMs, audioDurationMs)
    setAudioPositionMs(nextPositionMs)

    if (!audioEngineRef.current?.getState().isPlaying) {
      return
    }

    setIsAudioPreparing(true)
    try {
      const decodedTracks = await audioEngineRef.current.seek(nextPositionMs, {
        tracks: project.media,
        mediaFiles,
        playbackRate,
      })
      applyDecodedDurations(decodedTracks)
      setAudioError('')
    } catch (error) {
      setAudioError(getErrorMessage(error))
      setIsAudioPlaying(false)
    } finally {
      setIsAudioPreparing(false)
    }
  }

  function resetToNewProject() {
    const nextProject = createNewProject()
    audioEngineRef.current?.stop()
    setProject(nextProject)
    setMediaFiles({})
    setSelectedPartId(nextProject.parts[0]?.id ?? '')
    setNewPartName('')
    setImportIssues([])
    setLyricsSource('')
    setImportBlocks([])
    setNewLaneName('')
    setNewLaneRole('main')
    setSelectedLaneId(nextProject.lyricLanes[0]?.id ?? '')
    setSelectedCueId('')
    setLaneEditorHistory({ past: [], future: [] })
    setAudioPositionMs(0)
    setIsAudioPlaying(false)
    setAudioError('')
    setPlaybackRate(nextProject.settings.defaultPlaybackRate)
    setViewerPanel('parts')
    setViewerLoopMode('off')
    setAbLoopStartMs(null)
    setAbLoopEndMs(null)
    setViewerCueLoopId(null)
    setIsAutoScrollPaused(false)
    setStatusMessage('새 프로젝트를 만들었습니다.')
  }

  function updateProjectMeta(field: ProjectMetaTextField, value: string) {
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        project: {
          ...currentProject.project,
          [field]: field === 'title' ? value : value.trim() || undefined,
        },
      }),
    )
  }

  function updateProjectBpm(value: string) {
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        project: {
          ...currentProject.project,
          bpm: value === '' ? undefined : Number(value),
        },
      }),
    )
  }

  function addPart() {
    const nextPart = createPart({
      name: newPartName,
      existingParts: project.parts,
    })

    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        parts: [...currentProject.parts, nextPart],
      }),
    )
    setSelectedPartId(nextPart.id)
    setNewPartName('')
    setStatusMessage(`${nextPart.name} 파트를 추가했습니다.`)
  }

  function updatePart(
    partId: string,
    patch: Partial<
      Pick<
        Part,
        'name' | 'color' | 'description' | 'guidePosition' | 'defaultMarkStyle'
      >
    >,
  ) {
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        parts: currentProject.parts.map((part) =>
          part.id === partId ? { ...part, ...patch } : part,
        ),
      }),
    )
  }

  function updateSelectedCueSegmentRole(segmentId: string, role: LyricRole) {
    if (!selectedCue) {
      setStatusMessage('role을 편집할 cue가 없습니다.')
      return
    }

    const nextProject = updateCueSegmentRole(project, {
      cueId: selectedCue.id,
      segmentId,
      role,
    })
    if (nextProject === project) {
      return
    }

    commitLaneEditorProject(nextProject, `${role} segment role로 변경했습니다.`)
  }

  function toggleSelectedPartMark(
    event: MouseEvent<HTMLSpanElement>,
    cueId: string,
    segmentId: string,
  ) {
    if (!selectedPart) {
      setStatusMessage('Part Mark를 추가할 part가 없습니다.')
      return
    }

    const textRange = getTextSelectionRange(event.currentTarget)
    if (!textRange) {
      return
    }

    const isRemoving = project.partMarks.some(
      (mark) =>
        mark.cueId === cueId &&
        mark.segmentId === segmentId &&
        mark.partId === selectedPart.id &&
        mark.startChar === textRange.startChar &&
        mark.endChar === textRange.endChar,
    )
    const nextProject = togglePartMark(project, {
      cueId,
      segmentId,
      partId: selectedPart.id,
      startChar: textRange.startChar,
      endChar: textRange.endChar,
    })
    if (nextProject === project) {
      return
    }

    commitLaneEditorProject(
      nextProject,
      `${selectedPart.name} Part Mark를 ${isRemoving ? '제거' : '추가'}했습니다.`,
    )
  }

  function extractLyricsSource() {
    const nextBlocks = extractLyricImportBlocks(lyricsSource)
    setImportBlocks(nextBlocks)
    setStatusMessage(
      nextBlocks.length > 0
        ? `${nextBlocks.length}개 lyric import block을 추출했습니다.`
        : '붙여넣은 가사가 없어 추출할 수 없습니다.',
    )
  }

  function updateImportBlockExport(blockId: string, value: string) {
    setImportBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId
          ? { ...block, exportedLines: splitEditedLyricLines(value) }
          : block,
      ),
    )
  }

  function confirmLyricsImport() {
    const nextDraft = createLyricDraftLines(importBlocks)
    if (nextDraft.length === 0) {
      setStatusMessage('확정할 lyric draft가 없습니다.')
      return
    }

    commitLaneEditorProject(
      {
        ...project,
        lyricDraft: nextDraft,
      },
      `${nextDraft.length}줄 lyric draft를 저장했습니다.`,
    )
  }

  function syncLyricPreviewScroll(source: 'source' | 'extract') {
    if (syncingLyricScrollRef.current) {
      return
    }

    const fromElement =
      source === 'source'
        ? lyricSourcePreviewRef.current
        : lyricExtractPreviewRef.current
    const toElement =
      source === 'source'
        ? lyricExtractPreviewRef.current
        : lyricSourcePreviewRef.current
    if (!fromElement || !toElement) {
      return
    }

    syncingLyricScrollRef.current = true
    toElement.scrollTop = fromElement.scrollTop
    toElement.scrollLeft = fromElement.scrollLeft
    window.requestAnimationFrame(() => {
      syncingLyricScrollRef.current = false
    })
  }

  function commitLaneEditorProject(
    nextProject: EazyChorusProject,
    nextStatusMessage: string,
  ) {
    setLaneEditorHistory((currentHistory) => ({
      past: [...currentHistory.past, createLaneEditorSnapshot(project)].slice(
        -50,
      ),
      future: [],
    }))
    setProject(touchProject(nextProject))
    setStatusMessage(nextStatusMessage)
  }

  function addLyricLane() {
    const nextLane = createLyricLane({
      name: newLaneName,
      defaultRole: newLaneRole,
      existingLanes: project.lyricLanes,
    })

    commitLaneEditorProject(
      {
        ...project,
        lyricLanes: [...project.lyricLanes, nextLane],
      },
      `${nextLane.name} lane을 추가했습니다.`,
    )
    setSelectedLaneId(nextLane.id)
    setNewLaneName('')
  }

  function placeDraftLine(draftLineId: string) {
    if (!selectedLane) {
      setStatusMessage('가사를 배치할 lane이 없습니다.')
      return
    }

    const nextProject = placeDraftLineOnLane(
      project,
      draftLineId,
      selectedLane.id,
    )
    if (nextProject === project) {
      setStatusMessage('선택한 lyric draft를 배치할 수 없습니다.')
      return
    }

    const nextCue = nextProject.cues[nextProject.cues.length - 1]
    commitLaneEditorProject(
      nextProject,
      `${selectedLane.name} lane에 cue를 추가했습니다.`,
    )
    setSelectedCueId(nextCue?.id ?? '')
  }

  function placeAllDraftLines() {
    if (!selectedLane) {
      setStatusMessage('가사를 배치할 lane이 없습니다.')
      return
    }

    const draftCount = project.lyricDraft.length
    const nextProject = placeAllDraftLinesOnLane(project, selectedLane.id)
    if (nextProject === project) {
      setStatusMessage('배치할 lyric draft가 없습니다.')
      return
    }

    const firstAddedCue = nextProject.cues[project.cues.length]
    commitLaneEditorProject(
      nextProject,
      `${selectedLane.name} lane에 ${draftCount}개 cue를 배치했습니다.`,
    )
    setSelectedCueId(firstAddedCue?.id ?? '')
  }

  function tapSelectedCueStart() {
    if (!selectedCue) {
      setStatusMessage('tap-sync할 cue가 없습니다.')
      return
    }

    const nextProject = syncCueStart(project, selectedCue.id, audioPositionMs)
    const nextCueId = getNextCueId(nextProject, selectedCue.id)
    commitLaneEditorProject(
      nextProject,
      `${formatDuration(audioPositionMs)}에 cue 시작을 입력했습니다.`,
    )
    setSelectedCueId(nextCueId ?? selectedCue.id)
  }

  function tapSelectedCueEnd() {
    if (!selectedCue) {
      setStatusMessage('종료 시간을 입력할 cue가 없습니다.')
      return
    }

    const nextProject = syncCueEnd(project, selectedCue.id, audioPositionMs)
    commitLaneEditorProject(
      nextProject,
      `${formatDuration(audioPositionMs)}에 cue 종료를 입력했습니다.`,
    )
  }

  function selectAdjacentCue(direction: 'previous' | 'next') {
    if (!selectedCue) {
      return
    }

    const adjacentCueId =
      direction === 'previous'
        ? getPreviousCueId(project, selectedCue.id)
        : getNextCueId(project, selectedCue.id)
    if (adjacentCueId) {
      setSelectedCueId(adjacentCueId)
    }
  }

  function undoLaneEditorChange() {
    const previousSnapshot = laneEditorHistory.past.at(-1)
    if (!previousSnapshot) {
      setStatusMessage('되돌릴 lane 편집 이력이 없습니다.')
      return
    }

    const nextPast = laneEditorHistory.past.slice(0, -1)
    setLaneEditorHistory({
      past: nextPast,
      future: [
        createLaneEditorSnapshot(project),
        ...laneEditorHistory.future,
      ].slice(0, 50),
    })
    setProject(
      touchProject(restoreLaneEditorSnapshot(project, previousSnapshot)),
    )
    setStatusMessage('lane 편집을 한 단계 되돌렸습니다.')
  }

  function redoLaneEditorChange() {
    const nextSnapshot = laneEditorHistory.future[0]
    if (!nextSnapshot) {
      setStatusMessage('다시 적용할 lane 편집 이력이 없습니다.')
      return
    }

    setLaneEditorHistory({
      past: [
        ...laneEditorHistory.past,
        createLaneEditorSnapshot(project),
      ].slice(-50),
      future: laneEditorHistory.future.slice(1),
    })
    setProject(touchProject(restoreLaneEditorSnapshot(project, nextSnapshot)))
    setStatusMessage('lane 편집을 다시 적용했습니다.')
  }

  async function addMrFile(file: File | undefined) {
    if (!file) {
      return
    }

    const track = createMediaTrack({
      file,
      role: 'mr',
      variant: 'custom',
      existingPaths: createExistingMediaPathSet(project),
      defaultTitle: 'MR',
    })

    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        media: [
          ...currentProject.media.filter((item) => item.role !== 'mr'),
          track,
        ],
      }),
    )
    const previousMrPaths = project.media
      .filter((item) => item.role === 'mr')
      .map((item) => item.path)
    setMediaFiles((currentFiles) => {
      const nextFiles = { ...currentFiles }
      previousMrPaths.forEach((path) => {
        delete nextFiles[path]
      })
      nextFiles[track.path] = file
      return nextFiles
    })
    setStatusMessage(`${file.name} 파일을 MR로 추가했습니다.`)
  }

  async function addPartAudioFile(file: File | undefined) {
    if (!file || !selectedPartId) {
      return
    }

    const selectedPart = project.parts.find(
      (part) => part.id === selectedPartId,
    )
    const track = createMediaTrack({
      file,
      role: 'part-audio',
      partId: selectedPartId,
      variant: selectedVariant,
      existingPaths: createExistingMediaPathSet(project),
      defaultTitle: selectedPart
        ? `${selectedPart.name} ${selectedVariant}`
        : undefined,
    })

    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        media: [
          ...currentProject.media.map((item) =>
            item.role === 'part-audio' && item.partId === selectedPartId
              ? { ...item, enabled: false }
              : item,
          ),
          track,
        ],
        parts: currentProject.parts.map((part) =>
          part.id === selectedPartId
            ? { ...part, defaultTrackId: track.id }
            : part,
        ),
      }),
    )
    setMediaFiles((currentFiles) => ({
      ...currentFiles,
      [track.path]: file,
    }))
    setStatusMessage(`${file.name} 파일을 파트 음원으로 추가했습니다.`)
  }

  function removeMediaTrack(track: MediaTrack) {
    const nextPositionMs = clampPosition(audioPositionMs, audioDurationMs)
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        media: currentProject.media.filter((item) => item.id !== track.id),
        parts: currentProject.parts.map((part) =>
          part.defaultTrackId === track.id
            ? { ...part, defaultTrackId: undefined }
            : part,
        ),
      }),
    )
    setMediaFiles((currentFiles) => {
      const nextFiles = { ...currentFiles }
      delete nextFiles[track.path]
      return nextFiles
    })
    setAudioPositionMs(nextPositionMs)
    setStatusMessage(`${track.title} 음원을 제거했습니다.`)
  }

  function updateMediaTrackMix(
    trackId: string,
    patch: Partial<Pick<MediaTrack, 'volume' | 'muted' | 'solo' | 'enabled'>>,
  ) {
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        media: currentProject.media.map((track) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      }),
    )
  }

  function updatePartAudioVariant(partId: string, trackId: string | null) {
    setProject((currentProject) =>
      touchProject(selectPartAudioVariant(currentProject, partId, trackId)),
    )
  }

  async function playViewerCue(cue: LyricCue) {
    const targetMs = getCueClickTargetMs(cue, project.settings.clickPreRollMs)
    setSelectedLaneId(cue.laneId)
    setSelectedCueId(cue.id)
    setIsAutoScrollPaused(false)

    if (canPlayProjectAudio) {
      await playAudio(targetMs)
      setStatusMessage(
        `${formatDuration(targetMs)}부터 viewer cue를 재생합니다.`,
      )
      return
    }

    await seekAudio(targetMs)
    setStatusMessage(
      `${formatDuration(targetMs)}로 이동했습니다. 음원을 추가하면 바로 재생됩니다.`,
    )
  }

  function markAbLoopBoundary(boundary: 'start' | 'end') {
    const loopPositionMs = clampPosition(audioPositionMs, audioDurationMs)
    const nextAbLoop = {
      startMs: boundary === 'start' ? loopPositionMs : abLoopStartMs,
      endMs: boundary === 'end' ? loopPositionMs : abLoopEndMs,
    }

    setAbLoopStartMs(nextAbLoop.startMs)
    setAbLoopEndMs(nextAbLoop.endMs)

    if (isAbLoopRangeReady(nextAbLoop)) {
      setViewerLoopMode('ab')
      setStatusMessage(
        `A-B 반복 구간을 ${formatLoopRange(nextAbLoop.startMs, nextAbLoop.endMs)}로 설정했습니다.`,
      )
      return
    }

    setStatusMessage(
      boundary === 'start'
        ? `A 지점을 ${formatDuration(loopPositionMs)}로 설정했습니다.`
        : `B 지점을 ${formatDuration(loopPositionMs)}로 설정했습니다.`,
    )
  }

  function toggleAbLoop() {
    if (viewerLoopMode === 'ab') {
      setViewerLoopMode('off')
      setStatusMessage('A-B 반복을 해제했습니다.')
      return
    }

    const nextAbLoop = { startMs: abLoopStartMs, endMs: abLoopEndMs }
    if (!isAbLoopRangeReady(nextAbLoop)) {
      setStatusMessage('A-B 반복은 A보다 뒤에 있는 B 지점이 필요합니다.')
      return
    }

    setViewerLoopMode('ab')
    setStatusMessage(
      `A-B 반복을 ${formatLoopRange(abLoopStartMs, abLoopEndMs)}로 켰습니다.`,
    )
  }

  function toggleCueLoop() {
    const loopTargetCue = activeTimelineCue ?? selectedTimelineCue
    if (!loopTargetCue) {
      setStatusMessage('반복할 cue가 없습니다.')
      return
    }

    if (viewerLoopMode === 'cue' && viewerCueLoopId === loopTargetCue.id) {
      setViewerLoopMode('off')
      setStatusMessage('현재 cue 반복을 해제했습니다.')
      return
    }

    setViewerCueLoopId(loopTargetCue.id)
    setViewerLoopMode('cue')
    setSelectedLaneId(loopTargetCue.laneId)
    setSelectedCueId(loopTargetCue.id)
    setStatusMessage(`${getCueText(loopTargetCue)} cue 반복을 켰습니다.`)
  }

  function handleViewerScroll() {
    if (viewerAutoScrollingRef.current) {
      return
    }

    setIsAutoScrollPaused(true)
  }

  function resumeViewerAutoScroll() {
    setIsAutoScrollPaused(false)
    setStatusMessage('Viewer auto-scroll을 현재 위치로 재개했습니다.')
  }

  function handleViewerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || isEditableKeyboardTarget(event.target)) {
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      if (isAudioPlaying) {
        pauseAudio()
      } else {
        void playAudio()
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (event.shiftKey) {
        selectTimelineCue('previous')
      } else {
        void seekAudio(audioPositionMs - 2000)
      }
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (event.shiftKey) {
        selectTimelineCue('next')
      } else {
        void seekAudio(audioPositionMs + 2000)
      }
      return
    }

    if (event.key.toLowerCase() === 'l') {
      event.preventDefault()
      toggleAbLoop()
      return
    }

    if (event.key.toLowerCase() === 'm') {
      event.preventDefault()
      setViewerPanel('mixer')
      return
    }

    if (event.key.toLowerCase() === 'p') {
      event.preventDefault()
      setViewerPanel('parts')
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setViewerPanel('parts')
    }
  }

  function selectTimelineCue(direction: 'previous' | 'next') {
    if (!selectedTimelineCue) {
      return
    }

    const currentIndex = timelineCues.findIndex(
      (cue) => cue.id === selectedTimelineCue.id,
    )
    const nextIndex =
      direction === 'previous' ? currentIndex - 1 : currentIndex + 1
    const nextCue = timelineCues[nextIndex]
    if (!nextCue) {
      return
    }

    setSelectedLaneId(nextCue.laneId)
    setSelectedCueId(nextCue.id)
    setIsAutoScrollPaused(false)
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) {
      return
    }

    const result = await importProjectPackage(file)
    setImportIssues(result.issues)

    if (!result.package) {
      setStatusMessage(
        '프로젝트 파일을 열 수 없습니다. validation error를 확인하세요.',
      )
      return
    }

    audioEngineRef.current?.stop()
    setProject(result.package.project)
    setMediaFiles(result.package.mediaFiles)
    setSelectedPartId(result.package.project.parts[0]?.id ?? '')
    setSelectedLaneId(result.package.project.lyricLanes[0]?.id ?? '')
    setSelectedCueId(result.package.project.cues[0]?.id ?? '')
    setLaneEditorHistory({ past: [], future: [] })
    setAudioPositionMs(0)
    setIsAudioPlaying(false)
    setAudioError('')
    setLyricsSource('')
    setImportBlocks([])
    setPlaybackRate(result.package.project.settings.defaultPlaybackRate)
    setViewerPanel('parts')
    setViewerLoopMode('off')
    setAbLoopStartMs(null)
    setAbLoopEndMs(null)
    setViewerCueLoopId(null)
    setIsAutoScrollPaused(false)
    setStatusMessage(`${file.name} 프로젝트를 열었습니다.`)
  }

  async function exportCurrentProject() {
    const projectToExport = touchProject(project)
    setIsExporting(true)

    try {
      const blob = await exportProjectPackage({
        project: projectToExport,
        mediaFiles,
      })
      downloadBlob(
        blob,
        `${sanitizeFileName(projectToExport.project.title)}.eazychorus`,
      )
      setProject(projectToExport)
      setStatusMessage('.eazychorus 프로젝트 파일을 내보냈습니다.')
    } catch {
      setStatusMessage(
        '프로젝트 파일을 내보낼 수 없습니다. validation error를 확인하세요.',
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="workspace-header">
        <div>
          <p className="app-kicker">Eazy Chorus</p>
          <h1>Project File Workspace</h1>
        </div>
        <div className="workspace-actions" aria-label="프로젝트 파일 액션">
          <button type="button" onClick={resetToNewProject}>
            새 프로젝트
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            파일 열기
          </button>
          <button
            type="button"
            onClick={exportCurrentProject}
            disabled={exportDisabled}
          >
            {isExporting ? '내보내는 중' : '.eazychorus 저장'}
          </button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept=".eazychorus,application/zip"
            aria-label=".eazychorus 프로젝트 파일 열기"
            onChange={(event) => {
              void handleImportFile(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
        </div>
      </header>

      <section className="status-strip" aria-live="polite">
        <strong>{statusMessage}</strong>
        <span>
          media {project.media.length}개, part {project.parts.length}개,
          validation error {validationErrors.length}개
        </span>
      </section>

      <div className="workspace-grid">
        <section
          className="workspace-section"
          aria-labelledby="project-meta-title"
        >
          <div className="section-heading">
            <h2 id="project-meta-title">Project Meta</h2>
            <span>{project.project.id}</span>
          </div>

          <div className="form-grid">
            <label>
              제목
              <input
                value={project.project.title}
                onChange={(event) =>
                  updateProjectMeta('title', event.target.value)
                }
              />
            </label>
            <label>
              아티스트
              <input
                value={project.project.artist ?? ''}
                onChange={(event) =>
                  updateProjectMeta('artist', event.target.value)
                }
              />
            </label>
            <label>
              Key
              <input
                value={project.project.key ?? ''}
                onChange={(event) =>
                  updateProjectMeta('key', event.target.value)
                }
              />
            </label>
            <label>
              BPM
              <input
                type="number"
                min="1"
                value={project.project.bpm ?? ''}
                onChange={(event) => updateProjectBpm(event.target.value)}
              />
            </label>
            <label className="wide-field">
              메모
              <textarea
                value={project.project.memo ?? ''}
                rows={3}
                onChange={(event) =>
                  updateProjectMeta('memo', event.target.value)
                }
              />
            </label>
          </div>
        </section>

        <section className="workspace-section" aria-labelledby="media-title">
          <div className="section-heading">
            <h2 id="media-title">Media</h2>
            <span>ZIP 내부 media/ 경로로 저장</span>
          </div>

          <div className="media-import-row">
            <button type="button" onClick={() => mrInputRef.current?.click()}>
              MR 추가
            </button>
            <button
              type="button"
              onClick={() => partAudioInputRef.current?.click()}
              disabled={!selectedPartId}
            >
              파트 음원 추가
            </button>
            <select
              aria-label="파트 음원 대상 파트"
              value={selectedPartId}
              onChange={(event) => setSelectedPartId(event.target.value)}
            >
              {project.parts.map((part) => (
                <option value={part.id} key={part.id}>
                  {part.name}
                </option>
              ))}
            </select>
            <select
              aria-label="파트 음원 variant"
              value={selectedVariant}
              onChange={(event) =>
                setSelectedVariant(event.target.value as MediaVariant)
              }
            >
              {MEDIA_VARIANT_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              ref={mrInputRef}
              className="visually-hidden"
              type="file"
              accept="audio/*"
              aria-label="MR 파일 선택"
              onChange={(event) => {
                void addMrFile(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            <input
              ref={partAudioInputRef}
              className="visually-hidden"
              type="file"
              accept="audio/*"
              aria-label="파트 음원 파일 선택"
              onChange={(event) => {
                void addPartAudioFile(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
            />
          </div>

          <div
            className="media-table"
            role="table"
            aria-label="프로젝트 media 목록"
          >
            <div className="media-row media-row-head" role="row">
              <span role="columnheader">Role</span>
              <span role="columnheader">Title</span>
              <span role="columnheader">Path</span>
              <span role="columnheader">Size</span>
              <span role="columnheader">Action</span>
            </div>
            {project.media.map((track) => (
              <div className="media-row" role="row" key={track.id}>
                <span role="cell">{formatTrackRole(track, project.parts)}</span>
                <span role="cell">{track.title}</span>
                <span role="cell">{track.path}</span>
                <span role="cell">{formatBytes(track.sizeBytes)}</span>
                <span role="cell">
                  <button type="button" onClick={() => removeMediaTrack(track)}>
                    제거
                  </button>
                </span>
              </div>
            ))}
            {project.media.length === 0 ? (
              <p className="empty-state">MR과 보컬 음원을 추가하세요.</p>
            ) : null}
          </div>
        </section>

        <section className="workspace-section" aria-labelledby="audio-title">
          <div className="section-heading">
            <h2 id="audio-title">Audio Engine</h2>
            <span>
              active {activeTrackCount}개 / decoded duration{' '}
              {formatDuration(audioDurationMs)}
            </span>
          </div>

          <div className="transport-panel">
            <div className="transport-actions" aria-label="오디오 재생 컨트롤">
              <button
                type="button"
                onClick={() =>
                  isAudioPlaying ? pauseAudio() : void playAudio()
                }
                disabled={
                  isAudioPreparing ||
                  project.media.length === 0 ||
                  validationErrors.length > 0
                }
              >
                {isAudioPlaying ? '일시정지' : '재생'}
              </button>
              <button
                type="button"
                onClick={stopAudio}
                disabled={isAudioPreparing || project.media.length === 0}
              >
                정지
              </button>
              <button
                type="button"
                onClick={() => void replayAudio()}
                disabled={
                  isAudioPreparing ||
                  project.media.length === 0 ||
                  validationErrors.length > 0
                }
              >
                처음부터
              </button>
              <label>
                속도
                <select
                  value={playbackRate}
                  onChange={(event) =>
                    setPlaybackRate(Number(event.target.value))
                  }
                >
                  {PLAYBACK_RATE_OPTIONS.map((rate) => (
                    <option value={rate} key={rate}>
                      {rate}x
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="seek-control">
              Seek
              <input
                type="range"
                min="0"
                max={Math.max(audioDurationMs, 1)}
                step="100"
                value={clampPosition(audioPositionMs, audioDurationMs)}
                disabled={audioDurationMs === 0}
                onChange={(event) => void seekAudio(Number(event.target.value))}
              />
            </label>
            <div className="transport-time">
              <span>{formatDuration(audioPositionMs)}</span>
              <span>{formatDuration(audioDurationMs)}</span>
            </div>
            {audioError ? (
              <p className="audio-error" role="alert">
                {audioError}
              </p>
            ) : null}
          </div>

          {partVariantGroups.length > 0 ? (
            <div className="variant-switcher">
              <h3>Part audio variant</h3>
              {partVariantGroups.map(({ part, tracks }) => (
                <label key={part.id}>
                  {part.name}
                  <select
                    value={
                      tracks.find((track) => track.enabled)?.id ??
                      part.defaultTrackId ??
                      ''
                    }
                    onChange={(event) =>
                      updatePartAudioVariant(part.id, event.target.value)
                    }
                  >
                    <option value="">사용 안 함</option>
                    {tracks.map((track) => (
                      <option value={track.id} key={track.id}>
                        {track.title} / {track.variant ?? 'custom'}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          <div className="mixer-table" aria-label="오디오 믹서">
            {project.media.map((track) => (
              <div className="mixer-row" key={track.id}>
                <div>
                  <strong>{track.title}</strong>
                  <span>
                    {formatTrackRole(track, project.parts)} · gain{' '}
                    {getEffectiveTrackGain(track, project.media).toFixed(2)}
                  </span>
                </div>
                <label>
                  Volume
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={track.volume}
                    onChange={(event) =>
                      updateMediaTrackMix(track.id, {
                        volume: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={track.muted}
                    onChange={(event) =>
                      updateMediaTrackMix(track.id, {
                        muted: event.target.checked,
                      })
                    }
                  />
                  Mute
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={track.solo}
                    onChange={(event) =>
                      updateMediaTrackMix(track.id, {
                        solo: event.target.checked,
                      })
                    }
                  />
                  Solo
                </label>
                {track.role === 'mr' ? (
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={track.enabled}
                      onChange={(event) =>
                        updateMediaTrackMix(track.id, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                    Active
                  </label>
                ) : (
                  <span className="variant-state">
                    {track.enabled ? 'Active variant' : 'Inactive variant'}
                  </span>
                )}
              </div>
            ))}
            {project.media.length === 0 ? (
              <p className="empty-state">
                음원을 추가하면 Web Audio 재생과 믹서 컨트롤을 사용할 수
                있습니다.
              </p>
            ) : null}
          </div>
        </section>

        <section
          className="workspace-section lyric-import-section"
          aria-labelledby="lyrics-import-title"
        >
          <div className="section-heading">
            <h2 id="lyrics-import-title">Lyric Import</h2>
            <span>
              draft {lyricDraft.length}줄 / block {importBlocks.length}개
            </span>
          </div>

          <label className="wide-field">
            원본 가사 붙여넣기
            <textarea
              value={lyricsSource}
              rows={8}
              placeholder="일본어 가사&#10;한글 차음&#10;한국어 해석"
              onChange={(event) => setLyricsSource(event.target.value)}
            />
          </label>

          <div className="lyric-import-actions">
            <button type="button" onClick={extractLyricsSource}>
              가사 추출
            </button>
            <button
              type="button"
              onClick={confirmLyricsImport}
              disabled={extractedLineCount === 0}
            >
              추출 결과 확정
            </button>
            <span>{extractedLineCount}줄 추출됨</span>
          </div>

          {importBlocks.length > 0 ? (
            <div className="lyric-confirm-grid">
              <div>
                <h3>원본 가사</h3>
                <div
                  ref={lyricSourcePreviewRef}
                  className="lyric-scroll-column"
                  role="region"
                  aria-label="원본 가사 비교"
                  onScroll={() => syncLyricPreviewScroll('source')}
                >
                  {importBlocks.map((block, index) => (
                    <div
                      className={`lyric-import-block lyric-import-block-${block.confidence}`}
                      key={block.id}
                    >
                      <div className="lyric-block-meta">
                        #{index + 1} {block.pattern} / {block.confidence}
                      </div>
                      {block.sourceLines.map((line, lineIndex) => (
                        <p key={`${block.id}-source-${lineIndex}`}>{line}</p>
                      ))}
                      {block.warnings.length > 0 ? (
                        <ul>
                          {block.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>추출된 가사</h3>
                <div
                  ref={lyricExtractPreviewRef}
                  className="lyric-scroll-column"
                  role="region"
                  aria-label="추출된 가사 편집"
                  onScroll={() => syncLyricPreviewScroll('extract')}
                >
                  {importBlocks.map((block, index) => (
                    <label
                      className={`lyric-import-block lyric-import-block-${block.confidence}`}
                      key={block.id}
                    >
                      추출 block {index + 1}
                      <textarea
                        rows={Math.max(2, block.exportedLines.length)}
                        value={block.exportedLines.join('\n')}
                        onChange={(event) =>
                          updateImportBlockExport(block.id, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {lyricDraft.length > 0 ? (
            <div className="lyric-draft-preview">
              <h3>Lyric draft</h3>
              <ol>
                {lyricDraft.slice(0, 8).map((line) => (
                  <li key={line.id}>{line.text}</li>
                ))}
              </ol>
              {lyricDraft.length > 8 ? (
                <p>외 {lyricDraft.length - 8}줄</p>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">
              확정된 lyric draft가 없습니다. 추출 결과를 확인한 뒤 저장하세요.
            </p>
          )}
        </section>

        <section
          className="workspace-section lane-editor-section"
          aria-labelledby="lane-editor-title"
        >
          <div className="section-heading">
            <h2 id="lane-editor-title">Lane & Tap Sync</h2>
            <span>
              lane {project.lyricLanes.length}개 / cue {project.cues.length}개
            </span>
          </div>

          <div className="lane-editor-layout">
            <div className="lane-control-panel">
              <h3>Lane</h3>
              <div className="lane-add-row">
                <input
                  aria-label="새 lane 이름"
                  placeholder="새 lane 이름"
                  value={newLaneName}
                  onChange={(event) => setNewLaneName(event.target.value)}
                />
                <select
                  aria-label="새 lane 기본 role"
                  value={newLaneRole}
                  onChange={(event) =>
                    setNewLaneRole(event.target.value as LyricRole)
                  }
                >
                  {LANE_ROLE_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addLyricLane}>
                  Lane 추가
                </button>
              </div>

              <div className="lane-pill-list" aria-label="lyric lane 목록">
                {sortedLanes.map((lane) => (
                  <button
                    className={
                      lane.id === selectedLane?.id
                        ? 'lane-pill lane-pill-active'
                        : 'lane-pill'
                    }
                    type="button"
                    aria-pressed={lane.id === selectedLane?.id}
                    key={lane.id}
                    onClick={() => setSelectedLaneId(lane.id)}
                  >
                    <span>{lane.name}</span>
                    <small>
                      {lane.defaultRole} ·{' '}
                      {getLaneCueSequence(project, lane.id).length} cue
                    </small>
                  </button>
                ))}
              </div>
            </div>

            <div className="draft-queue-panel">
              <div className="panel-title-row">
                <h3>Lyric draft queue</h3>
                <button
                  type="button"
                  onClick={placeAllDraftLines}
                  disabled={!selectedLane || lyricDraft.length === 0}
                >
                  전체 배치
                </button>
              </div>
              <div className="draft-line-list">
                {lyricDraft.map((line) => (
                  <div className="draft-line-item" key={line.id}>
                    <p>{line.text}</p>
                    <button
                      type="button"
                      aria-label={`${selectedLane?.name ?? '선택 lane'}에 배치: ${
                        line.text
                      }`}
                      onClick={() => placeDraftLine(line.id)}
                      disabled={!selectedLane}
                    >
                      배치
                    </button>
                  </div>
                ))}
                {lyricDraft.length === 0 ? (
                  <p className="empty-state">
                    대기 중인 lyric draft가 없습니다.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="tap-sync-panel">
            <div className="panel-title-row">
              <h3>{selectedLane?.name ?? 'Lane'} cues</h3>
              <span>{selectedCue ? formatCueRange(selectedCue) : '-'}</span>
            </div>

            <div className="tap-sync-actions" aria-label="tap sync actions">
              <button
                type="button"
                onClick={() => selectAdjacentCue('previous')}
                disabled={
                  !selectedCue || !getPreviousCueId(project, selectedCue.id)
                }
              >
                이전 cue
              </button>
              <button
                type="button"
                onClick={tapSelectedCueStart}
                disabled={!selectedCue}
                aria-keyshortcuts="Space"
                title="Space"
              >
                현재 시간 시작
              </button>
              <button
                type="button"
                onClick={tapSelectedCueEnd}
                disabled={!selectedCue}
                aria-keyshortcuts="G"
                title="G"
              >
                현재 cue 종료
              </button>
              <button
                type="button"
                onClick={() => selectAdjacentCue('next')}
                disabled={
                  !selectedCue || !getNextCueId(project, selectedCue.id)
                }
              >
                다음 cue
              </button>
              <button
                type="button"
                onClick={undoLaneEditorChange}
                disabled={laneEditorHistory.past.length === 0}
                aria-keyshortcuts="Backspace"
                title="Backspace"
              >
                실행 취소
              </button>
              <button
                type="button"
                onClick={redoLaneEditorChange}
                disabled={laneEditorHistory.future.length === 0}
              >
                다시 실행
              </button>
            </div>

            <ol className="cue-list">
              {selectedLaneCues.map((cue, index) => (
                <li
                  className={
                    cue.id === selectedCue?.id
                      ? 'cue-list-item cue-list-item-active'
                      : 'cue-list-item'
                  }
                  key={cue.id}
                >
                  <button
                    className="cue-select-button"
                    type="button"
                    onClick={() => setSelectedCueId(cue.id)}
                  >
                    <span>#{index + 1}</span>
                    <strong>{getCueText(cue)}</strong>
                    <small>{formatCueRange(cue)}</small>
                    <small>{formatCueState(cue)}</small>
                  </button>
                </li>
              ))}
            </ol>
            {selectedLaneCues.length === 0 ? (
              <p className="empty-state">
                선택한 lane에 배치된 cue가 없습니다.
              </p>
            ) : null}
          </div>

          <div className="part-mark-editor-panel">
            <div className="panel-title-row">
              <h3>Part Mark Editor</h3>
              <span>
                segment {selectedCueSegmentCount}개 / mark{' '}
                {project.partMarks.length}개
              </span>
            </div>

            <div className="part-mark-control-row">
              <label>
                Mark 대상 Part
                <select
                  value={selectedPart?.id ?? ''}
                  onChange={(event) => setSelectedPartId(event.target.value)}
                >
                  {project.parts.map((part) => (
                    <option value={part.id} key={part.id}>
                      {part.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                기본 mark
                <select
                  value={selectedPart?.defaultMarkStyle ?? 'highlight'}
                  disabled={!selectedPart}
                  onChange={(event) =>
                    selectedPart
                      ? updatePart(selectedPart.id, {
                          defaultMarkStyle: event.target
                            .value as Part['defaultMarkStyle'],
                        })
                      : undefined
                  }
                >
                  {PART_MARK_STYLE_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedCue ? (
              <div className="segment-editor-list">
                {selectedCue.segments.map((segment) => {
                  const segmentMarks = getPartMarksForSegment(
                    project.partMarks,
                    selectedCue.id,
                    segment.id,
                  )

                  return (
                    <div className="segment-editor-row" key={segment.id}>
                      <label>
                        Role
                        <select
                          aria-label={`${segment.text} segment role`}
                          value={segment.role}
                          onChange={(event) =>
                            updateSelectedCueSegmentRole(
                              segment.id,
                              event.target.value as LyricRole,
                            )
                          }
                        >
                          {LANE_ROLE_OPTIONS.map((option) => (
                            <option value={option.value} key={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span
                        className={`segment-select-text segment-select-text-${segment.role}`}
                        onMouseUp={(event) =>
                          toggleSelectedPartMark(
                            event,
                            selectedCue.id,
                            segment.id,
                          )
                        }
                      >
                        {segment.text}
                      </span>
                      <div className="part-mark-chip-list">
                        {segmentMarks.map((mark) => (
                          <span
                            className="part-mark-chip"
                            key={mark.id}
                            style={createPartSwatchStyle(mark, project.parts)}
                          >
                            {formatPartMarkLabel(mark, project.parts)}
                          </span>
                        ))}
                        {segmentMarks.length === 0 ? (
                          <span className="part-mark-chip-empty">
                            Part Mark 없음
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="empty-state">편집할 cue가 없습니다.</p>
            )}
          </div>
        </section>

        <section
          className="workspace-section viewer-mode-section"
          aria-labelledby="viewer-mode-title"
          onKeyDown={handleViewerKeyDown}
        >
          <div className="section-heading">
            <h2 id="viewer-mode-title">Viewer Mode</h2>
            <span>
              {timelineCues.length} cue / auto-scroll{' '}
              {isAutoScrollPaused ? 'paused' : 'on'}
            </span>
          </div>

          <div className="viewer-mode-layout">
            <div className="viewer-main">
              <div
                ref={viewerStageRef}
                className="viewer-lyrics-stage"
                aria-label="viewer lyrics document"
                tabIndex={0}
                onScroll={handleViewerScroll}
              >
                {timelineCues.map((cue) => (
                  <button
                    ref={(element) => {
                      viewerCueRefs.current[cue.id] = element
                    }}
                    className={
                      activeCueIds.has(cue.id)
                        ? 'viewer-cue viewer-cue-active'
                        : 'viewer-cue'
                    }
                    type="button"
                    key={cue.id}
                    onClick={() => void playViewerCue(cue)}
                  >
                    <span className="viewer-cue-range">
                      {formatCueRange(cue)}
                    </span>
                    <ViewerCueText
                      cue={cue}
                      parts={project.parts}
                      partMarks={project.partMarks}
                    />
                  </button>
                ))}
                {timelineCues.length === 0 ? (
                  <p className="empty-state">표시할 cue가 없습니다.</p>
                ) : null}
              </div>

              {isAutoScrollPaused ? (
                <button
                  className="viewer-resume-scroll"
                  type="button"
                  onClick={resumeViewerAutoScroll}
                >
                  현재 위치로
                </button>
              ) : null}
            </div>

            <aside className="viewer-side-panel" aria-label="viewer side panel">
              <div className="viewer-panel-tabs">
                <button
                  type="button"
                  aria-pressed={viewerPanel === 'parts'}
                  onClick={() => setViewerPanel('parts')}
                >
                  Parts
                </button>
                <button
                  type="button"
                  aria-pressed={viewerPanel === 'mixer'}
                  onClick={() => setViewerPanel('mixer')}
                >
                  Mixer
                </button>
              </div>

              {viewerPanel === 'parts' ? (
                <div className="viewer-parts-panel">
                  {project.parts.map((part) => {
                    const partTracks = project.media.filter(
                      (track) =>
                        track.role === 'part-audio' && track.partId === part.id,
                    )

                    return (
                      <article className="viewer-part-item" key={part.id}>
                        <div className="viewer-part-heading">
                          <span
                            className="viewer-part-color"
                            style={{ backgroundColor: part.color }}
                          />
                          <strong>{part.name}</strong>
                        </div>
                        <p>{part.description || '파트 설명 없음'}</p>
                        <dl>
                          <div>
                            <dt>Mark</dt>
                            <dd>{part.defaultMarkStyle}</dd>
                          </div>
                          <div>
                            <dt>Guide</dt>
                            <dd>{part.guidePosition}</dd>
                          </div>
                          <div>
                            <dt>Variant</dt>
                            <dd>
                              {partTracks.length > 0
                                ? partTracks
                                    .map((track) => track.variant ?? 'custom')
                                    .join(', ')
                                : '연결 없음'}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="viewer-mixer-panel">
                  {partVariantGroups.length > 0 ? (
                    <div className="viewer-variant-list">
                      {partVariantGroups.map(({ part, tracks }) => (
                        <label key={part.id}>
                          {part.name}
                          <select
                            value={
                              tracks.find((track) => track.enabled)?.id ??
                              part.defaultTrackId ??
                              ''
                            }
                            onChange={(event) =>
                              updatePartAudioVariant(
                                part.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">사용 안 함</option>
                            {tracks.map((track) => (
                              <option value={track.id} key={track.id}>
                                {track.title} / {track.variant ?? 'custom'}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  ) : null}

                  <div className="viewer-track-list">
                    {project.media.map((track) => (
                      <div className="viewer-track-row" key={track.id}>
                        <div>
                          <strong>{track.title}</strong>
                          <span>{formatTrackRole(track, project.parts)}</span>
                        </div>
                        <label>
                          Volume
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={track.volume}
                            onChange={(event) =>
                              updateMediaTrackMix(track.id, {
                                volume: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={track.muted}
                            onChange={(event) =>
                              updateMediaTrackMix(track.id, {
                                muted: event.target.checked,
                              })
                            }
                          />
                          Mute
                        </label>
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={track.solo}
                            onChange={(event) =>
                              updateMediaTrackMix(track.id, {
                                solo: event.target.checked,
                              })
                            }
                          />
                          Solo
                        </label>
                      </div>
                    ))}
                    {project.media.length === 0 ? (
                      <p className="empty-state">
                        음원을 추가하면 Viewer Mixer를 사용할 수 있습니다.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </aside>
          </div>

          <div className="viewer-playbar" aria-label="viewer playbar">
            <button
              type="button"
              onClick={() => (isAudioPlaying ? pauseAudio() : void playAudio())}
              disabled={isAudioPreparing || !canPlayProjectAudio}
            >
              {isAudioPlaying ? 'Pause' : 'Play'}
            </button>
            <div className="viewer-time">
              <span>{formatDuration(audioPositionMs)}</span>
              <span>{formatDuration(audioDurationMs)}</span>
            </div>
            <label className="viewer-seek-control">
              Seek
              <input
                type="range"
                min="0"
                max={Math.max(audioDurationMs, 1)}
                step="100"
                value={clampPosition(audioPositionMs, audioDurationMs)}
                disabled={audioDurationMs === 0}
                onChange={(event) => void seekAudio(Number(event.target.value))}
              />
            </label>
            <button type="button" onClick={() => markAbLoopBoundary('start')}>
              A {formatDuration(abLoopStartMs ?? 0)}
            </button>
            <button type="button" onClick={() => markAbLoopBoundary('end')}>
              B {formatDuration(abLoopEndMs ?? 0)}
            </button>
            <button
              type="button"
              aria-pressed={viewerLoopMode === 'ab'}
              disabled={!abLoopReady}
              onClick={toggleAbLoop}
            >
              A-B Loop
            </button>
            <button
              type="button"
              aria-pressed={viewerLoopMode === 'cue'}
              disabled={!selectedTimelineCue && !activeTimelineCue}
              onClick={toggleCueLoop}
            >
              Cue Loop
            </button>
            <label>
              Rate
              <select
                value={playbackRate}
                onChange={(event) =>
                  setPlaybackRate(Number(event.target.value))
                }
              >
                {PLAYBACK_RATE_OPTIONS.map((rate) => (
                  <option value={rate} key={rate}>
                    {rate}x
                  </option>
                ))}
              </select>
            </label>
            <div className="viewer-loop-state">
              {viewerLoopMode === 'ab'
                ? `A-B ${formatLoopRange(abLoopStartMs, abLoopEndMs)}`
                : viewerLoopMode === 'cue' && viewerLoopCue
                  ? `Cue ${getCueText(viewerLoopCue)}`
                  : 'Loop off'}
            </div>
          </div>
        </section>

        <section className="workspace-section" aria-labelledby="parts-title">
          <div className="section-heading">
            <h2 id="parts-title">Parts</h2>
            <span>{mrTrack ? 'MR 포함됨' : 'MR 필요'}</span>
          </div>

          <div className="part-add-row">
            <input
              aria-label="새 part 이름"
              placeholder="새 part 이름"
              value={newPartName}
              onChange={(event) => setNewPartName(event.target.value)}
            />
            <button type="button" onClick={addPart}>
              Part 추가
            </button>
          </div>

          <div className="part-list">
            {project.parts.map((part) => {
              const partTracks = project.media.filter(
                (track) =>
                  track.role === 'part-audio' && track.partId === part.id,
              )

              return (
                <div className="part-item" key={part.id}>
                  <div className="part-summary-row">
                    <input
                      aria-label={`${part.name} 색상`}
                      className="part-color"
                      type="color"
                      value={part.color}
                      onChange={(event) =>
                        updatePart(part.id, { color: event.target.value })
                      }
                    />
                    <label>
                      Part 이름
                      <input
                        value={part.name}
                        onChange={(event) =>
                          updatePart(part.id, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Audio variant 연결
                      <select
                        value={part.defaultTrackId ?? ''}
                        onChange={(event) =>
                          updatePartAudioVariant(
                            part.id,
                            event.target.value || null,
                          )
                        }
                      >
                        <option value="">연결 없음</option>
                        {partTracks.map((track) => (
                          <option value={track.id} key={track.id}>
                            {track.title} / {track.variant ?? 'custom'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    설명
                    <textarea
                      rows={2}
                      value={part.description ?? ''}
                      onChange={(event) =>
                        updatePart(part.id, {
                          description: event.target.value.trim() || undefined,
                        })
                      }
                    />
                  </label>

                  <div className="part-config-row">
                    <label>
                      Guide 위치
                      <select
                        value={part.guidePosition}
                        onChange={(event) =>
                          updatePart(part.id, {
                            guidePosition: event.target
                              .value as Part['guidePosition'],
                          })
                        }
                      >
                        {GUIDE_POSITION_OPTIONS.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Mark style
                      <select
                        value={part.defaultMarkStyle}
                        onChange={(event) =>
                          updatePart(part.id, {
                            defaultMarkStyle: event.target
                              .value as Part['defaultMarkStyle'],
                          })
                        }
                      >
                        {PART_MARK_STYLE_OPTIONS.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span>
                      {partTracks.length > 0
                        ? `${partTracks.length}개 variant`
                        : '연결된 variant 없음'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section
          className="workspace-section"
          aria-labelledby="validation-title"
        >
          <div className="section-heading">
            <h2 id="validation-title">Validation</h2>
            <span>project.json + media 참조 검사</span>
          </div>

          <ValidationList
            title="현재 프로젝트"
            issues={validationIssues}
            emptyMessage="현재 프로젝트는 export 가능합니다."
          />
          <ValidationList
            title="최근 import"
            issues={importIssues}
            emptyMessage="최근 import validation error가 없습니다."
          />
          {validationWarnings.length > 0 ? (
            <p className="validation-note">
              warning은 저장을 막지 않지만 프로젝트 파일을 공유하기 전에
              확인하세요.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function ViewerCueText({
  cue,
  parts,
  partMarks,
}: {
  cue: LyricCue
  parts: readonly Part[]
  partMarks: readonly PartMark[]
}) {
  return (
    <span className="viewer-cue-text">
      {cue.segments.map((segment, segmentIndex) => {
        const segmentMarks = getPartMarksForSegment(
          partMarks,
          cue.id,
          segment.id,
        )
        const fragments = splitSegmentTextByPartMarks(segment, segmentMarks)

        return (
          <span
            className={`viewer-segment viewer-segment-${segment.role}`}
            key={segment.id}
          >
            {segmentIndex > 0 ? (
              <span className="viewer-segment-gap"> </span>
            ) : null}
            {fragments.map((fragment) => (
              <span
                className={
                  fragment.marks.length > 0
                    ? 'part-mark-fragment part-mark-fragment-marked'
                    : 'part-mark-fragment'
                }
                key={`${segment.id}-${fragment.startChar}-${fragment.endChar}`}
                style={createPartMarkFragmentStyle(fragment.marks, parts)}
                title={formatPartMarkTitle(fragment.marks, parts)}
              >
                {fragment.text}
              </span>
            ))}
          </span>
        )
      })}
    </span>
  )
}

function ValidationList({
  title,
  issues,
  emptyMessage,
}: {
  title: string
  issues: readonly ValidationIssue[]
  emptyMessage: string
}) {
  return (
    <div className="validation-list">
      <h3>{title}</h3>
      {issues.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <ul>
          {issues.map((issue, index) => (
            <li
              className={`validation-${issue.severity}`}
              key={`${issue.path}-${index}`}
            >
              {formatValidationIssue(issue)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type TextSelectionRange = {
  startChar: number
  endChar: number
}

function getTextSelectionRange(
  element: HTMLElement,
): TextSelectionRange | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const selectionRange = selection.getRangeAt(0)
  if (
    !element.contains(selectionRange.startContainer) ||
    !element.contains(selectionRange.endContainer)
  ) {
    return null
  }

  const startChar = getSelectionTextLengthBefore(element, {
    node: selectionRange.startContainer,
    offset: selectionRange.startOffset,
  })
  const endChar = getSelectionTextLengthBefore(element, {
    node: selectionRange.endContainer,
    offset: selectionRange.endOffset,
  })
  selection.removeAllRanges()

  return {
    startChar: Math.min(startChar, endChar),
    endChar: Math.max(startChar, endChar),
  }
}

function getSelectionTextLengthBefore(
  element: HTMLElement,
  boundary: { node: Node; offset: number },
): number {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(boundary.node, boundary.offset)
  return range.toString().length
}

function createExistingMediaPathSet(project: EazyChorusProject): Set<string> {
  return new Set(project.media.map((track) => track.path))
}

function createPartMarkFragmentStyle(
  marks: readonly PartMark[],
  parts: readonly Part[],
): CSSProperties {
  const highlightMark = marks.find((mark) => mark.style === 'highlight')
  const lineAboveMark = marks.find((mark) => mark.style === 'line-above')
  const lineBelowMark = marks.find((mark) => mark.style === 'line-below')
  const style: CSSProperties = {}

  if (highlightMark) {
    style.backgroundColor = `${getPartColor(highlightMark.partId, parts)}33`
  }
  if (lineAboveMark) {
    style.borderTop = `3px solid ${getPartColor(lineAboveMark.partId, parts)}`
  }
  if (lineBelowMark) {
    style.borderBottom = `3px solid ${getPartColor(lineBelowMark.partId, parts)}`
  }

  return style
}

function createPartSwatchStyle(
  mark: PartMark,
  parts: readonly Part[],
): CSSProperties {
  const color = getPartColor(mark.partId, parts)

  return {
    borderColor: color,
    backgroundColor: `${color}20`,
  }
}

function formatPartMarkLabel(mark: PartMark, parts: readonly Part[]): string {
  const partName =
    parts.find((part) => part.id === mark.partId)?.name ?? mark.partId

  return `${partName} ${mark.startChar}-${mark.endChar}`
}

function formatPartMarkTitle(
  marks: readonly PartMark[],
  parts: readonly Part[],
): string | undefined {
  return marks.length > 0
    ? marks.map((mark) => formatPartMarkLabel(mark, parts)).join(', ')
    : undefined
}

function getPartColor(partId: string, parts: readonly Part[]): string {
  return parts.find((part) => part.id === partId)?.color ?? '#64748b'
}

function formatTrackRole(track: MediaTrack, parts: readonly Part[]): string {
  if (track.role === 'mr') {
    return 'MR'
  }

  const part = parts.find((item) => item.id === track.partId)
  return `${part?.name ?? track.partId ?? 'Part'} / ${track.variant ?? 'custom'}`
}

function formatBytes(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) {
    return '-'
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(durationMs: number): string {
  const safeDurationMs = Math.max(0, Math.floor(durationMs))
  const totalSeconds = Math.floor(safeDurationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatLoopRange(startMs: number | null, endMs: number | null): string {
  return `${formatDuration(startMs ?? 0)} - ${formatDuration(endMs ?? 0)}`
}

function formatCueRange(cue: LyricCue): string {
  return `${formatDuration(cue.startMs)} - ${formatDuration(cue.endMs)}`
}

function formatCueState(cue: LyricCue): string {
  return cue.startMs === 0 && cue.endMs - cue.startMs <= 1
    ? 'unsynced'
    : 'synced'
}

function clampPosition(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(positionMs)) {
    return 0
  }

  if (durationMs <= 0) {
    return Math.max(0, positionMs)
  }

  return Math.min(durationMs, Math.max(0, positionMs))
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '오디오 재생 중 알 수 없는 오류가 발생했습니다.'
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
