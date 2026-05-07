import type {
  EazyChorusProject,
  LyricRole,
  LyricSegment,
  PartMark,
} from '../project-file'

export type PartMarkTextFragment = {
  text: string
  startChar: number
  endChar: number
  marks: PartMark[]
}

type SegmentRoleUpdateOptions = {
  cueId: string
  segmentId: string
  role: LyricRole
}

type PartMarkToggleOptions = {
  cueId: string
  segmentId: string
  partId: string
  startChar: number
  endChar: number
}

type TextRange = {
  startChar: number
  endChar: number
}

export function updateCueSegmentRole(
  project: EazyChorusProject,
  { cueId, segmentId, role }: SegmentRoleUpdateOptions,
): EazyChorusProject {
  let didUpdate = false

  const cues = project.cues.map((cue) => {
    if (cue.id !== cueId) {
      return cue
    }

    return {
      ...cue,
      segments: cue.segments.map((segment) => {
        if (segment.id !== segmentId || segment.role === role) {
          return segment
        }

        didUpdate = true
        return { ...segment, role }
      }),
    }
  })

  return didUpdate ? { ...project, cues } : project
}

export function togglePartMark(
  project: EazyChorusProject,
  { cueId, segmentId, partId, startChar, endChar }: PartMarkToggleOptions,
): EazyChorusProject {
  const part = project.parts.find((item) => item.id === partId)
  const segment = findCueSegment(project, cueId, segmentId)
  if (!part || !segment) {
    return project
  }

  const textRange = normalizeTextRange(segment.text.length, startChar, endChar)
  if (!textRange) {
    return project
  }

  const existingMark = project.partMarks.find(
    (mark) =>
      mark.cueId === cueId &&
      mark.segmentId === segmentId &&
      mark.partId === partId &&
      mark.startChar === textRange.startChar &&
      mark.endChar === textRange.endChar,
  )

  if (existingMark) {
    return {
      ...project,
      partMarks: project.partMarks.filter(
        (mark) => mark.id !== existingMark.id,
      ),
    }
  }

  return {
    ...project,
    partMarks: [
      ...project.partMarks,
      {
        id: createPartMarkId(cueId, segmentId, partId, textRange),
        cueId,
        segmentId,
        partId,
        startChar: textRange.startChar,
        endChar: textRange.endChar,
        style: part.defaultMarkStyle,
      },
    ],
  }
}

export function getPartMarksForSegment(
  partMarks: readonly PartMark[],
  cueId: string,
  segmentId: string,
): PartMark[] {
  return partMarks.filter(
    (mark) => mark.cueId === cueId && mark.segmentId === segmentId,
  )
}

export function splitSegmentTextByPartMarks(
  segment: LyricSegment,
  partMarks: readonly PartMark[],
): PartMarkTextFragment[] {
  const marks = partMarks.filter(
    (mark) =>
      mark.segmentId === segment.id &&
      mark.startChar >= 0 &&
      mark.endChar > mark.startChar &&
      mark.endChar <= segment.text.length,
  )
  if (segment.text.length === 0) {
    return []
  }

  const breakpoints = new Set<number>([0, segment.text.length])
  marks.forEach((mark) => {
    breakpoints.add(mark.startChar)
    breakpoints.add(mark.endChar)
  })

  const sortedBreakpoints = [...breakpoints].sort(
    (first, second) => first - second,
  )

  return sortedBreakpoints.flatMap((startChar, index) => {
    const endChar = sortedBreakpoints[index + 1]
    if (endChar === undefined || startChar === endChar) {
      return []
    }

    return {
      text: segment.text.slice(startChar, endChar),
      startChar,
      endChar,
      marks: marks.filter(
        (mark) => mark.startChar <= startChar && endChar <= mark.endChar,
      ),
    }
  })
}

function findCueSegment(
  project: EazyChorusProject,
  cueId: string,
  segmentId: string,
): LyricSegment | null {
  const cue = project.cues.find((item) => item.id === cueId)
  return cue?.segments.find((segment) => segment.id === segmentId) ?? null
}

function normalizeTextRange(
  textLength: number,
  startChar: number,
  endChar: number,
): TextRange | null {
  if (!Number.isFinite(startChar) || !Number.isFinite(endChar)) {
    return null
  }

  const normalizedStartChar = Math.max(0, Math.floor(startChar))
  const normalizedEndChar = Math.min(textLength, Math.ceil(endChar))
  if (
    normalizedStartChar >= normalizedEndChar ||
    normalizedEndChar > textLength
  ) {
    return null
  }

  return {
    startChar: normalizedStartChar,
    endChar: normalizedEndChar,
  }
}

function createPartMarkId(
  cueId: string,
  segmentId: string,
  partId: string,
  range: TextRange,
): string {
  return [
    'part-mark',
    slugify(cueId),
    slugify(segmentId),
    slugify(partId),
    range.startChar,
    range.endChar,
  ].join('-')
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  )
}
