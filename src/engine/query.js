const SENTINELS = new Set(['', '?', '-'])

function isSentinel (value) {
  return SENTINELS.has(String(value ?? '').trim())
}

function toNumber (value) {
  if (isSentinel(value)) return null
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(num) ? num : null
}

const OPS = {
  eq: (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase(),
  ne: (a, b) => String(a).trim().toLowerCase() !== String(b).trim().toLowerCase(),
  gt: (a, b) => { const n = toNumber(a); return n !== null && n > Number(b) },
  gte: (a, b) => { const n = toNumber(a); return n !== null && n >= Number(b) },
  lt: (a, b) => { const n = toNumber(a); return n !== null && n < Number(b) },
  lte: (a, b) => { const n = toNumber(a); return n !== null && n <= Number(b) },
  contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
  in: (a, b) => Array.isArray(b) && b.map(x => String(x).trim().toLowerCase()).includes(String(a).trim().toLowerCase()),
  yes: (a) => String(a).trim().toLowerCase() === 'y',
  known: (a) => !isSentinel(a)
}

function resolveField (field, aliasMap, sample) {
  if (aliasMap[field]) return aliasMap[field]
  if (sample && Object.prototype.hasOwnProperty.call(sample, field)) return field
  return null
}

function projectRow (row, select, aliasMap, sample) {
  const out = {}
  if (select && select.length) {
    for (const f of select) {
      const header = resolveField(f, aliasMap, sample) || f
      out[header] = row[header]
    }
  } else {
    for (const key of Object.keys(row)) {
      if (key === 'INDEX' || key === 'simpleModel' || key === 'category') continue
      out[key] = row[key]
    }
  }
  return out
}

function queryComponents (items, spec = {}, opts = {}) {
  const { category, where = [], sort, limit, select } = spec
  const { aliases = {}, maxResults = 10 } = opts
  const aliasMap = aliases[category] || {}

  let rows = items.filter(i => i.category === category)
  if (rows.length === 0) return { error: `Unknown or empty category: ${category}` }
  const sample = rows[0]

  const validFields = () => [...new Set([...Object.keys(sample), ...Object.keys(aliasMap)])]
    .filter(f => !['INDEX', 'simpleModel', 'category'].includes(f))

  for (const cond of where) {
    if (!OPS[cond.op]) return { error: `Unknown op "${cond.op}"` }
    if (!resolveField(cond.field, aliasMap, sample)) {
      return { error: `Unknown field "${cond.field}" for ${category}`, validFields: validFields() }
    }
  }
  if (sort && !resolveField(sort.field, aliasMap, sample)) {
    return { error: `Unknown sort field "${sort.field}" for ${category}`, validFields: validFields() }
  }

  rows = rows.filter(row => where.every(cond => {
    const header = resolveField(cond.field, aliasMap, sample)
    return OPS[cond.op](row[header], cond.value)
  }))

  if (sort) {
    const header = resolveField(sort.field, aliasMap, sample)
    const dir = sort.dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => {
      const na = toNumber(a[header])
      const nb = toNumber(b[header])
      if (na !== null && nb !== null) return (na - nb) * dir
      if (na === null && nb === null) return 0
      return na === null ? 1 : -1 // unknowns last
    })
  }

  const total = rows.length
  const cap = Math.min(limit || maxResults, maxResults)
  const results = rows.slice(0, cap).map(row => projectRow(row, select, aliasMap, sample))
  return { count: total, returned: results.length, results }
}

module.exports = { queryComponents, toNumber }
