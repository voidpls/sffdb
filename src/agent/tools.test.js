const { test } = require('node:test')
const assert = require('node:assert')
const { buildTools } = require('./tools')

// Minimal engine stub matching the methods tools use
const engine = {
  search: (query, { limit } = {}) => [
    { category: 'Graphics Cards', INDEX: 'MSI RTX 3080 Ti Ventus 3X', simpleModel: '3080 Ti', Brand: 'MSI', 'Length (mm)': '323' }
  ].slice(0, limit || 8),
  query: (spec) => ({ count: 1, returned: 1, results: [{ Case: 'Terra' }], echo: spec })
}

test('exposes both tools', () => {
  const tools = buildTools(engine)
  assert.ok(tools.search_components)
  assert.ok(tools.query_components)
})

test('search_components returns compact results with internal fields stripped', async () => {
  const tools = buildTools(engine)
  const out = await tools.search_components.execute({ query: '3080 ti' })
  assert.strictEqual(out.count, 1)
  assert.strictEqual(out.results[0].category, 'Graphics Cards')
  assert.strictEqual(out.results[0]['Length (mm)'], '323')
  assert.strictEqual(out.results[0].INDEX, undefined)
  assert.strictEqual(out.results[0].simpleModel, undefined)
})

test('query_components delegates to engine.query', async () => {
  const tools = buildTools(engine)
  const out = await tools.query_components.execute({ category: 'Cases', where: [{ field: 'volume', op: 'lte', value: 12 }] })
  assert.strictEqual(out.count, 1)
  assert.strictEqual(out.results[0].Case, 'Terra')
})
