import { useMemo, useRef, useState } from 'react'
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
  const [isExporting, setIsExporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const mrInputRef = useRef<HTMLInputElement | null>(null)
  const partAudioInputRef = useRef<HTMLInputElement | null>(null)

  const validationIssues = useMemo(
    () =>
      validateProjectPayload(project, new Set(Object.keys(mediaFiles))).issues,
    [mediaFiles, project],
  )
  const validationErrors = validationIssues.filter(
    (issue) => issue.severity === 'error',
  )
  const validationWarnings = validationIssues.filter(
    (issue) => issue.severity === 'warning',
  )
  const mrTrack = project.media.find((track) => track.role === 'mr')
  const exportDisabled = isExporting || hasValidationErrors(validationIssues)

  function resetToNewProject() {
    const nextProject = createNewProject()
    setProject(nextProject)
    setMediaFiles({})
    setSelectedPartId(nextProject.parts[0]?.id ?? '')
    setNewPartName('')
    setImportIssues([])
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
        media: [...currentProject.media, track],
        parts: currentProject.parts.map((part) =>
          part.id === selectedPartId && !part.defaultTrackId
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
    setStatusMessage(`${track.title} 음원을 제거했습니다.`)
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

    setProject(result.package.project)
    setMediaFiles(result.package.mediaFiles)
    setSelectedPartId(result.package.project.parts[0]?.id ?? '')
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
