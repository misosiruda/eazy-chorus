import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AudioPlaybackEngine,
  createMediaFilePathSet,
  getEffectiveTrackGain,
  getProjectDurationMs,
  getSyncPlaybackTracks,
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
  createCueFromTextSelection,
  createLyricLane,
  findActiveCueIds,
  getCueText,
  getLaneCueSequence,
  getNextSyncCueId,
  getSortedLanes,
  getSyncCueSequence,
  getTimelineCues,
  isCueOpenForSync,
  restoreLaneEditorSnapshot,
  syncCueEnd,
  syncCueStart,
  type LaneEditorSnapshot,
} from '../features/lane-editor'
import {
  getPartMarksForSegment,
  splitSegmentTextByPartMarks,
  togglePartMark,
  upsertPartMarkAnnotation,
  type PartMarkTextFragment,
} from '../features/part-editor'
import {
  createLyricDraftDocumentText,
  createLyricDraftLineRanges,
  createLyricSegmentSourceFromSelectionRange,
  createMediaTrack,
  createNewProject,
  createPart,
  exportProjectPackage,
  formatValidationIssue,
  hasValidationErrors,
  importProjectPackage,
  type EazyChorusProject,
  type LyricCue,
  type LyricCueSourceRange,
  type LyricDraftLineRange,
  type LyricDraftSelectionRange,
  type LyricDraftLine,
  type LyricLane,
  type MediaTrack,
  type MediaVariant,
  type Part,
  type PartMark,
  type ProjectMediaFiles,
  resolveLyricSegmentSourceRange,
  sanitizeFileName,
  syncProjectLyricSegmentTexts,
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
type WorkspaceMode = 'editor' | 'practice'
type EditorWizardStep =
  | 'project'
  | 'audio'
  | 'lyrics'
  | 'lanes'
  | 'harmony'
  | 'sync'
  | 'notes'
  | 'preview'
type ViewerPartFocusMode = 'all' | 'lane' | 'marks'
type PendingPreviewAnnotation = {
  partId: string
  targets: PartMarkDocumentTarget[]
  selectedText: string
  note: string
}

const WORKSPACE_PAGE_OPTIONS: {
  value: WorkspaceMode
  label: string
  path: string
}[] = [
  { value: 'editor', label: '편집자', path: '/editor' },
  { value: 'practice', label: '연습자', path: '/practice' },
]

const EDITOR_WIZARD_STEPS: { value: EditorWizardStep; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'audio', label: 'Audio' },
  { value: 'lyrics', label: 'Lyrics' },
  { value: 'lanes', label: 'Lane' },
  { value: 'harmony', label: 'Sub' },
  { value: 'sync', label: 'Sync' },
  { value: 'notes', label: 'Notes' },
  { value: 'preview', label: 'Preview' },
]

const MEDIA_VARIANT_OPTIONS: { value: MediaVariant; label: string }[] = [
  { value: 'fx', label: 'FX' },
  { value: 'no-fx', label: 'No FX' },
  { value: 'pitch-corrected', label: 'Pitch corrected' },
  { value: 'guide', label: 'Guide' },
  { value: 'custom', label: 'Custom' },
]

const PLAYBACK_RATE_OPTIONS = [0.75, 0.9, 1, 1.1]
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
const MIN_HARMONY_LEVEL = 1
const MAX_HARMONY_LEVEL = 8
const HARMONY_LEVEL_OPTIONS = Array.from(
  { length: MAX_HARMONY_LEVEL - MIN_HARMONY_LEVEL + 1 },
  (_, index) => MIN_HARMONY_LEVEL + index,
)
const SAMPLE_PROJECT_FILE_NAME = 'eazy-chorus-demo.eazychorus'
const SAMPLE_PROJECT_URL = `${import.meta.env.BASE_URL}samples/${SAMPLE_PROJECT_FILE_NAME}`

type LaneEditorHistory = {
  past: LaneEditorSnapshot[]
  future: LaneEditorSnapshot[]
}

