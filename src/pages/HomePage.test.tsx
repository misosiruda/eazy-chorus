import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { HomePage } from './HomePage'

function renderHomePage(initialPath = '/editor') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HomePage />
    </MemoryRouter>,
  )
}

async function openEditorStep(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole('button', { name: new RegExp(name) }))
}

function selectElementText(element: HTMLElement, start: number, end: number) {
  const startPosition = getTextPosition(element, start)
  const endPosition = getTextPosition(element, end)
  const range = document.createRange()
  range.setStart(startPosition.textNode, startPosition.offset)
  range.setEnd(endPosition.textNode, endPosition.offset)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function getTextPosition(
  element: HTMLElement,
  targetOffset: number,
): { textNode: Text; offset: number } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let lastTextNode: Text | null = null

  while (true) {
    const nextNode = walker.nextNode()
    if (!nextNode) {
      break
    }

    const textNode = nextNode as Text
    const nextOffset = currentOffset + textNode.data.length
    lastTextNode = textNode
    if (targetOffset <= nextOffset) {
      return {
        textNode,
        offset: Math.max(0, targetOffset - currentOffset),
      }
    }
    currentOffset = nextOffset
  }

  if (!lastTextNode) {
    throw new Error('No text node found')
  }

  return { textNode: lastTextNode, offset: lastTextNode.data.length }
}

async function confirmOneLyricDraft(user: ReturnType<typeof userEvent.setup>) {
  await openEditorStep(user, 'Lyrics')
  await user.type(
    screen.getByLabelText('원본 가사 붙여넣기'),
    '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
  )
  await user.click(screen.getByRole('button', { name: '가사 추출' }))
  await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))
}

async function assignDraftToLeadLane(user: ReturnType<typeof userEvent.setup>) {
  await openEditorStep(user, 'Lane')
  const draftDocument = screen.getByLabelText('lyric draft document')
  selectElementText(draftDocument, 0, '키미노 나오 욘다'.length)
  fireEvent.mouseUp(draftDocument)
}

