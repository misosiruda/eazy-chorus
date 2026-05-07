import type { LyricDraftLine } from '../project-file'

export type LineKind =
  | 'japanese'
  | 'korean'
  | 'english'
  | 'mixed'
  | 'empty'
  | 'unknown'

export type ImportPattern =
  | 'jp-ko-translation'
  | 'english-translation'
  | 'manual'
  | 'unknown'

export type ImportConfidence = 'high' | 'medium' | 'low'

export type ImportBlock = {
  id: string
  sourceLines: string[]
  exportedLines: string[]
  pattern: ImportPattern
  confidence: ImportConfidence
  warnings: string[]
}

const JAPANESE_SCRIPT_PATTERN =
  /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/
const LATIN_PATTERN = /[A-Za-z]/
const ENGLISH_LINE_PATTERN = /^[A-Za-z0-9\s'"’.,!?;:()\-&/]+$/

export function classifyLine(line: string): LineKind {
  const trimmedLine = line.trim()
  if (trimmedLine === '') {
    return 'empty'
  }

  const hasJapanese = JAPANESE_SCRIPT_PATTERN.test(trimmedLine)
  const hasHangul = HANGUL_PATTERN.test(trimmedLine)
  const hasLatin = LATIN_PATTERN.test(trimmedLine)

  if (hasJapanese && (hasHangul || hasLatin)) {
    return 'mixed'
  }
  if (hasJapanese) {
    return 'japanese'
  }
  if (hasHangul && hasLatin) {
    return 'mixed'
  }
  if (hasHangul) {
    return 'korean'
  }
  if (hasLatin && ENGLISH_LINE_PATTERN.test(trimmedLine)) {
    return 'english'
  }
  if (hasLatin) {
    return 'mixed'
  }

  return 'unknown'
}

export function extractLyricImportBlocks(source: string): ImportBlock[] {
  const lines = splitSourceLines(source)
  const blocks: ImportBlock[] = []
  let lineIndex = 0

  while (lineIndex < lines.length) {
    const currentLine = lines[lineIndex]
    const nextLine = lines[lineIndex + 1]
    const thirdLine = lines[lineIndex + 2]

    if (
      nextLine !== undefined &&
      thirdLine !== undefined &&
      isJapaneseSourceLine(currentLine) &&
      isPronunciationLine(nextLine) &&
      isKoreanMeaningLine(thirdLine)
    ) {
      blocks.push(
        createImportBlock(blocks.length, [currentLine, nextLine, thirdLine], {
          exportedLines: [nextLine],
          pattern: 'jp-ko-translation',
          confidence: 'high',
        }),
      )
      lineIndex += 3
      continue
    }

    if (
      nextLine !== undefined &&
      classifyLine(currentLine) === 'english' &&
      isKoreanMeaningLine(nextLine)
    ) {
      blocks.push(
        createImportBlock(blocks.length, [currentLine, nextLine], {
          exportedLines: [currentLine],
          pattern: 'english-translation',
          confidence: 'high',
        }),
      )
      lineIndex += 2
      continue
    }

    if (
      nextLine !== undefined &&
      isJapaneseSourceLine(currentLine) &&
      isPronunciationLine(nextLine)
    ) {
      blocks.push(
        createImportBlock(blocks.length, [currentLine, nextLine], {
          exportedLines: [nextLine],
          pattern: 'jp-ko-translation',
          confidence: 'medium',
          warnings: ['해석 줄이 없는 2줄 패턴으로 처리했습니다.'],
        }),
      )
      lineIndex += 2
      continue
    }

    blocks.push(
      createImportBlock(blocks.length, [currentLine], {
        exportedLines: [currentLine],
        pattern: 'unknown',
        confidence: 'low',
        warnings: ['자동 패턴을 확정할 수 없어 원문을 그대로 추출했습니다.'],
      }),
    )
    lineIndex += 1
  }

  return blocks
}

export function createLyricDraftLines(
  blocks: readonly ImportBlock[],
): LyricDraftLine[] {
  return blocks
    .flatMap((block) => block.exportedLines)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      id: `lyric-draft-${index + 1}`,
      text,
    }))
}

export function splitEditedLyricLines(value: string): string[] {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function countExportedLines(blocks: readonly ImportBlock[]): number {
  return blocks.reduce(
    (count, block) =>
      count +
      block.exportedLines.filter((line) => line.trim().length > 0).length,
    0,
  )
}

function splitSourceLines(source: string): string[] {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function isJapaneseSourceLine(line: string): boolean {
  return JAPANESE_SCRIPT_PATTERN.test(line)
}

function isPronunciationLine(line: string): boolean {
  return !JAPANESE_SCRIPT_PATTERN.test(line) && HANGUL_PATTERN.test(line)
}

function isKoreanMeaningLine(line: string): boolean {
  return !JAPANESE_SCRIPT_PATTERN.test(line) && HANGUL_PATTERN.test(line)
}

function createImportBlock(
  index: number,
  sourceLines: string[],
  options: {
    exportedLines: string[]
    pattern: ImportPattern
    confidence: ImportConfidence
    warnings?: string[]
  },
): ImportBlock {
  return {
    id: `import-block-${index + 1}`,
    sourceLines,
    exportedLines: options.exportedLines,
    pattern: options.pattern,
    confidence: options.confidence,
    warnings: options.warnings ?? [],
  }
}
