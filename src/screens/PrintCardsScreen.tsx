import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine } from '../app/context'
import { Button } from '../components/ui'
import { gameListOptions } from '../lib/survey'

export function PrintCardsScreen() {
  const engine = useEngine()
  const navigate = useNavigate()
  const games = gameListOptions(engine.schema.payload)
  const [perPage, setPerPage] = useState<2 | 4>(4)
  const pages: string[][] = []
  for (let i = 0; i < games.length; i += perPage) pages.push(games.slice(i, i + perPage))

  return (
    <div>
      <style>{`@page { size: A4 landscape; margin: 10mm; }`}</style>
      <div className="no-print mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
        <Button onClick={() => navigate('/')}>← 돌아가기</Button>
        <h1 className="text-2xl font-extrabold">게임 카드 인쇄</h1>
        <span className="text-slate-600">게임 {games.length}종 · 어드민의 게임 목록 문항과 연동</span>
        <div className="ml-auto flex items-center gap-2" role="group" aria-label="한 장에 카드 수">
          {([2, 4] as const).map((n) => (
            <Button key={n} variant={perPage === n ? 'primary' : 'secondary'} onClick={() => setPerPage(n)}>한 장에 {n}개</Button>
          ))}
          <Button variant="primary" onClick={() => window.print()}>인쇄</Button>
        </div>
      </div>
      {games.length === 0 && <p className="px-6 text-lg">게임 목록 문항이 없습니다. 어드민에서 '게임 목록' 표시를 켜 주세요.</p>}
      {pages.map((page, pi) => (
        <section key={pi} data-testid="print-page"
          className="mx-auto mb-6 grid aspect-[297/210] w-full max-w-5xl gap-3 bg-white p-3 shadow print:mb-0 print:max-w-none print:shadow-none"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: perPage === 4 ? 'repeat(2, 1fr)' : '1fr', breakAfter: 'page' }}>
          {page.map((g) => {
            const n = games.indexOf(g) + 1
            return (
              <div key={g} data-testid="game-card" className="flex flex-col items-center justify-center rounded-2xl border-4 border-slate-900 p-4 text-center">
                <span className="text-4xl font-black text-slate-500">{n}</span>
                <span className={`mt-2 font-black leading-tight ${perPage === 2 ? 'text-7xl' : 'text-5xl'}`}>{g}</span>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
