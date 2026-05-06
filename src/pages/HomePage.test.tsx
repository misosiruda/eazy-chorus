import { render, screen } from '@testing-library/react'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('renders the milestone 0 placeholder actions as disabled controls', () => {
    render(<HomePage />)

    expect(
      screen.getByRole('heading', { name: 'Eazy Chorus' }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: /새 프로젝트 만들기/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /프로젝트 파일 열기/ }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /샘플 프로젝트 열기/ }),
    ).toBeDisabled()
  })
})
