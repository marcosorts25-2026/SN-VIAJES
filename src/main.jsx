import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  let refreshed = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshed) return
    refreshed = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`)
      .then(reg => {
        console.log('ServiceWorker registrado:', reg.scope)

        if (hadController && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (hadController && worker.state === 'installed') {
              worker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        reg.update().catch(() => {})
      })
      .catch(err => console.log('Registro SW falló:', err))
  })
}
