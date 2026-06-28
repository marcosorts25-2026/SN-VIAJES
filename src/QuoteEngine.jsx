import React from 'react'
import SAMPLE from './data/sampleData'
import { mergeTownOptions } from './data/predefinedTowns'
import { loadData as loadRemoteData, saveData as saveRemoteData } from './sync'

const BASE_URL = import.meta.env.BASE_URL || '/'

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return SAMPLE
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas.filter(item => item && typeof item === 'object') : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos.filter(item => item && typeof item === 'object') : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas.filter(item => item && typeof item === 'object') : []
  }
}

function formatCurrency(value) {
  try {
    return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  } catch (e) {
    return '$' + value
  }
}

function rrppPerSeat(route) {
  if (!route || !route.RRPP_Cobra) return 0
  return Number(route.RRPP_Ganancia_Por_Asiento || 0)
}

function effectiveSeatPrice(route) {
  return Number(route?.Precio_Por_Pasajero || 0) + rrppPerSeat(route)
}

function companyIdFromRoute(route, vehiculoById) {
  if (!route || typeof route !== 'object') return ''
  if (route.ID_Empresa) return route.ID_Empresa
  if (route.ID_Vehiculo) {
    const v = vehiculoById.get(route.ID_Vehiculo)
    return v?.ID_Empresa || ''
  }
  return ''
}

// initial data source: SAMPLE, then try public/data.json or remote via sync

