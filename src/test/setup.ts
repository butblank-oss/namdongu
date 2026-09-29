import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

beforeEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear()
})
