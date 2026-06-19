const { test } = require('node:test')
const assert = require('node:assert')
const { buildResearchPrompt, buildFormatNudge } = require('./prompt')

const catalog = {
  Cases: [
    { header: 'Volume (L)', alias: 'volume', unit: 'L', type: 'number', default: true },
    { header: 'PSU', alias: 'psu', unit: null, type: 'enum', values: ['SFX', 'ATX'], default: true },
    { header: 'Boost Clock (MHz)', alias: null, unit: 'MHz', type: 'number', default: false }
  ]
}
const margins = { gpuRiser: 15, gpu8pin: 30, gpu12vhpwr: 45, aioServiceMm: 8, coolerMarginMm: 4, slimFanMm: 15 }

test('research prompt has tools, catalog defaults, and fit recipe', () => {
  const prompt = buildResearchPrompt(catalog)
  assert.match(prompt, /search_components/)
  assert.match(prompt, /query_components/)
  assert.match(prompt, /\(\*\) = returned by tools by default/)
  assert.match(prompt, /"Volume \(L\)" \(number\) \[L\] \(\*\)/)
  assert.doesNotMatch(prompt, /\{SFX, ATX\}/)
  assert.match(prompt, /also queryable: "Boost Clock \(MHz\)"/)
  assert.doesNotMatch(prompt, /Answer style/i)
  assert.match(prompt, /never re-run with only sort changed to page/)
  assert.match(prompt, /100\+ variants/)
  assert.match(prompt, /Never query Model contains/)
  assert.match(prompt, /Query policy/)
  assert.doesNotMatch(prompt, /## GPU fit in case/)
  assert.match(prompt, /Never combined lte on generous cases/)
  assert.match(prompt, /Width \(mm\) gt case GPU width limit/)
  assert.match(prompt, /Thickness \(mm\) gt case GPU thickness limit/)
  assert.match(prompt, /Union of \(a\)\(b\)\(c\)/)
  assert.match(prompt, /Stop probing/)
  assert.match(prompt, /do not re-search the same case/)
  assert.match(prompt, /bare_chip_browse reject/)
  assert.match(prompt, /never chip-only again/)
  assert.doesNotMatch(prompt, /AIO: needs the radiator/)
})

test('format nudge requires generous fit to cite all three exception axes', () => {
  const nudge = buildFormatNudge(margins)
  assert.match(nudge, /length, width, AND thickness exception queries/)
})

test('format nudge has Discord rules and answer caveats', () => {
  const nudge = buildFormatNudge(margins)
  assert.match(nudge, /Answer caveats/)
  assert.match(nudge, /90° adapter/)
  assert.match(nudge, /Answer style/i)
  assert.match(nudge, /Do not call any tools/)
  assert.match(nudge, /first sentence is the verdict/)
  assert.match(nudge, /one sentence what you won't do/)
})
