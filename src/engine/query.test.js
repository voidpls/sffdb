const { test } = require('node:test')
const assert = require('node:assert')
const { queryComponents } = require('./query')

const items = [
  { category: 'Cases', Seller: 'Velka', Case: '5', 'Volume (L)': '3.9', 'GPU Length (mm)': '?', 'CPU Cooler Height (mm)': '48', PSU: 'Flex', INDEX: 'Velka 5' },
  { category: 'Cases', Seller: 'Cooler Master', Case: 'NR200', 'Volume (L)': '18.25', 'GPU Length (mm)': '330', 'CPU Cooler Height (mm)': '155', PSU: 'SFX / SFX-L', INDEX: 'Cooler Master NR200' },
  { category: 'Cases', Seller: 'Fractal', Case: 'Terra', 'Volume (L)': '10.4', 'GPU Length (mm)': '322', 'CPU Cooler Height (mm)': '77', PSU: 'SFX / SFX-L', INDEX: 'Fractal Terra' },
  { category: 'Graphics Cards', Brand: 'MSI', Model: 'RTX 3080 Ti', Name: 'Ventus 3X', 'Length (mm)': '323', INDEX: 'MSI RTX 3080 Ti Ventus 3X' }
]
const aliases = {
  Cases: { volume: 'Volume (L)', gpu_length: 'GPU Length (mm)', cooler_height: 'CPU Cooler Height (mm)', psu: 'PSU' }
}
const opts = { aliases, maxResults: 10 }

test('filters by numeric gte using alias and excludes unknown sentinels', () => {
  const res = queryComponents(items, { category: 'Cases', where: [{ field: 'gpu_length', op: 'gte', value: 323 }] }, opts)
  assert.strictEqual(res.count, 1)
  assert.strictEqual(res.results[0].Case, 'NR200')
})

test('combines conditions with implicit AND and sorts ascending', () => {
  const res = queryComponents(items, {
    category: 'Cases',
    where: [{ field: 'gpu_length', op: 'gte', value: 320 }, { field: 'volume', op: 'lte', value: 12 }],
    sort: { field: 'volume', dir: 'asc' }
  }, opts)
  assert.strictEqual(res.count, 1)
  assert.strictEqual(res.results[0].Case, 'Terra')
})

test('contains op is case-insensitive', () => {
  const res = queryComponents(items, { category: 'Cases', where: [{ field: 'psu', op: 'contains', value: 'sfx' }] }, opts)
  assert.strictEqual(res.count, 2)
})

test('limit is clamped to maxResults and flags truncation', () => {
  const res = queryComponents(items, { category: 'Cases', limit: 99 }, { aliases, maxResults: 2 })
  assert.strictEqual(res.results.length, 2)
  assert.strictEqual(res.count, 3)
  assert.strictEqual(res.truncated, true)
})

test('truncated is false when all rows are returned', () => {
  const res = queryComponents(items, { category: 'Cases' }, { aliases, maxResults: 50 })
  assert.strictEqual(res.truncated, false)
})

test('unknown field returns an error with validFields', () => {
  const res = queryComponents(items, { category: 'Cases', where: [{ field: 'nope', op: 'eq', value: 1 }] }, opts)
  assert.ok(res.error)
  assert.ok(Array.isArray(res.validFields))
})

test('select projects only requested fields (resolving aliases)', () => {
  const res = queryComponents(items, { category: 'Cases', select: ['volume', 'Case'] }, opts)
  assert.deepStrictEqual(Object.keys(res.results[0]).sort(), ['Case', 'Volume (L)'])
})

test('unknown category returns an error', () => {
  const res = queryComponents(items, { category: 'Nope' }, opts)
  assert.ok(res.error)
})
