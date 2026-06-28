import React from 'react'

export default function LoginPanel({ onLogin, loading, errorText, authUnavailable }) {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')

  function submit(event) {
    event.preventDefault()
    onLogin?.({ email, password })
  }

  return (
    <section className="details" style={{ maxWidth: 480, margin: '1.5rem auto' }}>
      <h2>Ingreso de usuarios</h2>
      <p>Accede con tu usuario y contraseña para usar la app.</p>

      {authUnavailable && (
        <div style={{ border: '1px solid #c62828', background: '#fff3f3', color: '#8a1c1c', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          No se pudo conectar con Firebase Authentication. Verifica public/firebase-config.json.
        </div>
      )}

      {errorText && (
        <div style={{ border: '1px solid #c62828', background: '#fff3f3', color: '#8a1c1c', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          {errorText}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={event => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={loading || authUnavailable}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <p style={{ marginTop: 10, opacity: 0.85 }}>
        Si eres propietario y aún no tienes usuario, crea el primer usuario desde Firebase Authentication y al primer ingreso quedará como owner automáticamente.
      </p>
    </section>
  )
}
