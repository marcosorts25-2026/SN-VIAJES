import React from 'react'
import SAMPLE from './data/sampleData'
import { loadData as loadRemoteData, saveData as saveRemoteData } from './sync'

function formatCurrency(value) {
  try {
    return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  } catch (e) {
    return '$' + value
  }
}

// initial data source: SAMPLE, then try public/data.json or remote via sync

export default function QuoteEngine() {
  const [pasajeros, setPasajeros] = React.useState(1)
  const [origen, setOrigen] = React.useState('Del Campillo')
  const [results, setResults] = React.useState(null)
  const [data, setData] = React.useState(() => SAMPLE)
  const [allowExcedente, setAllowExcedente] = React.useState(true)
  const [charges, setCharges] = React.useState({})

  // Try to fetch public data.json on mount (overrides localStorage/sample)
  React.useEffect(() => {
    let mounted = true
    (async () => {
      try {
        // prefer static public file or remote
        const remote = await loadRemoteData()
        if (remote && mounted) {
          setData(remote)
          return
        }
        const r = await fetch('/data.json')
        if (r.ok) {
          const json = await r.json()
          if (!mounted) return
          setData(json)
          try { await saveRemoteData(json) } catch (e) {}
        }
      } catch (e) {
        // ignore and keep SAMPLE/local
      }
    })()
    return () => { mounted = false }
  }, [])

  React.useEffect(() => {
    // update origen to first available when data changes
    const origenes = Array.from(new Set(data.rutas.map(r => r.Origen_Pueblo)))
    if (origenes.length && !origenes.includes(origen)) setOrigen(origenes[0])
  }, [data])

  // initialize default charge-per-pax values when results arrive
  React.useEffect(() => {
    if (!results) return
    setCharges(prev => {
      const copy = { ...prev }
      results.forEach(r => {
        if (copy[r.ID_Ruta] === undefined) {
          if (r.Modalidad_Cobro === 'Viaje Cerrado') {
            const seats = Number(r.vehiculo.Capacidad_Asientos ?? r.vehiculo.Capacidad_Maxima ?? 0)
            const suggested = Math.ceil(Number(r.Precio_Base) / Math.max(1, seats))
            copy[r.ID_Ruta] = suggested
          } else {
            copy[r.ID_Ruta] = Number(r.Precio_Base)
          }
        }
      })
      return copy
    })
  }, [results])

  const origenes = Array.from(new Set(data.rutas.map(r => r.Origen_Pueblo)))

  function calculate() {
    const P = parseInt(pasajeros, 10) || 0
    if (P <= 0) {
      alert('Ingresa una cantidad de pasajeros válida (mayor que 0).')
      return
    }

    // join rutas with vehiculos and empresas
    const joined = data.rutas.map(r => {
      const v = data.vehiculos.find(x => x.ID_Vehiculo === r.ID_Vehiculo) || {}
      const e = data.empresas.find(x => x.ID_Empresa === v.ID_Empresa) || {}
      return { ...r, vehiculo: v, empresa: e }
    })

    // filter by origin and capacity (considera asientos + excedente si está permitido)
    const viable = joined.filter(item => {
      if (item.Origen_Pueblo !== origen) return false
      const seats = Number(item.vehiculo.Capacidad_Asientos ?? item.vehiculo.Capacidad_Maxima ?? 0)
      const extra = Number(item.vehiculo.Capacidad_Excedente ?? 0)
      const total = seats + extra
      return allowExcedente ? total >= P : seats >= P
    })

    const computed = viable.map(item => {
      const precio = Number(item.Precio_Base)
      const seats = Number(item.vehiculo.Capacidad_Asientos ?? item.vehiculo.Capacidad_Maxima ?? 0)
      const extraAllowed = Number(item.vehiculo.Capacidad_Excedente ?? 0)
      const extraUsed = Math.max(0, P - seats)
      const extraChargeFromRoute = (extraUsed > 0 && item.Excedente_Cobra) ? (Number(item.Recargo_Excedente || 0) * extraUsed) : 0
      let C_total = 0
      let C_pax = 0
      if (item.Modalidad_Cobro === 'Viaje Cerrado') {
        C_total = precio + extraChargeFromRoute
        C_pax = C_total / P
      } else {
        C_total = precio * P + extraChargeFromRoute
        C_pax = C_total / P
      }
      return { ...item, C_total, C_pax, seats, extraAllowed, extraUsed, extraChargeFromRoute }
    })

    computed.sort((a, b) => a.C_total - b.C_total)
    setResults(computed)
  }

  function copyResultText(item) {
    const text = `Empresa: ${item.empresa.Nombre_Empresa}\nVehículo: ${item.vehiculo.Tipo_Vehiculo} (${item.vehiculo.ID_Vehiculo})\nCapacidad: ${item.seats} asientos${item.extraAllowed ? ` +${item.extraAllowed} extra` : ''}\nModalidad: ${item.Modalidad_Cobro}\nPrecio base: ${formatCurrency(item.Precio_Base)}\nCosto total: ${formatCurrency(item.C_total)}\nCosto por pax: ${formatCurrency(item.C_pax)}\nRecargo excedente: ${formatCurrency(item.extraChargeFromRoute || 0)}`
    navigator.clipboard.writeText(text).then(() => alert('Cotización copiada'))
  }

  return (
    <div className="quote-engine">
      <h2>Cotizador rápido</h2>
      <div className="form-row">
        <label>Pasajeros</label>
        <input type="number" min="1" value={pasajeros} onChange={e => setPasajeros(e.target.value)} />
        <label>Origen</label>
        <select value={origen} onChange={e => setOrigen(e.target.value)}>
          {origenes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <label style={{display:'flex', alignItems:'center', gap:6}}><input type="checkbox" checked={allowExcedente} onChange={e => setAllowExcedente(e.target.checked)} /> Permitir excedente</label>
        <button onClick={calculate} className="search">Buscar</button>
      </div>

      <div className="results">
        {!results && <p className="muted">Ingrese pasajeros y origen, luego pulse Buscar.</p>}
        {results && results.length === 0 && (
          <p>No hay vehículos viables para esa cantidad de pasajeros desde este origen.</p>
        )}

        {results && results.length > 0 && (
          <div>
            <p>Se muestran {results.length} opción(es). La primera es la recomendada por menor costo.</p>
            <div className="result-list">
              {results.map((r, i) => {
                const seats = Number(r.vehiculo.Capacidad_Asientos ?? r.vehiculo.Capacidad_Maxima ?? 0)
                const extraAllowed = Number(r.vehiculo.Capacidad_Excedente ?? 0)
                const Pnum = parseInt(pasajeros, 10) || 0
                const extraPassengers = Math.max(0, Pnum - seats)
                const extraChargeFromExcedente = (r.Excedente_Cobra ? (Number(r.Recargo_Excedente || 0) * extraPassengers) : 0)

                // suggested per-seat when trip is closed
                const baseTripCost = Number(r.Precio_Base)
                const suggestedPerSeat = r.Modalidad_Cobro === 'Viaje Cerrado' ? Math.ceil(baseTripCost / Math.max(1, seats)) : Number(r.Precio_Base)
                const chargePerPax = Number(charges[r.ID_Ruta] ?? suggestedPerSeat)

                // revenue/profit calculations
                const revenueIfFull = chargePerPax * seats
                const revenueActual = chargePerPax * Pnum + extraChargeFromExcedente
                const profitIfFull = revenueIfFull - baseTripCost
                const profitActual = revenueActual - baseTripCost

                return (
                  <article key={r.ID_Ruta} className={`result-card ${i === 0 ? 'recommended' : ''} ${extraPassengers>0 ? 'excedente' : ''}`}>
                    {i === 0 && <div className="badge">Recomendada</div>}
                    {extraPassengers > 0 && <div className="badge excedente">Excedente</div>}
                    <h3>{r.empresa.Nombre_Empresa} — {r.vehiculo.Tipo_Vehiculo}</h3>
                    <div className="meta">
                      <span>Capacidad: {seats} asientos{extraAllowed ? ` +${extraAllowed} extra` : ''}</span>
                      <span>Modalidad: {r.Modalidad_Cobro}</span>
                    </div>

                    <div className="prices">
                      <div>Precio base: <strong>{formatCurrency(r.Precio_Base)}</strong></div>
                      {r.Modalidad_Cobro === 'Viaje Cerrado' && (
                        <div>Sugerido por asiento: <strong>{formatCurrency(suggestedPerSeat)}</strong></div>
                      )}
                      <div style={{display:'flex', gap:8, alignItems:'center', marginTop:6}}>
                        <label style={{fontSize:12}}>Cobrar por pax</label>
                        <input type="number" min="0" value={charges[r.ID_Ruta] ?? suggestedPerSeat} onChange={e => setCharges(prev => ({ ...prev, [r.ID_Ruta]: Number(e.target.value) }))} />
                      </div>

                      <div>Ingresos si llena asientos: <strong>{formatCurrency(revenueIfFull)}</strong></div>
                      <div>Ingresos por {Pnum} pax: <strong>{formatCurrency(revenueActual)}</strong></div>
                      {extraPassengers > 0 && (
                        <div>Recargo por {extraPassengers} excedente(s): <strong>{formatCurrency(extraChargeFromExcedente)}</strong></div>
                      )}
                      <div>Ganancia (si llena): <strong>{formatCurrency(profitIfFull)}</strong></div>
                      <div>Ganancia (actual): <strong>{formatCurrency(profitActual)}</strong></div>
                    </div>

                    <div className="actions">
                      <button onClick={() => alert('Reservación simulada: ' + r.ID_Ruta)}>Reservar</button>
                      <button onClick={() => copyResultText(r)}>Copiar cotización</button>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
