export {
  EAZY_CHORUS_APP_ID,
  PROJECT_SCHEMA_VERSION,
  SUPPORTED_PROJECT_SCHEMA_VERSIONS,
} from './types'
export {
  createMediaTrack,
  createNewProject,
  createPart,
  createUniqueMediaPath,
  sanitizeFileName,
  touchProject,
} from './projectFactory'
export type {
  EazyChorusProject,
  LyricCue,
  LyricCueSourceRange,
  LyricDraftLine,
  LyricLane,
  LyricRole,
  LyricSegment,
  LyricSegmentSource,
  MarkStyle,
  MediaRole,
  MediaTrack,
  MediaVariant,
  Part,
  PartMark,
  ProjectMediaFiles,
  ProjectPackage,
  ProjectSettings,
} from './types'
export {
  createLyricDraftDocumentText,
  createLyricDraftLineRanges,
  createLyricSegmentSourceFromSelectionRange,
  migrateLegacyLyricSources,
  resolveLyricSegmentSourceRange,
  syncProjectLyricSegmentTexts,
  type LyricDraftLineRange,
  type LyricDraftSelectionRange,
} from './lyricSources'
export {
  formatValidationIssue,
  hasValidationErrors,
  validateProjectPayload,
} from './validation'
export type { ProjectValidationResult, ValidationIssue } from './validation'
export {
  exportProjectPackage,
  importProjectPackage,
  ProjectPackageValidationError,
} from './zipProject'
export type { ImportProjectPackageResult } from './zipProject'
