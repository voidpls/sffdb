const { test } = require('node:test')
const assert = require('node:assert')
const { summarizeSteps, summarizeReasoning } = require('./index')

test('summarizeSteps flattens tool calls across steps', () => {
  const steps = [
    { toolCalls: [{ toolName: 'search_components', input: { query: '3080 ti' } }] },
    { toolCalls: [{ toolName: 'query_components', input: { category: 'Cases', limit: 5 } }] }
  ]
  const summary = summarizeSteps(steps)
  assert.deepStrictEqual(summary, [
    'search_components({"query":"3080 ti"})',
    'query_components({"category":"Cases","limit":5})'
  ])
})

test('summarizeSteps tolerates steps without tool calls', () => {
  assert.deepStrictEqual(summarizeSteps([{}, { toolCalls: [] }]), [])
  assert.deepStrictEqual(summarizeSteps(), [])
})

test('summarizeSteps falls back to args when input is absent', () => {
  const summary = summarizeSteps([{ toolCalls: [{ toolName: 'query_components', args: { category: 'Cases' } }] }])
  assert.deepStrictEqual(summary, ['query_components({"category":"Cases"})'])
})

test('summarizeReasoning reads reasoningText and reasoning parts', () => {
  const steps = [
    { reasoningText: 'first thought' },
    { reasoning: [{ text: 'second ' }, { text: 'thought' }] },
    {}
  ]
  assert.deepStrictEqual(summarizeReasoning(steps), ['first thought', 'second thought'])
})

test('summarizeReasoning tolerates empty input', () => {
  assert.deepStrictEqual(summarizeReasoning(), [])
})
