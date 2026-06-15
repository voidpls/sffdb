const { test } = require('node:test')
const assert = require('node:assert')
const { buildCatalog } = require('./catalog')

const items = [
  { category: 'Cases', Case: 'A', 'Volume (L)': '3.9', PSU: 'Flex', 'BIOS Flashback': 'Y', INDEX: 'x', simpleModel: '' },
  { category: 'Cases', Case: 'B', 'Volume (L)': '10', PSU: 'SFX', 'BIOS Flashback': '-', INDEX: 'y', simpleModel: '' },
  { category: 'Cases', Case: 'C', 'Volume (L)': '?', PSU: 'ATX', 'BIOS Flashback': 'Y', INDEX: 'z', simpleModel: '' }
]
const aliases = { Cases: { volume: 'Volume (L)' } }

test('excludes internal fields and infers types', () => {
  const cat = buildCatalog(items, aliases)
  const headers = cat.Cases.map(f => f.header)
  assert.ok(!headers.includes('INDEX'))
  assert.ok(!headers.includes('simpleModel'))

  const volume = cat.Cases.find(f => f.header === 'Volume (L)')
  assert.strictEqual(volume.type, 'number')
  assert.strictEqual(volume.unit, 'L')
  assert.strictEqual(volume.alias, 'volume')

  const flashback = cat.Cases.find(f => f.header === 'BIOS Flashback')
  assert.strictEqual(flashback.type, 'bool')

  const psu = cat.Cases.find(f => f.header === 'PSU')
  assert.strictEqual(psu.type, 'enum')
  assert.deepStrictEqual(psu.values.sort(), ['ATX', 'Flex', 'SFX'])
})

test('does not treat letter-led text as numeric', () => {
  const gpus = [
    { category: 'Graphics Cards', Model: 'RTX 4090', INDEX: 'a', simpleModel: '' },
    { category: 'Graphics Cards', Model: 'RTX 4080 Super', INDEX: 'b', simpleModel: '' },
    { category: 'Graphics Cards', Model: 'RX 7900 XTX', INDEX: 'c', simpleModel: '' }
  ]
  const cat = buildCatalog(gpus)
  const model = cat['Graphics Cards'].find(f => f.header === 'Model')
  assert.notStrictEqual(model.type, 'number')
})

test('marks default fields when defaultSelect is provided', () => {
  const cat = buildCatalog(items, aliases, { Cases: ['Volume (L)', 'PSU'] })
  assert.strictEqual(cat.Cases.find(f => f.header === 'Volume (L)').default, true)
  assert.strictEqual(cat.Cases.find(f => f.header === 'PSU').default, true)
  assert.strictEqual(cat.Cases.find(f => f.header === 'Case').default, false)
})
