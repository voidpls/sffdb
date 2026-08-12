const { test } = require('node:test')
const assert = require('node:assert')
const { normalize, rowAliases, verifyAnswer } = require('./bench-lib')

test('normalize lowercases and strips non-alphanumerics', () => {
  assert.strictEqual(normalize('RTX 4090'), 'rtx4090')
  assert.strictEqual(normalize('Noctua NH-L9a'), 'noctuanhl9a')
  assert.strictEqual(normalize(''), '')
})

test('rowAliases keeps long tokens, 4-digit chips, and brand concats', () => {
  const aliases = rowAliases({ Brand: 'ASUS', Model: '4090', Name: 'ROG Strix RTX 4090' })
  assert.ok(aliases.includes('4090'), 'chip allowlist')
  assert.ok(aliases.includes('asus4090'), 'brand+model concat')
  assert.ok(aliases.includes('rogstrixrtx4090'), 'name token')
  assert.ok(!aliases.includes('asus'), 'short token dropped')
})

test('verifyAnswer generous: all-fit claim with exceptions fails', () => {
  const engine = {
    query: () => ({ results: [{ Brand: 'ASUS', Model: '4090', Name: 'ASUS ROG Strix RTX 4090 OC' }], truncated: false })
  }
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Length (mm)', op: 'gt', value: '330' }
    ]
  }]
  const r = verifyAnswer({ kind: 'generous_gpu', chip: '4090' }, { answer: 'All 4090s fit', specs, engine })
  assert.strictEqual(r.ok, false)
  assert.ok(r.reasons.some(x => /all fit/.test(x)), `reasons: ${r.reasons}`)
})

test('verifyAnswer generous: exception language passes', () => {
  const engine = {
    query: () => ({ results: [{ Brand: 'ASUS', Model: '4090', Name: 'ASUS ROG Strix RTX 4090 OC' }], truncated: false })
  }
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Length (mm)', op: 'gt', value: '330' }
    ]
  }]
  const r = verifyAnswer({ kind: 'generous_gpu', chip: '4090' }, {
    answer: '4090 exceptions: the ASUS Strix is too long; everything else fits',
    specs,
    engine
  })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.reasons, [])
})

test('verifyAnswer generous: RTX prefix satisfies chip via normalize', () => {
  const engine = { query: () => ({ results: [], truncated: false }) }
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Length (mm)', op: 'gt', value: '330' }
    ]
  }]
  const r = verifyAnswer({ kind: 'generous_gpu', chip: '4090' }, {
    answer: 'The RTX 4090 has no exceptions in this case',
    specs,
    engine
  })
  assert.strictEqual(r.ok, true)
})

test('verifyAnswer generous: except-language answer passes (no false all-fit)', () => {
  const engine = {
    query: () => ({ results: [{ Brand: 'ASUS', Model: '4090', Name: 'ASUS ROG Strix RTX 4090 OC' }], truncated: false })
  }
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Length (mm)', op: 'gt', value: '330' }
    ]
  }]
  const r = verifyAnswer({ kind: 'generous_gpu', chip: '4090' }, {
    answer: 'All other 4090s fit except the ASUS Strix',
    specs,
    engine
  })
  assert.strictEqual(r.ok, true)
})

test('verifyAnswer tight: fitting card mentioned, none-language on empty', () => {
  const row = { Brand: 'Gigabyte', Model: '5080', Name: 'Gigabyte RTX 5080 Windforce' }
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '5080' },
      { field: 'Length (mm)', op: 'lte', value: '300' },
      { field: 'Width (mm)', op: 'lte', value: '140' },
      { field: 'Thickness (mm)', op: 'lte', value: '45' }
    ]
  }]
  const withRows = verifyAnswer({ kind: 'tight_gpu', chip: '5080' }, {
    answer: 'The Gigabyte RTX 5080 Windforce fits',
    specs,
    engine: { query: () => ({ results: [row], truncated: false }) }
  })
  assert.strictEqual(withRows.ok, true)

  const noRows = verifyAnswer({ kind: 'tight_gpu', chip: '5080' }, {
    answer: 'No 5080 cards fit in this case',
    specs,
    engine: { query: () => ({ results: [], truncated: false }) }
  })
  assert.strictEqual(noRows.ok, true)

  const noRowsChipBetween = verifyAnswer({ kind: 'tight_gpu', chip: '5080' }, {
    answer: 'No RTX 5080 cards fit in the Ghost S1',
    specs,
    engine: { query: () => ({ results: [], truncated: false }) }
  })
  assert.strictEqual(noRowsChipBetween.ok, true)

  const claimWithNoRows = verifyAnswer({ kind: 'tight_gpu', chip: '5080' }, {
    answer: 'The Gigabyte fits',
    specs,
    engine: { query: () => ({ results: [], truncated: false }) }
  })
  assert.strictEqual(claimWithNoRows.ok, false)
})

