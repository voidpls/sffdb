'use strict'

const { analyzeGenerousGpuFit } = require('../src/engine/query')

function parseSpecs (tools) {
  return tools.filter(t => t.startsWith('query_components')).map(t => {
    const open = t.indexOf('(')
    const close = t.lastIndexOf(')')
    if (open === -1 || close === -1) return null
    const inner = t.slice(open + 1, close)
    if (inner.startsWith('"')) return null
    try { return JSON.parse(inner) } catch { return null }
  }).filter(Boolean)
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

function analyzeRun (tools) {
  const specs = parseSpecs(tools)
  return {
    specs,
    queryCount: specs.length,
    malformed: tools.some(t => t.includes('DSML')),
    generous: analyzeGenerousGpuFit(specs),
    tight: analyzeTightGpuFit(specs),
    cooler: analyzeCoolerFit(specs)
  }
}

module.exports = {
  parseSpecs,
  analyzeRun,
  analyzeGenerousGpuFit,
  analyzeTightGpuFit,
  analyzeCoolerFit
}
