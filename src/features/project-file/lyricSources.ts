import type {
  EazyChorusProject,
  LyricCue,
  LyricCueSourceRange,
  LyricDraftLine,
  LyricSegmentSource,
  PartMark,
} from './types'

export type LyricDraftLineRange = LyricCueSourceRange & {
  lineId: string
  lineIndex: number
}

export type LyricDraftSelectionRange = LyricCueSourceRange & {
  lineId: string
  lineIndex: number
  lineStartChar: number
  lineEndChar: number
  localStartChar: number
  localEndChar: number
}

type ResolvedLyricSegmentSource = {
  source: LyricSegmentSource
  text: string
}

export function createLyricDraftDocumentText(
  draftLines: readonly LyricDraftLine[],
): string {
  return draftLines.map((line) => line.text).join('\n')
}

export function createLyricDraftLineRanges(
  draftLines: readonly LyricDraftLine[],
): LyricDraftLineRange[] {
  let cursor = 0

  return draftLines.map((line, lineIndex) => {
    const startChar = cursor
    const endChar = startChar + line.text.length
    cursor = endChar + 1

    return {
      lineId: line.id,
      lineIndex,
      startChar,
      endChar,
    }
  })
}

export function createLyricSegmentSourceFromSelectionRange(
  range: LyricDraftSelectionRange,
): LyricSegmentSource {
  const isWholeLine =
    range.localStartChar === 0 &&
    range.localEndChar === range.lineEndChar - range.lineStartChar

  return {
    draftLineId: range.lineId,
    startChar: range.localStartChar,
    endChar: range.localEndChar,
    ...(isWholeLine ? { wholeLine: true } : {}),
  }
}

export function resolveLyricSegmentSourceRange(
  source: LyricSegmentSource | undefined,
  lineRanges: readonly LyricDraftLineRange[],
): LyricCueSourceRange | null {
  if (!source) {
    return null
  }

  const lineRange = lineRanges.find((line) => line.lineId === source.draftLineId)
  if (!lineRange) {
    return null
  }

  const lineLength = lineRange.endChar - lineRange.startChar
  const startChar = source.wholeLine ? 0 : source.startChar
  const endChar = source.wholeLine ? lineLength : source.endChar
  if (
    !Number.isFinite(startChar) ||
    !Number.isFinite(endChar) ||
    startChar < 0 ||
    startChar >= endChar ||
    endChar > lineLength
  ) {
    return null
  }

  return {
    startChar: lineRange.startChar + startChar,
    endChar: lineRange.startChar + endChar,
  }
}

export function syncProjectLyricSegmentTexts(
  project: EazyChorusProject,
): EazyChorusProject {
  let didChange = false

  const cues = project.cues.map((cue) => {
    const nextCue = syncCueLyricSegmentTexts(cue, project.lyricDraft)
    if (nextCue !== cue) {
      didChange = true
    }
    return nextCue
  })
  const partMarks = clampPartMarksToCueSegments(project.partMarks, cues)
  if (partMarks !== project.partMarks) {
    didChange = true
  }

  return didChange ? { ...project, cues, partMarks } : project
}

export function migrateLegacyLyricSources(
  project: EazyChorusProject,
): EazyChorusProject {
  const documentText = createLyricDraftDocumentText(project.lyricDraft)
  const lineRanges = createLyricDraftLineRanges(project.lyricDraft)
  const fallbackSearchStartByKey = new Map<string, number>()
  let didChange = false

  const cues = project.cues.map((cue) => {
    const nextCue = migrateCueLyricSources({
      cue,
      documentText,
      lineRanges,
      fallbackSearchStartByKey,
    })
    if (nextCue !== cue) {
      didChange = true
    }
    return nextCue
  })

  const migratedProject = didChange ? { ...project, cues } : project
  return syncProjectLyricSegmentTexts(migratedProject)
}