export function HomePage() {
  const location = useLocation()
  const workspaceMode: WorkspaceMode = location.pathname.startsWith('/practice')
    ? 'practice'
    : 'editor'
  const [editorWizardStep, setEditorWizardStep] =
    useState<EditorWizardStep>('project')
  const [project, setProject] = useState(() => createNewProject())
  const [mediaFiles, setMediaFiles] = useState<ProjectMediaFiles>({})
  const [selectedPartId, setSelectedPartId] = useState(
    () => project.parts[0]?.id ?? '',
  )
  const [selectedVariant, setSelectedVariant] = useState<MediaVariant>('fx')
  const [newPartName, setNewPartName] = useState('')
  const [statusMessage, setStatusMessage] =
    useState('새 프로젝트가 준비되었습니다.')
  const [isWorkspaceSidebarOpen, setIsWorkspaceSidebarOpen] = useState(true)
  const [importIssues, setImportIssues] = useState<ValidationIssue[]>([])
  const [lyricsSource, setLyricsSource] = useState('')
  const [importBlocks, setImportBlocks] = useState<ImportBlock[]>([])
  const [lyricDraftEditorState, setLyricDraftEditorState] = useState({
    sourceText: '',
    editorText: '',
  })
  const [newLaneName, setNewLaneName] = useState('')
  const [newLanePartId, setNewLanePartId] = useState(
    () => project.parts[0]?.id ?? '',
  )
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
  const [isProjectFileBusy, setIsProjectFileBusy] = useState(false)
  const [projectFileBusyMessage, setProjectFileBusyMessage] = useState(
    '프로젝트 파일을 처리하는 중입니다.',
  )
  const [audioPositionMs, setAudioPositionMs] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isAudioPreparing, setIsAudioPreparing] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [playbackRate, setPlaybackRate] = useState(
    () => project.settings.defaultPlaybackRate,
  )
  const [viewerPanel, setViewerPanel] = useState<ViewerPanel>('parts')
  const [viewerFocusedPartId, setViewerFocusedPartId] = useState<string | null>(
    null,
  )
  const [viewerLoopMode, setViewerLoopMode] = useState<ViewerLoopMode>('off')
  const [abLoopStartMs, setAbLoopStartMs] = useState<number | null>(null)
  const [abLoopEndMs, setAbLoopEndMs] = useState<number | null>(null)
  const [viewerCueLoopId, setViewerCueLoopId] = useState<string | null>(null)
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false)
  const [pendingPreviewAnnotation, setPendingPreviewAnnotation] =
    useState<PendingPreviewAnnotation | null>(null)
  const audioEngineRef = useRef<AudioPlaybackEngine | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const previewAnnotationTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const lyricSourcePreviewRef = useRef<HTMLDivElement | null>(null)
  const lyricExtractPreviewRef = useRef<HTMLDivElement | null>(null)
  const viewerStageRef = useRef<HTMLDivElement | null>(null)
  const viewerCueRefs = useRef<Record<string, HTMLElement | null>>({})
  const viewerAutoScrollingRef = useRef(false)
  const viewerSelectionHandledRef = useRef(false)
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
  const pendingPreviewAnnotationPart = pendingPreviewAnnotation
    ? project.parts.find((part) => part.id === pendingPreviewAnnotation.partId)
    : null
  const selectedPartAnnotations = useMemo(
    () =>
      selectedPart
        ? project.partMarks.filter(
            (mark) =>
              mark.partId === selectedPart.id &&
              typeof mark.note === 'string' &&
              mark.note.trim().length > 0,
          )
        : [],
    [project.partMarks, selectedPart],
  )
  const effectiveViewerFocusedPartId =
    viewerFocusedPartId &&
    project.parts.some((part) => part.id === viewerFocusedPartId)
      ? viewerFocusedPartId
      : null
  const audioDurationMs = getProjectDurationMs(project)
  const activeTrackCount = project.media.filter((track) => track.enabled).length
  const lyricDraft = project.lyricDraft
  const lyricDraftDocumentText = createLyricDraftDocumentText(lyricDraft)
  const lyricDraftEditorText =
    lyricDraftEditorState.sourceText === lyricDraftDocumentText
      ? lyricDraftEditorState.editorText
      : lyricDraftDocumentText
  const lyricDraftLineRanges = useMemo(
    () => createLyricDraftLineRanges(lyricDraft),
    [lyricDraft],
  )
  const sortedLanes = useMemo(() => getSortedLanes(project), [project])
  const selectedLane =
    sortedLanes.find((lane) => lane.id === selectedLaneId) ?? sortedLanes[0]
  const timelineCues = useMemo(() => getTimelineCues(project), [project])
  const syncCues = useMemo(() => getSyncCueSequence(project), [project])
  const selectedCue =
    syncCues.find((cue) => cue.id === selectedCueId) ?? syncCues[0]
  const lyricDocumentHighlights = useMemo(
    () =>
      createLyricDocumentHighlights({
        documentText: lyricDraftDocumentText,
        lineRanges: lyricDraftLineRanges,
        cues: timelineCues,
        project,
      }),
    [lyricDraftDocumentText, lyricDraftLineRanges, project, timelineCues],
  )
  const lyricDocumentFragments = useMemo(
    () =>
      splitLyricDocumentByHighlights(
        lyricDraftDocumentText,
        lyricDocumentHighlights,
      ),
    [lyricDraftDocumentText, lyricDocumentHighlights],
  )
  const partMarkDocumentHighlights = useMemo(
    () =>
      createPartMarkDocumentHighlights({
        documentText: lyricDraftDocumentText,
        lineRanges: lyricDraftLineRanges,
        cues: timelineCues,
        partMarks: project.partMarks.filter(
          (mark) => mark.partId === selectedPartId && isVisualPartMark(mark),
        ),
        project,
      }),
    [
      lyricDraftDocumentText,
      lyricDraftLineRanges,
      project,
      selectedPartId,
      timelineCues,
    ],
  )
  const harmonyDocumentFragments = useMemo(
    () =>
      splitHarmonyDocumentByHighlights({
        documentText: lyricDraftDocumentText,
        partMarkHighlights: partMarkDocumentHighlights,
      }),
    [lyricDraftDocumentText, partMarkDocumentHighlights],
  )
  const activeCueIds = useMemo(
    () => findActiveCueIds(project, audioPositionMs),
    [audioPositionMs, project],
  )
  const viewerFocusedLaneIds = useMemo(
    () =>
      new Set(
        effectiveViewerFocusedPartId
          ? project.lyricLanes
              .filter((lane) => lane.partId === effectiveViewerFocusedPartId)
              .map((lane) => lane.id)
          : [],
      ),
    [effectiveViewerFocusedPartId, project.lyricLanes],
  )
  const viewerPartFocusMode: ViewerPartFocusMode = effectiveViewerFocusedPartId
    ? viewerFocusedLaneIds.size > 0
      ? 'lane'
      : 'marks'
    : 'all'
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
  const currentPlaybackTracks = useMemo(
    () =>
      workspaceMode === 'editor' && editorWizardStep === 'sync'
        ? getSyncPlaybackTracks(project)
        : project.media,
    [editorWizardStep, project, workspaceMode],
  )
  const canPlayProjectAudio =
    currentPlaybackTracks.some((track) => track.enabled) &&
    validationErrors.length === 0
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
  const isEditorMode = workspaceMode === 'editor'
  const isEditorNotesStep = isEditorMode && editorWizardStep === 'notes'
  const isViewerSurfaceVisible =
    !isEditorMode || editorWizardStep === 'preview' || isEditorNotesStep
  const workspaceTitle = isEditorMode ? 'Editor Wizard' : 'Practice Viewer'
  const editorWizardStepIndex = Math.max(
    EDITOR_WIZARD_STEPS.findIndex((step) => step.value === editorWizardStep),
    0,
  )

  function applyDecodedDurations(decodedTracks: readonly TrackDecodeResult[]) {
    setProject((currentProject) =>
      updateProjectWithDecodedDurations(currentProject, decodedTracks),
    )
  }

  function getEditorWizardStepSummary(step: EditorWizardStep): string {
    if (step === 'project') {
      return 'meta'
    }

    if (step === 'audio') {
      return `media ${project.media.length}개 / part ${project.parts.length}개`
    }

    if (step === 'lyrics') {
      return `draft ${lyricDraft.length}줄`
    }

    if (step === 'lanes') {
      return `lane ${project.lyricLanes.length}개`
    }

    if (step === 'harmony') {
      return `mark ${project.partMarks.length}개`
    }

    if (step === 'sync') {
      const syncedCueCount = project.cues.filter(
        (cue) => cue.endMs - cue.startMs > 1,
      ).length
      return `synced ${syncedCueCount}/${project.cues.length}`
    }

    if (step === 'notes') {
      const noteCount = project.partMarks.filter(hasPartMarkNote).length
      return `note ${noteCount}개`
    }

    return `error ${validationErrors.length}개`
  }

  function moveEditorWizardStep(direction: -1 | 1) {
    const nextIndex = editorWizardStepIndex + direction
    const nextStep = EDITOR_WIZARD_STEPS[nextIndex]
    if (!nextStep) {
      return
    }

    setEditorWizardStep(nextStep.value)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return
      }

      if (
        isEditorMode &&
        editorWizardStep === 'sync' &&
        event.code === 'Space' &&
        !isTextEntryKeyboardTarget(event.target)
      ) {
        event.preventDefault()
        tapSelectedCueStart()
        return
      }

      if (isEditableKeyboardTarget(event.target)) {
        return
      }

      if (isEditorNotesStep) {
        return
      }

      if (isEditorMode) {
        if (editorWizardStep === 'sync' && event.key.toLowerCase() === 'g') {
          event.preventDefault()
          tapSelectedCueEnd()
          return
        }

        if (event.key === 'Backspace') {
          event.preventDefault()
          undoLaneEditorChange()
          return
        }
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
    if (!pendingPreviewAnnotation) {
      return
    }

    previewAnnotationTextareaRef.current?.focus()
  }, [pendingPreviewAnnotation])

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
          tracks: currentPlaybackTracks,
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
  }, [currentPlaybackTracks, mediaFiles, playbackRate])

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
    if (!canPlayProjectAudio) {
      return
    }

    setIsAudioPreparing(true)
    try {
      const decodedTracks = await getAudioEngine().play({
        tracks: currentPlaybackTracks,
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
        tracks: currentPlaybackTracks,
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
    setNewLanePartId(nextProject.parts[0]?.id ?? '')
    setSelectedLaneId(nextProject.lyricLanes[0]?.id ?? '')
    setSelectedCueId('')
    setLaneEditorHistory({ past: [], future: [] })
    setAudioPositionMs(0)
    setIsAudioPlaying(false)
    setAudioError('')
    setPlaybackRate(nextProject.settings.defaultPlaybackRate)
    setViewerPanel('parts')
    setViewerFocusedPartId(null)
    setViewerLoopMode('off')
    setAbLoopStartMs(null)
    setAbLoopEndMs(null)
    setViewerCueLoopId(null)
    setIsAutoScrollPaused(false)
    setPendingPreviewAnnotation(null)
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
    setNewLanePartId(nextPart.id)
    setNewPartName('')
    setStatusMessage(`${nextPart.name} 파트를 추가했습니다.`)
  }

  function updatePart(
    partId: string,
    patch: Partial<
      Pick<
        Part,
        | 'name'
        | 'color'
        | 'description'
        | 'guidePosition'
        | 'defaultMarkStyle'
        | 'harmonyLevel'
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

  function removePart(partId: string) {
    const part = project.parts.find((item) => item.id === partId)
    if (!part) {
      return
    }

    const linkedTrackCount = project.media.filter(
      (track) => track.role === 'part-audio' && track.partId === partId,
    ).length
    if (linkedTrackCount > 0) {
      setStatusMessage('연결된 음원을 먼저 제거한 뒤 Part를 제거하세요.')
      return
    }

    const fallbackPartId =
      project.parts.find((item) => item.id !== partId)?.id ?? ''

    setProject((currentProject) =>
      touchProject(removePartReferences(currentProject, partId)),
    )
    setSelectedPartId((currentPartId) =>
      currentPartId === partId ? fallbackPartId : currentPartId,
    )
    setNewLanePartId((currentPartId) =>
      currentPartId === partId ? fallbackPartId : currentPartId,
    )
    setStatusMessage(`${part.name} part를 제거했습니다.`)
  }

  function toggleSelectedPartMarkFromDocument(
    event: MouseEvent<HTMLDivElement>,
  ) {
    if (!selectedPart) {
      setStatusMessage('Part Mark를 추가할 part가 없습니다.')
      return
    }

    const selectedRange = trimTextSelectionRange(
      lyricDraftDocumentText,
      getTextSelectionRange(event.currentTarget),
    )
    if (!selectedRange) {
      setStatusMessage('왼쪽 가사에서 드래그로 Sub 범위를 선택하세요.')
      return
    }

    const markTargets = createPartMarkTargetsFromDocumentSelection({
      documentText: lyricDraftDocumentText,
      lineRanges: lyricDraftLineRanges,
      cues: timelineCues,
      selectionRange: selectedRange,
    })
    if (markTargets.length === 0) {
      setStatusMessage(
        'Lane에서 Main cue로 지정된 가사만 Sub 표시할 수 있습니다.',
      )
      return
    }

    const isRemoving = markTargets.every((target) =>
      project.partMarks.some(
        (mark) =>
          mark.cueId === target.cueId &&
          mark.segmentId === target.segmentId &&
          mark.partId === selectedPart.id &&
          mark.startChar === target.startChar &&
          mark.endChar === target.endChar,
      ),
    )
    const nextProject = markTargets.reduce(
      (currentProject, target) =>
        togglePartMark(currentProject, {
          cueId: target.cueId,
          segmentId: target.segmentId,
          partId: selectedPart.id,
          startChar: target.startChar,
          endChar: target.endChar,
        }),
      project,
    )
    if (nextProject === project) {
      return
    }

    commitLaneEditorProject(
      nextProject,
      `${selectedPart.name} Sub를 ${isRemoving ? '제거' : '표시'}했습니다.`,
    )
    setSelectedCueId(markTargets[0].cueId)
  }

  function annotatePreviewSelection(event: MouseEvent<HTMLDivElement>) {
    if (!isEditorNotesStep) {
      return
    }

    const selectedText = window.getSelection()?.toString().trim() ?? ''
    const annotationTargets = createPartMarkTargetsFromViewerSelection(
      event.currentTarget,
    )
    if (annotationTargets.length === 0) {
      return
    }

    viewerSelectionHandledRef.current = true
    window.setTimeout(() => {
      viewerSelectionHandledRef.current = false
    }, 0)

    if (!selectedPart) {
      setStatusMessage('주석을 추가할 part가 없습니다.')
      clearTextSelection()
      return
    }

    setPendingPreviewAnnotation({
      partId: selectedPart.id,
      targets: annotationTargets,
      selectedText,
      note: '',
    })
    setSelectedCueId(annotationTargets[0].cueId)
    setViewerFocusedPartId(selectedPart.id)
    setStatusMessage(`${selectedPart.name} 주석 범위를 선택했습니다.`)
    clearTextSelection()
  }

  function updatePendingPreviewAnnotationNote(note: string) {
    setPendingPreviewAnnotation((currentAnnotation) =>
      currentAnnotation ? { ...currentAnnotation, note } : currentAnnotation,
    )
  }

  function closePreviewAnnotationDialog() {
    setPendingPreviewAnnotation(null)
  }

  function savePendingPreviewAnnotation() {
    if (!pendingPreviewAnnotation) {
      return
    }

    const part = project.parts.find(
      (item) => item.id === pendingPreviewAnnotation.partId,
    )
    if (!part) {
      setStatusMessage('주석을 추가할 part가 없습니다.')
      setPendingPreviewAnnotation(null)
      return
    }

    const note = pendingPreviewAnnotation.note.trim()
    if (note.length === 0) {
      setStatusMessage('Notes 주석 내용을 입력하세요.')
      return
    }

    const nextProject = pendingPreviewAnnotation.targets.reduce(
      (currentProject, target) =>
        upsertPartMarkAnnotation(currentProject, {
          cueId: target.cueId,
          segmentId: target.segmentId,
          partId: part.id,
          startChar: target.startChar,
          endChar: target.endChar,
          note,
        }),
      project,
    )
    if (nextProject === project) {
      setPendingPreviewAnnotation(null)
      return
    }

    commitLaneEditorProject(
      nextProject,
      `${part.name} 주석 ${pendingPreviewAnnotation.targets.length}개를 저장했습니다.`,
    )
    setSelectedCueId(pendingPreviewAnnotation.targets[0].cueId)
    setViewerFocusedPartId(part.id)
    setPendingPreviewAnnotation(null)
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
      syncProjectLyricSegmentTexts({
        ...project,
        lyricDraft: nextDraft,
      }),
      `${nextDraft.length}줄 lyric draft를 저장했습니다.`,
    )
  }

  function saveLyricDraftEdit() {
    const nextDraft = createLyricDraftFromEditedText(
      lyricDraftEditorText,
      lyricDraft,
    )

    commitLaneEditorProject(
      syncProjectLyricSegmentTexts({
        ...project,
        lyricDraft: nextDraft,
      }),
      nextDraft.length > 0
        ? `${nextDraft.length}줄 lyric draft를 수정했습니다.`
        : 'lyric draft를 비웠습니다.',
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
    const lanePartId = newLanePartId || selectedPartId || project.parts[0]?.id
    const nextLane = createLyricLane({
      name: newLaneName,
      defaultRole: 'main',
      existingLanes: project.lyricLanes,
      partId: lanePartId,
    })

    commitLaneEditorProject(
      {
        ...project,
        lyricLanes: [...project.lyricLanes, nextLane],
      },
      `${nextLane.name} lane을 추가했습니다.`,
    )
    setSelectedLaneId(nextLane.id)
    if (lanePartId) {
      setSelectedPartId(lanePartId)
    }
    setNewLaneName('')
  }

  function updateLyricLanePart(laneId: string, partId: string) {
    const lane = project.lyricLanes.find((item) => item.id === laneId)
    const part = project.parts.find((item) => item.id === partId)
    if (!lane || !part) {
      return
    }

    commitLaneEditorProject(
      {
        ...project,
        lyricLanes: project.lyricLanes.map((item) =>
          item.id === laneId ? { ...item, partId } : item,
        ),
        cues: project.cues.map((cue) =>
          cue.laneId === laneId
            ? {
                ...cue,
                segments: cue.segments.map((segment) =>
                  segment.role === 'main'
                    ? { ...segment, partIds: [partId] }
                    : segment,
                ),
              }
            : cue,
        ),
      },
      `${lane.name} lane을 ${part.name} part에 연결했습니다.`,
    )
    setSelectedLaneId(laneId)
    setSelectedPartId(partId)
  }

  function assignLyricDocumentSelectionToLane(
    event: MouseEvent<HTMLDivElement>,
  ) {
    if (!selectedLane) {
      setStatusMessage('가사를 매칭할 lane이 없습니다.')
      return
    }

    const selectedRange = trimTextSelectionRange(
      lyricDraftDocumentText,
      getTextSelectionRange(event.currentTarget),
    )
    if (!selectedRange) {
      setStatusMessage('왼쪽 가사에서 드래그로 Main 범위를 선택하세요.')
      return
    }

    const selectedLineRanges = splitRangeByLyricDraftLines({
      documentText: lyricDraftDocumentText,
      lineRanges: lyricDraftLineRanges,
      range: selectedRange,
    })
    if (selectedLineRanges.length === 0) {
      setStatusMessage('왼쪽 가사에서 드래그로 Main 범위를 선택하세요.')
      return
    }
    const matchingHighlights = findMatchingLaneHighlights({
      highlights: lyricDocumentHighlights,
      laneId: selectedLane.id,
      range: selectedRange,
    })
    const unmatchedLineRanges = selectedLineRanges.filter(
      (range) =>
        !matchingHighlights.some((highlight) =>
          rangesOverlap(highlight, range),
        ),
    )
    const shouldLinkExistingSelection =
      matchingHighlights.length > 0 && unmatchedLineRanges.length > 0

    if (shouldLinkExistingSelection) {
      const linkId =
        matchingHighlights.find((highlight) => highlight.linkId)?.linkId ??
        createCueLinkId(selectedLane.id, selectedRange)
      const matchingCueIds = new Set(
        matchingHighlights.map((highlight) => highlight.id),
      )
      const linkedExistingCues = project.cues.map((cue) =>
        matchingCueIds.has(cue.id) ? { ...cue, linkId } : cue,
      )
      const nextCues = createCuesForRanges({
        documentText: lyricDraftDocumentText,
        ranges: unmatchedLineRanges,
        lane: selectedLane,
        existingCues: linkedExistingCues,
        linkId,
      })

      commitLaneEditorProject(
        {
          ...project,
          cues: [...linkedExistingCues, ...nextCues],
        },
        `${selectedLane.name} lane에 Main 가사를 연결했습니다.`,
      )
      setSelectedCueId(matchingHighlights[0]?.id ?? nextCues[0]?.id ?? '')
      return
    }

    if (matchingHighlights.length > 0) {
      const replacementCueIds = new Set(
        matchingHighlights.map((highlight) => highlight.id),
      )
      const retainedCues = project.cues.filter(
        (cue) => !replacementCueIds.has(cue.id),
      )
      const replacementCues = matchingHighlights.flatMap((highlight) => {
        const cue = project.cues.find((item) => item.id === highlight.id)

        return cue
          ? createCueReplacementsAfterRangeRemoval({
              cue,
              lane: selectedLane,
              documentText: lyricDraftDocumentText,
              lineRanges: lyricDraftLineRanges,
              highlight,
              removalRange: selectedRange,
              existingCues: [...retainedCues, ...project.cues],
            })
          : []
      })

      commitLaneEditorProject(
        {
          ...project,
          cues: [...retainedCues, ...replacementCues],
          partMarks: project.partMarks.filter(
            (mark) => !replacementCueIds.has(mark.cueId),
          ),
        },
        replacementCues.length > 0
          ? `${selectedLane.name} lane Main 하이라이트 일부를 해제했습니다.`
          : `${selectedLane.name} lane Main 하이라이트를 해제했습니다.`,
      )
      setSelectedCueId(replacementCues[0]?.id ?? '')
      return
    }

    const linkId =
      selectedLineRanges.length > 1
        ? createCueLinkId(selectedLane.id, selectedRange)
        : undefined
    const nextCues = createCuesForRanges({
      documentText: lyricDraftDocumentText,
      ranges: selectedLineRanges,
      lane: selectedLane,
      existingCues: project.cues,
      linkId,
    })

    commitLaneEditorProject(
      {
        ...project,
        cues: [...project.cues, ...nextCues],
      },
      `${selectedLane.name} lane에 Main 가사를 매칭했습니다.`,
    )
    setSelectedCueId(nextCues[0].id)
  }

  function tapSelectedCueStart() {
    if (!selectedCue) {
      setStatusMessage('tap-sync할 cue가 없습니다.')
      return
    }

    const nextProject = syncCueStart(project, selectedCue.id, audioPositionMs)
    const nextCueId = getNextSyncCueId(nextProject, selectedCue.id)
    commitLaneEditorProject(
      nextProject,
      `${formatDuration(audioPositionMs)}에 cue 시작을 입력했습니다. End는 다음 Space 또는 End 입력으로 정해집니다.`,
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

  function addAudioFiles(fileList: FileList | null | undefined) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) {
      return
    }

    const existingPaths = createExistingMediaPathSet(project)
    const uploadedItems: { file: File; track: MediaTrack }[] = []
    let nextParts = [...project.parts]
    const nextMedia = [...project.media]
    const preparedPartIds = new Set<string>()
    let firstPartId = ''
    let hasMrTrack = project.media.some((track) => track.role === 'mr')

    files.forEach((file) => {
      if (!hasMrTrack && isLikelyMrAudioFile(file)) {
        const track = createMediaTrack({
          file,
          role: 'mr',
          existingPaths,
        })
        existingPaths.add(track.path)
        nextMedia.push(track)
        uploadedItems.push({ file, track })
        hasMrTrack = true
        return
      }

      const reusablePartIndex = findReusableAudioPartIndex(nextParts, nextMedia)
      const partName = getAudioPartName(file)
      let partId = ''

      if (reusablePartIndex >= 0) {
        const reusablePart = nextParts[reusablePartIndex]
        partId = reusablePart.id
        nextParts = nextParts.map((part, index) =>
          index === reusablePartIndex
            ? { ...part, name: partName || part.name }
            : part,
        )
      } else {
        const nextPart = createPart({
          name: partName,
          existingParts: nextParts,
        })
        partId = nextPart.id
        nextParts = [...nextParts, nextPart]
      }

      const track = createMediaTrack({
        file,
        role: 'part-audio',
        partId,
        variant: selectedVariant,
        existingPaths,
      })
      existingPaths.add(track.path)
      const nextTrack = { ...track, enabled: true }
      nextMedia.push(nextTrack)
      uploadedItems.push({ file, track: nextTrack })
      nextParts = nextParts.map((part) =>
        part.id === partId ? { ...part, defaultTrackId: nextTrack.id } : part,
      )

      if (!firstPartId) {
        firstPartId = partId
      }
      preparedPartIds.add(partId)
    })

    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        parts: nextParts,
        media: nextMedia,
      }),
    )
    setMediaFiles((currentFiles) => {
      const nextFiles = { ...currentFiles }
      uploadedItems.forEach(({ file, track }) => {
        nextFiles[track.path] = file
      })
      return nextFiles
    })
    if (firstPartId) {
      setSelectedPartId(firstPartId)
      setNewLanePartId(firstPartId)
    }
    setStatusMessage(
      `${uploadedItems.length}개 음원을 추가하고 Part ${preparedPartIds.size}개를 준비했습니다.`,
    )
  }

  function removeMediaTrack(track: MediaTrack) {
    const nextPositionMs = clampPosition(audioPositionMs, audioDurationMs)
    const remainingPartTracks =
      track.role === 'part-audio' && track.partId
        ? project.media.filter(
            (item) =>
              item.id !== track.id &&
              item.role === 'part-audio' &&
              item.partId === track.partId,
          )
        : []
    const partToRemove =
      track.role === 'part-audio' &&
      track.partId &&
      remainingPartTracks.length === 0
        ? project.parts.find((part) => part.id === track.partId)
        : null
    const fallbackPartId = partToRemove
      ? (project.parts.find((part) => part.id !== partToRemove.id)?.id ?? '')
      : ''

    setProject((currentProject) =>
      touchProject(
        maybeRemoveAudioPart(
          {
            ...currentProject,
            media: currentProject.media.filter((item) => item.id !== track.id),
            parts: currentProject.parts.map((part) => {
              if (part.defaultTrackId !== track.id) {
                return part
              }

              const fallbackTrack = currentProject.media.find(
                (item) =>
                  item.id !== track.id &&
                  item.role === 'part-audio' &&
                  item.partId === track.partId,
              )
              return { ...part, defaultTrackId: fallbackTrack?.id }
            }),
          },
          track,
        ),
      ),
    )
    if (partToRemove) {
      setSelectedPartId((currentPartId) =>
        currentPartId === partToRemove.id ? fallbackPartId : currentPartId,
      )
      setNewLanePartId((currentPartId) =>
        currentPartId === partToRemove.id ? fallbackPartId : currentPartId,
      )
    }
    setMediaFiles((currentFiles) => {
      const nextFiles = { ...currentFiles }
      delete nextFiles[track.path]
      return nextFiles
    })
    setAudioPositionMs(nextPositionMs)
    setStatusMessage(
      partToRemove
        ? `${track.title} 음원과 ${partToRemove.name} part를 제거했습니다.`
        : `${track.title} 음원을 제거했습니다.`,
    )
  }

  function maybeRemoveAudioPart(
    nextProject: EazyChorusProject,
    removedTrack: MediaTrack,
  ): EazyChorusProject {
    if (!removedTrack.partId || removedTrack.role !== 'part-audio') {
      return nextProject
    }

    const hasRemainingPartAudio = nextProject.media.some(
      (track) =>
        track.role === 'part-audio' && track.partId === removedTrack.partId,
    )
    return hasRemainingPartAudio
      ? nextProject
      : removePartReferences(nextProject, removedTrack.partId)
  }

  function removePartReferences(
    currentProject: EazyChorusProject,
    partId: string,
  ): EazyChorusProject {
    return {
      ...currentProject,
      parts: currentProject.parts.filter((item) => item.id !== partId),
      lyricLanes: currentProject.lyricLanes.map((lane) => {
        if (lane.partId !== partId) {
          return lane
        }

        const laneWithoutPart: LyricLane = { ...lane }
        delete laneWithoutPart.partId
        return laneWithoutPart
      }),
      cues: currentProject.cues.map((cue) => ({
        ...cue,
        segments: cue.segments.map((segment) => ({
          ...segment,
          partIds: segment.partIds.filter((item) => item !== partId),
        })),
      })),
      partMarks: currentProject.partMarks.filter(
        (mark) => mark.partId !== partId,
      ),
    }
  }

  function updateMediaTrackRole(trackId: string, role: MediaTrack['role']) {
    const fallbackPartId = selectedPartId || project.parts[0]?.id
    if (role === 'part-audio' && !fallbackPartId) {
      setStatusMessage('파트 음원으로 지정할 part가 없습니다.')
      return
    }

    setProject((currentProject) => {
      const nextFallbackPartId =
        fallbackPartId || currentProject.parts[0]?.id || ''
      const targetTrack = currentProject.media.find(
        (track) => track.id === trackId,
      )
      if (!targetTrack || !nextFallbackPartId) {
        return currentProject
      }

      const nextMedia =
        role === 'mr'
          ? currentProject.media.map((track) => {
              if (track.id === trackId) {
                const nextTrack: MediaTrack = {
                  ...track,
                  role: 'mr',
                  enabled: true,
                }
                delete nextTrack.partId
                return nextTrack
              }

              if (track.role === 'mr') {
                return {
                  ...track,
                  role: 'part-audio' as const,
                  partId: track.partId ?? nextFallbackPartId,
                  variant: track.variant ?? selectedVariant,
                  enabled: false,
                }
              }

              return track
            })
          : currentProject.media.map((track) => {
              if (track.id !== trackId) {
                return track.role === 'part-audio' &&
                  track.partId === nextFallbackPartId
                  ? { ...track, enabled: false }
                  : track
              }

              return {
                ...track,
                role: 'part-audio' as const,
                partId: track.partId ?? nextFallbackPartId,
                variant: track.variant ?? selectedVariant,
                enabled: true,
              }
            })

      return touchProject({
        ...currentProject,
        media: nextMedia,
        parts: currentProject.parts.map((part) => {
          if (role === 'mr' && part.defaultTrackId === trackId) {
            return { ...part, defaultTrackId: undefined }
          }

          if (role === 'part-audio' && part.id === nextFallbackPartId) {
            return { ...part, defaultTrackId: trackId }
          }

          return part
        }),
      })
    })
    setStatusMessage(
      role === 'mr' ? 'MR 음원을 변경했습니다.' : '파트 음원으로 변경했습니다.',
    )
  }

  function updateMediaTrackPart(trackId: string, partId: string) {
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        media: currentProject.media.map((track) => {
          if (track.id === trackId) {
            return {
              ...track,
              role: 'part-audio',
              partId,
              variant: track.variant ?? selectedVariant,
              enabled: true,
            }
          }

          if (track.role === 'part-audio' && track.partId === partId) {
            return { ...track, enabled: false }
          }

          return track
        }),
        parts: currentProject.parts.map((part) => {
          if (part.id === partId) {
            return { ...part, defaultTrackId: trackId }
          }

          if (part.defaultTrackId === trackId) {
            return { ...part, defaultTrackId: undefined }
          }

          return part
        }),
      }),
    )
    setSelectedPartId(partId)
    setStatusMessage('파트 음원 연결을 변경했습니다.')
  }

  function updateMediaTrackVariant(trackId: string, variant: MediaVariant) {
    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        media: currentProject.media.map((track) =>
          track.id === trackId ? { ...track, variant } : track,
        ),
      }),
    )
    setSelectedVariant(variant)
    setStatusMessage('음원 variant를 변경했습니다.')
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

  function toggleViewerPartFocus(part: Part) {
    const shouldClearFocus = effectiveViewerFocusedPartId === part.id
    setViewerFocusedPartId(shouldClearFocus ? null : part.id)
    if (
      isEditorMode &&
      (editorWizardStep === 'notes' || editorWizardStep === 'preview')
    ) {
      setSelectedPartId(part.id)
    }
    setStatusMessage(
      shouldClearFocus
        ? 'Viewer Part 강조를 해제했습니다.'
        : `${part.name} Part만 강조합니다.`,
    )
  }

  function handleViewerCueClick(cue: LyricCue) {
    if (viewerSelectionHandledRef.current) {
      viewerSelectionHandledRef.current = false
      return
    }

    void playViewerCue(cue)
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

  function handleViewerManualScroll() {
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

    if (isEditorNotesStep) {
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

    setPendingPreviewAnnotation(null)
    setProjectFileBusyMessage('프로젝트 파일을 여는 중입니다.')
    setIsProjectFileBusy(true)

    try {
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
      setNewLanePartId(result.package.project.parts[0]?.id ?? '')
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
      setViewerFocusedPartId(null)
      setViewerLoopMode('off')
      setAbLoopStartMs(null)
      setAbLoopEndMs(null)
      setViewerCueLoopId(null)
      setIsAutoScrollPaused(false)
      setStatusMessage(`${file.name} 프로젝트를 열었습니다.`)
    } finally {
      setIsProjectFileBusy(false)
    }
  }

  async function openSampleProject() {
    setStatusMessage('샘플 프로젝트를 불러오는 중입니다.')
    setProjectFileBusyMessage('샘플 프로젝트를 여는 중입니다.')
    setIsProjectFileBusy(true)

    try {
      const response = await fetch(SAMPLE_PROJECT_URL)
      if (!response.ok) {
        throw new Error(`Sample request failed: ${response.status}`)
      }

      await handleImportFile(
        new File([await response.blob()], SAMPLE_PROJECT_FILE_NAME, {
          type: 'application/zip',
        }),
      )
    } catch {
      setStatusMessage(
        '샘플 프로젝트를 불러올 수 없습니다. 배포 파일 또는 네트워크 상태를 확인하세요.',
      )
    } finally {
      setIsProjectFileBusy(false)
    }
  }

  async function exportCurrentProject() {
    const projectToExport = touchProject(project)
    setIsExporting(true)
    setProjectFileBusyMessage('프로젝트 파일을 저장하는 중입니다.')
    setIsProjectFileBusy(true)

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
      setIsProjectFileBusy(false)
    }
  }

  const hasAssignmentSidebar =
    isEditorMode &&
    (editorWizardStep === 'lanes' || editorWizardStep === 'harmony')
  const workspaceGridClassName = isEditorMode
    ? hasAssignmentSidebar
      ? 'workspace-grid editor-workspace-grid editor-sidebar-grid'
      : 'workspace-grid editor-workspace-grid'
    : 'workspace-grid practice-grid'
  const appContentClassName = [
    'app-content',
    isProjectFileBusy || pendingPreviewAnnotation ? 'app-content-busy' : '',
    isWorkspaceSidebarOpen ? 'app-content-sidebar-open' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const workspaceStats = isEditorMode
    ? `media ${project.media.length}개, part ${project.parts.length}개, validation error ${validationErrors.length}개`
    : `cue ${timelineCues.length}개, part ${project.parts.length}개, validation error ${validationErrors.length}개`
  const editorProgressPercent =
    ((editorWizardStepIndex + 1) / EDITOR_WIZARD_STEPS.length) * 100
  const editorWizardControls = isEditorMode ? (
    <section
      className="editor-wizard-rail"
      aria-labelledby="editor-wizard-title"
    >
      <div className="section-heading">
        <h2 id="editor-wizard-title">Steps</h2>
        <span>
          {editorWizardStepIndex + 1}/{EDITOR_WIZARD_STEPS.length}
        </span>
      </div>

      <div className="editor-wizard-steps" aria-label="편집 단계">
        {EDITOR_WIZARD_STEPS.map((step, index) => (
          <button
            className={
              step.value === editorWizardStep
                ? 'editor-wizard-step editor-wizard-step-active'
                : 'editor-wizard-step'
            }
            type="button"
            aria-current={step.value === editorWizardStep ? 'step' : undefined}
            aria-pressed={step.value === editorWizardStep}
            onClick={() => setEditorWizardStep(step.value)}
            key={step.value}
          >
            <span className="editor-wizard-step-number">{index + 1}</span>
            <span className="editor-wizard-step-copy">
              <strong>{step.label}</strong>
              <small>{getEditorWizardStepSummary(step.value)}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="editor-wizard-actions">
        <button
          type="button"
          onClick={() => moveEditorWizardStep(-1)}
          disabled={editorWizardStepIndex === 0}
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => moveEditorWizardStep(1)}
          disabled={editorWizardStepIndex === EDITOR_WIZARD_STEPS.length - 1}
        >
          다음
        </button>
      </div>
    </section>
  ) : null

  return (
    <main className="app-shell">
      <div
        className={appContentClassName}
        aria-hidden={isProjectFileBusy || Boolean(pendingPreviewAnnotation)}
      >
        <header className="workspace-header">
          <div className="workspace-title-stack">
            <p className="app-kicker">Eazy Chorus</p>
            <h1>{workspaceTitle}</h1>
          </div>

          <section className="workspace-header-status" aria-live="polite">
            <div className="workspace-status-line">
              <strong>{statusMessage}</strong>
              <span>{workspaceStats}</span>
            </div>
            {isEditorMode ? (
              <div
                className="workspace-progress"
                role="progressbar"
                aria-label="편집 단계 진행률"
                aria-valuemin={1}
                aria-valuemax={EDITOR_WIZARD_STEPS.length}
                aria-valuenow={editorWizardStepIndex + 1}
              >
                <div className="workspace-progress-copy">
                  <strong>
                    {EDITOR_WIZARD_STEPS[editorWizardStepIndex]?.label ??
                      'Step'}
                  </strong>
                  <span>
                    {editorWizardStepIndex + 1}/{EDITOR_WIZARD_STEPS.length}
                  </span>
                </div>
                <div className="workspace-progress-track" aria-hidden="true">
                  <span style={{ width: `${editorProgressPercent}%` }} />
                </div>
              </div>
            ) : null}
          </section>
        </header>

        <div className={workspaceGridClassName}>
          {isEditorMode ? (
            <>
              {editorWizardStep === 'project' ? (
                <>
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
                          onChange={(event) =>
                            updateProjectBpm(event.target.value)
                          }
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
                </>
              ) : null}

              {editorWizardStep === 'audio' ? (
                <>
                  <section
                    className="workspace-section"
                    aria-labelledby="media-title"
                  >
                    <div className="section-heading">
                      <h2 id="media-title">Media</h2>
                      <span>ZIP 내부 media/ 경로로 저장</span>
                    </div>

                    <div className="media-import-row">
                      <button
                        type="button"
                        onClick={() => audioInputRef.current?.click()}
                      >
                        음원 추가
                      </button>
                      <select
                        aria-label="업로드 기본 variant"
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
                        ref={audioInputRef}
                        className="visually-hidden"
                        type="file"
                        accept="audio/*"
                        multiple
                        aria-label="오디오 파일 선택"
                        onChange={(event) => {
                          addAudioFiles(event.currentTarget.files)
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
                        <span role="columnheader">Part</span>
                        <span role="columnheader">Variant</span>
                        <span role="columnheader">Path</span>
                        <span role="columnheader">Size</span>
                        <span role="columnheader">Action</span>
                      </div>
                      {project.media.map((track) => (
                        <div className="media-row" role="row" key={track.id}>
                          <span role="cell">
                            <select
                              aria-label={`${track.title} 역할`}
                              value={track.role}
                              onChange={(event) =>
                                updateMediaTrackRole(
                                  track.id,
                                  event.target.value as MediaTrack['role'],
                                )
                              }
                            >
                              <option value="part-audio">파트 음원</option>
                              <option value="mr">MR</option>
                            </select>
                          </span>
                          <span role="cell">{track.title}</span>
                          <span role="cell">
                            {track.role === 'part-audio' ? (
                              <select
                                aria-label={`${track.title} 파트 연결`}
                                value={track.partId ?? ''}
                                onChange={(event) =>
                                  updateMediaTrackPart(
                                    track.id,
                                    event.target.value,
                                  )
                                }
                              >
                                {project.parts.map((part) => (
                                  <option value={part.id} key={part.id}>
                                    {part.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="media-assignment-note">
                                MR로 사용
                              </span>
                            )}
                          </span>
                          <span role="cell">
                            {track.role === 'part-audio' ? (
                              <select
                                aria-label={`${track.title} variant`}
                                value={track.variant ?? 'custom'}
                                onChange={(event) =>
                                  updateMediaTrackVariant(
                                    track.id,
                                    event.target.value as MediaVariant,
                                  )
                                }
                              >
                                {MEDIA_VARIANT_OPTIONS.map((option) => (
                                  <option
                                    value={option.value}
                                    key={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="media-assignment-note">-</span>
                            )}
                          </span>
                          <span role="cell">{track.path}</span>
                          <span role="cell">
                            {formatBytes(track.sizeBytes)}
                          </span>
                          <span role="cell">
                            <button
                              type="button"
                              aria-label={`${track.title} 음원 제거`}
                              onClick={() => removeMediaTrack(track)}
                            >
                              제거
                            </button>
                          </span>
                        </div>
                      ))}
                      {project.media.length === 0 ? (
                        <p className="empty-state">
                          MR과 보컬 음원을 추가하세요.
                        </p>
                      ) : null}
                    </div>
                  </section>

                  <section
                    className="workspace-section"
                    aria-labelledby="audio-title"
                  >
                    <div className="section-heading">
                      <h2 id="audio-title">Audio Engine</h2>
                      <span>
                        active {activeTrackCount}개 / decoded duration{' '}
                        {formatDuration(audioDurationMs)}
                      </span>
                    </div>

                    <div className="transport-panel">
                      <div
                        className="transport-actions"
                        aria-label="오디오 재생 컨트롤"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            isAudioPlaying ? pauseAudio() : void playAudio()
                          }
                          disabled={isAudioPreparing || !canPlayProjectAudio}
                        >
                          {isAudioPlaying ? '일시정지' : '재생'}
                        </button>
                        <button
                          type="button"
                          onClick={stopAudio}
                          disabled={
                            isAudioPreparing || project.media.length === 0
                          }
                        >
                          정지
                        </button>
                        <button
                          type="button"
                          onClick={() => void replayAudio()}
                          disabled={isAudioPreparing || !canPlayProjectAudio}
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
                          value={clampPosition(
                            audioPositionMs,
                            audioDurationMs,
                          )}
                          disabled={audioDurationMs === 0}
                          onChange={(event) =>
                            void seekAudio(Number(event.target.value))
                          }
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

                    <div className="mixer-table" aria-label="오디오 믹서">
                      {project.media.map((track) => (
                        <div className="mixer-row" key={track.id}>
                          <div>
                            <strong>{track.title}</strong>
                            <span>
                              {formatTrackRole(track, project.parts)} · gain{' '}
                              {getEffectiveTrackGain(
                                track,
                                project.media,
                              ).toFixed(2)}
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
                              {track.enabled
                                ? 'Active variant'
                                : 'Inactive variant'}
                            </span>
                          )}
                        </div>
                      ))}
                      {project.media.length === 0 ? (
                        <p className="empty-state">
                          음원을 추가하면 Web Audio 재생과 믹서 컨트롤을 사용할
                          수 있습니다.
                        </p>
                      ) : null}
                    </div>
                  </section>
                </>
              ) : null}

              {editorWizardStep === 'lyrics' ? (
                <section
                  className="workspace-section lyric-import-section"
                  aria-labelledby="lyrics-import-title"
                >
                  <div className="section-heading">
                    <h2 id="lyrics-import-title">Lyric Import</h2>
                    <span>
                      draft {lyricDraft.length}줄 / block {importBlocks.length}
                      개
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
                                #{index + 1} {block.pattern} /{' '}
                                {block.confidence}
                              </div>
                              {block.sourceLines.map((line, lineIndex) => (
                                <p key={`${block.id}-source-${lineIndex}`}>
                                  {line}
                                </p>
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
                                  updateImportBlockExport(
                                    block.id,
                                    event.target.value,
                                  )
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
                      <div className="panel-title-row">
                        <h3>Lyric draft</h3>
                        <span>{lyricDraft.length}줄</span>
                      </div>
                      <textarea
                        aria-label="최종 가사 편집"
                        rows={Math.min(
                          12,
                          Math.max(4, lyricDraftEditorText.split('\n').length),
                        )}
                        value={lyricDraftEditorText}
                        onChange={(event) =>
                          setLyricDraftEditorState({
                            sourceText: lyricDraftDocumentText,
                            editorText: event.target.value,
                          })
                        }
                      />
                      <div className="lyric-draft-actions">
                        <button type="button" onClick={saveLyricDraftEdit}>
                          최종 가사 저장
                        </button>
                        <span>
                          {splitEditedLyricLines(lyricDraftEditorText).length}줄
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-state">
                      확정된 lyric draft가 없습니다. 추출 결과를 확인한 뒤
                      저장하세요.
                    </p>
                  )}
                </section>
              ) : null}

              {editorWizardStep === 'lanes' ? (
                <section
                  className="workspace-section lane-assignment-section"
                  aria-labelledby="lane-assignment-title"
                >
                  <div className="section-heading">
                    <h2 id="lane-assignment-title">Lane 설정</h2>
                    <span>
                      lane {project.lyricLanes.length}개 / main cue{' '}
                      {project.cues.length}개
                    </span>
                  </div>

                  <div className="assignment-workbench">
                    <div className="lyrics-assignment-document">
                      <div className="panel-title-row">
                        <h3>전체 가사</h3>
                        <span>{selectedLane?.name ?? 'Lane'} 선택 중</span>
                      </div>

                      <div className="lyrics-line-list" aria-label="전체 가사">
                        {lyricDraft.length > 0 ? (
                          <>
                            <div className="lyric-document-editor">
                              <div
                                className="lyric-draft-document"
                                aria-label="lyric draft document"
                                onMouseUp={assignLyricDocumentSelectionToLane}
                              >
                                {lyricDocumentFragments.map((fragment) =>
                                  fragment.highlights.length > 0 ? (
                                    <mark
                                      className={
                                        fragment.highlights.some(
                                          (highlight) =>
                                            highlight.laneId === selectedLaneId,
                                        )
                                          ? 'lyric-highlight-mark lyric-highlight-mark-selected-lane'
                                          : 'lyric-highlight-mark'
                                      }
                                      key={fragment.id}
                                      style={createLyricHighlightStyle(
                                        fragment.highlights,
                                        selectedLaneId,
                                      )}
                                      title={formatLyricHighlightTitle(
                                        fragment.highlights,
                                      )}
                                    >
                                      {fragment.text}
                                    </mark>
                                  ) : (
                                    <span key={fragment.id}>
                                      {fragment.text}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="empty-state">
                            확정된 lyric draft가 없습니다. Lyrics 단계에서
                            가사를 먼저 저장하세요.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {editorWizardStep === 'lanes' ? (
                <aside
                  className="workspace-sidebar assignment-legend"
                  aria-label="Lane 범례"
                >
                  <div className="panel-title-row">
                    <h3>Lane 범례</h3>
                    <span>Main만 매칭</span>
                  </div>

                  <div className="lane-add-row">
                    <input
                      aria-label="새 lane 이름"
                      placeholder="새 lane 이름"
                      value={newLaneName}
                      onChange={(event) => setNewLaneName(event.target.value)}
                    />
                    <select
                      aria-label="새 lane part"
                      value={newLanePartId}
                      onChange={(event) => setNewLanePartId(event.target.value)}
                    >
                      {project.parts.map((part) => (
                        <option value={part.id} key={part.id}>
                          {part.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={addLyricLane}>
                      Lane 추가
                    </button>
                  </div>

                  <div
                    className="assignment-legend-list"
                    aria-label="lyric lane 목록"
                  >
                    {sortedLanes.map((lane) => (
                      <article
                        className={
                          lane.id === selectedLane?.id
                            ? 'assignment-legend-row assignment-legend-row-active'
                            : 'assignment-legend-row'
                        }
                        key={lane.id}
                      >
                        <button
                          className="assignment-legend-button"
                          type="button"
                          aria-pressed={lane.id === selectedLane?.id}
                          onClick={() => {
                            setSelectedLaneId(lane.id)
                            if (lane.partId) {
                              setSelectedPartId(lane.partId)
                            }
                          }}
                        >
                          <span
                            className="legend-swatch"
                            style={{
                              backgroundColor: getPartColor(
                                lane.partId ?? '',
                                project.parts,
                              ),
                            }}
                          />
                          <span>
                            <strong>{lane.name}</strong>
                            <small>
                              {formatLanePartMatch(
                                lane,
                                project.parts,
                                project.media,
                              )}{' '}
                              · {getLaneCueSequence(project, lane.id).length}{' '}
                              cue
                            </small>
                          </span>
                        </button>
                        <label>
                          Part
                          <select
                            aria-label={`${lane.name} lane part`}
                            value={lane.partId ?? ''}
                            onChange={(event) =>
                              updateLyricLanePart(lane.id, event.target.value)
                            }
                          >
                            {project.parts.map((part) => (
                              <option value={part.id} key={part.id}>
                                {part.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </article>
                    ))}
                  </div>

                  <div className="assignment-history-actions">
                    <button
                      type="button"
                      onClick={undoLaneEditorChange}
                      disabled={laneEditorHistory.past.length === 0}
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
                </aside>
              ) : null}

              {editorWizardStep === 'harmony' ? (
                <section
                  className="workspace-section harmony-assignment-section"
                  aria-labelledby="harmony-assignment-title"
                >
                  <div className="section-heading">
                    <h2 id="harmony-assignment-title">Sub</h2>
                    <span>
                      cue {project.cues.length}개 / mark{' '}
                      {project.partMarks.length}개
                    </span>
                  </div>

                  <div className="assignment-workbench">
                    <div className="harmony-cue-document">
                      <div className="panel-title-row">
                        <h3>전체 가사</h3>
                        <span>{selectedPart?.name ?? 'Part'} 선택 중</span>
                      </div>

                      <div
                        className="lyrics-line-list"
                        aria-label="Sub 전체 가사"
                      >
                        {timelineCues.length > 0 ? (
                          <div className="lyric-document-editor">
                            <div
                              className="lyric-draft-document"
                              aria-label="sub lyric document"
                              onMouseUp={toggleSelectedPartMarkFromDocument}
                            >
                              {harmonyDocumentFragments.map((fragment) => {
                                if (fragment.partMarkHighlights.length > 0) {
                                  return (
                                    <mark
                                      className="sub-highlight-mark"
                                      key={fragment.id}
                                      style={createPartMarkDocumentStyle(
                                        fragment.partMarkHighlights,
                                        project.parts,
                                      )}
                                      title={formatPartMarkDocumentTitle(
                                        fragment.partMarkHighlights,
                                        project.parts,
                                      )}
                                    >
                                      {fragment.text}
                                    </mark>
                                  )
                                }

                                return (
                                  <span key={fragment.id}>{fragment.text}</span>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                        {timelineCues.length === 0 ? (
                          <p className="empty-state">
                            Lane 단계에서 Main cue를 먼저 만드세요.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {editorWizardStep === 'harmony' ? (
                <aside
                  className="workspace-sidebar assignment-legend"
                  aria-label="Sub 범례"
                >
                  <div className="panel-title-row">
                    <h3>Sub 범례</h3>
                    <span>화음 표시 대상</span>
                  </div>

                  <div className="assignment-legend-list">
                    {project.parts.map((part) => (
                      <button
                        className={
                          part.id === selectedPart?.id
                            ? 'assignment-legend-button assignment-legend-button-active'
                            : 'assignment-legend-button'
                        }
                        type="button"
                        aria-pressed={part.id === selectedPart?.id}
                        key={part.id}
                        onClick={() => setSelectedPartId(part.id)}
                      >
                        <span
                          className="legend-swatch"
                          style={{ backgroundColor: part.color }}
                        />
                        <span>
                          <strong>{part.name}</strong>
                          <small>
                            {formatPartAudioVariant(part, project.media)}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>

                  <label className="legend-mark-style">
                    기본 Sub 표시
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

                  <label className="legend-mark-style">
                    Level
                    <select
                      aria-label="선택된 Sub level"
                      value={String(
                        selectedPart?.harmonyLevel ?? MIN_HARMONY_LEVEL,
                      )}
                      disabled={!selectedPart}
                      onChange={(event) =>
                        selectedPart
                          ? updatePart(selectedPart.id, {
                              harmonyLevel: normalizeHarmonyLevelInput(
                                Number(event.target.value),
                              ),
                            })
                          : undefined
                      }
                    >
                      {HARMONY_LEVEL_OPTIONS.map((level) => (
                        <option value={level} key={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="assignment-history-actions">
                    <button
                      type="button"
                      onClick={undoLaneEditorChange}
                      disabled={laneEditorHistory.past.length === 0}
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
                </aside>
              ) : null}

              {editorWizardStep === 'sync' ? (
                <section
                  className="workspace-section sync-section"
                  aria-labelledby="sync-title"
                >
                  <div className="section-heading">
                    <h2 id="sync-title">Sync</h2>
                    <span>
                      cue {project.cues.length}개 / position{' '}
                      {formatDuration(audioPositionMs)}
                    </span>
                  </div>

                  <div className="assignment-workbench">
                    <div className="tap-sync-panel">
                      <div className="panel-title-row">
                        <h3>Cue list</h3>
                        <span>
                          {selectedCue ? getCueText(selectedCue) : 'cue 없음'}
                        </span>
                      </div>

                      <ul className="cue-list" aria-label="sync cue 목록">
                        {syncCues.map((cue, index) => (
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
                              onClick={() => {
                                setSelectedLaneId(cue.laneId)
                                setSelectedCueId(cue.id)
                              }}
                            >
                              <span>{index + 1}</span>
                              <strong>{getCueText(cue)}</strong>
                              <small>{formatSyncCueRange(cue)}</small>
                              <small>{getLaneName(cue.laneId, project)}</small>
                            </button>
                          </li>
                        ))}
                        {syncCues.length === 0 ? (
                          <li className="cue-list-item">
                            <p className="empty-state">
                              Lane 단계에서 Main cue를 먼저 만드세요.
                            </p>
                          </li>
                        ) : null}
                      </ul>
                    </div>

                    <aside className="tap-sync-panel" aria-label="Sync 컨트롤">
                      <div className="panel-title-row">
                        <h3>Tap Sync</h3>
                        <span>{formatDuration(audioPositionMs)}</span>
                      </div>

                      <div className="tap-sync-actions">
                        <button
                          type="button"
                          onClick={() =>
                            isAudioPlaying ? pauseAudio() : void playAudio()
                          }
                          disabled={isAudioPreparing || !canPlayProjectAudio}
                        >
                          {isAudioPlaying ? '일시정지' : '재생'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void seekAudio(audioPositionMs - 2000)}
                          disabled={audioDurationMs === 0}
                        >
                          -2s
                        </button>
                        <button
                          type="button"
                          onClick={() => void seekAudio(audioPositionMs + 2000)}
                          disabled={audioDurationMs === 0}
                        >
                          +2s
                        </button>
                        <button
                          type="button"
                          onClick={tapSelectedCueStart}
                          disabled={!selectedCue}
                        >
                          Start 입력
                        </button>
                        <button
                          type="button"
                          onClick={tapSelectedCueEnd}
                          disabled={!selectedCue}
                        >
                          End 입력
                        </button>
                        <button
                          type="button"
                          onClick={undoLaneEditorChange}
                          disabled={laneEditorHistory.past.length === 0}
                        >
                          실행 취소
                        </button>
                      </div>

                      <label className="seek-control">
                        Seek
                        <input
                          type="range"
                          min="0"
                          max={Math.max(audioDurationMs, 1)}
                          step="100"
                          value={clampPosition(
                            audioPositionMs,
                            audioDurationMs,
                          )}
                          disabled={audioDurationMs === 0}
                          onChange={(event) =>
                            void seekAudio(Number(event.target.value))
                          }
                        />
                      </label>
                      <div className="transport-time">
                        <span>{formatDuration(audioPositionMs)}</span>
                        <span>{formatDuration(audioDurationMs)}</span>
                      </div>
                    </aside>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {isViewerSurfaceVisible ? (
            <section
              className="workspace-section viewer-mode-section"
              aria-labelledby="viewer-mode-title"
              onKeyDown={handleViewerKeyDown}
              onWheel={handleViewerManualScroll}
              onTouchMove={handleViewerManualScroll}
            >
              <div className="section-heading">
                <h2 id="viewer-mode-title">
                  {isEditorNotesStep ? 'Notes' : 'Viewer Mode'}
                </h2>
                <span>
                  {isEditorNotesStep
                    ? `${selectedPartAnnotations.length} note / ${
                        selectedPart?.name ?? 'Part'
                      }`
                    : `${timelineCues.length} cue / auto-scroll ${
                        isAutoScrollPaused ? 'paused' : 'on'
                      }`}
                </span>
              </div>

              <div className="viewer-mode-layout">
                <div className="viewer-main">
                  <div
                    ref={viewerStageRef}
                    className="viewer-lyrics-stage"
                    aria-label="viewer lyrics document"
                    tabIndex={0}
                    onMouseUp={annotatePreviewSelection}
                  >
                    {timelineCues.map((cue) => {
                      const isViewerCuePartFocused = isCueFocusedByViewerPart({
                        cue,
                        focusMode: viewerPartFocusMode,
                        focusedLaneIds: viewerFocusedLaneIds,
                        focusedPartId: effectiveViewerFocusedPartId,
                        partMarks: project.partMarks,
                      })

                      const cueClassName = createViewerCueClassName({
                        isActive: activeCueIds.has(cue.id),
                        isPartFocusEnabled: viewerPartFocusMode !== 'all',
                        isPartFocused: isViewerCuePartFocused,
                      })
                      const cueContent = (
                        <>
                          <span className="viewer-cue-range">
                            {formatCueRange(cue)}
                          </span>
                          <ViewerCueText
                            cue={cue}
                            focusMode={viewerPartFocusMode}
                            focusedPartId={effectiveViewerFocusedPartId}
                            isCuePartFocused={isViewerCuePartFocused}
                            parts={project.parts}
                            partMarks={project.partMarks}
                          />
                        </>
                      )

                      return isEditorNotesStep ? (
                        <div
                          ref={(element) => {
                            viewerCueRefs.current[cue.id] = element
                          }}
                          className={`${cueClassName} viewer-cue-note-target`}
                          key={cue.id}
                        >
                          {cueContent}
                        </div>
                      ) : (
                        <button
                          ref={(element) => {
                            viewerCueRefs.current[cue.id] = element
                          }}
                          className={cueClassName}
                          type="button"
                          key={cue.id}
                          onClick={() => handleViewerCueClick(cue)}
                        >
                          {cueContent}
                        </button>
                      )
                    })}
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

                <aside
                  className={
                    isEditorNotesStep
                      ? 'viewer-side-panel viewer-side-panel-notes'
                      : 'viewer-side-panel'
                  }
                  aria-label="viewer side panel"
                >
                  {isEditorNotesStep ? (
                    <div
                      className="preview-annotation-panel"
                      aria-label="notes annotation editor"
                    >
                      <div className="panel-title-row">
                        <h3>Part Notes</h3>
                        <span>{selectedPart?.name ?? 'Part'} 선택 중</span>
                      </div>
                      {selectedPartAnnotations.length > 0 ? (
                        <ul
                          className="preview-annotation-list"
                          aria-label="선택 Part 주석 목록"
                        >
                          {selectedPartAnnotations.map((mark) => (
                            <li key={mark.id}>
                              <strong>
                                {formatPartMarkAnnotationSource(mark, project)}
                              </strong>
                              <span>{mark.note}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

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
                            track.role === 'part-audio' &&
                            track.partId === part.id,
                        )
                        const isPreviewAnnotationPart =
                          isEditorMode &&
                          editorWizardStep === 'notes' &&
                          selectedPart?.id === part.id

                        return (
                          <article
                            className={
                              effectiveViewerFocusedPartId === part.id ||
                              isPreviewAnnotationPart
                                ? 'viewer-part-item viewer-part-item-selected'
                                : 'viewer-part-item'
                            }
                            key={part.id}
                          >
                            <button
                              className="viewer-part-select-button"
                              type="button"
                              aria-pressed={
                                effectiveViewerFocusedPartId === part.id
                              }
                              onClick={() => toggleViewerPartFocus(part)}
                            >
                              <span className="viewer-part-heading">
                                <span
                                  className="viewer-part-color"
                                  style={{ backgroundColor: part.color }}
                                />
                                <strong>{part.name}</strong>
                              </span>
                            </button>
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
                                <dt>Level</dt>
                                <dd>{part.harmonyLevel}</dd>
                              </div>
                              <div>
                                <dt>Variant</dt>
                                <dd>
                                  {partTracks.length > 0
                                    ? partTracks
                                        .map(
                                          (track) => track.variant ?? 'custom',
                                        )
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
                      <div className="viewer-track-list">
                        {project.media.map((track) => (
                          <div className="viewer-track-row" key={track.id}>
                            <div>
                              <strong>{track.title}</strong>
                              <span>
                                {formatTrackRole(track, project.parts)}
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
                  className="viewer-play-toggle"
                  type="button"
                  onClick={() =>
                    isAudioPlaying ? pauseAudio() : void playAudio()
                  }
                  disabled={isAudioPreparing || !canPlayProjectAudio}
                >
                  {isAudioPlaying ? 'Pause' : 'Play'}
                </button>
                <div
                  className="viewer-seek-control"
                  aria-label="viewer progress"
                >
                  <span>{formatDuration(audioPositionMs)}</span>
                  <input
                    aria-label="재생 위치"
                    type="range"
                    min="0"
                    max={Math.max(audioDurationMs, 1)}
                    step="100"
                    value={clampPosition(audioPositionMs, audioDurationMs)}
                    disabled={audioDurationMs === 0}
                    onChange={(event) =>
                      void seekAudio(Number(event.target.value))
                    }
                  />
                  <span>{formatDuration(audioDurationMs)}</span>
                </div>
                <button
                  className="viewer-loop-boundary-start"
                  type="button"
                  onClick={() => markAbLoopBoundary('start')}
                >
                  A {formatDuration(abLoopStartMs ?? 0)}
                </button>
                <button
                  className="viewer-loop-boundary-end"
                  type="button"
                  onClick={() => markAbLoopBoundary('end')}
                >
                  B {formatDuration(abLoopEndMs ?? 0)}
                </button>
                <button
                  className="viewer-ab-loop-control"
                  type="button"
                  aria-pressed={viewerLoopMode === 'ab'}
                  disabled={!abLoopReady}
                  onClick={toggleAbLoop}
                >
                  A-B Loop
                </button>
                <button
                  className="viewer-cue-loop-control"
                  type="button"
                  aria-pressed={viewerLoopMode === 'cue'}
                  disabled={!selectedTimelineCue && !activeTimelineCue}
                  onClick={toggleCueLoop}
                >
                  Cue Loop
                </button>
                <label className="viewer-rate-control">
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
          ) : null}

          {isEditorMode && editorWizardStep === 'audio' ? (
            <>
              <section
                className="workspace-section"
                aria-labelledby="parts-title"
              >
                <div className="section-heading">
                  <h2 id="parts-title">Parts from Audio</h2>
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
                                updatePart(part.id, {
                                  name: event.target.value,
                                })
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
                                description:
                                  event.target.value.trim() || undefined,
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
                          <label>
                            Level
                            <select
                              aria-label={`${part.name} harmony level`}
                              value={String(part.harmonyLevel)}
                              onChange={(event) =>
                                updatePart(part.id, {
                                  harmonyLevel: normalizeHarmonyLevelInput(
                                    Number(event.target.value),
                                  ),
                                })
                              }
                            >
                              {HARMONY_LEVEL_OPTIONS.map((level) => (
                                <option value={level} key={level}>
                                  {level}
                                </option>
                              ))}
                            </select>
                          </label>
                          <span>
                            {partTracks.length > 0
                              ? `${partTracks.length}개 variant`
                              : '연결된 variant 없음'}
                          </span>
                          <button
                            type="button"
                            aria-label={`${part.name} part 제거`}
                            onClick={() => removePart(part.id)}
                            title={
                              partTracks.length > 0
                                ? '연결된 음원을 먼저 제거하세요.'
                                : undefined
                            }
                          >
                            Part 제거
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          ) : null}

          {isEditorMode && editorWizardStep === 'preview' ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>
      <aside
        className={
          isWorkspaceSidebarOpen
            ? 'workspace-utility-sidebar workspace-utility-sidebar-open'
            : 'workspace-utility-sidebar'
        }
        aria-label="워크스페이스 도구"
      >
        <button
          className="workspace-utility-toggle"
          type="button"
          aria-label={
            isWorkspaceSidebarOpen
              ? '워크스페이스 도구 접기'
              : '워크스페이스 도구 열기'
          }
          aria-expanded={isWorkspaceSidebarOpen}
          title={
            isWorkspaceSidebarOpen
              ? '워크스페이스 도구 접기'
              : '워크스페이스 도구 열기'
          }
          onClick={() =>
            setIsWorkspaceSidebarOpen(
              (currentSidebarState) => !currentSidebarState,
            )
          }
        >
          <SidebarToggleIcon isOpen={isWorkspaceSidebarOpen} />
        </button>

        {isWorkspaceSidebarOpen ? (
          <div className="workspace-utility-content">
            <section className="workspace-utility-group">
              <div className="panel-title-row">
                <h2>Workspace</h2>
                <span>{workspaceMode === 'editor' ? '편집' : '연습'}</span>
              </div>
              <nav className="workspace-page-nav" aria-label="페이지 이동">
                {WORKSPACE_PAGE_OPTIONS.map((option) => (
                  <Link
                    className={
                      workspaceMode === option.value
                        ? 'workspace-page-link workspace-page-link-active'
                        : 'workspace-page-link'
                    }
                    to={option.path}
                    aria-current={
                      workspaceMode === option.value ? 'page' : undefined
                    }
                    key={option.value}
                  >
                    {option.label}
                  </Link>
                ))}
              </nav>
            </section>

            <section className="workspace-utility-group">
              <div className="panel-title-row">
                <h2>Project File</h2>
                <span>.eazychorus</span>
              </div>
              <div
                className="workspace-actions"
                aria-label="프로젝트 파일 액션"
              >
                {isEditorMode ? (
                  <button
                    type="button"
                    onClick={resetToNewProject}
                    disabled={isProjectFileBusy}
                  >
                    새 프로젝트
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  disabled={isProjectFileBusy}
                >
                  파일 열기
                </button>
                <button
                  type="button"
                  onClick={() => void openSampleProject()}
                  disabled={isProjectFileBusy}
                >
                  샘플 열기
                </button>
                {isEditorMode ? (
                  <button
                    type="button"
                    onClick={exportCurrentProject}
                    disabled={exportDisabled || isProjectFileBusy}
                  >
                    {isExporting ? '내보내는 중' : '.eazychorus 저장'}
                  </button>
                ) : null}
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
            </section>

            {editorWizardControls}
          </div>
        ) : null}
      </aside>
      {pendingPreviewAnnotation ? (
        <div
          className="preview-annotation-dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-annotation-dialog-title"
        >
          <form
            className="preview-annotation-dialog"
            onSubmit={(event) => {
              event.preventDefault()
              savePendingPreviewAnnotation()
            }}
          >
            <div className="panel-title-row">
              <h2 id="preview-annotation-dialog-title">Part Note</h2>
              <span>{pendingPreviewAnnotationPart?.name ?? 'Part'}</span>
            </div>
            <p className="preview-annotation-target">
              {pendingPreviewAnnotation.selectedText}
            </p>
            <label>
              주석
              <textarea
                ref={previewAnnotationTextareaRef}
                aria-label="Notes 주석 입력"
                rows={4}
                value={pendingPreviewAnnotation.note}
                onChange={(event) =>
                  updatePendingPreviewAnnotationNote(event.target.value)
                }
              />
            </label>
            <div className="preview-annotation-dialog-actions">
              <button type="button" onClick={closePreviewAnnotationDialog}>
                취소
              </button>
              <button type="submit">저장</button>
            </div>
          </form>
        </div>
      ) : null}
      {isProjectFileBusy ? (
        <div
          className="project-file-loading-overlay"
          role="status"
          aria-label="프로젝트 파일 처리 상태"
          aria-live="assertive"
        >
          <div className="project-file-loading-panel">
            <span className="project-file-loading-spinner" aria-hidden="true" />
            <strong>{projectFileBusyMessage}</strong>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function SidebarToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={
        isOpen ? 'workspace-sidebar-icon' : 'workspace-sidebar-icon-closed'
      }
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15.2999 3.40059C15.2999 3.01399 14.9863 2.70039 14.5997 2.70039H3.4001C3.0135 2.70039 2.6999 3.01399 2.6999 3.40059V14.6002C2.6999 14.9868 3.0135 15.3004 3.4001 15.3004H14.5997C14.9863 15.3004 15.2999 14.9868 15.2999 14.6002V3.40059ZM17.0999 14.6002C17.0999 15.9809 15.9804 17.1004 14.5997 17.1004H3.4001C2.01939 17.1004 0.899902 15.9809 0.899902 14.6002V3.40059C0.899902 2.01987 2.01939 0.900391 3.4001 0.900391H14.5997C15.9804 0.900391 17.0999 2.01987 17.0999 3.40059V14.6002Z"
        fill="currentColor"
      />
      <path
        d="M5.6999 16.2004V1.80039C5.6999 1.30333 6.10285 0.900391 6.5999 0.900391C7.09696 0.900391 7.4999 1.30333 7.4999 1.80039V16.2004C7.4999 16.6974 7.09696 17.1004 6.5999 17.1004C6.10285 17.1004 5.6999 16.6974 5.6999 16.2004Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ViewerCueText({
  cue,
  focusMode,
  focusedPartId,
  isCuePartFocused,
  parts,
  partMarks,
}: {
  cue: LyricCue
  focusMode: ViewerPartFocusMode
  focusedPartId: string | null
  isCuePartFocused: boolean
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
        const visibleSegmentMarks = focusedPartId
          ? segmentMarks.filter((mark) => mark.partId === focusedPartId)
          : segmentMarks
        const visualSegmentMarks = visibleSegmentMarks.filter(isVisualPartMark)
        const noteSegmentMarks = visibleSegmentMarks.filter(hasPartMarkNote)
        const fragments = splitSegmentTextByPartMarks(
          segment,
          visualSegmentMarks,
        )

        return (
          <span
            className={createViewerSegmentClassName({
              isPartFocused: focusMode === 'lane' && isCuePartFocused,
              role: segment.role,
            })}
            key={segment.id}
          >
            {segmentIndex > 0 ? (
              <span className="viewer-segment-gap"> </span>
            ) : null}
            {fragments.map((fragment) => (
              <PartMarkFragment
                cueId={cue.id}
                fragment={fragment}
                focusedPartId={focusedPartId}
                key={`${segment.id}-${fragment.startChar}-${fragment.endChar}`}
                noteMarks={noteSegmentMarks}
                parts={parts}
                segmentId={segment.id}
              />
            ))}
          </span>
        )
      })}
    </span>
  )
}

function createViewerCueClassName({
  isActive,
  isPartFocusEnabled,
  isPartFocused,
}: {
  isActive: boolean
  isPartFocusEnabled: boolean
  isPartFocused: boolean
}): string {
  return [
    'viewer-cue',
    isActive ? 'viewer-cue-active' : '',
    isPartFocusEnabled ? 'viewer-cue-part-filtered' : '',
    isPartFocusEnabled && isPartFocused ? 'viewer-cue-part-focused' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function createViewerSegmentClassName({
  isPartFocused,
  role,
}: {
  isPartFocused: boolean
  role: LyricCue['segments'][number]['role']
}): string {
  return [
    'viewer-segment',
    `viewer-segment-${role}`,
    isPartFocused ? 'viewer-segment-part-focused' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function isCueFocusedByViewerPart({
  cue,
  focusMode,
  focusedLaneIds,
  focusedPartId,
  partMarks,
}: {
  cue: LyricCue
  focusMode: ViewerPartFocusMode
  focusedLaneIds: ReadonlySet<string>
  focusedPartId: string | null
  partMarks: readonly PartMark[]
}): boolean {
  if (!focusedPartId || focusMode === 'all') {
    return false
  }

  if (focusMode === 'lane') {
    return focusedLaneIds.has(cue.laneId)
  }

  return partMarks.some(
    (mark) =>
      isVisualPartMark(mark) &&
      mark.cueId === cue.id &&
      mark.partId === focusedPartId,
  )
}

type PartMarkBodyFragment = {
  endChar: number
  noteMarks: PartMark[]
  startChar: number
  text: string
}

function PartMarkFragment({
  cueId,
  focusedPartId,
  fragment,
  noteMarks,
  parts,
  segmentId,
}: {
  cueId: string
  focusedPartId: string | null
  fragment: PartMarkTextFragment
  noteMarks: readonly PartMark[]
  parts: readonly Part[]
  segmentId: string
}) {
  const fragmentNoteMarks = noteMarks.filter((mark) =>
    rangesOverlap(mark, fragment),
  )
  const visualMarks = fragment.marks.filter(isVisualPartMark)
  const isFocusedPartFragment =
    focusedPartId !== null &&
    visualMarks.some((mark) => mark.partId === focusedPartId)
  const lineAboveMarks = getPartMarksForLineStack(
    visualMarks,
    parts,
    'line-above',
  )
  const lineBelowMarks = getPartMarksForLineStack(
    visualMarks,
    parts,
    'line-below',
  )
  const bodyFragments = splitPartMarkFragmentByNotes(
    fragment,
    fragmentNoteMarks,
  )

  return (
    <span
      className={[
        'part-mark-fragment',
        visualMarks.length > 0 ? 'part-mark-fragment-marked' : '',
        isFocusedPartFragment ? 'part-mark-fragment-focused' : '',
        fragmentNoteMarks.length > 0 ? 'part-mark-fragment-has-note' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={createPartMarkFragmentStyle(
        visualMarks,
        parts,
        isFocusedPartFragment ? focusedPartId : null,
      )}
      title={
        fragmentNoteMarks.length > 0
          ? undefined
          : formatPartMarkTitle(visualMarks, parts)
      }
    >
      <PartMarkLineStack
        marks={lineAboveMarks}
        parts={parts}
        position="above"
      />
      <span className="part-mark-fragment-body">
        {bodyFragments.map((bodyFragment) => (
          <span
            className={[
              'part-mark-body-piece',
              bodyFragment.noteMarks.length > 0
                ? 'part-mark-body-piece-has-note'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={`${bodyFragment.startChar}-${bodyFragment.endChar}`}
          >
            <span
              className="part-mark-fragment-text"
              data-cue-id={cueId}
              data-end-char={bodyFragment.endChar}
              data-part-mark-text="true"
              data-segment-id={segmentId}
              data-start-char={bodyFragment.startChar}
            >
              {bodyFragment.text}
            </span>
            {bodyFragment.noteMarks.length > 0 ? (
              <span
                className="part-mark-note-indicators"
                aria-label={formatPartMarkNoteSummary(
                  bodyFragment.noteMarks,
                  parts,
                )}
              >
                {bodyFragment.noteMarks.map((mark) => (
                  <span
                    className="part-mark-note-indicator"
                    key={`note-indicator-${mark.id}`}
                    style={createPartNoteIndicatorStyle(mark, parts)}
                    aria-hidden="true"
                  />
                ))}
              </span>
            ) : null}
            {bodyFragment.noteMarks.length > 0 ? (
              <span className="part-mark-note-tooltip" role="tooltip">
                {bodyFragment.noteMarks.map((mark) => (
                  <span
                    className="part-mark-note"
                    key={`note-${mark.id}`}
                    title={formatPartMarkLabel(mark, parts)}
                  >
                    {formatPartMarkNote(mark, parts)}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
        ))}
      </span>
      <PartMarkLineStack
        marks={lineBelowMarks}
        parts={parts}
        position="below"
      />
    </span>
  )
}

function splitPartMarkFragmentByNotes(
  fragment: PartMarkTextFragment,
  noteMarks: readonly PartMark[],
): PartMarkBodyFragment[] {
  const overlappingNoteMarks = noteMarks.filter((mark) =>
    rangesOverlap(mark, fragment),
  )
  const boundaries = new Set<number>([fragment.startChar, fragment.endChar])
  overlappingNoteMarks.forEach((mark) => {
    boundaries.add(Math.max(fragment.startChar, mark.startChar))
    boundaries.add(Math.min(fragment.endChar, mark.endChar))
  })

  const sortedBoundaries = [...boundaries].sort(
    (first, second) => first - second,
  )

  return sortedBoundaries.flatMap((startChar, index) => {
    const endChar = sortedBoundaries[index + 1]
    if (endChar === undefined || startChar === endChar) {
      return []
    }

    const localStartChar = startChar - fragment.startChar
    const localEndChar = endChar - fragment.startChar

    return {
      endChar,
      noteMarks: overlappingNoteMarks.filter(
        (mark) => mark.startChar <= startChar && endChar <= mark.endChar,
      ),
      startChar,
      text: fragment.text.slice(localStartChar, localEndChar),
    }
  })
}

function PartMarkLineStack({
  marks,
  parts,
  position,
}: {
  marks: readonly PartMark[]
  parts: readonly Part[]
  position: 'above' | 'below'
}) {
  if (marks.length === 0) {
    return null
  }

  return (
    <span
      className={`part-mark-line-stack part-mark-line-stack-${position}`}
      aria-hidden="true"
    >
      {marks.map((mark) => (
        <span
          className="part-mark-line"
          data-harmony-level={
            parts.find((part) => part.id === mark.partId)?.harmonyLevel ??
            MIN_HARMONY_LEVEL
          }
          data-part-id={mark.partId}
          key={`${position}-${mark.id}`}
          style={{ backgroundColor: getPartColor(mark.partId, parts) }}
        />
      ))}
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

type LyricDocumentHighlight = LyricCueSourceRange & {
  id: string
  laneId: string
  laneName: string
  linkId?: string
  text: string
  color: string
}

type LyricDocumentFragment = {
  id: string
  text: string
  highlights: LyricDocumentHighlight[]
}

type PartMarkDocumentHighlight = LyricCueSourceRange & {
  id: string
  cueId: string
  segmentId: string
  partId: string
  style: PartMark['style']
  note?: string
}

type HarmonyDocumentFragment = {
  id: string
  text: string
  partMarkHighlights: PartMarkDocumentHighlight[]
}

type PartMarkDocumentTarget = {
  cueId: string
  segmentId: string
  startChar: number
  endChar: number
}

function createLyricDraftFromEditedText(
  value: string,
  currentDraft: readonly LyricDraftLine[],
): LyricDraftLine[] {
  const editedLines = splitEditedLyricLines(value)
  const usedDraftIndexes = new Set<number>()
  const assignedIds = new Set<string>()
  const existingIds = new Set(currentDraft.map((line) => line.id))

  return editedLines.map((text, index) => {
    const sameIndexDraft = currentDraft[index]
    if (sameIndexDraft?.text === text) {
      usedDraftIndexes.add(index)
      assignedIds.add(sameIndexDraft.id)
      return { id: sameIndexDraft.id, text }
    }

    const matchingDraftIndex = currentDraft.findIndex(
      (draftLine, draftIndex) =>
        !usedDraftIndexes.has(draftIndex) && draftLine.text === text,
    )
    if (matchingDraftIndex >= 0) {
      usedDraftIndexes.add(matchingDraftIndex)
      const id = currentDraft[matchingDraftIndex].id
      assignedIds.add(id)
      return { id, text }
    }

    if (
      sameIndexDraft &&
      !usedDraftIndexes.has(index) &&
      !editedLines.slice(index + 1).includes(sameIndexDraft.text)
    ) {
      usedDraftIndexes.add(index)
      assignedIds.add(sameIndexDraft.id)
      return { id: sameIndexDraft.id, text }
    }

    const id = createLyricDraftLineId(existingIds, assignedIds)
    assignedIds.add(id)
    return { id, text }
  })
}

function createLyricDraftLineId(
  existingIds: ReadonlySet<string>,
  assignedIds: ReadonlySet<string>,
): string {
  let lineNumber = 1
  let candidate = `lyric-draft-${lineNumber}`
  while (existingIds.has(candidate) || assignedIds.has(candidate)) {
    lineNumber += 1
    candidate = `lyric-draft-${lineNumber}`
  }
  return candidate
}

function trimTextSelectionRange(
  documentText: string,
  range: TextSelectionRange | null,
): LyricCueSourceRange | null {
  if (!range) {
    return null
  }

  let startChar = Math.max(0, Math.min(range.startChar, documentText.length))
  let endChar = Math.max(
    startChar,
    Math.min(range.endChar, documentText.length),
  )
  while (startChar < endChar && /\s/.test(documentText[startChar])) {
    startChar += 1
  }
  while (endChar > startChar && /\s/.test(documentText[endChar - 1])) {
    endChar -= 1
  }

  return startChar < endChar ? { startChar, endChar } : null
}

function splitRangeByLyricDraftLines({
  documentText,
  lineRanges,
  range,
}: {
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  range: LyricCueSourceRange
}): LyricDraftSelectionRange[] {
  return lineRanges
    .map((lineRange) => {
      const trimmedRange = trimTextSelectionRange(documentText, {
        startChar: Math.max(range.startChar, lineRange.startChar),
        endChar: Math.min(range.endChar, lineRange.endChar),
      })
      if (!trimmedRange) {
        return null
      }

      return {
        ...trimmedRange,
        lineId: lineRange.lineId,
        lineIndex: lineRange.lineIndex,
        lineStartChar: lineRange.startChar,
        lineEndChar: lineRange.endChar,
        localStartChar: trimmedRange.startChar - lineRange.startChar,
        localEndChar: trimmedRange.endChar - lineRange.startChar,
      }
    })
    .filter((lineRange): lineRange is LyricDraftSelectionRange =>
      Boolean(lineRange),
    )
}

function createCueLinkId(laneId: string, range: LyricCueSourceRange): string {
  return `cue-link-${laneId}-${range.startChar}-${range.endChar}`
}

function createCuesForRanges({
  documentText,
  ranges,
  lane,
  existingCues,
  linkId,
}: {
  documentText: string
  ranges: readonly LyricDraftSelectionRange[]
  lane: LyricLane
  existingCues: readonly LyricCue[]
  linkId?: string
}): LyricCue[] {
  const nextCues: LyricCue[] = []

  ranges.forEach((range) => {
    nextCues.push(
      createCueFromTextSelection({
        text: documentText.slice(range.startChar, range.endChar),
        lane,
        existingCues: [...existingCues, ...nextCues],
        linkId,
        sourceId: `lyric-selection-${range.startChar}-${range.endChar}`,
        source: createLyricSegmentSourceFromSelectionRange(range),
        role: 'main',
      }),
    )
  })

  return nextCues
}

function createPartMarkTargetsFromDocumentSelection({
  documentText,
  lineRanges,
  cues,
  selectionRange,
}: {
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  cues: readonly LyricCue[]
  selectionRange: LyricCueSourceRange
}): PartMarkDocumentTarget[] {
  const fallbackSearchStartByKey = new Map<string, number>()

  return cues.flatMap((cue) => {
    const cueRange = resolveCueSourceRange(
      cue,
      documentText,
      lineRanges,
      fallbackSearchStartByKey,
    )
    if (!cueRange || !rangesOverlap(cueRange, selectionRange)) {
      return []
    }

    return cue.segments.flatMap((segment) => {
      const segmentRange = resolveSegmentSourceRange(
        cue,
        segment.id,
        cueRange,
        lineRanges,
      )
      if (!segmentRange || !rangesOverlap(segmentRange, selectionRange)) {
        return []
      }

      const localRange = trimTextSelectionRange(segment.text, {
        startChar:
          Math.max(selectionRange.startChar, segmentRange.startChar) -
          segmentRange.startChar,
        endChar:
          Math.min(selectionRange.endChar, segmentRange.endChar) -
          segmentRange.startChar,
      })
      if (!localRange) {
        return []
      }

      return {
        cueId: cue.id,
        segmentId: segment.id,
        ...localRange,
      }
    })
  })
}

function createPartMarkTargetsFromViewerSelection(
  root: HTMLElement,
): PartMarkDocumentTarget[] {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return []
  }

  const selectionRange = selection.getRangeAt(0)
  if (
    !root.contains(selectionRange.startContainer) &&
    !root.contains(selectionRange.endContainer)
  ) {
    return []
  }

  const targets = Array.from(
    root.querySelectorAll<HTMLElement>('[data-part-mark-text="true"]'),
  ).flatMap((element) => {
    if (!rangeIntersectsElement(selectionRange, element)) {
      return []
    }

    const cueId = element.dataset.cueId
    const segmentId = element.dataset.segmentId
    const baseStartChar = Number(element.dataset.startChar)
    const baseEndChar = Number(element.dataset.endChar)
    const text = element.textContent ?? ''
    if (
      !cueId ||
      !segmentId ||
      !Number.isFinite(baseStartChar) ||
      !Number.isFinite(baseEndChar) ||
      baseEndChar < baseStartChar
    ) {
      return []
    }

    const localStartChar = element.contains(selectionRange.startContainer)
      ? getSelectionTextLengthBefore(element, {
          node: selectionRange.startContainer,
          offset: selectionRange.startOffset,
        })
      : 0
    const localEndChar = element.contains(selectionRange.endContainer)
      ? getSelectionTextLengthBefore(element, {
          node: selectionRange.endContainer,
          offset: selectionRange.endOffset,
        })
      : text.length
    const localRange = trimTextSelectionRange(text, {
      startChar: localStartChar,
      endChar: localEndChar,
    })
    if (!localRange) {
      return []
    }

    return {
      cueId,
      segmentId,
      startChar: baseStartChar + localRange.startChar,
      endChar: baseStartChar + localRange.endChar,
    }
  })

  return mergeAdjacentPartMarkTargets(targets)
}

function mergeAdjacentPartMarkTargets(
  targets: readonly PartMarkDocumentTarget[],
): PartMarkDocumentTarget[] {
  return targets.reduce<PartMarkDocumentTarget[]>((mergedTargets, target) => {
    const previousTarget = mergedTargets.at(-1)
    if (
      previousTarget &&
      previousTarget.cueId === target.cueId &&
      previousTarget.segmentId === target.segmentId &&
      previousTarget.endChar >= target.startChar
    ) {
      previousTarget.endChar = Math.max(previousTarget.endChar, target.endChar)
      return mergedTargets
    }

    mergedTargets.push({ ...target })
    return mergedTargets
  }, [])
}

function rangeIntersectsElement(range: Range, element: HTMLElement): boolean {
  if (typeof range.intersectsNode === 'function') {
    return range.intersectsNode(element)
  }

  const elementRange = document.createRange()
  elementRange.selectNodeContents(element)

  return (
    range.compareBoundaryPoints(Range.END_TO_START, elementRange) > 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, elementRange) < 0
  )
}

function findMatchingLaneHighlights({
  highlights,
  laneId,
  range,
}: {
  highlights: readonly LyricDocumentHighlight[]
  laneId: string
  range: LyricCueSourceRange
}): LyricDocumentHighlight[] {
  return highlights.filter(
    (highlight) =>
      highlight.laneId === laneId && rangesOverlap(highlight, range),
  )
}

function createCueReplacementsAfterRangeRemoval({
  cue,
  lane,
  documentText,
  lineRanges,
  highlight,
  removalRange,
  existingCues,
}: {
  cue: LyricCue
  lane: LyricLane
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  highlight: LyricDocumentHighlight
  removalRange: LyricCueSourceRange
  existingCues: readonly LyricCue[]
}): LyricCue[] {
  const removalStart = Math.max(highlight.startChar, removalRange.startChar)
  const removalEnd = Math.min(highlight.endChar, removalRange.endChar)
  const remainingRanges = [
    trimTextSelectionRange(documentText, {
      startChar: highlight.startChar,
      endChar: removalStart,
    }),
    trimTextSelectionRange(documentText, {
      startChar: removalEnd,
      endChar: highlight.endChar,
    }),
  ].filter((range): range is LyricCueSourceRange => Boolean(range))

  return remainingRanges.flatMap((remainingRange) =>
    splitRangeByLyricDraftLines({
      documentText,
      lineRanges,
      range: remainingRange,
    }).map((range) =>
      createCueFromTextSelection({
        text: documentText.slice(range.startChar, range.endChar),
        lane,
        existingCues,
        linkId: cue.linkId,
        sourceId: `lyric-selection-${range.startChar}-${range.endChar}`,
        source: createLyricSegmentSourceFromSelectionRange(range),
        role: cue.segments[0]?.role ?? 'main',
      }),
    ),
  )
}

function createLyricDocumentHighlights({
  documentText,
  lineRanges,
  cues,
  project,
}: {
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  cues: readonly LyricCue[]
  project: EazyChorusProject
}): LyricDocumentHighlight[] {
  const fallbackSearchStartByKey = new Map<string, number>()

  return cues
    .map((cue) => {
      const cueText = getCueText(cue)
      const sourceRange = resolveCueSourceRange(
        cue,
        documentText,
        lineRanges,
        fallbackSearchStartByKey,
      )
      if (!sourceRange) {
        return null
      }

      return {
        id: cue.id,
        laneId: cue.laneId,
        laneName: getLaneName(cue.laneId, project),
        ...(cue.linkId ? { linkId: cue.linkId } : {}),
        text: cueText,
        color: getLaneHighlightColor(cue.laneId, project),
        ...sourceRange,
      }
    })
    .filter((highlight): highlight is LyricDocumentHighlight =>
      Boolean(highlight),
    )
}

function createPartMarkDocumentHighlights({
  documentText,
  lineRanges,
  cues,
  partMarks,
  project,
}: {
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  cues: readonly LyricCue[]
  partMarks: readonly PartMark[]
  project: EazyChorusProject
}): PartMarkDocumentHighlight[] {
  const fallbackSearchStartByKey = new Map<string, number>()

  return cues.flatMap((cue) => {
    const cueRange = resolveCueSourceRange(
      cue,
      documentText,
      lineRanges,
      fallbackSearchStartByKey,
    )
    if (!cueRange) {
      return []
    }

    return cue.segments.flatMap((segment) => {
      const segmentRange = resolveSegmentSourceRange(
        cue,
        segment.id,
        cueRange,
        lineRanges,
      )
      if (!segmentRange) {
        return []
      }

      return partMarks
        .filter(
          (mark) =>
            isVisualPartMark(mark) &&
            mark.cueId === cue.id &&
            mark.segmentId === segment.id &&
            mark.startChar >= 0 &&
            mark.endChar > mark.startChar &&
            mark.endChar <= segment.text.length &&
            project.parts.some((part) => part.id === mark.partId),
        )
        .map((mark) => ({
          id: mark.id,
          cueId: mark.cueId,
          segmentId: mark.segmentId,
          partId: mark.partId,
          style: mark.style,
          ...(hasPartMarkNote(mark) ? { note: mark.note.trim() } : {}),
          startChar: segmentRange.startChar + mark.startChar,
          endChar: segmentRange.startChar + mark.endChar,
        }))
    })
  })
}

function resolveCueSourceRange(
  cue: LyricCue,
  documentText: string,
  lineRanges: readonly LyricDraftLineRange[],
  fallbackSearchStartByKey: Map<string, number>,
): LyricCueSourceRange | null {
  const segmentSourceRanges = cue.segments
    .map((segment) =>
      resolveLyricSegmentSourceRange(segment.source, lineRanges),
    )
    .filter((range): range is LyricCueSourceRange => Boolean(range))
  if (segmentSourceRanges.length > 0) {
    return {
      startChar: Math.min(
        ...segmentSourceRanges.map((range) => range.startChar),
      ),
      endChar: Math.max(...segmentSourceRanges.map((range) => range.endChar)),
    }
  }

  if (isValidSourceRange(cue.sourceRange, documentText.length)) {
    return cue.sourceRange
  }

  const cueText = getCueText(cue)
  if (cueText.trim().length === 0) {
    return null
  }

  const searchKey = `${cue.laneId}:${cueText}`
  const searchStart = fallbackSearchStartByKey.get(searchKey) ?? 0
  let startChar = documentText.indexOf(cueText, searchStart)
  if (startChar < 0) {
    startChar = documentText.indexOf(cueText)
  }
  if (startChar < 0) {
    return null
  }

  const endChar = startChar + cueText.length
  fallbackSearchStartByKey.set(searchKey, endChar)
  return { startChar, endChar }
}

function resolveSegmentSourceRange(
  cue: LyricCue,
  segmentId: string,
  cueRange: LyricCueSourceRange,
  lineRanges: readonly LyricDraftLineRange[],
): LyricCueSourceRange | null {
  let offset = 0

  for (const segment of cue.segments) {
    const sourceRange = resolveLyricSegmentSourceRange(
      segment.source,
      lineRanges,
    )
    if (segment.id === segmentId && sourceRange) {
      return sourceRange
    }

    const startChar = cueRange.startChar + offset
    const endChar = startChar + segment.text.length
    if (segment.id === segmentId) {
      return { startChar, endChar }
    }

    offset += segment.text.length + 1
  }

  return null
}

function splitLyricDocumentByHighlights(
  documentText: string,
  highlights: readonly LyricDocumentHighlight[],
): LyricDocumentFragment[] {
  if (documentText.length === 0) {
    return []
  }

  const boundaries = new Set([0, documentText.length])
  const connectedBoundaries = getConnectedHighlightBoundaries(
    documentText,
    highlights,
  )
  highlights.forEach((highlight) => {
    if (!connectedBoundaries.has(highlight.startChar)) {
      boundaries.add(highlight.startChar)
    }
    if (!connectedBoundaries.has(highlight.endChar)) {
      boundaries.add(highlight.endChar)
    }
  })
  const sortedBoundaries = [...boundaries].sort(
    (first, second) => first - second,
  )

  return sortedBoundaries.slice(0, -1).map((startChar, index) => {
    const endChar = sortedBoundaries[index + 1]
    const coveredHighlights = highlights.filter((highlight) =>
      rangesOverlap(highlight, { startChar, endChar }),
    )

    return {
      id: `${startChar}-${endChar}`,
      text: documentText.slice(startChar, endChar),
      highlights: coveredHighlights,
    }
  })
}

function splitHarmonyDocumentByHighlights({
  documentText,
  partMarkHighlights,
}: {
  documentText: string
  partMarkHighlights: readonly PartMarkDocumentHighlight[]
}): HarmonyDocumentFragment[] {
  if (documentText.length === 0) {
    return []
  }

  const boundaries = new Set([0, documentText.length])
  partMarkHighlights.forEach((highlight) => {
    boundaries.add(highlight.startChar)
    boundaries.add(highlight.endChar)
  })

  const sortedBoundaries = [...boundaries].sort(
    (first, second) => first - second,
  )

  return sortedBoundaries.slice(0, -1).map((startChar, index) => {
    const endChar = sortedBoundaries[index + 1]
    const range = { startChar, endChar }

    return {
      id: `${startChar}-${endChar}`,
      text: documentText.slice(startChar, endChar),
      partMarkHighlights: partMarkHighlights.filter((highlight) =>
        rangesOverlap(highlight, range),
      ),
    }
  })
}

function getConnectedHighlightBoundaries(
  documentText: string,
  highlights: readonly LyricDocumentHighlight[],
): Set<number> {
  const connectedBoundaries = new Set<number>()
  const linkedHighlights = highlights
    .filter((highlight) => highlight.linkId)
    .sort((first, second) => first.startChar - second.startChar)

  linkedHighlights.forEach((previousHighlight) => {
    const nextHighlight = linkedHighlights.find(
      (highlight) =>
        highlight.linkId === previousHighlight.linkId &&
        highlight.startChar > previousHighlight.endChar &&
        documentText
          .slice(previousHighlight.endChar, highlight.startChar)
          .trim().length === 0,
    )

    if (nextHighlight) {
      connectedBoundaries.add(previousHighlight.endChar)
      connectedBoundaries.add(nextHighlight.startChar)
    }
  })

  return connectedBoundaries
}

function createLyricHighlightStyle(
  highlights: readonly LyricDocumentHighlight[],
  selectedLaneId: string,
): CSSProperties {
  const selectedHighlight = highlights.find(
    (highlight) => highlight.laneId === selectedLaneId,
  )
  const primaryHighlight = selectedHighlight ?? highlights[0]
  const underlineColors = [
    ...(selectedHighlight ? [selectedHighlight.color] : []),
    ...highlights
      .map((highlight) => highlight.color)
      .filter((color) => color !== selectedHighlight?.color),
  ].slice(0, 3)

  return {
    backgroundColor: `${primaryHighlight.color}33`,
    boxShadow: underlineColors
      .map((color, index) => `inset 0 -${(index + 1) * 3}px 0 ${color}`)
      .join(', '),
  }
}

function formatLyricHighlightTitle(
  highlights: readonly LyricDocumentHighlight[],
): string {
  return highlights.map((highlight) => highlight.laneName).join(', ')
}

function getLaneHighlightColor(
  laneId: string,
  project: EazyChorusProject,
): string {
  const lane = project.lyricLanes.find((item) => item.id === laneId)
  return lane?.partId ? getPartColor(lane.partId, project.parts) : '#0f766e'
}

function isValidSourceRange(
  range: LyricCueSourceRange | undefined,
  documentLength: number,
): range is LyricCueSourceRange {
  return (
    range !== undefined &&
    Number.isFinite(range.startChar) &&
    Number.isFinite(range.endChar) &&
    range.startChar >= 0 &&
    range.startChar < range.endChar &&
    range.endChar <= documentLength
  )
}

function rangesOverlap(
  first: LyricCueSourceRange,
  second: LyricCueSourceRange,
): boolean {
  return first.startChar < second.endChar && second.startChar < first.endChar
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

function clearTextSelection() {
  window.getSelection()?.removeAllRanges()
}

function createExistingMediaPathSet(project: EazyChorusProject): Set<string> {
  return new Set(project.media.map((track) => track.path))
}

function findReusableAudioPartIndex(
  parts: readonly Part[],
  media: readonly MediaTrack[],
): number {
  return parts.findIndex(
    (part) =>
      part.defaultTrackId === undefined &&
      !media.some(
        (track) => track.role === 'part-audio' && track.partId === part.id,
      ),
  )
}

function getAudioPartName(file: File): string {
  return stripFileExtension(file.name)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLikelyMrAudioFile(file: File): boolean {
  const normalizedName = stripFileExtension(file.name)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')

  return /\b(mr|mix|full mix|inst|instrumental|karaoke|off vocal)\b/.test(
    normalizedName,
  )
}

function stripFileExtension(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
}

function createPartMarkDocumentStyle(
  highlights: readonly PartMarkDocumentHighlight[],
  parts: readonly Part[],
): CSSProperties {
  const primaryHighlight = highlights[0]
  const primaryColor = getPartColor(primaryHighlight.partId, parts)
  const colors = highlights
    .map((highlight) => getPartColor(highlight.partId, parts))
    .filter((color, index, allColors) => allColors.indexOf(color) === index)
    .slice(0, 3)

  return {
    backgroundColor: `${primaryColor}40`,
    boxShadow: colors
      .map((color, index) => `inset 0 -${(index + 1) * 3}px 0 ${color}`)
      .join(', '),
  }
}

function formatPartMarkDocumentTitle(
  highlights: readonly PartMarkDocumentHighlight[],
  parts: readonly Part[],
): string {
  return highlights
    .map((highlight) => {
      const partName = parts.find((part) => part.id === highlight.partId)?.name
      if (!partName) {
        return null
      }

      return highlight.note ? `${partName}: ${highlight.note}` : partName
    })
    .filter((partName): partName is string => Boolean(partName))
    .join(', ')
}

function createPartMarkFragmentStyle(
  marks: readonly PartMark[],
  parts: readonly Part[],
  focusedPartId: string | null = null,
): CSSProperties {
  const highlightMark = getPartMarksByStyle(marks, parts, 'highlight')[0]
  const style: CSSProperties = {}

  if (focusedPartId && marks.length > 0) {
    style.backgroundColor = `${getPartColor(focusedPartId, parts)}40`
  } else if (highlightMark) {
    style.backgroundColor = `${getPartColor(highlightMark.partId, parts)}33`
  }

  return style
}

function getPartMarksByStyle(
  marks: readonly PartMark[],
  parts: readonly Part[],
  style: PartMark['style'],
): PartMark[] {
  return sortPartMarksByLevel(
    marks.filter((mark) => mark.style === style),
    parts,
    'near-to-far',
  )
}

function getPartMarksForLineStack(
  marks: readonly PartMark[],
  parts: readonly Part[],
  style: 'line-above' | 'line-below',
): PartMark[] {
  return sortPartMarksByLevel(
    marks.filter((mark) => mark.style === style),
    parts,
    style === 'line-above' ? 'far-to-near' : 'near-to-far',
  )
}

function sortPartMarksByLevel(
  marks: readonly PartMark[],
  parts: readonly Part[],
  direction: 'near-to-far' | 'far-to-near',
): PartMark[] {
  const partOrder = new Map(parts.map((part, index) => [part.id, index]))

  return [...marks].sort((first, second) => {
    const firstPart = parts.find((part) => part.id === first.partId)
    const secondPart = parts.find((part) => part.id === second.partId)
    const firstLevel = firstPart?.harmonyLevel ?? MIN_HARMONY_LEVEL
    const secondLevel = secondPart?.harmonyLevel ?? MIN_HARMONY_LEVEL
    const levelDelta =
      direction === 'near-to-far'
        ? firstLevel - secondLevel
        : secondLevel - firstLevel

    if (levelDelta !== 0) {
      return levelDelta
    }

    return (
      (partOrder.get(first.partId) ?? Number.MAX_SAFE_INTEGER) -
      (partOrder.get(second.partId) ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

function normalizeHarmonyLevelInput(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_HARMONY_LEVEL
  }

  return Math.min(
    MAX_HARMONY_LEVEL,
    Math.max(MIN_HARMONY_LEVEL, Math.round(value)),
  )
}

function hasPartMarkNote(mark: PartMark): mark is PartMark & { note: string } {
  return typeof mark.note === 'string' && mark.note.trim().length > 0
}

function isVisualPartMark(mark: PartMark): boolean {
  return !hasPartMarkNote(mark)
}

function formatPartMarkNote(mark: PartMark, parts: readonly Part[]): string {
  const partName =
    parts.find((part) => part.id === mark.partId)?.name ?? mark.partId

  return `${partName}: ${mark.note?.trim() ?? ''}`
}

function formatPartMarkNoteSummary(
  marks: readonly PartMark[],
  parts: readonly Part[],
): string {
  return marks.map((mark) => formatPartMarkNote(mark, parts)).join(', ')
}

function createPartNoteIndicatorStyle(
  mark: PartMark,
  parts: readonly Part[],
): CSSProperties {
  return {
    '--part-note-color': getPartColor(mark.partId, parts),
  } as CSSProperties
}

function formatPartMarkAnnotationSource(
  mark: PartMark,
  project: EazyChorusProject,
): string {
  const cue = project.cues.find((item) => item.id === mark.cueId)
  const segment = cue?.segments.find((item) => item.id === mark.segmentId)
  const text = segment?.text.slice(mark.startChar, mark.endChar).trim()

  return text || `${mark.startChar}-${mark.endChar}`
}

function formatPartMarkLabel(mark: PartMark, parts: readonly Part[]): string {
  const partName =
    parts.find((part) => part.id === mark.partId)?.name ?? mark.partId

  const rangeLabel = `${partName} ${mark.startChar}-${mark.endChar}`
  return hasPartMarkNote(mark)
    ? `${rangeLabel}: ${mark.note.trim()}`
    : rangeLabel
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

function getLaneName(laneId: string, project: EazyChorusProject): string {
  return project.lyricLanes.find((lane) => lane.id === laneId)?.name ?? laneId
}

function formatLanePartMatch(
  lane: LyricLane,
  parts: readonly Part[],
  media: readonly MediaTrack[],
): string {
  const part = parts.find((item) => item.id === lane.partId)
  if (!part) {
    return 'part 미연결'
  }

  return `${part.name} / ${formatPartAudioVariant(part, media)}`
}

function formatPartAudioVariant(
  part: Part,
  media: readonly MediaTrack[],
): string {
  const activeTrack =
    media.find((track) => track.id === part.defaultTrackId) ??
    media.find(
      (track) =>
        track.role === 'part-audio' &&
        track.partId === part.id &&
        track.enabled,
    )

  if (!activeTrack) {
    return 'audio variant 미지정'
  }

  return `${activeTrack.title} / ${activeTrack.variant ?? 'custom'}`
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

function formatSyncCueRange(cue: LyricCue): string {
  return isCueOpenForSync(cue)
    ? `${formatDuration(cue.startMs)} - End 대기`
    : formatCueRange(cue)
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
  return (
    isTextEntryKeyboardTarget(target) ||
    (target instanceof HTMLElement && target instanceof HTMLButtonElement)
  )
}

function isTextEntryKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
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
