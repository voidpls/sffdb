const { test } = require('node:test')
const assert = require('node:assert')
const { buildTools } = require('./tools')

const engine = {
  search: () => [
    { category: 'Graphics Cards', INDEX: 'MSI RTX 3080 Ti Ventus 3X', simpleModel: '3080 Ti', Brand: 'MSI', 'Length (mm)': '323', 'Boost Clock (MHz)': '1665' }
  ],
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
  assert.strictEqual(out.budgetUsed, 1)
  assert.strictEqual(out.budgetRemaining, 9)
  assert.match(out.budgetHint, /9 tool calls remaining/)
})

test('tool budget rejects after maxToolCalls', async () => {
  const { createToolBudgetTracker, withToolBudget } = require('./tools')
  const budget = createToolBudgetTracker(10)
  for (let i = 0; i < 10; i++) {
    withToolBudget(budget, () => ({ ok: true }))
  }
  const blocked = withToolBudget(budget, () => ({ ok: true }))
  assert.strictEqual(blocked.hintCode, 'budget_exhausted')
  assert.strictEqual(blocked.budgetRemaining, 0)
})

test('tool budget soft warning at hardLimit minus 2', () => {
  const { createToolBudgetTracker, withToolBudget } = require('./tools')
  const budget = createToolBudgetTracker(10)
  for (let i = 0; i < 8; i++) withToolBudget(budget, () => ({}))
  const warn = withToolBudget(budget, () => ({ count: 1 }))
  assert.strictEqual(warn.budgetRemaining, 1)
  assert.match(warn.budgetHint, /STOP unless this call is essential/)
})
