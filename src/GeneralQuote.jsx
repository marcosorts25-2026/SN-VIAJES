import React from 'react'
import SAMPLE from './data/sampleData'
import solver from 'javascript-lp-solver'
import { loadData as loadRemoteData, saveData as saveRemoteData } from './sync'

function formatCurrency(value) {
  try {
    return Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
  } catch (e) {
    return '$' + value
  }
}

export default function GeneralQuote() {
  const [data, setData] = React.useState(() => SAMPLE)
  const [reservations, setReservations] = React.useState([])
  const [newRes, setNewRes] = React.useState({ Origen_Pueblo: '', Pasajeros: 1, PrecioCobrado: 0 })
  const [allowExcedente, setAllowExcedente] = React.useState(true)
  const [strategy, setStrategy] = React.useState('max-profit')
  const [results, setResults] = React.useState(null)

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const remote = await loadRemoteData()
        if (remote && mounted) {
          setData(remote)
          return
        }
        const r = await fetch(import.meta.env.BASE_URL + 'data.json')
        if (r.ok) {
          const json = await r.json()
          if (!mounted) return
          setData(json)
          try { await saveRemoteData(json) } catch (e) {}
        }
      } catch (e) {}
    })()
    return () => { mounted = false }
  }, [])

  React.useEffect(() => {
    // set default origin for new reservation
    const origenes = Array.from(new Set(data.rutas.map(r => r.Origen_Pueblo)))
    if (origenes.length && !newRes.Origen_Pueblo) setNewRes(prev => ({ ...prev, Origen_Pueblo: origenes[0] }))
  }, [data])

  function addReservation(e) {
    e && e.preventDefault()
    const P = Number(newRes.Pasajeros || 0)
    if (!newRes.Origen_Pueblo) return alert('Selecciona origen')
    if (P <= 0) return alert('Ingresa pasajeros válidos')
    const id = Date.now() + Math.floor(Math.random()*999)
    setReservations(prev => [...prev, { id, Origen_Pueblo: newRes.Origen_Pueblo, Pasajeros: P, PrecioCobrado: Number(newRes.PrecioCobrado || 0) }])
    setNewRes(prev => ({ ...prev, Pasajeros: 1, PrecioCobrado: 0 }))
  }

  function removeReservation(id) {
    setReservations(prev => prev.filter(r => r.id !== id))
  }

  function calculateAllocations() {
    const out = []
    let totalUnassigned = 0

    reservations.forEach(res => {
      const P = Number(res.Pasajeros || 0)
      const C = Number(res.PrecioCobrado || 0)
      // build candidates replicating units disponibles; respect allowExcedente flag
      const candidates = []
      const origenNorm = (res.Origen_Pueblo || '').trim().toLowerCase()
      data.rutas.filter(r => (r.Origen_Pueblo || '').trim().toLowerCase() === origenNorm).forEach(r => {
        const v = data.vehiculos.find(x => x.ID_Vehiculo === r.ID_Vehiculo) || {}
        const e = data.empresas.find(x => x.ID_Empresa === v.ID_Empresa) || {}
        const seats = Number(v.Capacidad_Asientos ?? v.Capacidad_Maxima ?? 0)
        const extra = Number(v.Capacidad_Excedente ?? 0)
        const units = Math.max(1, Number(v.Unidades_Disponibles ?? 1))
        for (let u = 0; u < units; u++) {
          const totalCap = allowExcedente ? (seats + extra) : seats
          candidates.push({ ...r, vehiculo: v, empresa: e, seats, extra, totalCap, unitIndex: u, instanceId: `${r.ID_Ruta}#${u}` })
        }
      })

      if (candidates.length === 0) {
        out.push({ reservation: res, allocations: [], unassigned: P, summary: { revenue: 0, cost: 0, profit: -0 } })
        totalUnassigned += P
        return
      }

      const capacitySum = candidates.reduce((s, c) => s + c.totalCap, 0)

      // helper for single-route profit given using P pax
      function singleProfit(route) {
        const baseCost = route.Modalidad_Cobro === 'Viaje Cerrado' ? Number(route.Precio_Base) : (Number(route.Precio_Base) * P)
        const extraPassengers = Math.max(0, P - route.seats)
        const usableExtra = allowExcedente ? extraPassengers : 0
        const extraCharge = route.Excedente_Cobra ? (Number(route.Recargo_Excedente || 0) * usableExtra) : 0
        const revenue = C * P + extraCharge
        const profit = revenue - baseCost
        return { baseCost, revenue, profit, extraPassengers: usableExtra }
      }

      if (candidates.some(r => r.totalCap >= P)) {
        // pick best single route by profit
        const scored = candidates.map(r => ({ route: r, ...singleProfit(r) }))
        scored.sort((a,b) => b.profit - a.profit)
        const best = scored[0]
        out.push({ reservation: res, allocations: [{ route: best.route, allocated: P, revenue: best.revenue, cost: best.baseCost, profit: best.profit, extraUsed: best.extraPassengers }], unassigned: 0, summary: { revenue: best.revenue, cost: best.baseCost, profit: best.profit } })
        return
      }

      // otherwise, try greedy multi-route allocation (one instance per route)
      // compute metrics for ordering based on selected strategy
      const enriched = candidates.map(r => {
        let profitPerSeat = 0
        let costPerSeat = 0
        if (r.Modalidad_Cobro === 'Viaje Cerrado') {
          costPerSeat = Number(r.Precio_Base) / Math.max(1, r.seats)
          const suggested = (C * r.seats - Number(r.Precio_Base)) / Math.max(1, r.seats)
          profitPerSeat = suggested
        } else {
          costPerSeat = Number(r.Precio_Base)
          profitPerSeat = C - Number(r.Precio_Base)
        }
        return { ...r, profitPerSeat, costPerSeat }
      })

      let greedy = enriched.slice()
      if (strategy === 'max-profit') {
        greedy.sort((a,b) => b.profitPerSeat - a.profitPerSeat)
      } else if (strategy === 'min-cost') {
        greedy.sort((a,b) => a.costPerSeat - b.costPerSeat)
      } else {
        // balance: prefer profit but penalize high cost
        greedy.sort((a,b) => (b.profitPerSeat - b.costPerSeat*0.5) - (a.profitPerSeat - a.costPerSeat*0.5))
      }

      let remaining = P
      const allocations = []
      let totalRevenue = 0
      let totalCost = 0

      for (const route of greedy) {
        if (remaining <= 0) break
        const take = Math.min(remaining, route.totalCap)
        if (take <= 0) continue
        const seats = route.seats
        const extraForThis = Math.max(0, take - seats)
        const usableExtra = allowExcedente ? extraForThis : 0
        const extraCharge = route.Excedente_Cobra ? (Number(route.Recargo_Excedente || 0) * usableExtra) : 0
        const revenueSeg = C * take + extraCharge
        const costSeg = route.Modalidad_Cobro === 'Viaje Cerrado' ? Number(route.Precio_Base) : (Number(route.Precio_Base) * take)
        const profitSeg = revenueSeg - costSeg
        allocations.push({ route, allocated: take, revenue: revenueSeg, cost: costSeg, profit: profitSeg, extraUsed: extraForThis })
        totalRevenue += revenueSeg
        totalCost += costSeg
        remaining -= take
      }

      const unassigned = Math.max(0, remaining)
      totalUnassigned += unassigned
      const totalProfit = totalRevenue - totalCost
      out.push({ reservation: res, allocations, unassigned, summary: { revenue: totalRevenue, cost: totalCost, profit: totalProfit } })
    })

    // Try an ILP optimization when there are relatively few candidate instances (keeps solve time reasonable)
    // Build a binary assignment variable x_resId_instance for assigning an instance to a reservation.
    try {
      const candidateInstances = []
      reservations.forEach(res => {
        const origenNormILP = (res.Origen_Pueblo || '').trim().toLowerCase()
        data.rutas.filter(r => (r.Origen_Pueblo || '').trim().toLowerCase() === origenNormILP).forEach(r => {
          const v = data.vehiculos.find(x => x.ID_Vehiculo === r.ID_Vehiculo) || {}
          const units = Math.max(1, Number(v.Unidades_Disponibles ?? 1))
          const seats = Number(v.Capacidad_Asientos ?? v.Capacidad_Maxima ?? 0)
          const extra = Number(v.Capacidad_Excedente ?? 0)
          for (let u = 0; u < units; u++) candidateInstances.push({ resId: res.id, ruta: r, vehiculo: v, seats, extra, instanceId: `${r.ID_Ruta}#${u}` })
        })
      })

      if (candidateInstances.length > 0 && candidateInstances.length <= 200) {
        // construct LP model
        const model = { optimize: 'profit', opType: 'max', constraints: {}, variables: {}, ints: {} }

        // Each instance can be used at most once across all reservations
        candidateInstances.forEach(ci => {
          const varName = `x_${ci.resId}_${ci.instanceId}`
          // variable contributes profit when assigned; compute profit for assigning up to reservation pax or min(capacity,res.pax)
          const reservation = reservations.find(r => r.id === ci.resId)
          const P = reservation ? Number(reservation.Pasajeros||0) : 0
          const C = reservation ? Number(reservation.PrecioCobrado||0) : 0
          const seats = ci.seats
          const extraAvail = allowExcedente ? ci.extra : 0
          const cap = seats + extraAvail
          const alloc = Math.min(cap, P)
          const extraUsed = Math.max(0, alloc - seats)
          const extraCharge = ci.ruta.Excedente_Cobra ? (Number(ci.ruta.Recargo_Excedente||0) * extraUsed) : 0
          const revenue = C * alloc + extraCharge
          const cost = ci.ruta.Modalidad_Cobro === 'Viaje Cerrado' ? Number(ci.ruta.Precio_Base) : (Number(ci.ruta.Precio_Base) * alloc)
          const profit = revenue - cost

          model.variables[varName] = { profit }
          // constraint: instance used at most once
          model.constraints[`inst_${ci.instanceId}`] = model.constraints[`inst_${ci.instanceId}`] || { max: 1 }
          model.variables[varName][`inst_${ci.instanceId}`] = 1
          // constraint: reservation must be fully covered by sum of assigned capacities >= P (we'll model by covering seats)
          model.constraints[`res_${ci.resId}`] = model.constraints[`res_${ci.resId}`] || { min: 0 }
          model.variables[varName][`res_${ci.resId}`] = alloc
          model.ints[varName] = 1
        })

        // for each reservation, require sum(alloc) >= P
        reservations.forEach(r => {
          const key = `res_${r.id}`
          const P = Number(r.Pasajeros || 0)
          if (!model.constraints[key]) model.constraints[key] = { min: P }
          else model.constraints[key].min = P
        })

        // Solve
        const solution = solver.Solve(model)
        if (solution && solution.feasible) {
          // parse solution into allocations
          const mapAlloc = {}
          Object.keys(solution).forEach(k => {
            if (!k.startsWith('x_')) return
            if (solution[k] >= 0.5) {
              // assigned
              const underIdx = k.indexOf('_', 2); const resId = k.slice(2, underIdx); const instanceId = k.slice(underIdx + 1)
              const ci = candidateInstances.find(x => String(x.resId) === resId && x.instanceId === instanceId)
              if (!ci) return
              const reservation = reservations.find(r => String(r.id) === resId)
              if (!reservation) return
              const allocCount = Math.min(ci.seats + (allowExcedente ? ci.extra : 0), reservation.Pasajeros)
              const empresa = data.empresas.find(x => x.ID_Empresa === ci.vehiculo.ID_Empresa) || {}
              if (!mapAlloc[resId]) mapAlloc[resId] = []
              const costILP = ci.ruta.Modalidad_Cobro === 'Viaje Cerrado' ? Number(ci.ruta.Precio_Base) : Number(ci.ruta.Precio_Base) * allocCount
              const revenueILP = reservation.PrecioCobrado * allocCount
              mapAlloc[resId].push({ route: { ...ci.ruta, vehiculo: ci.vehiculo, empresa }, allocated: allocCount, revenue: revenueILP, cost: costILP, profit: revenueILP - costILP, extraUsed: 0 })
            }
          })

          // build results per reservation
          const ilpOut = []
          let ilpUnassigned = 0
          reservations.forEach(r => {
            const allocs = mapAlloc[r.id] || []
            const assigned = allocs.reduce((s,a)=>s+a.allocated,0)
            const unassigned = Math.max(0, r.Pasajeros - assigned)
            ilpUnassigned += unassigned
            const revenue = allocs.reduce((s,a)=>s+a.revenue,0)
            const cost = allocs.reduce((s,a)=>s+a.cost,0)
            ilpOut.push({ reservation: r, allocations: allocs, unassigned, summary: { revenue, cost, profit: revenue - cost } })
          })

          setResults({ perReservation: ilpOut, totalUnassigned: ilpUnassigned })
          return
        }
      }
    } catch (err) {
      console.warn('ILP solve failed', err)
    }

    setResults({ perReservation: out, totalUnassigned })
  }

  const origenes = Array.from(new Set(data.rutas.map(r => r.Origen_Pueblo)))

  return (
    <div className="general-quote">
      <h2>Cotización general</h2>
      <p>Añade reservas desde varias localidades; el sistema sugerirá transportes y mostrará plazas sin asignar.</p>

      <form onSubmit={addReservation} style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
        <select value={newRes.Origen_Pueblo} onChange={e => setNewRes({...newRes, Origen_Pueblo: e.target.value})}>
          {origenes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input type="number" min="1" value={newRes.Pasajeros} onChange={e => setNewRes({...newRes, Pasajeros: e.target.value})} />
        <input type="number" min="0" value={newRes.PrecioCobrado} onChange={e => setNewRes({...newRes, PrecioCobrado: e.target.value})} placeholder="Precio por pax" />
        <label style={{display:'flex', alignItems:'center', gap:6}}><input type="checkbox" checked={allowExcedente} onChange={e => setAllowExcedente(e.target.checked)} /> Permitir excedente</label>
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontSize:12}}>Estrategia:</span>
          <select value={strategy} onChange={e => setStrategy(e.target.value)}>
            <option value="max-profit">Maximizar ganancia</option>
            <option value="min-cost">Minimizar costo</option>
            <option value="balance">Balance</option>
          </select>
        </label>
        <button type="submit">Agregar reserva</button>
        <button type="button" onClick={() => { setReservations([]); setResults(null) }}>Limpiar</button>
      </form>

      <div style={{marginTop:12}}>
        <h4>Reservas</h4>
        <ul>
          {reservations.map(r => (
            <li key={r.id}>{r.Origen_Pueblo} — {r.Pasajeros} pax — {formatCurrency(r.PrecioCobrado)} <button onClick={() => removeReservation(r.id)}>Eliminar</button></li>
          ))}
        </ul>
      </div>

      <div style={{marginTop:12}}>
        <button onClick={calculateAllocations} disabled={reservations.length===0}>Calcular asignación</button>
      </div>

      <div style={{marginTop:16}}>
        {results && results.perReservation.map((resRes, idx) => (
          <section key={idx} style={{border:'1px solid #ddd', padding:8, marginBottom:8}}>
            <h4>{resRes.reservation.Origen_Pueblo} — {resRes.reservation.Pasajeros} pax</h4>
            {resRes.allocations.length === 0 && <p style={{color:'#a00'}}>No hay rutas disponibles para este origen. Sin asignar: {resRes.unassigned}</p>}
            {resRes.allocations.length > 0 && (
              <div>
                <ul>
                  {resRes.allocations.map((a, i) => (
                    <li key={i}>{a.route.ID_Ruta} — {a.route?.empresa?.Nombre_Empresa ?? '—'} — {a.route?.vehiculo?.Tipo_Vehiculo ?? '—'} : asignadas {a.allocated} pax, ingresos {formatCurrency(a.revenue)}, costo {formatCurrency(a.cost)}, ganancia {formatCurrency(a.profit)} {a.extraUsed ? `(extra usado: ${a.extraUsed})` : ''}</li>
                  ))}
                </ul>
                {resRes.unassigned > 0 && <p style={{color:'#a60'}}>Faltan {resRes.unassigned} plazas sin asignar</p>}
                <p><strong>Resumen:</strong> Ingresos {formatCurrency(resRes.summary.revenue)} — Costo {formatCurrency(resRes.summary.cost)} — Ganancia {formatCurrency(resRes.summary.profit)}</p>
              </div>
            )}
          </section>
        ))}

        {results && (
          <div style={{marginTop:12}}>
            <h3>Resumen global</h3>
            <p>Plazas sin asignar totales: <strong>{results.totalUnassigned}</strong></p>
          </div>
        )}
      </div>
    </div>
  )
}
