const { test } = require('node:test')
const assert = require('node:assert')
const config = require('../config')
const QueryEngine = require('./index')

function withDefaults (category, row) {
  for (const field of config.agent.defaultSelect[category] || []) {
    if (!(field in row)) row[field] = '?'
  }
  return row
}

function makeEngine () {
  const engine = new QueryEngine()
  const items = [
    withDefaults('Cases', { category: 'Cases', Seller: 'Velka', Case: '5', 'Volume (L)': '3.9', 'GPU Length (mm)': '?', INDEX: 'Velka 5' }),
    withDefaults('Cases', { category: 'Cases', Seller: 'Fractal', Case: 'Terra', 'Volume (L)': '10.4', 'GPU Length (mm)': '322', INDEX: 'Fractal Terra' }),
    ...Object.keys(config.agent.defaultSelect)
      .filter(c => c !== 'Cases')
      .map(c => withDefaults(c, { category: c, INDEX: `${c} stub`, simpleModel: '' }))
  ]
  engine.searchEngine.load(items)
  engine.rebuildCatalog()
  return engine
}

test('engine.query delegates to executor with config aliases', () => {
  const engine = makeEngine()
  const res = engine.query({ category: 'Cases', where: [{ field: 'volume', op: 'lte', value: 5 }] })
  assert.strictEqual(res.count, 1)
  assert.strictEqual(res.results[0].Case, '5')
  assert.ok(Array.isArray(engine.getCatalog().Cases))
})