function syncCueLyricSegmentTexts(
  cue: LyricCue,
  draftLines: readonly LyricDraftLine[],
): LyricCue {
  let didChange = false
  const segments = cue.segments.map((segment) => {
    const resolvedSource = resolveLyricSegmentSource(
      segment.source,
      draftLines,
    )
    if (!resolvedSource) {
      return segment
    }

    if (
      segment.text === resolvedSource.text &&
      areSourcesEqual(segment.source, resolvedSource.source)
    ) {
      return segment
    }

    didChange = true
    return {
      ...segment,
      text: resolvedSource.text,
      source: resolvedSource.source,
    }
  })

  return didChange ? { ...cue, segments } : cue
}

function resolveLyricSegmentSource(
  source: LyricSegmentSource | undefined,
  draftLines: readonly LyricDraftLine[],
): ResolvedLyricSegmentSource | null {
  if (!source) {
    return null
  }

  const draftLine = draftLines.find((line) => line.id === source.draftLineId)
  if (!draftLine) {
    return null
  }

  const lineLength = draftLine.text.length
  const startChar = source.wholeLine
    ? 0
    : Math.max(0, Math.min(Math.floor(source.startChar), lineLength))
  const endChar = source.wholeLine
    ? lineLength
    : Math.max(startChar, Math.min(Math.ceil(source.endChar), lineLength))
  if (startChar >= endChar) {
    return null
  }

  return {
    text: draftLine.text.slice(startChar, endChar),
    source: {
      draftLineId: source.draftLineId,
      startChar,
      endChar,
      ...(source.wholeLine ? { wholeLine: true } : {}),
    },
  }
}

function migrateCueLyricSources({
  cue,
  documentText,
  lineRanges,
  fallbackSearchStartByKey,
}: {
  cue: LyricCue
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  fallbackSearchStartByKey: Map<string, number>
}): LyricCue {
  if (cue.segments.every((segment) => segment.source)) {
    return cue
  }

  const cueRange = resolveLegacyCueRange({
    cue,
    documentText,
    lineRanges,
    fallbackSearchStartByKey,
  })
  let segmentOffset = 0
  let didChange = false
  const segments = cue.segments.map((segment) => {
    if (segment.source) {
      segmentOffset += segment.text.length + 1
      return segment
    }

    const segmentRange = cueRange
      ? {
          startChar: cueRange.startChar + segmentOffset,
          endChar: cueRange.startChar + segmentOffset + segment.text.length,
        }
      : resolveTextRangeInDraftDocument({
          searchKey: `${cue.laneId}:${segment.text}`,
          searchText: segment.text,
          documentText,
          fallbackSearchStartByKey,
        })
    const source = segmentRange
      ? createSourceFromDocumentRange(segmentRange, lineRanges, {
          forceWholeLine:
            cue.segments.length === 1 &&
            documentText.slice(segmentRange.startChar, segmentRange.endChar) !==
              segment.text,
        })
      : null
    segmentOffset += segment.text.length + 1

    if (!source) {
      return segment
    }

    didChange = true
    return { ...segment, source }
  })

  if (!didChange) {
    return cue
  }

  const cueWithoutLegacySourceRange = { ...cue }
  delete cueWithoutLegacySourceRange.sourceRange
  return { ...cueWithoutLegacySourceRange, segments }
}

function resolveLegacyCueRange({
  cue,
  documentText,
  lineRanges,
  fallbackSearchStartByKey,
}: {
  cue: LyricCue
  documentText: string
  lineRanges: readonly LyricDraftLineRange[]
  fallbackSearchStartByKey: Map<string, number>
}): LyricCueSourceRange | null {
  if (
    cue.sourceRange &&
    isValidDocumentRange(cue.sourceRange, documentText.length)
  ) {
    return cue.sourceRange
  }

  const cueText = getCueText(cue)
  const textRange = resolveTextRangeInDraftDocument({
    searchKey: `${cue.laneId}:${cueText}`,
    searchText: cueText,
    documentText,
    fallbackSearchStartByKey,
  })
  if (!textRange) {
    return null
  }

  const source = createSourceFromDocumentRange(textRange, lineRanges)
  return source ? textRange : null
}

