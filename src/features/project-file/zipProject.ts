import JSZip from 'jszip'
import type {
  EazyChorusProject,
  ProjectMediaFiles,
  ProjectPackage,
} from './types'
import {
  hasValidationErrors,
  validateProjectPayload,
  type ValidationIssue,
} from './validation'

const PROJECT_JSON_PATH = 'project.json'

export type ImportProjectPackageResult = {
  package: ProjectPackage | null
  issues: ValidationIssue[]
}

export class ProjectPackageValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(message: string, issues: ValidationIssue[]) {
    super(message)
    this.name = 'ProjectPackageValidationError'
    this.issues = issues
  }
}

export async function exportProjectPackage({
  project,
  mediaFiles,
}: ProjectPackage): Promise<Blob> {
  const mediaPaths = new Set(Object.keys(mediaFiles))
  const validation = validateProjectPayload(project, mediaPaths)
  if (hasValidationErrors(validation.issues)) {
    throw new ProjectPackageValidationError(
      '프로젝트 파일을 내보낼 수 없습니다.',
      validation.issues,
    )
  }

  const zip = new JSZip()
  zip.file(PROJECT_JSON_PATH, JSON.stringify(project, null, 2))

  await Promise.all(
    project.media.map(async (track) => {
      const mediaFile = mediaFiles[track.path]
      if (!mediaFile) {
        return
      }
      zip.file(track.path, await mediaFile.arrayBuffer())
    }),
  )

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

export async function importProjectPackage(
  file: File,
): Promise<ImportProjectPackageResult> {
  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    return {
      package: null,
      issues: [
        {
          severity: 'error',
          path: file.name,
          message: '유효한 .eazychorus ZIP 파일이 아닙니다.',
        },
      ],
    }
  }

  const projectJson = zip.file(PROJECT_JSON_PATH)
  if (!projectJson) {
    return {
      package: null,
      issues: [
        {
          severity: 'error',
          path: PROJECT_JSON_PATH,
          message: 'ZIP 내부에 project.json이 없습니다.',
        },
      ],
    }
  }

  let projectPayload: unknown
  try {
    projectPayload = JSON.parse(await projectJson.async('string'))
  } catch {
    return {
      package: null,
      issues: [
        {
          severity: 'error',
          path: PROJECT_JSON_PATH,
          message: 'project.json을 JSON으로 해석할 수 없습니다.',
        },
      ],
    }
  }

  const mediaPaths = new Set(
    Object.keys(zip.files).filter(
      (path) => path.startsWith('media/') && !zip.files[path].dir,
    ),
  )
  const validation = validateProjectPayload(projectPayload, mediaPaths)
  if (!validation.project) {
    return { package: null, issues: validation.issues }
  }

  const mediaFiles = await buildMediaFiles(validation.project, zip)

  return {
    package: {
      project: validation.project,
      mediaFiles,
    },
    issues: validation.issues,
  }
}

async function buildMediaFiles(
  project: EazyChorusProject,
  zip: JSZip,
): Promise<ProjectMediaFiles> {
  const mediaFiles: ProjectMediaFiles = {}

  await Promise.all(
    project.media.map(async (track) => {
      const entry = zip.file(track.path)
      if (!entry) {
        return
      }

      mediaFiles[track.path] = new Blob([await entry.async('arraybuffer')], {
        type: track.mimeType ?? 'application/octet-stream',
      })
    }),
  )

  return mediaFiles
}
