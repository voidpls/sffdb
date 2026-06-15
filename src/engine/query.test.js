const { test } = require('node:test')
const assert = require('node:assert')
const config = require('../config')
const { queryComponents, analyzeGenerousGpuFit } = require('./query')

const items = [
  { category: 'Cases', Seller: 'Velka', Case: '5', 'Volume (L)': '3.9', 'GPU Length (mm)': '?', 'CPU Cooler Height (mm)': '48', PSU: 'Flex', INDEX: 'Velka 5' },
  { category: 'Cases', Seller: 'Cooler Master', Case: 'NR200', 'Volume (L)': '18.25', 'GPU Length (mm)': '330', 'CPU Cooler Height (mm)': '155', PSU: 'SFX / SFX-L', INDEX: 'Cooler Master NR200' },
  { category: 'Cases', Seller: 'Fractal', Case: 'Terra', 'Volume (L)': '10.4', 'GPU Length (mm)': '322', 'CPU Cooler Height (mm)': '77', PSU: 'SFX / SFX-L', INDEX: 'Fractal Terra' },
  { category: 'Graphics Cards', Brand: 'MSI', Model: 'RTX 3080 Ti', Name: 'Ventus 3X', 'Length (mm)': '323', 'Boost Clock (MHz)': '1665', 'TDP (W)': '350', INDEX: 'MSI RTX 3080 Ti Ventus 3X' }
]
const aliases = {
  Cases: { volume: 'Volume (L)', gpu_length: 'GPU Length (mm)', cooler_height: 'CPU Cooler Height (mm)', psu: 'PSU' }
}
const opts = { aliases, maxResults: 10, defaultSelect: config.agent.defaultSelect }

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

test('limit is clamped to maxResults, flags truncation, and adds hint', () => {
  const truncated = queryComponents(items, { category: 'Cases', limit: 99 }, { aliases, maxResults: 2 })
  assert.strictEqual(truncated.results.length, 2)
  assert.strictEqual(truncated.count, 3)
  assert.strictEqual(truncated.truncated, true)
  assert.match(truncated.hint, /never browse or paginate/i)
  assert.match(truncated.hint, /3 matches/)

  const complete = queryComponents(items, { category: 'Cases' }, { aliases, maxResults: 50 })
  assert.strictEqual(complete.truncated, false)
  assert.strictEqual(complete.hint, undefined)
})

test('default select omits non-default fields', () => {
  const res = queryComponents(items, { category: 'Graphics Cards' }, opts)
  assert.ok(res.results[0]['Length (mm)'])
  assert.strictEqual(res.results[0]['Boost Clock (MHz)'], undefined)
})

test('unknown field returns an error with validFields', () => {
  const res = queryComponents(items, { category: 'Cases', where: [{ field: 'nope', op: 'eq', value: 1 }] }, opts)
  assert.ok(res.error)
  assert.ok(Array.isArray(res.validFields))
})

test('rejects bare chip-family browse on Graphics Cards when enabled', () => {
  const gpuItems = [
    ...items,
    { category: 'Graphics Cards', Brand: 'Nvidia', Model: 'RTX 5080', Name: 'FE', 'Length (mm)': '304', 'Width (mm)': '137', 'Thickness (mm)': '40', INDEX: '5080 FE' },
    { category: 'Graphics Cards', Brand: 'MSI', Model: 'RTX 5080', Name: 'Ventus', 'Length (mm)': '330', 'Width (mm)': '140', 'Thickness (mm)': '50', INDEX: '5080 Ventus' }
  ]
  const rejectOpts = { ...opts, rejectBareChipBrowse: true }
  const bare = queryComponents(gpuItems, {
    category: 'Graphics Cards',
    where: [{ field: 'Model', op: 'contains', value: '5080' }]
  }, rejectOpts)
  assert.strictEqual(bare.rejected, 'bare_chip_browse')
  assert.ok(bare.error)

  const fit = queryComponents(gpuItems, {
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '5080' },
      { field: 'Length (mm)', op: 'lte', value: 305 }
    ]
  }, rejectOpts)
  assert.strictEqual(fit.count, 1)
  assert.strictEqual(fit.rejected, undefined)

  const named = queryComponents(gpuItems, {
    category: 'Graphics Cards',
    where: [{ field: 'Name', op: 'contains', value: 'FE' }]
  }, rejectOpts)
  assert.strictEqual(named.count, 1)

  const cases = queryComponents(items, { category: 'Cases', where: [{ field: 'psu', op: 'contains', value: 'sfx' }] }, rejectOpts)
  assert.strictEqual(cases.count, 2)
})

