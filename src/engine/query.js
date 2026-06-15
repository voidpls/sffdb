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

// Strips internal bookkeeping fields, returning the raw component values
function stripInternal (row) {
  const out = {}
  for (const key of Object.keys(row)) {
    if (key === 'INDEX' || key === 'simpleModel' || key === 'category') continue
    out[key] = row[key]
  }
  return out
}

function buildEffectiveSelect (spec, aliasMap, sample, defaultSelectByCategory = {}) {
  if (spec.select?.length) return spec.select

  const defaults = defaultSelectByCategory[spec.category] || []
  const extra = []
  for (const cond of spec.where || []) extra.push(cond.field)
  if (spec.sort?.field) extra.push(spec.sort.field)

  const seen = new Set()
  const out = []
  for (const f of [...defaults, ...extra]) {
    const header = resolveField(f, aliasMap, sample) || f
    if (seen.has(header)) continue
    seen.add(header)
    out.push(f)
  }
  return out
}

function projectRow (row, select, aliasMap, sample) {
  if (!select?.length) return stripInternal(row)
  const out = {}
  for (const f of select) {
    const header = resolveField(f, aliasMap, sample) || f
    out[header] = row[header]
  }
  return out
}

function slimComponent (row, aliasesByCategory = {}, defaultSelectByCategory = {}) {
  const category = row.category
  const aliasMap = aliasesByCategory[category] || {}
  const select = buildEffectiveSelect({ category }, aliasMap, row, defaultSelectByCategory)
  return { category, ...projectRow(row, select, aliasMap, row) }
}

function buildQueryHint (total, returned, truncated) {
  if (!truncated) return undefined
  const scale = total >= 100 ? `${total} matches (100+ variants)` : `${total} matches`
  return `${scale} (${returned} returned) — never browse or paginate. Use fit recipe: tight case → all lte limits in one where; generous case → three gt exception queries (length, width, thickness).`
}

const GPU_CHIP_FIELDS = /^model$|^name$|^gpu$/i
const GPU_LENGTH_FIELD = /^length \(mm\)$/i
const GPU_WIDTH_FIELD = /^width \(mm\)$/i
const GPU_THICKNESS_FIELD = /^thickness \(mm\)$/i
const GPU_DIM_FIELDS = /^length \(mm\)$|^width \(mm\)$|^thickness \(mm\)$/i
const CHIP_FAMILY = /\d{4}/

function analyzeGenerousGpuFit (specs = []) {
  const flags = { lengthGt: false, widthGt: false, thicknessGt: false, complete: false }
  for (const spec of specs) {
    if (spec?.category !== 'Graphics Cards' || !spec.where?.length) continue
    let chipFamily = false
    for (const cond of spec.where) {
      const field = String(cond.field ?? '').trim()
      if (cond.op === 'contains' && GPU_CHIP_FIELDS.test(field) && CHIP_FAMILY.test(String(cond.value ?? ''))) {
        chipFamily = true
      }
    }
    if (!chipFamily) continue
    for (const cond of spec.where) {
      const field = String(cond.field ?? '').trim()
      if (cond.op !== 'gt') continue
      if (GPU_LENGTH_FIELD.test(field)) flags.lengthGt = true
      if (GPU_WIDTH_FIELD.test(field)) flags.widthGt = true
      if (GPU_THICKNESS_FIELD.test(field)) flags.thicknessGt = true
    }
  }
  flags.complete = flags.lengthGt && flags.widthGt && flags.thicknessGt
  return flags
}

function isBareChipBrowse (category, where, aliasMap, sample) {
  if (category !== 'Graphics Cards' || !where.length) return false

  let chipFamily = false
  let hasDim = false

  for (const cond of where) {
    const header = resolveField(cond.field, aliasMap, sample) || cond.field
    if (GPU_DIM_FIELDS.test(header)) hasDim = true
    if (cond.op === 'contains' && GPU_CHIP_FIELDS.test(header.trim())) {
      if (CHIP_FAMILY.test(String(cond.value ?? ''))) chipFamily = true
    }
  }

  return chipFamily && !hasDim
}

function queryComponents (items, spec = {}, opts = {}) {
  const { category, where = [], sort, limit } = spec
  const { aliases = {}, maxResults = 10, defaultSelect = {}, rejectBareChipBrowse = false } = opts
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

  if (rejectBareChipBrowse && isBareChipBrowse(category, where, aliasMap, sample)) {
    return {
      error: 'Chip-family browse rejected (100+ variants). Include case GPU Length/Width/Thickness limits in the same where.',
      rejected: 'bare_chip_browse'
    }
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
  const effectiveSelect = buildEffectiveSelect(spec, aliasMap, sample, defaultSelect)
  const results = rows.slice(0, cap).map(row => projectRow(row, effectiveSelect, aliasMap, sample))
  const truncated = total > results.length
  const out = { count: total, returned: results.length, truncated, results }
  const hint = buildQueryHint(total, results.length, truncated)
  if (hint) out.hint = hint
  return out
}

module.exports = {
  queryComponents,
  isBareChipBrowse,
  analyzeGenerousGpuFit,
  toNumber,
  stripInternal,
  buildEffectiveSelect,
  projectRow,
  slimComponent,
  buildQueryHint
}
