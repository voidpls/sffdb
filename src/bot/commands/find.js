const { EmbedBuilder, MessageFlags } = require('discord.js')
const config = require('../../config')

// Interactive /find command: search -> category select -> component select -> show info
const collectors = new Map()

const { FIND_CHANNELS } = process.env

async function run (engine, bot, int) {
  const query = int.options.getString('query', true).trim()

  if (FIND_CHANNELS) {
    const guildChannels = await int.guild.channels.fetch()
    const whitelist = FIND_CHANNELS.split(',')
    const guildWhitelist = whitelist.filter(c => guildChannels.has(c))
    if (guildWhitelist.length && !guildWhitelist.includes(int.channel.id)) {
      return int.reply({
        content:
          "You can't use that in this channel!\n\nPermitted channels:\n" +
          guildWhitelist.map(c => `<#${c}>`).join('\n'),
        flags: MessageFlags.Ephemeral
      })
    }
  }

  if (!query) {
    return int.reply({
      content: 'You must specify a search query.',
      flags: MessageFlags.Ephemeral
    })
  }

  const results = engine.search(query)
  if (results.length === 0) {
    return int.reply({
      content: 'No results found.',
      flags: MessageFlags.Ephemeral
    })
  }

  if (results.length === 1) {
    await int.reply('** **')
    return showComponent(engine, bot, int, results[0])
  }

  const categories = [...new Set(results.map(r => r.category))]

  if (categories.length === 1) {
    return showComponentList(engine, bot, int, results, categories[0])
  }

  return showCategoryList(engine, bot, int, results, categories)
}

function makeEmbed (bot, data) {
  return new EmbedBuilder()
    .setAuthor({
      name: bot.user.username
      // url: bot.user.avatarURL({ dynamic: true, size: 128, format: 'png' })
    })
    .setColor(config.bot.color)
    .setDescription(data.description)
    .setTitle(data.title)
}

function stopCollector (userId) {
  const existing = collectors.get(userId)
  if (existing) existing.stop('overlap')
}

async function sendInteraction (int, payload) {
  if (int.replied) return int.editReply(payload)
  return int.reply(payload)
}

// Prompt the user to type a number (1..maxChoice) or "exit"
function collectInput (int, { maxChoice, onSelect }) {
  stopCollector(int.user.id)

  const filter = m => {
    if (m.author.id !== int.user.id) return false
    if (m.content.toLowerCase() === 'exit') return true
    if (!maxChoice) return false
    const num = parseInt(m.content)
    return num >= 1 && num <= maxChoice
  }

  const collector = int.channel.createMessageCollector({
    filter,
    max: 1,
    time: 60000
  })
  collectors.set(int.user.id, collector)

  collector.on('collect', async col => {
    await col.delete().catch(() => {})
    if (col.content.toLowerCase() === 'exit') return int.deleteReply()
    if (onSelect) return onSelect(parseInt(col.content) - 1)
  })

  collector.on('end', () => collectors.delete(int.user.id))
}

async function showCategoryList (engine, bot, int, results, categories) {
  const desc = categories.map((c, i) => `\`[${i + 1}]\` ${c}`)
  const embed = makeEmbed(bot, {
    title: 'Select a category',
    description: '**Type a # to select a category**\n\n' + desc.join('\n')
  }).setFooter({ text: 'Or type "exit" to close this prompt' })

  await int.reply({ embeds: [embed] })

  collectInput(int, {
    maxChoice: categories.length,
    onSelect: index =>
      showComponentList(engine, bot, int, results, categories[index])
  })
}

async function showComponentList (engine, bot, int, results, category) {
  const components = results.filter(r => r.category === category)
  if (components.length === 1)
    return showComponent(engine, bot, int, components[0])

  const shown = components.slice(0, 9)
  const desc = shown.map((c, i) => {
    const fmt = engine.formatDiscord(c)
    return `\`[${i + 1}]\` ${fmt.title}`
  })

  const embed = makeEmbed(bot, {
    title: 'Select a component',
    description: '**Type a # to select a component**\n\n' + desc.join('\n')
  }).setFooter({ text: 'Or type "exit" to close this prompt' })

  await sendInteraction(int, { embeds: [embed] })

  collectInput(int, {
    maxChoice: shown.length,
    onSelect: index => showComponent(engine, bot, int, shown[index])
  })
}

async function showComponent (engine, bot, int, component) {
  const fmt = engine.formatDiscord(component)
  if (!fmt) {
    const text = `Could not display info. Template for \`${component.category}\` not found.`
    return sendInteraction(int, text)
  }

  const embed = makeEmbed(bot, fmt).setFooter({
    text: 'Type "exit" to close this prompt'
  })

  await sendInteraction(int, { embeds: [embed] })
  collectInput(int, {})
}

module.exports = {
  run,
  info: {
    name: 'find',
    data: {
      name: 'find',
      description: 'Look up a component',
      options: [
        {
          type: 3,
          name: 'query',
          description: 'The name of the component',
          required: true
        }
      ]
    }
  }
}
