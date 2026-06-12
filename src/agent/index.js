const { generateText, stepCountIs } = require('ai')
const { createDeepSeek } = require('@ai-sdk/deepseek')
const { buildTools } = require('./tools')
const { buildSystemPrompt } = require('./prompt')
const config = require('../config')

function createAgent (engine) {
  const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY })
  const tools = buildTools(engine)

  return async function runAgent (question, { onStepFinish } = {}) {
    const result = await generateText({
      model: deepseek(config.agent.model),
      system: buildSystemPrompt(engine.getCatalog(), config.agent.margins),
      prompt: question,
      tools,
      stopWhen: stepCountIs(config.agent.maxSteps),
      onStepFinish
    })
    return { answer: result.text, steps: result.steps }
  }
}

module.exports = { createAgent }
