// 앱 껍데기(HTML/JS/CSS) 오프라인 캐시. 같은 출처 GET 만 다루고, Supabase 요청(다른 출처)은 건드리지 않는다.
// 명단·응답 데이터는 여기 저장하지 않는다 (IndexedDB 담당).
const CACHE = 'namdongu-shell-v1'
const SCOPE = self.registration.scope
const INDEX = new URL('index.html', SCOPE).href

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE, INDEX])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return

  if (req.mode === 'navigate') {
    // 페이지: 네트워크 우선, 끊기면 캐시된 index.html
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          if (res.ok) void caches.open(CACHE).then((c) => c.put(INDEX, copy))
          return res
        })
        .catch(() => caches.match(INDEX).then((r) => r || caches.match(SCOPE))),
    )
    return
  }

  // 해시가 붙은 정적 파일: 캐시 우선, 없으면 받아서 캐시
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone()
        void caches.open(CACHE).then((c) => c.put(req, copy))
      }
      return res
    })),
  )
})
