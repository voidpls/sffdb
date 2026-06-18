const { test } = require('node:test')
const assert = require('node:assert')
const {
  summarizeSteps,
  extractToolCalls,
  summarizeReasoning,
  needsFormatPass,
  formatStepIndex,
  tokenUsage,
  accumulateStepTokens,
  sanitizeAnswer,
  resolveThinkingType
} = require('./index')
const config = require('../config')

test('resolveThinkingType maps config and overrides', () => {
  const prev = config.agent.thinking
  config.agent.thinking = true
  assert.strictEqual(resolveThinkingType(), 'enabled')
  assert.strictEqual(resolveThinkingType('adaptive'), 'adaptive')
  config.agent.thinking = false
  assert.strictEqual(resolveThinkingType(), 'disabled')
  config.agent.thinking = prev
})

test('summarizeSteps flattens tool calls across steps', () => {
  const steps = [
    { toolCalls: [{ toolName: 'search_components', input: { query: '3080 ti' } }] },
    { toolCalls: [{ toolName: 'query_components', input: { category: 'Cases', limit: 5 } }] },
    {},
    { toolCalls: [{ toolName: 'query_components', args: { category: 'Cases' } }] }
  ]
  assert.deepStrictEqual(summarizeSteps(steps), [
    'search_components({"query":"3080 ti"})',
    'query_components({"category":"Cases","limit":5})',
    'query_components({"category":"Cases"})'
  ])
  assert.deepStrictEqual(summarizeSteps(), [])
})

test('extractToolCalls returns structured calls preferring input over args', () => {
  const steps = [
    { toolCalls: [{ toolName: 'search_components', input: { query: '3080 ti' } }] },
    { toolCalls: [{ toolName: 'query_components', input: { category: 'Cases', limit: 5 } }] },
    {},
    { toolCalls: [{ toolName: 'query_components', args: { category: 'Cases' } }] }
  ]
  assert.deepStrictEqual(extractToolCalls(steps), [
    { toolName: 'search_components', input: { query: '3080 ti' } },
    { toolName: 'query_components', input: { category: 'Cases', limit: 5 } },
    { toolName: 'query_components', input: { category: 'Cases' } }
  ])
  assert.deepStrictEqual(extractToolCalls(), [])
})

test('summarizeReasoning reads reasoningText and reasoning parts', () => {
  const steps = [
    { reasoningText: 'first thought' },
    { reasoning: [{ text: 'second ' }, { text: 'thought' }] },
    {}
  ]
  assert.deepStrictEqual(summarizeReasoning(steps), ['first thought', 'second thought'])
  assert.deepStrictEqual(summarizeReasoning(), [])
})

test('needsFormatPass when research ended before prepareStep format slot', () => {
  assert.strictEqual(needsFormatPass({ steps: [{}] }), true)
  assert.strictEqual(needsFormatPass({
    text: 'Out of scope.',
    steps: [{ toolCalls: [] }]
  }), true)
  assert.strictEqual(needsFormatPass({
    text: 'draft',
    steps: [{ toolCalls: [{ toolName: 'query_components', input: {} }] }]
  }), true)
  const steps = Array.from({ length: config.agent.maxSteps + 1 }, () => ({}))
  assert.strictEqual(needsFormatPass({ steps }), false)
})

test('formatStepIndex detects prepareStep format step', () => {
  const steps = Array.from({ length: config.agent.maxSteps + 1 }, () => ({}))
  assert.strictEqual(formatStepIndex(steps), config.agent.maxSteps)
  assert.strictEqual(formatStepIndex([{}]), null)
})

test('tokenUsage reports uncached/cached input and output tokens', () => {
  assert.deepStrictEqual(tokenUsage({
    usage: {
      inputTokens: { noCache: 419, cacheRead: 10240 },
      outputTokens: { total: 892 }
    }
  }), { uncachedInput: 419, cachedInput: 10240, output: 892 })

  assert.deepStrictEqual(tokenUsage({
    providerMetadata: { deepseek: { promptCacheHitTokens: 100, promptCacheMissTokens: 5 } }
  }), { uncachedInput: 5, cachedInput: 100, output: 0 })

  assert.strictEqual(tokenUsage({}), null)
})

test('accumulateStepTokens splits research and format steps', () => {
  const steps = [
    { usage: { inputTokens: { noCache: 100, cacheRead: 200 }, outputTokens: { total: 10 } } },
    { usage: { inputTokens: { noCache: 50, cacheRead: 300 }, outputTokens: { total: 5 } } }
  ]
  const { researchTokens, formatTokens } = accumulateStepTokens(steps, 1)
  assert.deepStrictEqual(researchTokens, { uncachedInput: 100, cachedInput: 200, output: 10 })
  assert.deepStrictEqual(formatTokens, { uncachedInput: 50, cachedInput: 300, output: 5 })
})

test('sanitizeAnswer replaces emoji ticks and crosses', () => {
  assert.strictEqual(sanitizeAnswer('✅ fits'), '✓ fits')
  assert.strictEqual(sanitizeAnswer('❌ too wide'), '✗ too wide')
  assert.strictEqual(sanitizeAnswer('✔️ ok, ❎ no'), '✓ ok, ✗ no')
  assert.strictEqual(sanitizeAnswer('plain text'), 'plain text')
})