test('bare chip browse allowed when reject is disabled', () => {
  const gpuItems = [
    { category: 'Graphics Cards', Brand: 'Nvidia', Model: 'RTX 5080', Name: 'FE', 'Length (mm)': '304', INDEX: '5080 FE' },
    { category: 'Graphics Cards', Brand: 'MSI', Model: 'RTX 5080', Name: 'Ventus', 'Length (mm)': '330', INDEX: '5080 Ventus' }
  ]
  const res = queryComponents(gpuItems, {
    category: 'Graphics Cards',
    where: [{ field: 'Model', op: 'contains', value: '5080' }]
  }, { ...opts, rejectBareChipBrowse: false })
  assert.strictEqual(res.count, 2)
  assert.strictEqual(res.rejected, undefined)
})

test('truncation hint mentions generous width and thickness exception queries', () => {
  const res = queryComponents(items, { category: 'Cases', limit: 99 }, { aliases, maxResults: 2 })
  assert.match(res.hint, /three gt exception queries \(length, width, thickness\)/)
})

test('generous GPU fit width exception query finds too-wide cards', () => {
  const gpus = [
    { category: 'Graphics Cards', Brand: 'ZOTAC', Model: 'RTX 4090', Name: 'Wide OC', 'Length (mm)': '350', 'Width (mm)': '178', 'Thickness (mm)': '70', INDEX: '4090 wide' },
    { category: 'Graphics Cards', Brand: 'Nvidia', Model: 'RTX 4090', Name: 'FE', 'Length (mm)': '350', 'Width (mm)': '150', 'Thickness (mm)': '70', INDEX: '4090 fe' }
  ]
  const lengthExc = queryComponents(gpus, {
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Length (mm)', op: 'gt', value: 360 }
    ]
  }, opts)
  assert.strictEqual(lengthExc.count, 0)

  const widthExc = queryComponents(gpus, {
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Width (mm)', op: 'gt', value: 175 }
    ]
  }, opts)
  assert.strictEqual(widthExc.count, 1)
  assert.strictEqual(widthExc.results[0].Name, 'Wide OC')
})

test('analyzeGenerousGpuFit detects complete three-axis exception passes', () => {
  const complete = analyzeGenerousGpuFit([
    {
      category: 'Graphics Cards',
      where: [
        { field: 'Model', op: 'contains', value: '4090' },
        { field: 'Length (mm)', op: 'gt', value: 360 }
      ]
    },
    {
      category: 'Graphics Cards',
      where: [
        { field: 'Model', op: 'contains', value: '4090' },
        { field: 'Width (mm)', op: 'gt', value: 175 }
      ]
    },
    {
      category: 'Graphics Cards',
      where: [
        { field: 'Model', op: 'contains', value: '4090' },
        { field: 'Thickness (mm)', op: 'gt', value: 80 }
      ]
    }
  ])
  assert.strictEqual(complete.complete, true)

  const incomplete = analyzeGenerousGpuFit([
    {
      category: 'Graphics Cards',
      where: [
        { field: 'Model', op: 'contains', value: '4090' },
        { field: 'Length (mm)', op: 'gt', value: 360 }
      ]
    }
  ])
  assert.strictEqual(incomplete.complete, false)
  assert.strictEqual(incomplete.lengthGt, true)
  assert.strictEqual(incomplete.widthGt, false)
})

test('select projects only requested fields (resolving aliases)', () => {
  const res = queryComponents(items, { category: 'Cases', select: ['volume', 'Case'] }, opts)
  assert.deepStrictEqual(Object.keys(res.results[0]).sort(), ['Case', 'Volume (L)'])
})
