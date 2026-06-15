#!/usr/bin/env node
'use strict'

require('dotenv').config()

const { spawn } = require('node:child_process')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { analyzeRun, parseSpecs } = require('./bench-lib')

const CASES = [
  { id: 'q13', text: 'watercooled 4090s that fit in a Sliger SM550', maxQueries: 4 },
  { id: 'q17', text: '4070 Super cards under 244mm for a K39', maxQueries: 4 },
  { id: 'q06', text: 'slimmest 120mm fan that still moves decent air for a sandwich GPU', maxQueries: 4 }
]

function workerScript () {
  const root = process.cwd()
  return `
require('dotenv').config({ path: ${JSON.stringify(join(root, '.env'))} })
const QueryEngine = require(${JSON.stringify(join(root, 'src/engine/index'))})
const { createAgent, summarizeSteps } = require(${JSON.stringify(join(root, 'src/agent/index'))})
const { analyzeRun, parseSpecs } = require(${JSON.stringify(join(root, 'scripts/bench-lib.js'))})

function probeMetrics(tools) {
  const searches = tools.filter(t => t.startsWith('search_components'))
  const specs = parseSpecs(tools)
  const dupSearch = searches.length > 2
  const modelHunt = tools.some(t => /search_components.*(?:SY1212|SC1212|model string)/i.test(t)) ||
    tools.filter(t => t.startsWith('search_components') && /Graphics Cards|Slim Fans/i.test(t)).length > 2
  return { searchCount: searches.length, dupSearch, modelHunt }
}

;(async () => {
  const id = process.env.BENCH_ID
  const question = process.env.BENCH_QUESTION
  const run = Number(process.env.BENCH_RUN)
  const engine = new QueryEngine()
  await engine.init()
  const { answer, steps, totalMs, researchMs } = await createAgent(engine)(question)
  const tools = summarizeSteps(steps)
  const metrics = analyzeRun(tools)
  const probe = probeMetrics(tools)
  console.log(JSON.stringify({
    id, question, run, ok: true, totalMs, researchMs,
    stepCount: steps.length, tools, answerLen: (answer || '').length,
    ...metrics, ...probe
  }))
})().catch(err => {
  console.error(err.stack || err.message)
  process.exit(1)
})
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

function summarizeCase (c, rows) {
  const avg = k => Math.round(rows.reduce((s, r) => s + r[k], 0) / rows.length)
  const pass = rows.filter(r => r.queryCount <= c.maxQueries && !r.malformed).length
  return {
    id: c.id,
    runs: rows.length,
    passRate: pass / rows.length,
    avgQueries: Number((rows.reduce((s, r) => s + r.queryCount, 0) / rows.length).toFixed(1)),
    avgSearches: Number((rows.reduce((s, r) => s + r.searchCount, 0) / rows.length).toFixed(1)),
    avgSteps: Number((rows.reduce((s, r) => s + r.stepCount, 0) / rows.length).toFixed(1)),
    avgMs: avg('totalMs'),
    malformed: rows.filter(r => r.malformed).length
  }
}

async function main () {
  const runs = Number(process.argv.find((a, i) => process.argv[i - 1] === '--runs') || 5)
  const arm = process.argv.find((a, i) => process.argv[i - 1] === '--arm') || 'current'
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY required')
    process.exit(1)
  }

  const all = []
  let done = 0
  const total = CASES.length * runs
  await Promise.all(CASES.flatMap(c =>
    Array.from({ length: runs }, (_, i) => i + 1).map(run =>
      runOne(c.id, c.text, run).then(r => {
        done++
        process.stderr.write(`[p1-2-bench] ${arm} ${done}/${total} ${c.id} run ${run} q=${r.queryCount} s=${r.searchCount} ${r.totalMs}ms\n`)
        all.push(r)
        return r
      })
    )
  ))

  const summary = CASES.map(c => summarizeCase(c, all.filter(r => r.id === c.id)))
  const outDir = join(process.cwd(), 'scripts/bench-results')
  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, `p1-2-${arm}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(path, JSON.stringify({ arm, runs, cases: CASES, summary, results: all }, null, 2))

  console.log(`\n=== P1-2 probe bench (${arm}) × ${runs} ===`)
  for (const s of summary) {
    console.log(`${s.id}: pass ${(s.passRate * 100).toFixed(0)}% | avg ${s.avgQueries} queries, ${s.avgSearches} searches, ${s.avgSteps} steps, ${s.avgMs}ms | malformed ${s.malformed}/${s.runs}`)
  }
  console.log(`\nWrote ${path}`)
}

main().catch(err => { console.error(err); process.exit(1) })
