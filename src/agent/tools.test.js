const { test } = require('node:test')
const assert = require('node:assert')
const { buildTools } = require('./tools')

const engine = {
  search: (query, { limit } = {}) => [
    { category: 'Graphics Cards', INDEX: 'MSI RTX 3080 Ti Ventus 3X', simpleModel: '3080 Ti', Brand: 'MSI', 'Length (mm)': '323', 'Boost Clock (MHz)': '1665' }
  ].slice(0, limit || 8),
  query: (spec) => ({ count: 1, returned: 1, results: [{ Case: 'Terra' }], echo: spec })
}

test('search_components returns slim fit-relevant fields', async () => {
  const tools = buildTools(engine)
  const out = await tools.search_components.execute({ query: '3080 ti' })
  assert.strictEqual(out.count, 1)
  assert.strictEqual(out.results[0].category, 'Graphics Cards')
  assert.strictEqual(out.results[0]['Length (mm)'], '323')
  assert.strictEqual(out.results[0].INDEX, undefined)
  assert.strictEqual(out.results[0]['Boost Clock (MHz)'], undefined)
})
