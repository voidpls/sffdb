const { generateText, stepCountIs } = require('ai')
const { createDeepSeek } = require('@ai-sdk/deepseek')
const { buildTools } = require('./tools')
const { buildResearchPrompt, buildFormatNudge } = require('./prompt')
const config = require('../config')

function safeJson (value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncate (str, max) {
  if (!str) return ''
  return str.length > max ? `${str.slice(0, max)}…` : str
}

// Flattens each step's tool calls into "toolName(args)" strings for logging
function summarizeSteps (steps = []) {
  return steps.flatMap(step =>
    (step.toolCalls || []).map(
      call => `${call.toolName}(${safeJson(call.input ?? call.args ?? {})})`
    )
  )
}

// Pulls the model's reasoning text out of each step (debug logging only)
function summarizeReasoning (steps = []) {
  return steps
    .map(step => {
      if (step.reasoningText) return step.reasoningText
      if (Array.isArray(step.reasoning)) {
        return step.reasoning.map(r => r.text || '').join('')
      }
      return ''
    })
    .filter(Boolean)
}

function tokenUsage (result) {
  if (!result) return null
  const usage = result.usage ?? result.totalUsage
  if (usage?.inputTokens && typeof usage.inputTokens === 'object') {
    return {
      uncachedInput: usage.inputTokens.noCache ?? 0,
      cachedInput: usage.inputTokens.cacheRead ?? 0,
      output: usage.outputTokens?.total ?? 0
    }
  }

  const ds = result.providerMetadata?.deepseek
  if (ds?.promptCacheHitTokens == null && ds?.promptCacheMissTokens == null) return null

  return {
    uncachedInput: ds.promptCacheMissTokens ?? 0,
    cachedInput: ds.promptCacheHitTokens ?? 0,
    output: usage?.outputTokens?.total ?? usage?.outputTokens ?? 0
  }
}

function stepTokenUsage (step) {
  return tokenUsage({ usage: step?.usage, providerMetadata: step?.providerMetadata })
}

function accumulateStepTokens (steps, formatFromIndex) {
  const research = { uncachedInput: 0, cachedInput: 0, output: 0 }
  let format = null

  for (let i = 0; i < steps.length; i++) {
    const usage = stepTokenUsage(steps[i])
    if (!usage) continue
    if (formatFromIndex !== null && i >= formatFromIndex) {
      format = usage
    } else {
      research.uncachedInput += usage.uncachedInput
      research.output += usage.output
      research.cachedInput = usage.cachedInput
    }
  }

  return { researchTokens: research, formatTokens: format }
}

function needsFormatPass ({ steps, text }) {
  return summarizeSteps(steps).length > 0 || !text?.trim()
}

function formatStepIndex (steps) {
  return steps.length > config.agent.maxSteps ? config.agent.maxSteps : null
}

function sanitizeAnswer (text) {
  if (!text) return text
  return text
    .replace(/\u2705|\u2611\uFE0F?|\u2714\uFE0F?/g, '\u2713')
    .replace(/\u274C|\u274E|\u2716\uFE0F?|\u2796/g, '\u2717')
}

function resolveThinkingType (override) {
  if (override != null) return override
  return config.agent.thinking ? 'enabled' : 'disabled'
}

function createAgent (engine, { thinking } = {}) {
  const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY })
  const tools = buildTools(engine)
  const thinkingType = resolveThinkingType(thinking)
  const providerOptions = {
    deepseek: { thinking: { type: thinkingType } }
  }

  return async function runAgent (question, { onStepFinish, signal } = {}) {
    const start = Date.now()
    const system = buildResearchPrompt(engine.getCatalog())
    const model = deepseek(config.agent.model)
    let researchMs = 0
    let formatMs = 0
    let stepStart = Date.now()

    const onStepFinishWithTiming = (event) => {
      const ms = Date.now() - stepStart
      stepStart = Date.now()
      if (event.stepNumber >= config.agent.maxSteps) formatMs += ms
      else researchMs += ms
      onStepFinish?.(event)
    }

    try {
      let result = await generateText({
        model,
        system,
        prompt: question,
        tools,
        providerOptions,
        abortSignal: signal,
        stopWhen: ({ steps }) => steps.length > config.agent.maxSteps,
        prepareStep: ({ stepNumber, messages }) => {
          if (stepNumber !== config.agent.maxSteps) return
          return {
            messages: [...messages, { role: 'user', content: buildFormatNudge(config.agent.margins) }],
            toolChoice: 'none'
          }
        },
        onStepFinish: onStepFinishWithTiming
      })

      let steps = result.steps
      let formatFromIndex = formatStepIndex(steps)

      // Model stopped early with text — format wasn't reached via prepareStep
      if (formatFromIndex === null && needsFormatPass({ steps, text: result.text })) {
        const formatStart = Date.now()
        const formatResult = await generateText({
          model,
          system,
          messages: [
            { role: 'user', content: question },
            ...result.response.messages,
            { role: 'user', content: buildFormatNudge(config.agent.margins) }
          ],
          tools,
          providerOptions,
          abortSignal: signal,
          stopWhen: stepCountIs(1),
          toolChoice: 'none'
        })
        formatMs += Date.now() - formatStart
        formatFromIndex = steps.length
        steps = steps.concat(formatResult.steps)
        result = formatResult
      }

      const answer = sanitizeAnswer(result.text)
      const { researchTokens, formatTokens } = accumulateStepTokens(steps, formatFromIndex)

      const log = buildLog({
        start,
        researchMs,
        formatMs,
        question,
        steps,
        answer,
        researchTokens,
        formatTokens
      })
      if (process.env.AGENT_BENCH !== '1') {
        console.info('[agent] request', log)
      }
      return { answer, steps, researchMs, formatMs, totalMs: log.totalMs, thinking: thinkingType }
    } catch (err) {
      const cancelled = signal?.aborted || err.name === 'AbortError'
      console.error('[agent] request', {
        success: false,
        cancelled,
        researchMs,
        formatMs,
        totalMs: Date.now() - start,
        question,
        error: err.message
      })
      throw err
    }
  }
}

function buildLog ({ start, researchMs, formatMs, question, steps, answer, researchTokens, formatTokens }) {
  const log = {
    success: true,
    researchMs,
    formatMs,
    totalMs: Date.now() - start,
    question,
    steps: steps.length,
    tools: summarizeSteps(steps),
    output: truncate(answer, 500)
  }
  if (researchTokens) log.tokensResearch = researchTokens
  if (formatTokens) log.tokensFormat = formatTokens
  if (config.agent.logReasoning) log.reasoning = summarizeReasoning(steps)
  return log
}

module.exports = {
  createAgent,
  resolveThinkingType,
  summarizeSteps,
  summarizeReasoning,
  needsFormatPass,
  formatStepIndex,
  tokenUsage,
  accumulateStepTokens,
  sanitizeAnswer
}
