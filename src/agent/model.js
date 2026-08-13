// Model wiring: provider + id + provider options, overridable via env
// (AGENT_PROVIDER / AGENT_MODEL / AGENT_REASONING_EFFORT); defaults in config.agent.

const { createDeepSeek } = require('@ai-sdk/deepseek')
const { createXai } = require('@ai-sdk/xai')
const { createOpenAI } = require('@ai-sdk/openai')
const config = require('../config')

const PROVIDERS = {
  deepseek: {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-flash',
    toolChoiceNone: true,
    create: apiKey => createDeepSeek({ apiKey }),
    // thinking: 'enabled' | 'disabled' (config.agent.thinking / createAgent override);
    // reasoningEffort: low|medium|high|xhigh|max (AGENT_REASONING_EFFORT, unset = API default)
    providerOptions: thinking => {
      const opts = { deepseek: { thinking: { type: thinking } } }
      if (process.env.AGENT_REASONING_EFFORT) opts.deepseek.reasoningEffort = process.env.AGENT_REASONING_EFFORT
      return opts
    }
  },
  xai: {
    apiKeyEnv: 'XAI_API_KEY',
    defaultModel: 'grok-4.6',
    toolChoiceNone: true,
    create: apiKey => createXai({ apiKey }),
    // reasoningEffort: 'low' | 'medium' | 'high' (AGENT_REASONING_EFFORT, default low)
    providerOptions: () => ({
      xai: { reasoningEffort: process.env.AGENT_REASONING_EFFORT || 'low' }
    })
  },
  meta: {
    apiKeyEnv: 'MODEL_API_KEY',
    defaultModel: 'muse-spark-1.2-contributor',
    toolChoiceNone: false, // chat-completions endpoint only accepts tool_choice 'auto'
    create: apiKey => createOpenAI({ apiKey, baseURL: 'https://api.meta.ai/v1', name: 'meta' }),
    // reasoningEffort: minimal|low|medium|high|xhigh (AGENT_REASONING_EFFORT, default medium)
    providerOptions: () => ({
      meta: { reasoningEffort: process.env.AGENT_REASONING_EFFORT || 'medium' }
    })
  }
}

function resolveProvider () {
  return process.env.AGENT_PROVIDER || config.agent.provider || 'deepseek'
}

function modelIdFor (name) {
  return process.env.AGENT_MODEL || PROVIDERS[name]?.defaultModel || config.agent.model
}

function apiKeyEnv () {
  return PROVIDERS[resolveProvider()].apiKeyEnv
}

function createModel ({ thinking } = {}) {
  const name = resolveProvider()
  const def = PROVIDERS[name]
  if (!def) {
    throw new Error(`Unknown AGENT_PROVIDER '${name}' (expected: ${Object.keys(PROVIDERS).join(', ')})`)
  }
  const provider = def.create(process.env[def.apiKeyEnv])
  return {
    model: provider(modelIdFor(name)),
    providerOptions: def.providerOptions(thinking),
    toolChoiceNone: def.toolChoiceNone !== false
  }
}

module.exports = { createModel, resolveProvider, modelIdFor, apiKeyEnv, PROVIDERS }
