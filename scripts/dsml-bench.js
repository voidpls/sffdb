#!/usr/bin/env node
'use strict'

require('dotenv').config()

const { spawn } = require('node:child_process')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { parseSpecs } = require('./bench-lib')

const QUESTION = '5080s that fit in ghost s1'

function workerScript () {
  const root = process.cwd()
  return `
require('dotenv').config({ path: ${JSON.stringify(join(root, '.env'))} })
const QueryEngine = require(${JSON.stringify(join(root, 'src/engine/index'))})
const { createAgent, summarizeSteps } = require(${JSON.stringify(join(root, 'src/agent/index'))})
const { parseSpecs } = require(${JSON.stringify(join(root, 'scripts/bench-lib.js'))})

function metrics(tools, steps) {
  const dsml = tools.filter(t => /DSML|parameter:/.test(t))
  const specs = parseSpecs(tools)
  return {
    stepCount: steps.length,
    toolCount: tools.length,
    queryCount: specs.length,
    dsmlCount: dsml.length,
    malformed: dsml.length > 0,
    bareChip: specs.some(s => s.category === 'Graphics Cards' && s.where?.some(w => /Model|Name/i.test(w.field) && /5080|\\\\d{4}/.test(String(w.value)) && !s.where.some(x => /Length|Width|Thickness/i.test(x.field)))),
    combinedLte: specs.some(s => {
      if (s.category !== 'Graphics Cards' || !s.where) return false
      const w = s.where
      return w.some(x => /Model/i.test(x.field) && /5080/.test(String(x.value))) &&
        w.some(x => /Length/i.test(x.field) && x.op === 'lte') &&
        w.some(x => /Width/i.test(x.field) && x.op === 'lte') &&
        w.some(x => /Thickness/i.test(x.field) && x.op === 'lte')
    })
  }
}

;(async () => {
  const arm = process.env.BENCH_ARM
  const run = Number(process.env.BENCH_RUN)
  const engine = new QueryEngine()
  await engine.init()
  const { answer, steps, totalMs, researchMs } = await createAgent(engine)(process.env.BENCH_QUESTION)
  const tools = summarizeSteps(steps)
  console.log(JSON.stringify({
    arm, run, question: process.env.BENCH_QUESTION, totalMs, researchMs,
    answerLen: (answer || '').length, tools, ...metrics(tools, steps)
  }))
})().catch(err => { console.error(err.stack || err.message); process.exit(1) })
`
}

function runOne (arm, run) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', workerScript()], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENT_BENCH: '1',
        BENCH_ARM: arm,
        BENCH_RUN: String(run),
        BENCH_QUESTION: QUESTION
      },
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

function summarize (arm, rows) {
  const n = rows.length
  const avg = k => Math.round(rows.reduce((s, r) => s + r[k], 0) / n)
  return {
    arm,
    runs: n,
    dsml: rows.filter(r => r.malformed).length,
    avgDsmlCount: Number((rows.reduce((s, r) => s + r.dsmlCount, 0) / n).toFixed(1)),
    combinedLte: rows.filter(r => r.combinedLte).length,
    avgMs: avg('totalMs'),
    avgSteps: Number((rows.reduce((s, r) => s + r.stepCount, 0) / n).toFixed(1)),
    avgQueries: Number((rows.reduce((s, r) => s + r.queryCount, 0) / n).toFixed(1))
  }
}

async function runArm (arm, env, runs) {
  const prev = {}
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k]
    process.env[k] = v
  }
  const results = []
  let done = 0
  await Promise.all(Array.from({ length: runs }, (_, i) => i + 1).map(run =>
    runOne(arm, run).then(r => {
      done++
      process.stderr.write(`[dsml-bench] ${arm} ${done}/${runs} run ${run} dsml=${r.dsmlCount} ${r.totalMs}ms\n`)
      results.push(r)
      return r
    })
  ))
  for (const [k, v] of Object.entries(env)) {
    if (prev[k] === undefined) delete process.env[k]
    else process.env[k] = prev[k]
  }
  return results.sort((a, b) => a.run - b.run)
}

async function main () {
  const runs = Number(process.argv.find((a, i) => process.argv[i - 1] === '--runs') || 10)
  const arm = process.argv.find((a, i) => process.argv[i - 1] === '--arm')
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY required')
    process.exit(1)
  }

  const arms = arm
    ? [{ name: arm, env: envForArm(arm) }]
    : [
        { name: 'baseline', env: {} },
        { name: 'prompt', env: { AGENT_DSML_PROMPT: '1' } },
        { name: 'sanitize', env: { AGENT_DSML_SANITIZE: '1' } },
        { name: 'both', env: { AGENT_DSML_PROMPT: '1', AGENT_DSML_SANITIZE: '1' } }
      ]

  const all = {}
  for (const { name, env } of arms) {
    all[name] = await runArm(name, env, runs)
  }

  const summary = Object.entries(all).map(([name, rows]) => summarize(name, rows))
  const outDir = join(process.cwd(), 'scripts/bench-results')
  mkdirSync(outDir, { recursive: true })
  const path = join(outDir, `dsml-bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(path, JSON.stringify({ question: QUESTION, runs, summary, results: all }, null, 2))

  console.log(`\n=== DSML bench: "${QUESTION}" × ${runs} ===`)
  for (const s of summary) {
    console.log(`${s.arm}: dsml ${s.dsml}/${s.runs} (avg ${s.avgDsmlCount}/run) | combinedLte ${s.combinedLte}/${s.runs} | ${s.avgMs}ms | ${s.avgSteps} steps | ${s.avgQueries} queries`)
  }
  console.log(`\nWrote ${path}`)
}

function envForArm (arm) {
  if (arm === 'baseline') return {}
  if (arm === 'prompt') return { AGENT_DSML_PROMPT: '1' }
  if (arm === 'sanitize') return { AGENT_DSML_SANITIZE: '1' }
  if (arm === 'both') return { AGENT_DSML_PROMPT: '1', AGENT_DSML_SANITIZE: '1' }
  throw new Error(`unknown arm: ${arm}`)
}

main().catch(err => { console.error(err); process.exit(1) })
