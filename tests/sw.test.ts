// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('서비스 워커는 같은 출처만 캐시하고 Supabase(다른 출처) 요청은 건드리지 않는다', () => {
  const sw = readFileSync('public/sw.js', 'utf8')
  expect(sw).toContain('url.origin !== self.location.origin')
  expect(sw).toContain("req.method !== 'GET'")
  expect(readFileSync('src/main.tsx', 'utf8')).toContain('serviceWorker.register')
})
