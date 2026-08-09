const { test } = require('node:test')
const assert = require('node:assert')
const { resolveProvider, modelIdFor, apiKeyEnv, PROVIDERS, createModel } = require('./model')
const config = require('../config')

// Assigning `undefined` to process.env stores the string 'undefined' — delete instead.
function restoreEnv (name, prev) {
  if (prev === undefined) delete process.env[name]
  else process.env[name] = prev
}

test('resolveProvider defaults to config provider and honors AGENT_PROVIDER', () => {
  const prev = process.env.AGENT_PROVIDER
  delete process.env.AGENT_PROVIDER
  assert.strictEqual(resolveProvider(), config.agent.provider)
  process.env.AGENT_PROVIDER = 'xai'
  assert.strictEqual(resolveProvider(), 'xai')
  restoreEnv('AGENT_PROVIDER', prev)
})

test('modelIdFor picks per-provider defaults and honors AGENT_MODEL', () => {
  const prev = process.env.AGENT_MODEL
  delete process.env.AGENT_MODEL
  assert.strictEqual(modelIdFor('deepseek'), 'deepseek-v4-flash')
  assert.strictEqual(modelIdFor('xai'), 'grok-4.5')
  process.env.AGENT_MODEL = 'grok-4.5-fast'
  assert.strictEqual(modelIdFor('xai'), 'grok-4.5-fast')
  restoreEnv('AGENT_MODEL', prev)
})

test('apiKeyEnv maps to the resolved provider key', () => {
  const prev = process.env.AGENT_PROVIDER
  process.env.AGENT_PROVIDER = 'deepseek'
  assert.strictEqual(apiKeyEnv(), 'DEEPSEEK_API_KEY')
  process.env.AGENT_PROVIDER = 'xai'
  assert.strictEqual(apiKeyEnv(), 'XAI_API_KEY')
  restoreEnv('AGENT_PROVIDER', prev)
})

test('deepseek providerOptions maps thinking type', () => {
  assert.deepStrictEqual(PROVIDERS.deepseek.providerOptions('enabled'), {
    deepseek: { thinking: { type: 'enabled' } }
  })
  assert.deepStrictEqual(PROVIDERS.deepseek.providerOptions('disabled'), {
    deepseek: { thinking: { type: 'disabled' } }
  })
})

test('deepseek providerOptions honors AGENT_REASONING_EFFORT', () => {
  const prev = process.env.AGENT_REASONING_EFFORT
  delete process.env.AGENT_REASONING_EFFORT
  assert.deepStrictEqual(PROVIDERS.deepseek.providerOptions('enabled'), {
    deepseek: { thinking: { type: 'enabled' } }
  })
  process.env.AGENT_REASONING_EFFORT = 'high'
  assert.deepStrictEqual(PROVIDERS.deepseek.providerOptions('enabled'), {
    deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'high' }
  })
  restoreEnv('AGENT_REASONING_EFFORT', prev)
})

test('xai providerOptions maps reasoning effort, env overridable', () => {
  const prev = process.env.AGENT_REASONING_EFFORT
  delete process.env.AGENT_REASONING_EFFORT
  assert.deepStrictEqual(PROVIDERS.xai.providerOptions(), { xai: { reasoningEffort: 'low' } })
  process.env.AGENT_REASONING_EFFORT = 'high'
  assert.deepStrictEqual(PROVIDERS.xai.providerOptions(), { xai: { reasoningEffort: 'high' } })
  restoreEnv('AGENT_REASONING_EFFORT', prev)
})

test('meta provider defaults: model id, key env, medium effort', () => {
  assert.strictEqual(modelIdFor('meta'), 'muse-spark-1.2-contributor')
  assert.strictEqual(PROVIDERS.meta.apiKeyEnv, 'MODEL_API_KEY')
  const prev = process.env.AGENT_REASONING_EFFORT
  delete process.env.AGENT_REASONING_EFFORT
  assert.deepStrictEqual(PROVIDERS.meta.providerOptions(), { meta: { reasoningEffort: 'medium' } })
  process.env.AGENT_REASONING_EFFORT = 'high'
  assert.deepStrictEqual(PROVIDERS.meta.providerOptions(), { meta: { reasoningEffort: 'high' } })
  restoreEnv('AGENT_REASONING_EFFORT', prev)
})

test('toolChoiceNone capability: meta opts out, deepseek/xai default in', () => {
  assert.strictEqual(PROVIDERS.meta.toolChoiceNone, false)
  assert.strictEqual(PROVIDERS.deepseek.toolChoiceNone, true)
  assert.strictEqual(PROVIDERS.xai.toolChoiceNone, true)
})

test('createModel rejects unknown provider', () => {
  const prev = process.env.AGENT_PROVIDER
  process.env.AGENT_PROVIDER = 'nope'
  assert.throws(() => createModel(), /Unknown AGENT_PROVIDER/)
  restoreEnv('AGENT_PROVIDER', prev)
})
