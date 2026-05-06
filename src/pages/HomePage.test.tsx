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
})
