import React, { useState, useMemo } from 'react'
import SAMPLE from './data/sampleData'
import { mergeTownOptions } from './data/predefinedTowns'
import { loadData as loadRemoteData } from './sync'

const BASE_URL = import.meta.env.BASE_URL || '/'

function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return SAMPLE
  return {
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : [],
    rutas: Array.isArray(raw.rutas) ? raw.rutas : []
  }
}

export default function ExpressQuote() {
  const [data, setData] = useState(() => SAMPLE)
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [pasajeros, setPasajeros] = useState(10)
  const [precioCobrar, setPrecioCobrar] = useState(20000)

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const remote = await loadRemoteData()
        if (remote && mounted) {
          setData(normalizeData(remote))
          return
        }
        const response = await fetch(`${BASE_URL}data.json`)
        if (response.ok) {
          const json = await response.json()
          if (mounted) setData(normalizeData(json))
        }
      } catch (e) {}
    })()
    return () => { mounted = false }
  }, [])

  const { empresasById, vehiculosByCompany, results } = useMemo(() => {
    const empresasById = {}
    const vehiculosByCompany = {}

    data.empresas.forEach(emp => {
      empresasById[emp.ID_Empresa] = emp
    })

    data.vehiculos.forEach(v => {
      if (!vehiculosByCompany[v.ID_Empresa]) {
        vehiculosByCompany[v.ID_Empresa] = []
      }
      vehiculosByCompany[v.ID_Empresa].push(v)
    })

    // Filtrar rutas que coincidan origen y destino
    const matchedRoutes = data.rutas.filter(
      r => r.Origen_Pueblo === origen && r.Destino_Final === destino
    )

    // Para cada ruta, crear opciones de transporte
    const results = matchedRoutes.map(route => {
      const empresa = empresasById[route.ID_Empresa]
      const vehiculos = vehiculosByCompany[route.ID_Empresa] || []

      const transports = vehiculos.map(v => {
        const capacidad = v.Capacidad_Asientos
        const viajosNecesarios = Math.ceil(pasajeros / capacidad)
        const costoBaseViaje = route.Precio_Base
        const costoTotalViajes = costoBaseViaje * viajosNecesarios
        const ingresoTotal = pasajeros * precioCobrar
        const ganancia = ingresoTotal - costoTotalViajes

        return {
          vehiculo: v,
          viajosNecesarios,
          costoTotalViajes,
          ganancia,
          capacidadPorViaje: capacidad
        }
      })

      // Ordenar por ganancia descendente
      transports.sort((a, b) => b.ganancia - a.ganancia)

      return {
        empresa,
        route,
        transports
      }
    })

    return { empresasById, vehiculosByCompany, results }
  }, [data, origen, destino, pasajeros, precioCobrar])

  const pueblos = useMemo(() => mergeTownOptions(data.rutas.map(r => r.Origen_Pueblo)), [data.rutas])
  const destinos = useMemo(() => mergeTownOptions(data.rutas.map(r => r.Destino_Final)), [data.rutas])

  return (
    <div className="express-quote">
      <div className="express-hero">
        <div className="express-kicker">Cotización operativa</div>
        <h2 className="express-title">Cotización Express</h2>
        <p className="express-subtitle">Configura origen, destino y tarifa para validar la operación más conveniente con una vista rápida y limpia.</p>
      </div>

      <div className="express-grid">
        <div className="express-field">
          <label>
            <strong>Pueblo de origen</strong>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
              <option value="">Selecciona un pueblo</option>
              {pueblos.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="express-field">
          <label>
            <strong>Destino</strong>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Selecciona un destino</option>
              {destinos.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="express-field">
          <label>
            <strong>Pasajeros</strong>
            <input 
              type="number" 
              min="1" 
              value={pasajeros} 
              onChange={(e) => setPasajeros(parseInt(e.target.value) || 1)}
            />
          </label>
        </div>

        <div className="express-field">
          <label>
            <strong>Precio por pasajero ($)</strong>
            <input 
              type="number" 
              min="0" 
              step="1000"
              value={precioCobrar} 
              onChange={(e) => setPrecioCobrar(parseInt(e.target.value) || 0)}
            />
          </label>
        </div>
      </div>

      {origen && destino ? (
        <>
          <div className="express-summary">
            Ingreso total estimado: ${(pasajeros * precioCobrar).toLocaleString()}
          </div>

          {results.length === 0 ? (
            <div className="express-warning">
              No hay rutas disponibles para esa combinación.
            </div>
          ) : (
            results.map((result, idx) => (
              <div key={idx} className="express-company">
                <h3>{result.empresa.Nombre_Empresa}</h3>

                <table>
                  <thead>
                    <tr>
                      <th>Vehículo</th>
                      <th style={{ textAlign: 'center' }}>Capacidad</th>
                      <th style={{ textAlign: 'center' }}>Viajes</th>
                      <th style={{ textAlign: 'right' }}>Costo total</th>
                      <th style={{ textAlign: 'right' }}>Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.transports.map((t, tidx) => {
                      const isPositive = t.ganancia >= 0
                      const color = isPositive ? '#2d862d' : '#c93c39'
                      return (
                        <tr key={tidx}>
                          <td>{t.vehiculo.Tipo_Vehiculo}</td>
                          <td style={{ textAlign: 'center' }}>{t.capacidadPorViaje} pas.</td>
                          <td style={{ textAlign: 'center' }}><strong>{t.viajosNecesarios}</strong></td>
                          <td style={{ textAlign: 'right' }}>
                            ${t.costoTotalViajes.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', color, fontWeight: 'bold' }}>
                            {isPositive ? '+' : ''} ${t.ganancia.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="muted">
                  Contacto directo: {result.empresa.Contacto_Directo}
                </div>
              </div>
            ))
          )}
        </>
      ) : (
        <div className="express-empty">
          Selecciona origen y destino para ver opciones disponibles.
        </div>
      )}
    </div>
  )
}
