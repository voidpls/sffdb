const { test } = require('node:test')
const assert = require('node:assert')
const { buildCatalog } = require('./catalog')

const items = [
  { category: 'Cases', Case: 'A', 'Volume (L)': '3.9', PSU: 'Flex', 'BIOS Flashback': 'Y', INDEX: 'x', simpleModel: '' },
  { category: 'Cases', Case: 'B', 'Volume (L)': '10', PSU: 'SFX', 'BIOS Flashback': '-', INDEX: 'y', simpleModel: '' },
  { category: 'Cases', Case: 'C', 'Volume (L)': '?', PSU: 'ATX', 'BIOS Flashback': 'Y', INDEX: 'z', simpleModel: '' }
]
const aliases = { Cases: { volume: 'Volume (L)' } }

test('builds a per-category field list', () => {
  const cat = buildCatalog(items, aliases)
  assert.ok(Array.isArray(cat.Cases))
})

test('excludes internal fields', () => {
  const cat = buildCatalog(items, aliases)
  const headers = cat.Cases.map(f => f.header)
  assert.ok(!headers.includes('INDEX'))
  assert.ok(!headers.includes('simpleModel'))
  assert.ok(!headers.includes('category'))
})

test('infers number type and parses unit', () => {
  const cat = buildCatalog(items, aliases)
  const volume = cat.Cases.find(f => f.header === 'Volume (L)')
  assert.strictEqual(volume.type, 'number')
  assert.strictEqual(volume.unit, 'L')
  assert.strictEqual(volume.alias, 'volume')
})

test('infers bool type for Y/- columns', () => {
  const cat = buildCatalog(items, aliases)
  const flashback = cat.Cases.find(f => f.header === 'BIOS Flashback')
  assert.strictEqual(flashback.type, 'bool')
})

test('infers enum type with capped values', () => {
  const cat = buildCatalog(items, aliases)
  const psu = cat.Cases.find(f => f.header === 'PSU')
  assert.strictEqual(psu.type, 'enum')
  assert.deepStrictEqual(psu.values.sort(), ['ATX', 'Flex', 'SFX'])
})
