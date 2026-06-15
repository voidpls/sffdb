#!/usr/bin/env node
'use strict'

require('dotenv').config()

const { spawn } = require('node:child_process')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const CASES = [
  { id: 'q01', text: '5080s that fit in ghost s1', type: 'tight' },
  { id: 'q20', text: 'is the RTX 5090 FE small enough for a Louqe Ghost S1 with a riser?', type: 'named-gpu' },
  { id: 'q02', text: 'which 4090s fit in the Ncase M3?', type: 'generous' },
  { id: '1080', text: 'GTX 1080s that fit in Ghost S1', type: 'tight-old' }
]

function workerScript () {
  const root = process.cwd()
  return `
require('dotenv').config({ path: ${JSON.stringify(join(root, '.env'))} })
const QueryEngine = require(${JSON.stringify(join(root, 'src/engine/index'))})
const { createAgent, summarizeSteps } = require(${JSON.stringify(join(root, 'src/agent/index'))})

const CHIP = /\\d{4}/
const GPU_CHIP = /^model$|^name$|^gpu$/i
const GPU_DIM = /length|width|thickness/i

function parseSpecs (tools) {
  return tools.filter(t => t.startsWith('query_components')).map(t => {
    const inner = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'))
    if (inner.startsWith('"')) return null
    try { return JSON.parse(inner) } catch { return null }
  }).filter(Boolean)
}

function isBare (s) {
  if (s?.category !== 'Graphics Cards') return false
  let chip = false, dim = false
  for (const w of s.where || []) {
    const f = String(w.field ?? '')
    if (w.op === 'contains' && GPU_CHIP.test(f) && CHIP.test(String(w.value ?? ''))) chip = true
    if (GPU_DIM.test(f)) dim = true
  }
  return chip && !dim
}

function isCombined (s) {
  if (s?.category !== 'Graphics Cards') return false
  let chip = false, l = false, w = false, t = false
  for (const x of s.where || []) {
    const f = String(x.field ?? '')
    if (x.op === 'contains' && GPU_CHIP.test(f) && CHIP.test(String(x.value ?? ''))) chip = true
    if (/length/i.test(f) && x.op === 'lte') l = true
    if (/width/i.test(f) && x.op === 'lte') w = true
    if (/thickness/i.test(f) && x.op === 'lte') t = true
  }
  return chip && l && w && t
}

function isGtExc (s) {
  return s?.category === 'Graphics Cards' &&
    (s.where || []).some(w => GPU_DIM.test(String(w.field ?? '')) && w.op === 'gt')
}

;(async () => {
  const engine = new QueryEngine()
  await engine.init()
  const { answer, steps, totalMs } = await createAgent(engine)(process.env.BENCH_QUESTION)
  const tools = summarizeSteps(steps)
  const specs = parseSpecs(tools)
  const bareIdx = specs.findIndex(isBare)
  const combIdx = specs.findIndex(isCombined)
  const gtCount = specs.filter(isGtExc).length
  const fitIdx = combIdx >= 0 ? combIdx : specs.findIndex(isGtExc)
  console.log(JSON.stringify({
    id: process.env.BENCH_ID,
    run: Number(process.env.BENCH_RUN),
    totalMs,
    queryCount: specs.length,
    stepCount: steps.length,
    bareAttempts: specs.filter(isBare).length,
    bareBeforeFit: bareIdx >= 0 && fitIdx >= 0 && bareIdx < fitIdx,
    combinedLte: combIdx >= 0,
    gtExceptions: gtCount,
    gpuSearch: tools.filter(t => t.startsWith('search_components') && /Graphics Cards/i.test(t)).length,
    firstGpuQuery: specs[0]
      ? (isBare(specs[0]) ? 'bare' : isCombined(specs[0]) ? 'combined' : isGtExc(specs[0]) ? 'gt' : 'other')
      : 'none',
    pattern: bareIdx >= 0 && fitIdx >= 0 && bareIdx < fitIdx
      ? 'bare-then-fit'
      : (combIdx === 0 || (gtCount > 0 && bareIdx < 0)) ? 'clean' : 'other',
    tools
  }))
})().catch(err => { console.error(err.stack || err.message); process.exit(1) })
`
}

function runOne (id, question, run) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', workerScript()], {
      cwd: process.cwd(),
      env: { ...process.env, AGENT_BENCH: '1', BENCH_ID: id, BENCH_QUESTION: question, BENCH_RUN: String(run) },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || stdout || `exit ${code}`))
      resolve(JSON.parse(stdout.trim().split('\n').pop()))
    })
  })
}

async function main () {
  const runs = Number(process.argv.find((a, i) => process.argv[i - 1] === '--runs') || 5)
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY required')
    process.exit(1)
  }

  const all = []
  for (const c of CASES) {
    for (let r = 1; r <= runs; r++) {
      const row = await runOne(c.id, c.text, r)
      all.push({ ...row, type: c.type })
      process.stderr.write(`[p1-3] ${c.id} ${r}/${runs} bare=${row.bareAttempts} pattern=${row.pattern} ${row.totalMs}ms\n`)
    }
  }

  const summary = CASES.map(c => {
    const rows = all.filter(r => r.id === c.id)
    return {
      id: c.id,
      type: c.type,
      bareRate: rows.filter(r => r.bareAttempts > 0).length / runs,
      bareBeforeFit: rows.filter(r => r.bareBeforeFit).length / runs,
      cleanRate: rows.filter(r => r.pattern === 'clean').length / runs,
      avgQueries: Number((rows.reduce((s, r) => s + r.queryCount, 0) / runs).toFixed(1)),
      avgMs: Math.round(rows.reduce((s, r) => s + r.totalMs, 0) / runs),
      firstGpu: rows.map(r => r.firstGpuQuery)
    }
  })

  const outDir = join(process.cwd(), 'scripts/bench-results')
  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, `p1-3-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(path, JSON.stringify({ runs, summary, results: all }, null, 2))

  console.log(`\n=== P1-3 probe × ${runs} ===`)
  for (const s of summary) {
    console.log(`${s.id}: bare ${(s.bareRate * 100).toFixed(0)}% | bare→fit ${(s.bareBeforeFit * 100).toFixed(0)}% | clean ${(s.cleanRate * 100).toFixed(0)}% | ${s.avgQueries}q ${s.avgMs}ms`)
  }
  console.log(`Wrote ${path}`)
}

main().catch(err => { console.error(err); process.exit(1) })
