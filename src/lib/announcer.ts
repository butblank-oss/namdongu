/*
 * 대기석 큰 화면의 호출 소리: "띵동!" + "십이번" (번호만, 브라우저 음성 합성, 한국어).
 * 브라우저는 사용자가 화면을 한 번 누른 뒤에만 소리를 낸다 → 큰 화면의 '화면을 한 번 눌러 주세요'에서 unlock() 을 부른다.
 * (사파리는 누르는 그 순간에 한 번 말해야 이후 음성이 나온다 → unlock 에서 짧게 안내 문장을 말한다)
 * 호출이 겹치면 순서대로 하나씩 부른다.
 */

export type AnnounceMode = 'voice2' | 'voice1' | 'chime'
export const ANNOUNCE_LABEL: Record<AnnounceMode, string> = {
  voice2: '띵동 + 번호 2번 부르기',
  voice1: '띵동 + 번호 1번 부르기',
  chime: '띵동만',
}

/** 1~999 를 한자어 수로 읽기: 12 → 십이, 114 → 백십사 (음성이 '열두 번'으로 읽지 않게) */
export function koreanNumber(n: number): string {
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  if (n <= 0 || !Number.isInteger(n) || n > 999) return String(n)
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10
  return (h ? (h === 1 ? '' : d[h]) + '백' : '') + (t ? (t === 1 ? '' : d[t]) + '십' : '') + d[o]
}

/** 부르는 말: 띵동 뒤에 번호만 ("십이번") */
export const announceText = (n: number) => `${koreanNumber(n)}번`

/** 화면에 보여 줄 음성 상태 */
export type VoiceStatus =
  | { kind: 'unknown' }
  | { kind: 'ready'; name: string }
  | { kind: 'none' } // 이 노트북에 한국어 음성이 없음
  | { kind: 'unsupported' } // 브라우저가 음성 합성을 지원하지 않음
  | { kind: 'error'; message: string }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'
    ? window.speechSynthesis : null
}

/** 한국어 음성 고르기: 온라인(구글 등)이 더 자연스럽다 */
function koreanVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ko = list.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('ko'))
  return ko.find((v) => !v.localService) ?? ko[0] ?? null
}

export class Announcer {
  private ctx: AudioContext | null = null
  private chain: Promise<void> = Promise.resolve()
  private voice: SpeechSynthesisVoice | null = null
  /** 크롬은 말하는 중인 문장 객체가 사라지면 끝 알림(onend)을 안 준다 → 붙잡아 둔다 */
  private speaking = new Set<SpeechSynthesisUtterance>()
  status: VoiceStatus = { kind: 'unknown' }
  onStatus: ((s: VoiceStatus) => void) | null = null

  private setStatus(s: VoiceStatus) { this.status = s; this.onStatus?.(s) }

  /** 사용자 클릭 안에서 부른다 (소리 허용) */
  unlock() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx ??= new Ctx()
      void this.ctx.resume()
    } catch { /* 소리가 안 나도 화면은 바뀐다 */ }
    const s = synth()
    if (!s) { this.setStatus({ kind: 'unsupported' }); return }
    this.pickVoice()
    // 클릭한 그 순간에 한 번 말해 둔다 (사파리·일부 크롬은 이래야 이후 음성이 나온다)
    s.cancel()
    void this.speak('호출 소리를 켰습니다')
  }

  private pickVoice() {
    const s = synth()
    if (!s) return
    const apply = () => {
      this.voice = koreanVoice(s.getVoices())
      if (this.voice) this.setStatus({ kind: 'ready', name: this.voice.name })
      else if (s.getVoices().length) this.setStatus({ kind: 'none' })
    }
    apply()
    // 크롬은 음성 목록을 늦게 준다. 2초 뒤에도 한국어 음성이 없으면 '없음'
    s.addEventListener?.('voiceschanged', apply)
    setTimeout(() => { if (!this.voice && this.status.kind === 'unknown') this.setStatus({ kind: 'none' }) }, 2000)
  }

  /** 띵(높은음) - 동(낮은음). 크게: 압축기로 키운다 */
  chime(): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return Promise.resolve()
    try {
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -20
      comp.ratio.value = 6
      const master = ctx.createGain()
      master.gain.value = 1.4
      comp.connect(master).connect(ctx.destination)
      const now = ctx.currentTime
      // 659Hz(미) → 523Hz(도): 초인종 소리. 두 음 사이를 0.7초 띄워 '띵 … 동'이 또렷하게 들리게
      for (const [freq, at] of [[659.3, 0], [523.3, 0.7]] as const) {
        for (const [mult, level] of [[1, 1], [2, 0.15]] as const) {
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.type = 'sine'
          o.frequency.value = freq * mult
          g.gain.setValueAtTime(0.0001, now + at)
          g.gain.exponentialRampToValueAtTime(level, now + at + 0.015)
          g.gain.exponentialRampToValueAtTime(0.0001, now + at + 1.1)
          o.connect(g).connect(comp)
          o.start(now + at)
          o.stop(now + at + 1.2)
        }
      }
    } catch { /* 무시 */ }
    return sleep(1900)
  }

  speak(text: string): Promise<void> {
    const s = synth()
    if (!s) return Promise.resolve()
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = this.voice?.lang ?? 'ko-KR'
      if (this.voice) u.voice = this.voice
      u.rate = 0.85
      u.volume = 1
      this.speaking.add(u)
      const done = () => { clearTimeout(t); this.speaking.delete(u); resolve() }
      const t = setTimeout(done, 8000)
      u.onend = done
      u.onerror = (e) => {
        const err = (e as SpeechSynthesisErrorEvent).error
        if (err && err !== 'interrupted' && err !== 'canceled') this.setStatus({ kind: 'error', message: err })
        done()
      }
      // 크롬: 오래 쉬면 멈춰 있는 경우가 있다
      s.resume()
      s.speak(u)
    })
  }

  /** 번호 호출: 띵동 → "십이번" 을 mode 만큼 */
  announce(n: number, mode: AnnounceMode): Promise<void> {
    const times = mode === 'voice2' ? 2 : 1
    this.chain = this.chain.then(async () => {
      for (let i = 0; i < times; i++) {
        await this.chime()
        if (mode !== 'chime') await this.speak(announceText(n))
        await sleep(700)
      }
    })
    return this.chain
  }
}
