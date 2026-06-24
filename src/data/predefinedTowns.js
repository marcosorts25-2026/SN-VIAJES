export const PREDEFINED_TOWNS = [
  'Achiras',
  'Rio Cuarto',
  'Holberg',
  'Sampacho',
  'Las Vertientes',
  'Chajan',
  'Bulnes',
  'Coronel Moldes',
  'San Basilio',
  'Adelia Maria',
  'Laboulaye',
  'Gral Levalle',
  'La Cautiva',
  'Villa Sarmiento',
  'Justo Daract',
  'Villa Mercedes',
  'Villa Valeria',
  'Del Campillo',
  'Nicolas Bruzzone',
  'Mattaldi',
  'Jovita',
  'San Joaquin',
  'Serrano',
  'Melo',
  'Realico LP',
  'Huinca Renanco',
  'Villa Huidobro',
  'Buchardo'
]

export function normalizeTownKey(value) {
  return String(value || '').trim().toLowerCase()
}

export function mergeTownOptions(extraTowns = []) {
  const seen = new Set()
  return [...PREDEFINED_TOWNS, ...extraTowns]
    .map(town => String(town || '').trim())
    .filter(Boolean)
    .filter(town => {
      const key = normalizeTownKey(town)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
