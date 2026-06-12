const { test } = require('node:test')
const assert = require('node:assert')
const { buildSystemPrompt } = require('./prompt')

const catalog = {
  Cases: [
    { header: 'Volume (L)', alias: 'volume', unit: 'L', type: 'number' },
    { header: 'PSU', alias: 'psu', unit: null, type: 'enum', values: ['SFX', 'ATX'] }
  ]
}
const margins = { gpuRiser: 15, gpu8pin: 30, gpu12vhpwr: 45, aioServiceMm: 8, coolerMarginMm: 4, slimFanMm: 15 }

test('includes category fields, aliases and units', () => {
  const prompt = buildSystemPrompt(catalog, margins)
  assert.match(prompt, /Cases/)
  assert.match(prompt, /Volume \(L\)/)
  assert.match(prompt, /volume/)
})

test('includes the margin numbers', () => {
  const prompt = buildSystemPrompt(catalog, margins)
  assert.match(prompt, /15mm/)
  assert.match(prompt, /45mm/)
})

test('states scope and the disclaimer', () => {
  const prompt = buildSystemPrompt(catalog, margins)
  assert.match(prompt, /verify/i)
  assert.match(prompt, /search_components/)
  assert.match(prompt, /query_components/)
})
