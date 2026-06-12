const { test } = require('node:test')
const assert = require('node:assert')
const QueryEngine = require('./index')

function makeEngine () {
  const engine = new QueryEngine()
  engine.searchEngine.load([
    { category: 'Cases', Seller: 'Velka', Case: '5', 'Volume (L)': '3.9', 'GPU Length (mm)': '?', INDEX: 'Velka 5' },
    { category: 'Cases', Seller: 'Fractal', Case: 'Terra', 'Volume (L)': '10.4', 'GPU Length (mm)': '322', INDEX: 'Fractal Terra' }
  ])
  engine.rebuildCatalog()
  return engine
}

test('engine.query delegates to executor with config aliases', () => {
  const engine = makeEngine()
  const res = engine.query({ category: 'Cases', where: [{ field: 'volume', op: 'lte', value: 5 }] })
  assert.strictEqual(res.count, 1)
  assert.strictEqual(res.results[0].Case, '5')
})

test('engine.getCatalog returns a per-category catalog', () => {
  const engine = makeEngine()
  const catalog = engine.getCatalog()
  assert.ok(Array.isArray(catalog.Cases))
})
