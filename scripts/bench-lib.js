'use strict'

const { analyzeGenerousGpuFit, isBareChipBrowse } = require('../src/engine/query')

// Accept structured tool calls or legacy summarizeSteps strings; query_components inputs become specs.
function parseSpecs (tools) {
  return tools
    .map(t => {
      if (typeof t === 'string') {
        if (!t.startsWith('query_components')) return null
        const open = t.indexOf('(')
        const close = t.lastIndexOf(')')
        if (open === -1 || close === -1) return null
        const inner = t.slice(open + 1, close)
        if (inner.startsWith('"')) return null // DSML-corrupted, can't recover from string form
        try { return JSON.parse(inner) } catch { return null }
      }
      if (t.toolName === 'query_components') return t.input
      return null
    })
    .filter(Boolean)
}

const CHIP = /\d{4}/
const GPU_CHIP = /^model$|^name$|^gpu$/i
const GPU_LEN = /^length \(mm\)$/i
const GPU_WIDTH = /^width \(mm\)$/i
const GPU_THICK = /^thickness \(mm\)$/i

function analyzeTightGpuFit (specs = []) {
  let combinedLte = false
  for (const spec of specs) {
    if (spec?.category !== 'Graphics Cards' || !spec.where?.length) continue
    let chip = false
    let lenLte = false
    let widLte = false
    let thickLte = false
    for (const c of spec.where) {
      const f = String(c.field ?? '').trim()
      if (c.op === 'contains' && GPU_CHIP.test(f) && CHIP.test(String(c.value ?? ''))) chip = true
      if (c.op === 'lte' && GPU_LEN.test(f)) lenLte = true
      if (c.op === 'lte' && GPU_WIDTH.test(f)) widLte = true
      if (c.op === 'lte' && GPU_THICK.test(f)) thickLte = true
    }
    if (chip && lenLte && widLte && thickLte) combinedLte = true
  }
  return { combinedLte }
}

function analyzeCoolerFit (specs, userRam = 35) {
  const flags = {
    heightLte: false,
    ramGte: false,
    ramNoLimit: false,
    complete: false,
    heightOnly: false
  }
  for (const spec of specs) {
    if (spec?.category !== 'Coolers (Air)' || !spec.where?.length) continue
    let heightLte = false
    let ramGte = false
    let ramNoLimit = false
    for (const c of spec.where) {
      const f = String(c.field ?? '')
      if (/height/i.test(f) && c.op === 'lte') heightLte = true
      if (/ram clearance|ram_clearance/i.test(f) && c.op === 'gte' && Number(c.value) === userRam) ramGte = true
      if (/ram clearance|ram_clearance/i.test(f) && c.op === 'contains' && /no limit/i.test(String(c.value ?? ''))) ramNoLimit = true
    }
    if (heightLte && ramGte) flags.ramGte = true
    if (heightLte && ramNoLimit) flags.ramNoLimit = true
    if (heightLte && !ramGte && !ramNoLimit) flags.heightOnly = true
    if (heightLte) flags.heightLte = true
  }
  flags.complete = flags.ramGte && flags.ramNoLimit
  return flags
}

// Malformed (DSML leakage) is only visible in the string form, so the caller supplies it.
function analyzeRun (tools, { malformed = false } = {}) {
  const specs = parseSpecs(tools)
  return {
    specs,
    queryCount: specs.length,
    malformed,
    generous: analyzeGenerousGpuFit(specs),
    tight: analyzeTightGpuFit(specs),
    cooler: analyzeCoolerFit(specs)
  }
}

// --- Answer verification (final text vs ground truth re-queried via engine.query) ---

