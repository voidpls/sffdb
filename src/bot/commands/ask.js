const { EmbedBuilder, InteractionResponseFlags } = require('discord.js')
const config = require('../../config')
const { createAgent } = require('../../agent')

const { CHANNEL_WHITELIST } = process.env
const cooldowns = new Map()
const DISCLAIMER = 'Verify before buying — value check on manufacturer-reported numbers; manufacturers measure inconsistently.'

let runAgent

function ephemeral (int, content) {
  return int.reply({ content, flags: InteractionResponseFlags.Ephemeral })
}

async function run (engine, bot, int) {
  if (!config.agent.enabled) {
    return ephemeral(int, 'The SFF assistant is currently disabled.')
  }

  if (CHANNEL_WHITELIST) {
    const guildChannels = await int.guild.channels.fetch()
    const whitelist = CHANNEL_WHITELIST.split(',').filter(c => guildChannels.has(c))
    if (whitelist.length && !whitelist.includes(int.channel.id)) {
      return ephemeral(int, "You can't use that in this channel!\n\nPermitted channels:\n" +
        whitelist.map(c => `<#${c}>`).join('\n'))
    }
  }

  const now = Date.now()
  const last = cooldowns.get(int.user.id) || 0
  if (now - last < config.agent.cooldownMs) {
    const wait = Math.ceil((config.agent.cooldownMs - (now - last)) / 1000)
    return ephemeral(int, `Please wait ${wait}s before asking again.`)
  }
  cooldowns.set(int.user.id, now)

  const question = int.options.getString('question', true).trim()
  if (!question) return ephemeral(int, 'You must ask a question.')

  await int.deferReply()
  runAgent = runAgent || createAgent(engine)

  let statusShown = false
  const timeout = new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error('timeout')), config.agent.timeoutMs))

  try {
    const { answer } = await Promise.race([
      runAgent(question, {
        onStepFinish: ({ toolCalls }) => {
          if (!statusShown && toolCalls && toolCalls.length) {
            statusShown = true
            int.editReply('Searching the database…').catch(() => {})
          }
        }
      }),
      timeout
    ])

    const text = (answer || 'I could not produce an answer.').slice(0, 4000)
    const embed = new EmbedBuilder()
      .setColor(config.bot.color)
      .setTitle('SFF Assistant')
      .setDescription(text)
      .setFooter({ text: DISCLAIMER })
    await int.editReply({ content: '', embeds: [embed] })
  } catch (err) {
    console.error('[ask] error:', err)
    const msg = err.message === 'timeout'
      ? 'That took too long to answer. Try a more specific question.'
      : 'Sorry, I ran into an error answering that.'
    await int.editReply({ content: msg, embeds: [] }).catch(() => {})
  }
}

module.exports = {
  run,
  info: {
    name: 'ask',
    data: {
      name: 'ask',
      description: 'Ask the SFF assistant a hardware question',
      options: [
        { type: 3, name: 'question', description: 'Your question', required: true }
      ]
    }
  }
}
