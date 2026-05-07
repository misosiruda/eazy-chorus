import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('renders milestone 1 project file controls as active workspace actions', () => {
    render(<HomePage />)

    expect(
      screen.getByRole('heading', { name: 'Project File Workspace' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 프로젝트' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '파일 열기' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: '.eazychorus 저장' }),
    ).toBeEnabled()
    expect(
      screen.getByLabelText('.eazychorus 프로젝트 파일 열기'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Audio Engine' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Lane & Tap Sync' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재생' })).toBeDisabled()
  })

  it('adds a part from the workspace form', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    await user.type(screen.getByLabelText('새 part 이름'), 'Upper Harmony')
    await user.click(screen.getByRole('button', { name: 'Part 추가' }))

    expect(
      screen.getByRole('option', { name: 'Upper Harmony' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/part 2개/)).toBeInTheDocument()
  })

  it('extracts Japanese lyric blocks and confirms a lyric draft', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

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
    expect(screen.getByText(/draft 1줄/)).toBeInTheDocument()
  })

  it('places confirmed lyric draft into the selected lane cue list', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    await user.type(
      screen.getByLabelText('원본 가사 붙여넣기'),
      '君の名を呼んだ\n키미노 나오 욘다\n너의 이름을 불렀어',
    )
    await user.click(screen.getByRole('button', { name: '가사 추출' }))
    await user.click(screen.getByRole('button', { name: '추출 결과 확정' }))
    await user.click(screen.getByRole('button', { name: /Lead에 배치/ }))

    expect(
      screen.getByText('Lead lane에 cue를 추가했습니다.'),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /키미노 나오 욘다/ }).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/cue 1개/)).toBeInTheDocument()
  })
})