export default function QuoteEngine() {
  const [pasajeros, setPasajeros] = React.useState(1)
  const [origen, setOrigen] = React.useState('Del Campillo')
  const [results, setResults] = React.useState(null)
  const [data, setData] = React.useState(() => SAMPLE)
  const [allowExcedente, setAllowExcedente] = React.useState(true)

  // Try to fetch public data.json on mount (overrides localStorage/sample)
  React.useEffect(() => {
    let mounted = true
    (async () => {
      try {
        // prefer static public file or remote
        const remote = await loadRemoteData()
        if (remote && mounted) {
          setData(normalizeData(remote))
          return
        }
        const r = await fetch(`${BASE_URL}data.json`)
        if (r.ok) {
          const json = await r.json()
          if (!mounted) return
          const normalized = normalizeData(json)
          setData(normalized)
          try { await saveRemoteData(normalized) } catch (e) {}
        }
      } catch (e) {
        // ignore and keep SAMPLE/local
      }
    })()
    return () => { mounted = false }
  }, [])

  const rutas = Array.isArray(data?.rutas) ? data.rutas.filter(item => item && typeof item === 'object') : []
  const vehiculos = Array.isArray(data?.vehiculos) ? data.vehiculos.filter(item => item && typeof item === 'object') : []
  const empresas = Array.isArray(data?.empresas) ? data.empresas.filter(item => item && typeof item === 'object') : []
  const origenes = mergeTownOptions(rutas.map(r => r?.Origen_Pueblo).filter(Boolean))

  React.useEffect(() => {
    if (origenes.length && !origenes.includes(origen)) setOrigen(origenes[0])
  }, [origenes, origen])

  function calculate() {
    const P = parseInt(pasajeros, 10) || 0
    if (P <= 0) {
      alert('Ingresa una cantidad de pasajeros válida (mayor que 0).')
      return
    }

    // Mapas para búsqueda rápida
    const empresasById = new Map((empresas || []).filter(Boolean).map(e => [e.ID_Empresa, e]))
    const vehiculosByCompany = new Map()
    const vehiculosValidos = (vehiculos || []).filter(v => v && typeof v === 'object')
    const vehiculosById = new Map(vehiculosValidos.map(v => [v.ID_Vehiculo, v]))

    vehiculosValidos.forEach(v => {
      if (!vehiculosByCompany.has(v.ID_Empresa)) {
        vehiculosByCompany.set(v.ID_Empresa, [])
      }
      vehiculosByCompany.get(v.ID_Empresa).push(v)
    })

    // Para cada ruta que sale desde el origen seleccionado
    const rutasDesdeOrigen = (rutas || []).filter(r => r && r.Origen_Pueblo === origen)
    
    // Expandir: para cada ruta, crear un resultado por cada vehículo de su empresa
    const quoteResults = []
    rutasDesdeOrigen.forEach(ruta => {
      const companyId = companyIdFromRoute(ruta, vehiculosById)
      const empresa = empresasById.get(companyId) || {}

      let vehiculosEmpresa = []
      if (ruta.ID_Vehiculo) {
        const linked = vehiculosById.get(ruta.ID_Vehiculo)
        vehiculosEmpresa = linked ? [linked] : []
      } else {
        vehiculosEmpresa = vehiculosByCompany.get(companyId) || []
      }
      
      vehiculosEmpresa.forEach(vehiculo => {
        if (!vehiculo) return
        const seats = Number(vehiculo.Capacidad_Asientos ?? vehiculo.Capacidad_Maxima ?? 0)
        const extra = Number(vehiculo.Capacidad_Excedente ?? 0)
        const total = seats + (allowExcedente ? extra : 0)
        
        // Verificar capacidad
        if (allowExcedente ? total >= P : seats >= P) {
          const precio = Number(ruta.Precio_Base)
          const extraUsed = Math.max(0, P - seats)
          const extraChargeFromRoute = (extraUsed > 0 && ruta.Excedente_Cobra) ? (Number(ruta.Recargo_Excedente || 0) * extraUsed) : 0
          
          let C_total = 0
          let C_pax = 0
          if (ruta.Modalidad_Cobro === 'Viaje Cerrado') {
            C_total = precio + extraChargeFromRoute
            C_pax = C_total / P
          } else {
            C_total = precio * P + extraChargeFromRoute
            C_pax = C_total / P
          }
          
          quoteResults.push({
            ...ruta,
            vehiculo,
            empresa,
            C_total,
            C_pax,
            seats,
            extraAllowed: extra,
            extraUsed,
            extraChargeFromRoute
          })
        }
      })
    })

    quoteResults.sort((a, b) => a.C_total - b.C_total)
    setResults(quoteResults)
  }

  function copyResultText(item) {
    const rrppSeat = rrppPerSeat(item)
    const text = `Empresa: ${item.empresa.Nombre_Empresa}\nVehículo: ${item.vehiculo.Tipo_Vehiculo} (${item.vehiculo.ID_Vehiculo})\nCapacidad: ${item.seats} asientos${item.extraAllowed ? ` +${item.extraAllowed} extra` : ''}\nModalidad: ${item.Modalidad_Cobro}\nPrecio base: ${formatCurrency(item.Precio_Base)}\nPrecio por pasajero: ${formatCurrency(item.Precio_Por_Pasajero || 0)}\nGanancia RRPP por asiento: ${formatCurrency(rrppSeat)}\nPrecio final por pasajero: ${formatCurrency(effectiveSeatPrice(item))}\nCosto total: ${formatCurrency(item.C_total)}\nCosto por pax: ${formatCurrency(item.C_pax)}\nRecargo excedente: ${formatCurrency(item.extraChargeFromRoute || 0)}`
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
                <div className="section-grid">
                  <div className="section-card">
                    <div className="label">Opciones encontradas</div>
                    <div className="value">{results.length}</div>
                    <div className="hint">La primera opción es la de menor costo total.</div>
                  </div>
                  <div className="section-card">
                    <div className="label">Origen seleccionado</div>
                    <div className="value">{origen || 'Sin definir'}</div>
                    <div className="hint">Compara vehículos de esa salida en tiempo real.</div>
                  </div>
                </div>
            <div className="result-list">
              {results.map((r, i) => {
                const seats = Number(r.vehiculo?.Capacidad_Asientos ?? r.vehiculo?.Capacidad_Maxima ?? 0)
                const extraAllowed = Number(r.vehiculo?.Capacidad_Excedente ?? 0)
                const Pnum = parseInt(pasajeros, 10) || 0
                const extraPassengers = Math.max(0, Pnum - seats)
                const extraChargeFromExcedente = (r.Excedente_Cobra ? (Number(r.Recargo_Excedente || 0) * extraPassengers) : 0)

                const rrppSeat = rrppPerSeat(r)
                const chargePerPax = effectiveSeatPrice(r)
                const baseTripCost = Number(r.Precio_Base)

                // revenue/profit calculations
                const revenueIfFull = chargePerPax * seats
                const revenueActual = chargePerPax * Pnum + extraChargeFromExcedente
                const profitIfFull = revenueIfFull - baseTripCost
                const profitActual = revenueActual - baseTripCost

                return (
                  <article key={`${r.ID_Ruta || 'R'}-${r.vehiculo?.ID_Vehiculo || 'V'}-${i}`} className={`result-card ${i === 0 ? 'recommended' : ''} ${extraPassengers>0 ? 'excedente' : ''}`}>
                    {i === 0 && <div className="badge">Recomendada</div>}
                    {extraPassengers > 0 && <div className="badge excedente">Excedente</div>}
                    <h3>{r.empresa?.Nombre_Empresa || 'Empresa s/d'} — {r.vehiculo?.Tipo_Vehiculo || r.vehiculo?.ID_Vehiculo || 'Vehículo s/d'}</h3>
                    <div className="meta">
                      <span>Capacidad: {seats} asientos{extraAllowed ? ` +${extraAllowed} extra` : ''}</span>
                      <span>Modalidad: {r.Modalidad_Cobro}</span>
                      {r.vehiculo?.Modelo_Transporte && <span>Modelo: {r.vehiculo.Modelo_Transporte}</span>}
                      <span>Confort: {r.vehiculo?.Nivel_Confort || 'Estandar'}</span>
                      {r.vehiculo?.Detalle_Confort && <span>Detalle: {r.vehiculo.Detalle_Confort}</span>}
                    </div>

                    <div className="prices">
                      <div>Precio base: <strong>{formatCurrency(r.Precio_Base)}</strong></div>
                      <div>Precio por pasajero (ruta): <strong>{formatCurrency(r.Precio_Por_Pasajero || 0)}</strong></div>
                      <div>Ganancia RRPP por asiento: <strong>{formatCurrency(rrppSeat)}</strong></div>
                      <div>Precio final por pasajero (que cobras): <strong className={chargePerPax > 0 ? 'metric-positive' : 'metric-warning'}>{formatCurrency(chargePerPax)}</strong></div>

                      <div>Ingresos si llena {seats} asientos: <strong>{formatCurrency(revenueIfFull)}</strong></div>
                      <div>Ingresos por {Pnum} pax: <strong>{formatCurrency(revenueActual)}</strong></div>
                      {extraPassengers > 0 && (
                        <div>Recargo por {extraPassengers} excedente(s): <strong className="attention-chip">{formatCurrency(extraChargeFromExcedente)}</strong></div>
                      )}
                      <div style={{marginTop:8, paddingTop:8, borderTop:'1px solid #ddd'}}>
                        <div>Ganancia si llena {seats} asientos: <strong className={profitIfFull >= 0 ? 'metric-positive' : 'metric-negative'}>{formatCurrency(profitIfFull)}</strong></div>
                        <div>Ganancia real ({Pnum} pax): <strong className={profitActual >= 0 ? 'metric-positive' : 'metric-negative'} style={{fontSize:'1.1em'}}>{formatCurrency(profitActual)}</strong></div>
                      </div>
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