const EXCEPTION_RE = /(\bexception\b|\bexcept\b|\bexclude\b|too (long|wide|thick)|over (the )?limit|doesn'?t fit|do not fit)/i
const NONE_RE = /(none|no (?:[^ ]+ )*(cards?|gpus?|coolers?|cases?)|don'?t fit|do not fit)/i

function normalize (s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ALIAS_FIELDS = ['Brand', 'Model', 'Name', 'Cooler', 'Case', 'Seller']
const SHORT_ALIAS_ALLOW = /^\d{4}$/ // chip tokens (4090) — the intentional short allowlist

// Substrings an answer could use to name a row; short tokens are too generic except 4-digit chips.
function rowAliases (row = {}) {
  const out = new Set()
  const add = s => {
    const n = normalize(s)
    if (n && (n.length >= 5 || SHORT_ALIAS_ALLOW.test(n))) out.add(n)
  }
  for (const f of ALIAS_FIELDS) add(row[f])
  const brand = normalize(row.Brand)
  const model = normalize(row.Model)
  if (brand && model) add(brand + model) // 'asus4090'
  return [...out]
}

function mentions (answerNorm, alias) {
  return answerNorm.includes(alias)
}

function matchAny (answer, patterns) {
  return patterns.some(p => p.test(answer))
}

function unionRows (engine, specs) {
  const rows = []
  let truncated = false
  for (const spec of specs) {
    const r = engine.query(spec)
    if (r?.truncated) truncated = true
    rows.push(...(r?.results || []))
  }
  return { rows, truncated }
}

// Generous-fit exception specs: chip family + a gt on any GPU dimension.
// These queries return the NON-fit set — generous fit = chip family minus this union.
function generousExceptionSpecs (specs) {
  return (specs || []).filter(spec => {
    if (spec?.category !== 'Graphics Cards' || !spec.where?.length) return false
    let chip = false
    let gt = false
    for (const c of spec.where) {
      const f = String(c.field ?? '').trim()
      if (c.op === 'contains' && GPU_CHIP.test(f) && CHIP.test(String(c.value ?? ''))) chip = true
      if (c.op === 'gt' && (GPU_LEN.test(f) || GPU_WIDTH.test(f) || GPU_THICK.test(f))) gt = true
    }
    return chip && gt
  })
}

function tightLteSpec (specs) {
  return (specs || []).find(spec => {
    if (spec?.category !== 'Graphics Cards' || !spec.where?.length) return false
    let chip = false
    let len = false
    let wid = false
    let thick = false
    for (const c of spec.where) {
      const f = String(c.field ?? '').trim()
      if (c.op === 'contains' && GPU_CHIP.test(f) && CHIP.test(String(c.value ?? ''))) chip = true
      if (c.op === 'lte' && GPU_LEN.test(f)) len = true
      if (c.op === 'lte' && GPU_WIDTH.test(f)) wid = true
      if (c.op === 'lte' && GPU_THICK.test(f)) thick = true
    }
    return chip && len && wid && thick
  })
}

// Cooler specs combining height lte with a RAM-clearance bound (gte or 'No limit').
function coolerRamSpecs (specs) {
  return (specs || []).filter(spec => {
    if (spec?.category !== 'Coolers (Air)' || !spec.where?.length) return false
    let height = false
    let ram = false
    for (const c of spec.where) {
      const f = String(c.field ?? '')
      if (/height/i.test(f) && c.op === 'lte') height = true
      if (/ram clearance|ram_clearance/i.test(f) && (c.op === 'gte' || (c.op === 'contains' && /no limit/i.test(String(c.value ?? ''))))) ram = true
    }
    return height && ram
  })
}

// Verify the final answer text against ground truth re-queried through engine.query.
// def: { kind, chip?, anyOf?, category? }
//   generous_gpu:  chip + exception named or exception language; never 'all fit' with exceptions
//   tight_gpu:     chip + >=1 fitting card, or none-language when the lte set is empty
//   cooler_ram:    >=1 cooler from the height+RAM union, or none-language when empty
//   decline:       answer matches >=1 of anyOf (regex, case-insensitive)
//   fit_list:      chip (optional) + >=1 result alias from the first matching query
//   structural_only: no answer gate
// Returns { ok, reasons }.
function verifyAnswer (def, { answer, specs, engine }) {
  const reasons = []
  const answerNorm = normalize(answer)
  if (!answerNorm) return { ok: false, reasons: ['empty answer'] }

  const chip = def.chip ? normalize(def.chip) : null
  const checkChip = () => {
    if (chip && !mentions(answerNorm, chip)) reasons.push(`chip '${def.chip}' not mentioned`)
  }

  switch (def.kind) {
    case 'generous_gpu': {
      checkChip()
      const ex = generousExceptionSpecs(specs)
      if (!ex.length) { reasons.push('no generous exception queries'); break }
      const { rows, truncated } = unionRows(engine, ex)
      // Naming the chip family is not naming an exception — exclude bare chip tokens
      const aliases = [...new Set(rows.flatMap(rowAliases))].filter(a => !/^\d{4}$/.test(a))
      if (!truncated && aliases.length) {
        const anyAlias = aliases.some(a => mentions(answerNorm, a))
        if (!anyAlias && !EXCEPTION_RE.test(answer)) {
          reasons.push('exceptions exist but none named and no exception language used')
        }
      }
      if (rows.length && /\ball\b/i.test(answer) && /fit/i.test(answer) &&
          !EXCEPTION_RE.test(answer) && !aliases.some(a => mentions(answerNorm, a))) {
        reasons.push("claims 'all fit' while exception queries returned rows")
      }
      break
    }
    case 'tight_gpu': {
      const spec = tightLteSpec(specs)
      if (!spec) { reasons.push('no combined lte spec'); break }
      const { rows } = unionRows(engine, [spec])
      if (!rows.length) {
        if (!NONE_RE.test(answer)) reasons.push('no fitting results but answer lacks none-language')
      } else {
        const aliases = [...new Set(rows.flatMap(rowAliases))]
        const chipMentioned = !chip || mentions(answerNorm, chip)
        if (!chipMentioned && !aliases.some(a => mentions(answerNorm, a))) {
          reasons.push('chip or a fitting card not mentioned in answer')
        }
      }
      break
    }
    case 'cooler_ram': {
      const cs = coolerRamSpecs(specs)
      if (!cs.length) { reasons.push('no RAM-clearance cooler queries'); break }
      const { rows } = unionRows(engine, cs)
      const aliases = [...new Set(rows.flatMap(rowAliases))]
      if (!rows.length) {
        if (!NONE_RE.test(answer)) reasons.push('no coolers but answer lacks none-language')
      } else if (!aliases.some(a => mentions(answerNorm, a))) {
        reasons.push('no cooler from RAM-clearance union mentioned')
      }
      break
    }
    case 'decline': {
      const patterns = (def.anyOf || []).map(p => typeof p === 'string' ? new RegExp(`\\b${p}\\b`, 'i') : p)
      if (!patterns.length || !matchAny(answer, patterns)) reasons.push('decline language missing')
      break
    }
    case 'fit_list': {
      const cat = def.category
      const cs = (cat ? (specs || []).filter(s => s?.category === cat) : specs) || []
      if (!cs.length) { reasons.push(`no ${cat || 'matching'} queries`); break }
      const { rows } = unionRows(engine, [cs[0]])
      if (!rows.length) {
        if (!NONE_RE.test(answer)) reasons.push('no results but answer lacks none-language')
      } else {
        const aliases = [...new Set(rows.flatMap(rowAliases))]
        const chipMentioned = !chip || mentions(answerNorm, chip)
        if (!chipMentioned && !aliases.some(a => mentions(answerNorm, a))) {
          reasons.push('chip or a listed component not mentioned in answer')
        }
      }
      break
    }
    case 'structural_only':
      break
    default:
      reasons.push(`unknown answer kind '${def.kind}'`)
  }
  return { ok: reasons.length === 0, reasons }
}

// Count bare chip-family GPU queries (server-side cost gate) in a run's specs.
function bareChipQueries (specs, engine) {
  const sample = engine.getByCategory?.('Graphics Cards')?.[0]
  return specs.filter(s => isBareChipBrowse(s?.category, s?.where || [], {}, sample)).length
}

module.exports = {
  parseSpecs,
  analyzeRun,
  analyzeGenerousGpuFit,
  analyzeTightGpuFit,
  analyzeCoolerFit,
  normalize,
  rowAliases,
  verifyAnswer,
  bareChipQueries
}
