const { generateText, stepCountIs } = require('ai')
const { createDeepSeek } = require('@ai-sdk/deepseek')
const { buildTools } = require('./tools')
const { buildSystemPrompt } = require('./prompt')
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

function createAgent (engine) {
  const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY })
  const tools = buildTools(engine)

  const providerOptions = {
    deepseek: { thinking: { type: config.agent.thinking ? 'enabled' : 'disabled' } }
  }

  return async function runAgent (question, { onStepFinish, signal } = {}) {
    const start = Date.now()
    const system = buildSystemPrompt(engine.getCatalog(), config.agent.margins)
    try {
      const result = await generateText({
        model: deepseek(config.agent.model),
        system,
        prompt: question,
        tools,
        providerOptions,
        abortSignal: signal,
        stopWhen: stepCountIs(config.agent.maxSteps),
        onStepFinish
      })

      let answer = result.text
      let steps = result.steps

      // If the step budget ran out on a tool call, the model never got to write
      // an answer. Force one final text-only turn from the data already gathered.
      if (!answer || !answer.trim()) {
        const finalize = await generateText({
          model: deepseek(config.agent.model),
          system,
          messages: [
            { role: 'user', content: question },
            ...result.response.messages
          ],
          tools,
          providerOptions,
          abortSignal: signal,
          toolChoice: 'none'
        })
        answer = finalize.text
        steps = steps.concat(finalize.steps)
      }

      const log = {
        success: true,
        durationMs: Date.now() - start,
        question,
        steps: steps.length,
        tools: summarizeSteps(steps),
        output: truncate(answer, 500)
      }
      if (config.agent.logReasoning) log.reasoning = summarizeReasoning(steps)
      console.info('[agent] request', log)

      return { answer, steps }
    } catch (err) {
      const cancelled = signal?.aborted || err.name === 'AbortError'
      console.error('[agent] request', {
        success: false,
        cancelled,
        durationMs: Date.now() - start,
        question,
        error: err.message
      })
      throw err
    }
  }
}

module.exports = { createAgent, summarizeSteps, summarizeReasoning }
