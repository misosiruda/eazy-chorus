import {
  classifyLine,
  countExportedLines,
  createLyricDraftLines,
  extractLyricImportBlocks,
  splitEditedLyricLines,
} from './lyricsImport'

describe('lyrics-import feature', () => {
  it('classifies Japanese, Korean, English, and mixed lyric lines', () => {
    expect(classifyLine('君の名を呼んだ')).toBe('japanese')
    expect(classifyLine('키미노 나오 욘다')).toBe('korean')
    expect(classifyLine('I still remember you')).toBe('english')
    expect(classifyLine('키미토 I believe 아루이테쿠')).toBe('mixed')
  })

  it('extracts Korean pronunciation from jp-ko-translation blocks', () => {
    const blocks = extractLyricImportBlocks(`
      君の名を呼んだ
      키미노 나오 욘다
      너의 이름을 불렀어
    `)

    expect(blocks).toEqual([
      expect.objectContaining({
        sourceLines: [
          '君の名を呼んだ',
          '키미노 나오 욘다',
          '너의 이름을 불렀어',
        ],
        exportedLines: ['키미노 나오 욘다'],
        pattern: 'jp-ko-translation',
        confidence: 'high',
      }),
    ])
  })

  it('keeps standalone English lyric lines before Korean translations', () => {
    const blocks = extractLyricImportBlocks(`
      I still remember you
      나는 아직 너를 기억해
    `)

    expect(blocks).toEqual([
      expect.objectContaining({
        sourceLines: ['I still remember you', '나는 아직 너를 기억해'],
        exportedLines: ['I still remember you'],
        pattern: 'english-translation',
        confidence: 'high',
      }),
    ])
  })

  it('handles Japanese source lines that include English phrases', () => {
    const blocks = extractLyricImportBlocks(`
      君と I believe 歩いてく
      키미토 I believe 아루이테쿠
      너와 I believe 걸어가
    `)

    expect(blocks[0]).toEqual(
      expect.objectContaining({
        exportedLines: ['키미토 I believe 아루이테쿠'],
        confidence: 'high',
      }),
    )
  })

  it('marks unknown lines as low confidence manual candidates', () => {
    const blocks = extractLyricImportBlocks('♪ instrumental break ♪')

    expect(blocks[0]).toEqual(
      expect.objectContaining({
        exportedLines: ['♪ instrumental break ♪'],
        pattern: 'unknown',
        confidence: 'low',
      }),
    )
    expect(blocks[0]?.warnings).toHaveLength(1)
  })

  it('creates confirmed lyric draft lines from edited extraction output', () => {
    const blocks = extractLyricImportBlocks(`
      君の名を呼んだ
      키미노 나오 욘다
      너의 이름을 불렀어
    `)
    const editedBlocks = [
      {
        ...blocks[0]!,
        exportedLines: splitEditedLyricLines('키미노 나오 욘다\n\n다음 줄'),
      },
    ]

    expect(countExportedLines(editedBlocks)).toBe(2)
    expect(createLyricDraftLines(editedBlocks)).toEqual([
      { id: 'lyric-draft-1', text: '키미노 나오 욘다' },
      { id: 'lyric-draft-2', text: '다음 줄' },
    ])
  })
})
