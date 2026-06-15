const { test } = require('node:test')
const assert = require('node:assert')
const config = require('../config')
const { buildCatalog } = require('./catalog')
const { validateDefaultSelect } = require('./defaultSelect')

function stubItemsFromDefaults (defaultSelectByCategory) {
  const items = []
  for (const [category, fields] of Object.entries(defaultSelectByCategory)) {
    const row = { category, INDEX: `${category} stub`, simpleModel: '' }
    for (const field of fields) row[field] = '?'
    items.push(row)
  }
  return items
}

test('validateDefaultSelect passes when all defaults exist in catalog', () => {
  const defaultSelect = config.agent.defaultSelect
  const catalog = buildCatalog(stubItemsFromDefaults(defaultSelect), config.sheets.aliases, defaultSelect)
  const check = validateDefaultSelect(catalog, defaultSelect)
  assert.strictEqual(check.ok, true, JSON.stringify(check.missing))
})

test('validateDefaultSelect reports missing fields', () => {
  const catalog = buildCatalog(
    [{ category: 'Cases', Case: 'X', INDEX: 'x', simpleModel: '' }],
    {},
    {}
  )
  const check = validateDefaultSelect(catalog, { Cases: ['Case', 'Renamed Column'] })
  assert.strictEqual(check.ok, false)
  assert.deepStrictEqual(check.missing, [{ category: 'Cases', field: 'Renamed Column' }])

  const empty = validateDefaultSelect({}, { Cases: ['Case'] })
  assert.strictEqual(empty.ok, false)
})
