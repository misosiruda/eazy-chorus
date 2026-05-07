import { useEffect, useMemo, useRef, useState } from 'react'
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
  createMediaTrack,
  createNewProject,
  createPart,
  exportProjectPackage,
  formatValidationIssue,
  hasValidationErrors,
  importProjectPackage,
  type EazyChorusProject,
  type MediaTrack,
  type MediaVariant,
  type Part,
  type ProjectMediaFiles,
  sanitizeFileName,
  touchProject,
  validateProjectPayload,
  type ValidationIssue,
} from '../features/project-file'

type ProjectMetaTextField = 'title' | 'artist' | 'key' | 'memo'

const MEDIA_VARIANT_OPTIONS: { value: MediaVariant; label: string }[] = [
  { value: 'fx', label: 'FX' },
  { value: 'no-fx', label: 'No FX' },
  { value: 'pitch-corrected', label: 'Pitch corrected' },
  { value: 'guide', label: 'Guide' },
  { value: 'custom', label: 'Custom' },
]

const PLAYBACK_RATE_OPTIONS = [0.75, 0.9, 1, 1.1]

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
  const [isExporting, setIsExporting] = useState(false)
  const [audioPositionMs, setAudioPositionMs] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isAudioPreparing, setIsAudioPreparing] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [playbackRate, setPlaybackRate] = useState(
    () => project.settings.defaultPlaybackRate,
  )
  const audioEngineRef = useRef<AudioPlaybackEngine | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const mrInputRef = useRef<HTMLInputElement | null>(null)
  const partAudioInputRef = useRef<HTMLInputElement | null>(null)
  const lyricSourcePreviewRef = useRef<HTMLDivElement | null>(null)
  const lyricExtractPreviewRef = useRef<HTMLDivElement | null>(null)
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
  const audioDurationMs = getProjectDurationMs(project)
  const activeTrackCount = project.media.filter((track) => track.enabled).length
  const lyricDraft = project.lyricDraft ?? []
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
      if (audioDurationMs > 0 && nextPositionMs >= audioDurationMs) {
        audioEngine.pause()
        setAudioPositionMs(audioDurationMs)
        setIsAudioPlaying(false)
        return
      }

      setAudioPositionMs(nextPositionMs)
    }, 120)

    return () => window.clearInterval(timerId)
  }, [audioDurationMs, isAudioPlaying])

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
    setAudioPositionMs(0)
    setIsAudioPlaying(false)
    setAudioError('')
    setPlaybackRate(nextProject.settings.defaultPlaybackRate)
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
    patch: Partial<Pick<Part, 'name' | 'color'>>,
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

    setProject((currentProject) =>
      touchProject({
        ...currentProject,
        lyricDraft: nextDraft,
      }),
    )
    setStatusMessage(`${nextDraft.length}줄 lyric draft를 저장했습니다.`)
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

  function updatePartAudioVariant(partId: string, trackId: string) {
    setProject((currentProject) =>
      touchProject(selectPartAudioVariant(currentProject, partId, trackId)),
    )
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
    setAudioPositionMs(0)
    setIsAudioPlaying(false)
    setAudioError('')
    setLyricsSource('')
    setImportBlocks([])
    setPlaybackRate(result.package.project.settings.defaultPlaybackRate)
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
            {project.parts.map((part) => (
              <div className="part-item" key={part.id}>
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
                <span>{part.defaultTrackId ?? 'defaultTrackId 없음'}</span>
              </div>
            ))}
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

function createExistingMediaPathSet(project: EazyChorusProject): Set<string> {
  return new Set(project.media.map((track) => track.path))
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