test('verifyAnswer tight: card named without chip token passes', () => {
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '5080' },
      { field: 'Length (mm)', op: 'lte', value: '305' },
      { field: 'Width (mm)', op: 'lte', value: '144' },
      { field: 'Thickness (mm)', op: 'lte', value: '45' }
    ]
  }]
  const engine = {
    query: () => ({ results: [{ Brand: 'Gigabyte', Model: '5080', Name: 'Gigabyte Windforce' }], truncated: false })
  }
  const aliasOnly = verifyAnswer({ kind: 'tight_gpu', chip: '5080' }, {
    answer: 'The Gigabyte Windforce fits',
    specs,
    engine
  })
  assert.strictEqual(aliasOnly.ok, true)
  const chipOnly = verifyAnswer({ kind: 'tight_gpu', chip: '5080' }, {
    answer: 'The 5080 fits',
    specs,
    engine
  })
  assert.strictEqual(chipOnly.ok, true)
})

test('verifyAnswer fit_list: chip or component alias', () => {
  const engine = {
    query: () => ({ results: [{ Brand: 'MSI', Model: '1080 Ti', Name: 'MSI Gaming X' }], truncated: false })
  }
  const specs = [{ category: 'Graphics Cards', where: [{ field: 'Length (mm)', op: 'lte', value: '270' }] }]
  const aliasOnly = verifyAnswer({ kind: 'fit_list', chip: '1080', category: 'Graphics Cards' }, {
    answer: 'The MSI Gaming X is under 270mm',
    specs,
    engine
  })
  assert.strictEqual(aliasOnly.ok, true)
})

test('verifyAnswer cooler: union alias mentioned', () => {
  const specs = [{
    category: 'Coolers (Air)',
    where: [
      { field: 'Height (mm)', op: 'lte', value: '70' },
      { field: 'RAM Clearance (mm)', op: 'gte', value: '35' }
    ]
  }]
  const ok = verifyAnswer({ kind: 'cooler_ram' }, {
    answer: 'The Noctua NH-L9a fits',
    specs,
    engine: { query: () => ({ results: [{ Brand: 'Noctua', Cooler: 'NH-L9a' }], truncated: false }) }
  })
  assert.strictEqual(ok.ok, true)

  const noCoolerMention = verifyAnswer({ kind: 'cooler_ram' }, {
    answer: 'Everything fits',
    specs,
    engine: { query: () => ({ results: [{ Brand: 'Noctua', Cooler: 'NH-L9a' }], truncated: false }) }
  })
  assert.strictEqual(noCoolerMention.ok, false)
})

test('verifyAnswer decline: matches anyOf, rejects ranking answer', () => {
  const def = { kind: 'decline', anyOf: ['benchmark', 'rank', 'performance'] }
  const declined = verifyAnswer(def, {
    answer: "I don't rank GPUs, but I can check fit for a named model",
    specs: [],
    engine: null
  })
  assert.strictEqual(declined.ok, true)
  const ranked = verifyAnswer(def, {
    answer: 'The best 4090 is the ASUS Astral',
    specs: [],
    engine: null
  })
  assert.strictEqual(ranked.ok, false)
  const frank = verifyAnswer(def, {
    answer: 'Frankly, the 4090 is the best card out there',
    specs: [],
    engine: null
  })
  assert.strictEqual(frank.ok, false, "'Frankly' must not satisfy 'rank'")
})

test('verifyAnswer fit_list: none-language covers "no cases fit"', () => {
  const ok = verifyAnswer({ kind: 'fit_list', category: 'Cases' }, {
    answer: 'No cases fit under 10L',
    specs: [{ category: 'Cases', where: [{ field: 'Volume (L)', op: 'lte', value: '10' }] }],
    engine: { query: () => ({ results: [], truncated: false }) }
  })
  assert.strictEqual(ok.ok, true)
})

test('verifyAnswer generous: "exceptional" is not exception language', () => {
  const engine = {
    query: () => ({ results: [{ Brand: 'ASUS', Model: '4090', Name: 'ASUS ROG Strix RTX 4090 OC' }], truncated: false })
  }
  const specs = [{
    category: 'Graphics Cards',
    where: [
      { field: 'Model', op: 'contains', value: '4090' },
      { field: 'Length (mm)', op: 'gt', value: '330' }
    ]
  }]
  const r = verifyAnswer({ kind: 'generous_gpu', chip: '4090' }, {
    answer: 'All 4090s fit and have exceptional build quality',
    specs,
    engine
  })
  assert.strictEqual(r.ok, false, "'exceptional' must not satisfy exception language")
})

test('verifyAnswer fit_list: result alias mentioned', () => {
  const ok = verifyAnswer({ kind: 'fit_list', category: 'Cases' }, {
    answer: 'The Velka 5 is the smallest',
    specs: [{ category: 'Cases', where: [{ field: 'Volume (L)', op: 'lte', value: '10' }] }],
    engine: { query: () => ({ results: [{ Seller: 'Velka', Case: '5' }], truncated: false }) }
  })
  assert.strictEqual(ok.ok, true)
})

test('verifyAnswer structural_only passes; empty answer fails', () => {
  assert.strictEqual(verifyAnswer({ kind: 'structural_only' }, { answer: 'anything', specs: [], engine: null }).ok, true)
  assert.strictEqual(verifyAnswer({ kind: 'structural_only' }, { answer: '', specs: [], engine: null }).ok, false)
})
