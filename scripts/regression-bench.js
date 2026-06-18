#!/usr/bin/env node
'use strict'

require('dotenv').config()

const { spawn } = require('node:child_process')
const { writeFileSync, mkdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { analyzeRun } = require('./bench-lib')

const CASES = [
  {
    id: 'p0-1-gpu-generous-m3',
    p0: 'P0-1',
    text: 'which 4090s fit in the Ncase M3?',
    minPassRate: 1,
    check: r => r.generous?.complete === true
  },
  {
    id: 'p0-1-gpu-generous-raws1',
    p0: 'P0-1',
    text: '7900 XTX cards that fit in a Louqe Raw S1',
    minPassRate: 1,
    check: r => r.generous?.complete === true
  },
  {
    id: 'p0-3-cooler-ram-ridge',
    p0: 'P0-3',
    text: 'what air coolers fit in a Fractal Ridge with 35mm tall RAM?',
    minPassRate: 1,
    check: r => r.cooler?.complete === true && r.cooler?.heightOnly !== true
  },
  {
    id: 'gpu-tight-ghost5080',
    p0: 'control',
    text: '5080s that fit in ghost s1',
    minPassRate: 0.67,
    check: r => r.tight?.combinedLte === true
  },
  {
    id: 'case-browse-10l-330gpu',
    p0: 'control',
    text: 'smallest case under 10L that fits a 330mm GPU?',
    minPassRate: 1,
    check: r => r.queryCount >= 1 && r.malformed !== true
  },
  {
    id: 'gpu-filter-1080ti',
    p0: 'control',
    text: 'GTX 1080 Ti models under 270mm long',
    minPassRate: 1,
    check: r => r.queryCount >= 1 && r.malformed !== true
  }
]

function workerScript () {
  const benchLib = join(process.cwd(), 'scripts/bench-lib.js')
  return `
const { readFileSync } = require('node:fs')
require('dotenv').config({ path: ${JSON.stringify(join(process.cwd(), '.env'))} })
const QueryEngine = require(${JSON.stringify(join(process.cwd(), 'src/engine/index'))})
const { createAgent, summarizeSteps, extractToolCalls } = require(${JSON.stringify(join(process.cwd(), 'src/agent/index'))})
const { analyzeRun } = require(${JSON.stringify(benchLib)})

;(async () => {
  const id = process.env.BENCH_ID
  const question = process.env.BENCH_QUESTION
  const run = Number(process.env.BENCH_RUN)
  const snapshotPath = process.env.BENCH_SNAPSHOT
  const engine = new QueryEngine()
  if (snapshotPath) {
    engine.loadSnapshot(JSON.parse(readFileSync(snapshotPath, 'utf8')))
  } else {
    await engine.init()
  }
  const { answer, steps, totalMs, researchMs, researchTokens, formatTokens } = await createAgent(engine)(question)
  const toolCalls = extractToolCalls(steps)
  const toolStrings = summarizeSteps(steps) // kept for DSML detection + log parity
  const metrics = analyzeRun(toolCalls, { malformed: toolStrings.some(t => t.includes('DSML')) })
  console.log(JSON.stringify({
    id, question, run, ok: true, totalMs, researchMs,
    tools: toolStrings, toolCalls,
    answerLen: (answer || '').length,
    researchTokens, formatTokens,
    ...metrics
  }))
})().catch(err => {
  console.log(JSON.stringify({
    id: process.env.BENCH_ID, question: process.env.BENCH_QUESTION,
    run: Number(process.env.BENCH_RUN), ok: false, error: err.message
  }))
  process.exit(1)
})
`
}

function runOne ({ id, text }, run, snapshotPath) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      AGENT_BENCH: '1',
      BENCH_ID: id,
      BENCH_QUESTION: text,
      BENCH_RUN: String(run)
    }
    if (snapshotPath) env.BENCH_SNAPSHOT = snapshotPath
    const child = spawn(process.execPath, ['-e', workerScript()], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', code => {
      const line = stdout.trim().split('\n').pop()
      if (!line) return reject(new Error(stderr || `exit ${code}`))
      try { resolve(JSON.parse(line)) } catch { reject(new Error(stdout || stderr)) }
    })
  })
}

// DeepSeek V4-Flash pricing per 1M tokens (input cache-miss / cached / output)
const PRICING = { miss: 0.14, cache: 0.003, out: 0.28 }

function sumTokens (rows) {
  // Aggregate across research + format passes for a rollup of total token use per run.
  const tot = { miss: 0, cache: 0, out: 0 }
  for (const r of rows) {
    for (const t of [r.researchTokens, r.formatTokens]) {
      if (!t) continue
      tot.miss += t.uncachedInput || 0
      tot.cache += t.cachedInput || 0
      tot.out += t.output || 0
    }
  }
  return tot
}

