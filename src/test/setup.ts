import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/dom'

// CI 러너처럼 느린 환경에서도 화면 전환(IndexedDB 쓰기 → 라우팅)을 기다리도록 기본 1초 → 5초
configure({ asyncUtilTimeout: 5000 })

beforeEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear()
})
