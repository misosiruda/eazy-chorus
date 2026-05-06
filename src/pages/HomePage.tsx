type HomeAction = {
  label: string
  description: string
}

const homeActions: HomeAction[] = [
  {
    label: '새 프로젝트 만들기',
    description: '곡 정보와 MR, 파트 음원을 묶는 프로젝트 생성 흐름',
  },
  {
    label: '프로젝트 파일 열기',
    description: '.eazychorus 파일을 불러와 같은 연습 화면으로 복원',
  },
  {
    label: '샘플 프로젝트 열기',
    description: '기능 확인을 위한 예제 프로젝트 로드',
  },
]

export function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-panel" aria-labelledby="home-title">
        <div className="home-heading">
          <p className="home-kicker">Frontend-only chorus guide</p>
          <h1 id="home-title">Eazy Chorus</h1>
          <p className="home-summary">
            MR, 파트별 보컬 음원, 가사 싱크, 파트 가이드를 하나의
            프로젝트 파일로 묶어 공유하는 화음 가이드 웹앱입니다.
          </p>
        </div>

        <div className="home-actions" aria-label="프로젝트 시작 액션">
          {homeActions.map((action) => (
            <button
              className="home-action"
              type="button"
              disabled
              key={action.label}
              aria-describedby={`${action.label}-description`}
            >
              <span>{action.label}</span>
              <small id={`${action.label}-description`}>
                {action.description}
              </small>
            </button>
          ))}
        </div>

        <p className="home-status" role="status">
          Milestone 0에서는 프로젝트 기반만 준비합니다. 파일 입출력과 오디오
          재생은 이후 milestone에서 활성화됩니다.
        </p>
      </section>
    </main>
  )
}
