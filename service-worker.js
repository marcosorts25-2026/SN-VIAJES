const CACHE_VERSION = 'snt-pwa-20260624-1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const ACTIVE_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE])

const SHELL_PATHS = [
  './',
  './manifest.json',
  './firebase-config.json',
  './data.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
]

function scopeUrl(path) {
  return new URL(path, self.registration.scope).toString()
}

async function putInCache(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE)
  await Promise.allSettled(
    SHELL_PATHS.map(path => {
      const request = new Request(scopeUrl(path), { cache: 'reload' })
      return fetch(request).then(response => putInCache(SHELL_CACHE, request, response))
    })
  )
}

function offlineFallback() {
  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOMOS NOCHE TRANSPORTE</title><body style="font-family:Arial,sans-serif;padding:24px"><h1>SOMOS NOCHE TRANSPORTE</h1><p>La app no pudo cargar los archivos guardados. Abrela una vez con conexion y dejala terminar de cargar.</p></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

async function networkFirst(request, navigation = false) {
  try {
    const response = await fetch(request)
    await putInCache(navigation ? SHELL_CACHE : RUNTIME_CACHE, request, response)
    if (navigation) {
      await putInCache(SHELL_CACHE, new Request(scopeUrl('./')), response)
    }
    return response
  } catch (e) {
    const cached = await caches.match(request, { ignoreSearch: true })
    if (cached) return cached
    if (navigation) {
      return (await caches.match(scopeUrl('./'), { ignoreSearch: true })) || offlineFallback()
    }
    return Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true })
  if (cached) {
    fetch(request)
      .then(response => putInCache(RUNTIME_CACHE, request, response))
      .catch(() => {})
    return cached
  }
  return networkFirst(request)
}

function shouldCacheAsStatic(request, url) {
  if (request.destination && ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) return true
  return url.pathname.includes('/assets/') ||
    url.pathname.includes('/icons/') ||
    url.pathname.includes('/src/') ||
    url.pathname.includes('/node_modules/.vite/') ||
    url.pathname.includes('/@vite/')
}

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(precacheShell())
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(name => (ACTIVE_CACHES.has(name) ? null : caches.delete(name)))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/service-worker.js')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true))
    return
  }

  if (url.pathname.endsWith('/firebase-config.json')) {
    event.respondWith(networkFirst(request))
    return
  }

  if (shouldCacheAsStatic(request, url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})
