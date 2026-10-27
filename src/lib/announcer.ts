/*
 * 대기석 큰 화면의 호출 소리: "띵동!" + "N번 어르신, 들어오세요" (브라우저 음성 합성, 한국어).
 * 브라우저는 사용자가 화면을 한 번 누른 뒤에만 소리를 낸다 → 큰 화면의 '화면을 한 번 눌러 주세요'에서 unlock() 을 부른다.
 * 호출이 겹치면 순서대로 하나씩 부른다.
 */

export type AnnounceMode = 'voice2' | 'voice1' | 'chime'
export const ANNOUNCE_LABEL: Record<AnnounceMode, string> = {
  voice2: '띵동 + 번호 2번 부르기',
  voice1: '띵동 + 번호 1번 부르기',
  chime: '띵동만',
}

export const announceText = (n: number) => `${n}번 어르신, 들어오세요`

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class Announcer {
  private ctx: AudioContext | null = null
  private chain: Promise<void> = Promise.resolve()

  /** 사용자 클릭 안에서 부른다 (소리 허용) */
  unlock() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx ??= new Ctx()
      void this.ctx.resume()
    } catch { /* 소리가 안 나도 화면은 바뀐다 */ }
    // 음성 목록을 미리 불러 둔다 (크롬은 처음 부를 때 비어 있다)
    try { window.speechSynthesis?.getVoices() } catch { /* 무시 */ }
  }

  /** 띵동 (크게: 압축기로 소리를 키우고 높은음 → 낮은음) */
  chime(): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return Promise.resolve()
    try {
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -24
      comp.ratio.value = 4
      const master = ctx.createGain()
      master.gain.value = 1
      comp.connect(master).connect(ctx.destination)
      const now = ctx.currentTime
      for (const [freq, at] of [[880, 0], [698.5, 0.55]] as const) {
        for (const [mult, level, type] of [[1, 0.9, 'sine'], [2, 0.25, 'sine'], [3, 0.1, 'triangle']] as const) {
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.type = type
          o.frequency.value = freq * mult
          g.gain.setValueAtTime(0.0001, now + at)
          g.gain.exponentialRampToValueAtTime(level, now + at + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, now + at + 1.3)
          o.connect(g).connect(comp)
          o.start(now + at)
          o.stop(now + at + 1.4)
        }
      }
    } catch { /* 무시 */ }
    return sleep(1500)
  }

  speak(text: string): Promise<void> {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve()
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ko-KR'
      u.rate = 0.85
      u.volume = 1
      const ko = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('ko'))
      // 온라인 음성(구글 등)이 더 자연스럽다
      u.voice = ko.find((v) => !v.localService) ?? ko[0] ?? null
      const done = () => { clearTimeout(t); resolve() }
      const t = setTimeout(done, 8000)
      u.onend = done
      u.onerror = done
      synth.speak(u)
    })
  }

  /** 번호 호출: 띵동 → "N번 어르신, 들어오세요" 를 mode 만큼 */
  announce(n: number, mode: AnnounceMode): Promise<void> {
    const times = mode === 'voice2' ? 2 : 1
    this.chain = this.chain.then(async () => {
      for (let i = 0; i < times; i++) {
        await this.chime()
        if (mode !== 'chime') await this.speak(announceText(n))
        await sleep(600)
      }
    })
    return this.chain
  }
}