function createSourceFromDocumentRange(
  range: LyricCueSourceRange,
  lineRanges: readonly LyricDraftLineRange[],
  options: { forceWholeLine?: boolean } = {},
): LyricSegmentSource | null {
  const lineRange = lineRanges.find(
    (line) => range.startChar >= line.startChar && range.endChar <= line.endChar,
  )
  if (!lineRange) {
    return null
  }

  const startChar = range.startChar - lineRange.startChar
  const endChar = range.endChar - lineRange.startChar
  const wholeLine =
    (range.startChar === lineRange.startChar &&
      range.endChar === lineRange.endChar) ||
    (options.forceWholeLine && range.startChar === lineRange.startChar)

  return {
    draftLineId: lineRange.lineId,
    startChar: wholeLine ? 0 : startChar,
    endChar: wholeLine ? lineRange.endChar - lineRange.startChar : endChar,
    ...(wholeLine ? { wholeLine: true } : {}),
  }
}

function resolveTextRangeInDraftDocument({
  searchKey,
  searchText,
  documentText,
  fallbackSearchStartByKey,
}: {
  searchKey: string
  searchText: string
  documentText: string
  fallbackSearchStartByKey: Map<string, number>
}): LyricCueSourceRange | null {
  const normalizedSearchText = searchText.trim()
  if (normalizedSearchText.length === 0) {
    return null
  }

  const searchStart = fallbackSearchStartByKey.get(searchKey) ?? 0
  let startChar = documentText.indexOf(normalizedSearchText, searchStart)
  if (startChar < 0) {
    startChar = documentText.indexOf(normalizedSearchText)
  }
  if (startChar < 0) {
    return null
  }

  const endChar = startChar + normalizedSearchText.length
  fallbackSearchStartByKey.set(searchKey, endChar)
  return { startChar, endChar }
}

function clampPartMarksToCueSegments(
  partMarks: readonly PartMark[],
  cues: readonly LyricCue[],
): PartMark[] {
  const textLengthBySegment = new Map<string, number>()
  cues.forEach((cue) => {
    cue.segments.forEach((segment) => {
      textLengthBySegment.set(
        createSegmentKey(cue.id, segment.id),
        segment.text.length,
      )
    })
  })

  let didChange = false
  const nextPartMarks = partMarks.flatMap((mark) => {
    const textLength = textLengthBySegment.get(
      createSegmentKey(mark.cueId, mark.segmentId),
    )
    if (textLength === undefined) {
      return [mark]
    }

    const startChar = Math.max(0, Math.min(mark.startChar, textLength))
    const endChar = Math.max(startChar, Math.min(mark.endChar, textLength))
    if (startChar >= endChar) {
      didChange = true
      return []
    }

    if (startChar === mark.startChar && endChar === mark.endChar) {
      return [mark]
    }

    didChange = true
    return [{ ...mark, startChar, endChar }]
  })

  return didChange ? nextPartMarks : (partMarks as PartMark[])
}

function getCueText(cue: LyricCue): string {
  return cue.segments.map((segment) => segment.text).join(' ')
}

function isValidDocumentRange(
  range: LyricCueSourceRange,
  documentLength: number,
): boolean {
  return (
    Number.isFinite(range.startChar) &&
    Number.isFinite(range.endChar) &&
    range.startChar >= 0 &&
    range.startChar < range.endChar &&
    range.endChar <= documentLength
  )
}

function areSourcesEqual(
  first: LyricSegmentSource | undefined,
  second: LyricSegmentSource,
): boolean {
  return (
    first?.draftLineId === second.draftLineId &&
    first.startChar === second.startChar &&
    first.endChar === second.endChar &&
    Boolean(first.wholeLine) === Boolean(second.wholeLine)
  )
}

function createSegmentKey(cueId: string, segmentId: string): string {
  return `${cueId}:${segmentId}`
}