describe('HomePage', () => {
  it('renders milestone 1 project file controls as active workspace actions', () => {
    renderHomePage()

    expect(
      screen.getByRole('heading', { name: 'Editor Wizard' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '편집자' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: /Project/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: /Sync/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '새 프로젝트' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '파일 열기' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '샘플 열기' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: '.eazychorus 저장' }),
    ).toBeEnabled()
    expect(
      screen.getByLabelText('.eazychorus 프로젝트 파일 열기'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Project Meta' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Parts from Audio' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Audio Engine' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Lane & Tap Sync' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Lane 설정' }),
    ).not.toBeInTheDocument()
  })

  it('shows a blurred loading overlay while saving a project file', async () => {
    const user = userEvent.setup()
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const originalAnchorClick = HTMLAnchorElement.prototype.click
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:eazy-chorus-project'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })

    try {
      renderHomePage()

      await user.click(screen.getByRole('button', { name: '.eazychorus 저장' }))

      const loadingOverlay = await screen.findByRole('status', {
        name: '프로젝트 파일 처리 상태',
      })
      expect(loadingOverlay).toHaveTextContent(
        '프로젝트 파일을 저장하는 중입니다.',
      )
      expect(document.querySelector('.app-content-busy')).toBeInTheDocument()
      expect(
        await screen.findByText('.eazychorus 프로젝트 파일을 내보냈습니다.'),
      ).toBeInTheDocument()
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      })
      Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
        configurable: true,
        value: originalAnchorClick,
      })
    }
  })

  it('renders practice as a separate viewer page', () => {
    renderHomePage('/practice')

    expect(
      screen.getByRole('heading', { name: 'Practice Viewer' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '연습자' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('button', { name: '새 프로젝트' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: '.eazychorus 저장' }),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', { name: 'Project Meta' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Steps' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Viewer Mode' }),
    ).toBeInTheDocument()
    const playbar = screen.getByLabelText('viewer playbar')
    const progress = within(playbar).getByLabelText('viewer progress')
    expect(within(progress).getByLabelText('재생 위치')).toHaveAttribute(
      'type',
      'range',
    )
    expect(
      screen.getByLabelText('.eazychorus 프로젝트 파일 열기'),
    ).toBeInTheDocument()
  })

  it('adds a part from the Audio step form', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.type(screen.getByLabelText('새 part 이름'), 'Upper Harmony')
    await user.click(screen.getByRole('button', { name: 'Part 추가' }))

    expect(screen.getByDisplayValue('Upper Harmony')).toBeInTheDocument()
    expect(screen.getAllByText(/part 2개/).length).toBeGreaterThan(0)
  })

  it('uploads multiple audio files and lets the editor reassign MR and part links', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.upload(screen.getByLabelText('오디오 파일 선택'), [
      new File(['mr-audio'], 'full-mix.mp3', { type: 'audio/mpeg' }),
      new File(['guide-audio'], 'upper-guide.wav', { type: 'audio/wav' }),
    ])

    expect(
      screen.getByText('2개 음원을 추가하고 Part 1개를 준비했습니다.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('full-mix').length).toBeGreaterThan(0)
    expect(screen.getAllByText('upper-guide').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('upper guide').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/active 2개/).length).toBeGreaterThan(0)

    expect(screen.getByLabelText('full-mix 역할')).toHaveValue('mr')
    expect(screen.getByText('MR로 사용')).toBeInTheDocument()
    expect(screen.getByText('Active variant')).toBeInTheDocument()

    expect(screen.getByLabelText('upper-guide 파트 연결')).toHaveValue(
      'main-vocal',
    )
    await user.selectOptions(
      screen.getByLabelText('upper-guide variant'),
      'guide',
    )

    expect(screen.getByLabelText('upper-guide variant')).toHaveValue('guide')

    await user.selectOptions(screen.getByLabelText('upper-guide 역할'), 'mr')

    expect(screen.getByLabelText('upper-guide 역할')).toHaveValue('mr')
    expect(screen.getByLabelText('full-mix 역할')).toHaveValue('part-audio')
  })

  it('keeps the viewer mixer focused on playback mix instead of part relinking', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.upload(screen.getByLabelText('오디오 파일 선택'), [
      new File(['mr-audio'], 'full-mix.mp3', { type: 'audio/mpeg' }),
      new File(['guide-audio'], 'upper-guide.wav', { type: 'audio/wav' }),
    ])

    expect(
      screen.getByRole('heading', { name: 'Part audio variant' }),
    ).toBeInTheDocument()

    await openEditorStep(user, 'Preview')
    const viewerSidePanel = screen.getByLabelText('viewer side panel')
    await user.click(
      within(viewerSidePanel).getByRole('button', { name: 'Mixer' }),
    )

    expect(within(viewerSidePanel).queryByRole('combobox')).toBeNull()
    expect(
      within(viewerSidePanel).getAllByText('Volume').length,
    ).toBeGreaterThan(0)
    expect(within(viewerSidePanel).getAllByText('Mute').length).toBeGreaterThan(
      0,
    )
    expect(within(viewerSidePanel).getAllByText('Solo').length).toBeGreaterThan(
      0,
    )
  })

  it('highlights the selected lane Part in Practice Parts panel', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)
    await user.click(screen.getByRole('link', { name: '연습자' }))

    const viewerSidePanel = screen.getByLabelText('viewer side panel')
    await user.click(
      within(viewerSidePanel).getByRole('button', { name: /Main Vocal/ }),
    )

    const viewerStage = screen.getByLabelText('viewer lyrics document')
    const cueButton = within(viewerStage).getByRole('button', {
      name: /키미노 나오 욘다/,
    })
    expect(cueButton).toHaveClass('viewer-cue-part-focused')
    expect(
      within(cueButton)
        .getByText('키미노 나오 욘다', {
          selector: '.part-mark-fragment-text',
        })
        .closest('.viewer-segment'),
    ).toHaveClass('viewer-segment-part-focused')
  })

  it('removes an audio-derived part together with its last audio', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.upload(screen.getByLabelText('오디오 파일 선택'), [
      new File(['guide-audio'], 'upper-guide.wav', { type: 'audio/wav' }),
    ])
    await user.click(
      screen.getByRole('button', { name: 'upper-guide 음원 제거' }),
    )

    expect(
      screen.getByText('upper-guide 음원과 upper guide part를 제거했습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByDisplayValue('upper guide')).toBeNull()
  })

  it('extracts Japanese lyric blocks and confirms a lyric draft', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Lyrics')
    await user.type(
      screen.getByLabelText('원본 가사 붙여넣기'),
      '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
    )
    await user.click(screen.getByRole('button', { name: '가사 추출' }))

    expect(screen.getByLabelText('추출 block 1')).toHaveValue(
      '키미노 나오 욘다',
    )

    await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))

    expect(
      screen.getByText('1줄 lyric draft를 저장했습니다.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/draft 1줄/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('최종 가사 편집')).toHaveValue(
      '키미노 나오 욘다',
    )
  })

  it('edits the confirmed lyric draft before Lane assignment', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)

    const finalLyricsEditor = screen.getByLabelText('최종 가사 편집')
    await user.clear(finalLyricsEditor)
    await user.type(finalLyricsEditor, '키미노 이름을 불렀다')
    await user.click(screen.getByRole('button', { name: '최종 가사 저장' }))

    expect(
      screen.getByText('1줄 lyric draft를 수정했습니다.'),
    ).toBeInTheDocument()

    await openEditorStep(user, 'Lane')

    expect(screen.getByLabelText('lyric draft document')).toHaveTextContent(
      '키미노 이름을 불렀다',
    )
  })

  it('matches a dragged lyric selection into the selected Lane', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)

    expect(screen.getByLabelText('Lane 범례')).toHaveClass('workspace-sidebar')
    expect(
      screen.getByText('Lead lane에 Main 가사를 매칭했습니다.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('키미노 나오 욘다', { selector: 'mark' }),
    ).toHaveClass('lyric-highlight-mark')
    expect(screen.getAllByText(/cue 1개/).length).toBeGreaterThan(0)

    const draftDocument = screen.getByLabelText('lyric draft document')
    selectElementText(draftDocument, 0, '키미노 나오 욘다'.length)
    fireEvent.mouseUp(draftDocument)

    expect(
      screen.getByText('Lead lane Main 하이라이트를 해제했습니다.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('키미노 나오 욘다', { selector: 'mark' }),
    ).toBeNull()
  })

  it('removes only the dragged portion from an existing Lane highlight', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)

    const draftDocument = screen.getByLabelText('lyric draft document')
    selectElementText(draftDocument, '키미노 '.length, '키미노 나오'.length)
    fireEvent.mouseUp(draftDocument)

    expect(
      screen.getByText('Lead lane Main 하이라이트 일부를 해제했습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('키미노', { selector: 'mark' })).toHaveClass(
      'lyric-highlight-mark',
    )
    expect(screen.getByText('욘다', { selector: 'mark' })).toHaveClass(
      'lyric-highlight-mark',
    )
    expect(screen.queryByText(/나오/, { selector: 'mark' })).toBeNull()
  })

  it('matches a dragged multi-line lyric selection into line-sized Lane cues', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Lyrics')
    await user.type(
      screen.getByLabelText('원본 가사 붙여넣기'),
      '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
    )
    await user.click(screen.getByRole('button', { name: '가사 추출' }))
    fireEvent.change(screen.getByLabelText('추출 block 1'), {
      target: { value: '키미노 나오 욘다\n호시가 히카루' },
    })
    await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))
    await openEditorStep(user, 'Lane')

    const draftDocument = screen.getByLabelText('lyric draft document')
    selectElementText(
      draftDocument,
      0,
      '키미노 나오 욘다\n호시가 히카루'.length,
    )
    fireEvent.mouseUp(draftDocument)

    expect(
      screen.getByText('Lead lane에 Main 가사를 매칭했습니다.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/키미노 나오 욘다\s+호시가 히카루/, {
        selector: 'mark',
      }),
    ).toHaveClass('lyric-highlight-mark')
    expect(screen.getByText(/호시가 히카루/, { selector: 'mark' })).toHaveClass(
      'lyric-highlight-mark',
    )
    expect(screen.getAllByText(/cue 2개/).length).toBeGreaterThan(0)

    await openEditorStep(user, 'Sub')

    expect(screen.getByLabelText('sub lyric document')).toHaveTextContent(
      /키미노 나오 욘다\s+호시가 히카루/,
    )
  })

  it('links an existing single-line cue with newly dragged adjacent lines', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Lyrics')
    await user.type(
      screen.getByLabelText('원본 가사 붙여넣기'),
      '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
    )
    await user.click(screen.getByRole('button', { name: '가사 추출' }))
    fireEvent.change(screen.getByLabelText('추출 block 1'), {
      target: { value: '키미노 나오 욘다\n호시가 히카루' },
    })
    await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))
    await openEditorStep(user, 'Lane')

    const draftDocument = screen.getByLabelText('lyric draft document')
    selectElementText(draftDocument, 0, '키미노 나오 욘다'.length)
    fireEvent.mouseUp(draftDocument)
    selectElementText(
      draftDocument,
      0,
      '키미노 나오 욘다\n호시가 히카루'.length,
    )
    fireEvent.mouseUp(draftDocument)

    expect(
      screen.getByText('Lead lane에 Main 가사를 연결했습니다.'),
    ).toBeInTheDocument()

    await openEditorStep(user, 'Sub')

    expect(screen.getByLabelText('sub lyric document')).toHaveTextContent(
      /키미노 나오 욘다\s+호시가 히카루/,
    )
  })

  it('marks harmony text from the Sub step legend selection', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)
    await openEditorStep(user, 'Sub')

    expect(screen.getByLabelText('Sub 범례')).toHaveClass('workspace-sidebar')
    const harmonyDocument = screen.getByLabelText('sub lyric document')

    expect(
      within(harmonyDocument).queryByText('키미노 나오 욘다', {
        selector: 'mark',
      }),
    ).toBeNull()

    selectElementText(harmonyDocument, 0, 2)
    fireEvent.mouseUp(harmonyDocument)

    expect(
      screen.getByText('Main Vocal Sub를 표시했습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('키미', { selector: 'mark' })).toHaveClass(
      'sub-highlight-mark',
    )
  })

  it('renders multiple line-above harmony marks by level in Preview', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.type(screen.getByLabelText('새 part 이름'), '3도 높은 화음')
    await user.click(screen.getByRole('button', { name: 'Part 추가' }))
    await user.type(screen.getByLabelText('새 part 이름'), '5도 높은 화음')
    await user.click(screen.getByRole('button', { name: 'Part 추가' }))

    const markStyleSelects = screen.getAllByLabelText('Mark style')
    await user.selectOptions(markStyleSelects[2], 'line-above')
    await user.selectOptions(
      screen.getByLabelText('5도 높은 화음 harmony level'),
      '2',
    )

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)
    await openEditorStep(user, 'Sub')

    const harmonyDocument = screen.getByLabelText('sub lyric document')
    await user.click(screen.getByRole('button', { name: /3도 높은 화음/ }))
    selectElementText(harmonyDocument, 0, 2)
    fireEvent.mouseUp(harmonyDocument)

    await user.click(screen.getByRole('button', { name: /5도 높은 화음/ }))
    selectElementText(harmonyDocument, 0, 2)
    fireEvent.mouseUp(harmonyDocument)

    await openEditorStep(user, 'Preview')

    const viewerStage = screen.getByLabelText('viewer lyrics document')
    const markedText = within(viewerStage).getByText('키미', {
      selector: '.part-mark-fragment-text',
    })
    const markedFragment = markedText.closest('.part-mark-fragment')
    expect(markedFragment).not.toBeNull()

    const aboveLines = markedFragment?.querySelectorAll(
      '.part-mark-line-stack-above .part-mark-line',
    )
    expect(aboveLines).toHaveLength(2)
    expect(
      Array.from(aboveLines ?? []).map((line) =>
        line.getAttribute('data-harmony-level'),
      ),
    ).toEqual(['2', '1'])

    const viewerSidePanel = screen.getByLabelText('viewer side panel')
    await user.click(
      within(viewerSidePanel).getByRole('button', {
        name: /3도 높은 화음/,
      }),
    )

    const focusedCue = within(viewerStage).getByRole('button', {
      name: /키미노 나오 욘다/,
    })
    expect(focusedCue).toHaveClass('viewer-cue-part-focused')
    const focusedMarkedText = within(viewerStage).getByText('키미', {
      selector: '.part-mark-fragment-text',
    })
    const focusedMarkedFragment = focusedMarkedText.closest(
      '.part-mark-fragment',
    )
    expect(focusedMarkedFragment).toHaveClass('part-mark-fragment-focused')
    expect(
      focusedMarkedFragment?.querySelectorAll(
        '.part-mark-line-stack-above .part-mark-line',
      ),
    ).toHaveLength(1)
  })

  it('keeps non-selected lyrics at normal opacity while highlighting a harmony Part', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.type(screen.getByLabelText('새 part 이름'), '3도 높은 화음')
    await user.click(screen.getByRole('button', { name: 'Part 추가' }))
    await user.selectOptions(
      screen.getAllByLabelText('Mark style')[1],
      'line-above',
    )

    await openEditorStep(user, 'Lyrics')
    await user.type(
      screen.getByLabelText('원본 가사 붙여넣기'),
      '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
    )
    await user.click(screen.getByRole('button', { name: '가사 추출' }))
    fireEvent.change(screen.getByLabelText('추출 block 1'), {
      target: { value: '키미노 나오 욘다\n호시가 히카루' },
    })
    await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))
    await openEditorStep(user, 'Lane')

    const draftDocument = screen.getByLabelText('lyric draft document')
    selectElementText(
      draftDocument,
      0,
      '키미노 나오 욘다\n호시가 히카루'.length,
    )
    fireEvent.mouseUp(draftDocument)

    await openEditorStep(user, 'Sub')
    const harmonyDocument = screen.getByLabelText('sub lyric document')
    await user.click(screen.getByRole('button', { name: /3도 높은 화음/ }))
    selectElementText(harmonyDocument, 0, 2)
    fireEvent.mouseUp(harmonyDocument)

    await openEditorStep(user, 'Preview')
    const viewerSidePanel = screen.getByLabelText('viewer side panel')
    await user.click(
      within(viewerSidePanel).getByRole('button', {
        name: /3도 높은 화음/,
      }),
    )

    const viewerStage = screen.getByLabelText('viewer lyrics document')
    const cueButtons = within(viewerStage).getAllByRole('button')
    expect(cueButtons[0]).toHaveClass('viewer-cue-part-focused')
    expect(cueButtons[1]).not.toHaveClass('viewer-cue-part-focused')
    expect(cueButtons[1]).not.toHaveClass('viewer-cue-part-dimmed')
  })

  it('supports pre-recording setup with only an MR track', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Audio')
    await user.upload(screen.getByLabelText('오디오 파일 선택'), [
      new File(['mr-audio'], 'full-mix.mp3', { type: 'audio/mpeg' }),
    ])
    expect(screen.getByLabelText('full-mix 역할')).toHaveValue('mr')
    expect(
      screen.queryByRole('heading', { name: 'Part audio variant' }),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('새 part 이름'), '3도 높은 화음')
    await user.click(screen.getByRole('button', { name: 'Part 추가' }))
    await user.selectOptions(
      screen.getAllByLabelText('Mark style')[1],
      'line-above',
    )

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)
    await openEditorStep(user, 'Sub')

    const harmonyDocument = screen.getByLabelText('sub lyric document')
    await user.click(screen.getByRole('button', { name: /3도 높은 화음/ }))
    selectElementText(harmonyDocument, 0, 2)
    fireEvent.mouseUp(harmonyDocument)
    expect(
      screen.getByText('3도 높은 화음 Sub를 표시했습니다.'),
    ).toBeInTheDocument()

    await openEditorStep(user, 'Sync')
    const syncControls = screen.getByLabelText('Sync 컨트롤')
    expect(
      within(syncControls).getByRole('button', { name: '재생' }),
    ).toBeEnabled()
    expect(screen.getByLabelText('sync cue 목록')).toHaveTextContent(
      '키미노 나오 욘다',
    )

    await openEditorStep(user, 'Preview')
    const viewerStage = screen.getByLabelText('viewer lyrics document')
    const markedText = within(viewerStage).getByText('키미', {
      selector: '.part-mark-fragment-text',
    })
    const markedFragment = markedText.closest('.part-mark-fragment')
    expect(
      markedFragment?.querySelector(
        '.part-mark-line-stack-above .part-mark-line',
      ),
    ).not.toBeNull()
  })

  it('restores a dedicated Sync step for cue timing', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)
    await openEditorStep(user, 'Sync')

    expect(screen.getByRole('heading', { name: 'Sync' })).toBeInTheDocument()
    const syncCueList = screen.getByLabelText('sync cue 목록')
    expect(syncCueList).toBeInTheDocument()
    expect(screen.getByLabelText('Sync 컨트롤')).toBeInTheDocument()
    expect(
      within(syncCueList).getByRole('button', {
        name: /키미노 나오 욘다/,
      }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start 입력' }))

    expect(
      screen.getByText(
        '0:00에 cue 시작을 입력했습니다. End는 다음 Space 또는 End 입력으로 정해집니다.',
      ),
    ).toBeInTheDocument()
    expect(within(syncCueList).getByText('0:00 - End 대기')).toBeInTheDocument()
    expect(
      within(syncCueList).queryByText('0:00 - 0:00'),
    ).not.toBeInTheDocument()

    screen.getByRole('button', { name: '실행 취소' }).focus()
    await user.keyboard('[Space]')

    expect(
      screen.getByText(
        '0:00에 cue 시작을 입력했습니다. End는 다음 Space 또는 End 입력으로 정해집니다.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('lane 편집을 한 단계 되돌렸습니다.'),
    ).not.toBeInTheDocument()
  })

  it('keeps synced and unsynced cues editable in lyric order on the Sync step', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await openEditorStep(user, 'Lyrics')
    await user.type(
      screen.getByLabelText('원본 가사 붙여넣기'),
      '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
    )
    await user.click(screen.getByRole('button', { name: '가사 추출' }))
    fireEvent.change(screen.getByLabelText('추출 block 1'), {
      target: { value: '타이세츠나 코토와\n아케하나타레타 코노 헤야니와' },
    })
    await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))
    await openEditorStep(user, 'Lane')

    const draftDocument = screen.getByLabelText('lyric draft document')
    selectElementText(
      draftDocument,
      0,
      '타이세츠나 코토와\n아케하나타레타 코노 헤야니와'.length,
    )
    fireEvent.mouseUp(draftDocument)
    await openEditorStep(user, 'Sync')

    const syncList = screen.getByLabelText('sync cue 목록')
    let cueButtons = within(syncList).getAllByRole('button')
    expect(cueButtons).toHaveLength(2)
    expect(cueButtons[0]).toHaveTextContent('타이세츠나 코토와')
    expect(cueButtons[1]).toHaveTextContent('아케하나타레타 코노 헤야니와')

    await user.click(cueButtons[0])
    await user.click(screen.getByRole('button', { name: 'Start 입력' }))

    cueButtons = within(syncList).getAllByRole('button')
    expect(cueButtons).toHaveLength(2)
    expect(cueButtons[0]).toHaveTextContent('타이세츠나 코토와')
    expect(cueButtons[0]).toHaveTextContent('0:00 - End 대기')
    expect(cueButtons[1]).toHaveTextContent('아케하나타레타 코노 헤야니와')
  })

  it('opens a placed cue from Viewer Mode with the project pre-roll', async () => {
    const user = userEvent.setup()
    renderHomePage()

    await confirmOneLyricDraft(user)
    await assignDraftToLeadLane(user)
    await openEditorStep(user, 'Preview')

    const viewerStage = screen.getByLabelText('viewer lyrics document')
    await user.click(
      within(viewerStage).getByRole('button', { name: /키미노 나오 욘다/ }),
    )

    expect(
      screen.getByText('0:00로 이동했습니다. 음원을 추가하면 바로 재생됩니다.'),
    ).toBeInTheDocument()
  })
})