function costMills (t) {
  return Math.round((t.miss * PRICING.miss + t.cache * PRICING.cache + t.out * PRICING.out) / 10) / 100
}

function summarizeCase (c, rows) {
  const passed = rows.filter(r => r.ok !== false && c.check(r)).length
  const passRate = rows.length ? passed / rows.length : 0
  const tok = sumTokens(rows)
  return {
    id: c.id,
    p0: c.p0,
    question: c.text,
    runs: rows.length,
    passed,
    passRate,
    minPassRate: c.minPassRate,
    ok: passRate >= c.minPassRate,
    avgMs: rows.length ? Math.round(rows.reduce((s, r) => s + (r.totalMs || 0), 0) / rows.length) : 0,
    avgQueries: rows.length ? Number((rows.reduce((s, r) => s + (r.queryCount || 0), 0) / rows.length).toFixed(1)) : 0,
    avgTokIn: rows.length ? Math.round(tok.miss / rows.length) : 0,
    avgTokCache: rows.length ? Math.round(tok.cache / rows.length) : 0,
    avgTokOut: rows.length ? Math.round(tok.out / rows.length) : 0,
    costMillsPerRun: rows.length ? costMills(tok) / rows.length : 0,
    malformed: rows.filter(r => r.malformed).length,
    errors: rows.filter(r => r.ok === false).length
  }
}

async function main () {
  const runs = Number(process.argv.find((a, i) => process.argv[i - 1] === '--runs') || 3)
  const serial = process.argv.includes('--serial')
  const noSnapshot = process.argv.includes('--no-snapshot')
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY required')
    process.exit(1)
  }

  // One Sheets fetch for the whole session; each child loads it from disk.
  let snapshotPath = null
  let tmpDir = null
  if (!noSnapshot) {
    const QueryEngine = require('../src/engine')
    const tmp = require('node:os').tmpdir()
    tmpDir = join(tmp, `sffdb-bench-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    snapshotPath = join(tmpDir, 'snapshot.json')
    process.stderr.write('[regression] fetching Sheets snapshot…\n')
    const engine = new QueryEngine()
    await engine.init()
    writeFileSync(snapshotPath, JSON.stringify(engine.snapshot()))
    process.stderr.write(`[regression] snapshot at ${snapshotPath}\n`)
  }

  const jobs = []
  for (const c of CASES) {
    for (let run = 1; run <= runs; run++) jobs.push({ c, run })
  }

  console.error(`[regression] ${jobs.length} jobs (${CASES.length} cases × ${runs} runs)${serial ? ' serial' : ' parallel'}${noSnapshot ? ' no-snapshot' : ''}`)

  let results
  try {
    if (serial) {
      results = []
      for (const j of jobs) {
        const r = await runOne(j.c, j.run, snapshotPath)
        results.push(r)
        process.stderr.write(`[regression] ${results.length}/${jobs.length} ${j.c.id} run ${j.run}\n`)
      }
    } else {
      let done = 0
      results = await Promise.all(jobs.map(j =>
        runOne(j.c, j.run, snapshotPath).then(r => {
          done++
          process.stderr.write(`[regression] ${done}/${jobs.length} ${j.c.id} run ${j.run}\n`)
          return r
        })
      ))
    }
  } finally {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  const summary = CASES.map(c => summarizeCase(c, results.filter(r => r.id === c.id)))
  const failed = summary.filter(s => !s.ok)

  const outDir = join(process.cwd(), 'scripts/bench-results')
  mkdirSync(outDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(outDir, `regression-${ts}.json`)
  writeFileSync(path, JSON.stringify({ runs, summary, results }, null, 2))

  console.log('\n=== regression bench ===')
  for (const s of summary) {
    const mark = s.ok ? 'PASS' : 'FAIL'
    console.log(`[${mark}] ${s.id} (${s.p0})`)
    console.log(`  ${s.passed}/${s.runs} checks | ${s.avgQueries}q | ${s.avgMs}ms | dsml ${s.malformed}/${s.runs}`)
    console.log(`  tok/run: ${s.avgTokIn} in + ${s.avgTokCache} cache + ${s.avgTokOut} out | ${(s.costMillsPerRun / 1000).toFixed(4)}/run`)
  }
  const totalRuns = summary.reduce((n, s) => n + s.runs, 0)
  const totalCost = summary.reduce((n, s) => n + s.costMillsPerRun * s.runs, 0) / 1000
  console.log(`\n${totalRuns} runs | ~${totalCost.toFixed(3)} total est. cost`)
  console.log(`Wrote ${path}`)

  if (failed.length) {
    console.error(`\n${failed.length} case(s) below threshold:`)
    for (const s of failed) {
      console.error(`  ${s.id}: ${s.passed}/${s.runs} (need ${Math.ceil(s.minPassRate * s.runs)}+)`)
    }
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
