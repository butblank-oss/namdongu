import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

/** 브라우저 음성 합성 흉내: 말한 문장을 모은다 */
function fakeSpeech(voices: { name: string; lang: string; localService: boolean }[] = [{ name: 'Google 한국의', lang: 'ko-KR', localService: false }]) {
  const said: { text: string; lang: string }[] = []
  class Utter { text: string; lang = ''; rate = 1; volume = 1; voice = null; onend: (() => void) | null = null; onerror = null; constructor(t: string) { this.text = t } }
  Object.assign(window, {
    SpeechSynthesisUtterance: Utter,
    speechSynthesis: {
      getVoices: () => voices, cancel: () => {}, resume: () => {}, addEventListener: () => {},
      speak: (u: Utter) => { if (u.text !== '호출 소리를 켰습니다') said.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend?.(), 0) },
    },
  })
  return said
}

describe('대기석 큰 화면 호출 소리', () => {
  afterEach(() => { localStorage.clear() })

  test('호출하면 띵동 뒤에 번호만 한국어로 두 번 부른다 (기본)', async () => {
    const said = fakeSpeech()
    const server = makeServer()
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('display-start'))
    const staff = makeDevice(server, { name: '김다희' })
    await act(async () => { await staff.engine.callNext() })
    await waitFor(() => expect(said.map((s) => s.text)).toEqual(['일번', '일번']), { timeout: 8000 })
    expect(said[0].lang).toBe('ko-KR')
    await act(async () => { await staff.engine.callNext() })
    await waitFor(() => expect(said.slice(2).map((s) => s.text)).toEqual(['이번', '이번']), { timeout: 8000 })
  })

  test("'띵동만'으로 바꾸면 번호를 말하지 않고, 설정은 이 노트북에 남는다", async () => {
    const said = fakeSpeech()
    const server = makeServer()
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('호출 소리'), '띵동만')
    expect(localStorage.getItem('namdongu.announceMode')).toBe('chime')
    await user.click(screen.getByTestId('display-start'))
    const staff = makeDevice(server, { name: '김다희' })
    await act(async () => { await staff.engine.callNext() })
    await waitFor(() => expect(screen.getByTestId('display-now')).toHaveTextContent('1'))
    await new Promise((r) => setTimeout(r, 900))
    expect(said).toEqual([])
  })

  test('한국어 음성이 있으면 이름을, 없으면 경고를 화면에 보여 준다', async () => {
    fakeSpeech()
    const server = makeServer()
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('display-start'))
    expect(await screen.findByTestId('voice-status')).toHaveTextContent('음성: Google 한국의')
  })

  test('한국어 음성이 없는 노트북', async () => {
    fakeSpeech([{ name: 'English', lang: 'en-US', localService: true }])
    const server = makeServer()
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('display-start'))
    expect(await screen.findByTestId('voice-status')).toHaveTextContent('한국어 음성이 없어')
  })

  test('화면을 누르기 전(소리 허용 전)에는 부르지 않는다', async () => {
    const said = fakeSpeech()
    const server = makeServer()
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const staff = makeDevice(server, { name: '김다희' })
    await act(async () => { await staff.engine.callNext() })
    await waitFor(() => expect(screen.getByTestId('display-now')).toHaveTextContent('1'))
    await new Promise((r) => setTimeout(r, 300))
    expect(said).toEqual([])
  })
})

test('번호는 한자어 수로 읽는다 (십이번, 백십사번)', async () => {
  const { announceText } = await import('../../lib/announcer')
  expect([1, 10, 12, 20, 99, 100, 114, 160, 999].map(announceText))
    .toEqual(['일번', '십번', '십이번', '이십번', '구십구번', '백번', '백십사번', '백육십번', '구백구십구번'])
})
