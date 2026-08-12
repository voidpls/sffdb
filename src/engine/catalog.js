const INTERNAL = new Set(['INDEX', 'simpleModel', 'category'])
const SENTINELS = new Set(['', '?', '-'])

function parseUnit (header) {
  const match = header.match(/\(([^)]+)\)\s*$/)
  return match ? match[1] : null
}

function inferType (values) {
  const vals = values.filter(v => !SENTINELS.has(String(v ?? '').trim()))
  if (vals.length === 0) return 'string'

  const isBool = vals.every(v => ['y', 'n', 'yes', 'no'].includes(String(v).trim().toLowerCase()))
  if (isBool) return 'bool'

  // A value is numeric only if it STARTS with a number (optionally followed by a
  // unit), so text like "RTX 4090" is not misread as the number 4090.
  const numeric = vals.filter(v => /^-?\d+(\.\d+)?\s*[a-zA-Z%²"]*$/.test(String(v).trim()))
  if (numeric.length / vals.length >= 0.7) return 'number'

  const distinct = new Set(vals.map(v => String(v).trim()))
  if (distinct.size <= 12) return 'enum'
  return 'string'
}

function buildCatalog (items, aliasesByCat = {}, defaultSelectByCategory = {}) {
  const byCat = {}
  for (const item of items) {
    (byCat[item.category] = byCat[item.category] || []).push(item)
  }

  const catalog = {}
  for (const [category, rows] of Object.entries(byCat)) {
    const headers = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(h => !INTERNAL.has(h))
    const aliasMap = aliasesByCat[category] || {}
    const headerToAlias = {}
    for (const [alias, header] of Object.entries(aliasMap)) headerToAlias[header] = alias
    const defaultHeaders = new Set(defaultSelectByCategory[category] || [])

    catalog[category] = headers.map(header => {
      const values = rows.map(r => r[header])
      const type = inferType(values)
      return {
        header,
        alias: headerToAlias[header] || null,
        unit: parseUnit(header),
        type,
        default: defaultHeaders.has(header)
      }
    })
  }
  return catalog
}

module.exports = { buildCatalog }
