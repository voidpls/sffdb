#!/usr/bin/env node
'use strict'

require('dotenv').config()

const { spawn } = require('node:child_process')
const { writeFileSync, mkdirSync } = require('node:fs')
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
require('dotenv').config({ path: ${JSON.stringify(join(process.cwd(), '.env'))} })
const QueryEngine = require(${JSON.stringify(join(process.cwd(), 'src/engine/index'))})
const { createAgent, summarizeSteps } = require(${JSON.stringify(join(process.cwd(), 'src/agent/index'))})
const { analyzeRun } = require(${JSON.stringify(benchLib)})

;(async () => {
  const id = process.env.BENCH_ID
  const question = process.env.BENCH_QUESTION
  const run = Number(process.env.BENCH_RUN)
  const engine = new QueryEngine()
  await engine.init()
  const { answer, steps, totalMs, researchMs } = await createAgent(engine)(question)
  const tools = summarizeSteps(steps)
  const metrics = analyzeRun(tools)
  console.log(JSON.stringify({
    id, question, run, ok: true, totalMs, researchMs,
    tools, answerLen: (answer || '').length,
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

function runOne ({ id, text }, run) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', workerScript()], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENT_BENCH: '1',
        BENCH_ID: id,
        BENCH_QUESTION: text,
        BENCH_RUN: String(run)
      },
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

function summarizeCase (c, rows) {
  const passed = rows.filter(r => r.ok !== false && c.check(r)).length
  const passRate = rows.length ? passed / rows.length : 0
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
    malformed: rows.filter(r => r.malformed).length,
    errors: rows.filter(r => r.ok === false).length
  }
}

async function main () {
  const runs = Number(process.argv.find((a, i) => process.argv[i - 1] === '--runs') || 3)
  const serial = process.argv.includes('--serial')
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY required')
    process.exit(1)
  }

  const jobs = []
  for (const c of CASES) {
    for (let run = 1; run <= runs; run++) jobs.push({ c, run })
  }

  console.error(`[regression] ${jobs.length} jobs (${CASES.length} cases × ${runs} runs)${serial ? ' serial' : ' parallel'}`)

  let results
  if (serial) {
    results = []
    for (const j of jobs) {
      const r = await runOne(j.c, j.run)
      results.push(r)
      process.stderr.write(`[regression] ${results.length}/${jobs.length} ${j.c.id} run ${j.run}\n`)
    }
  } else {
    let done = 0
    results = await Promise.all(jobs.map(j =>
      runOne(j.c, j.run).then(r => {
        done++
        process.stderr.write(`[regression] ${done}/${jobs.length} ${j.c.id} run ${j.run}\n`)
        return r
      })
    ))
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
  }
  console.log(`\nWrote ${path}`)

  if (failed.length) {
    console.error(`\n${failed.length} case(s) below threshold:`)
    for (const s of failed) {
      console.error(`  ${s.id}: ${s.passed}/${s.runs} (need ${Math.ceil(s.minPassRate * s.runs)}+)`)
    }
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
