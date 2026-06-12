const { EmbedBuilder, InteractionResponseFlags } = require('discord.js')
const config = require('../../config')
// Interactive /find command: search -> category select -> component select -> show info
// Uses message collectors for the multi-step prompt flow
const collectors = new Map()

const { CHANNEL_WHITELIST } = process.env

async function run (engine, bot, int) {
  const query = int.options.getString('query', true).trim()

  if (CHANNEL_WHITELIST) {
    const guildChannels = await int.guild.channels.fetch()
    const whitelist = CHANNEL_WHITELIST.split(',')
    const guildWhitelist = whitelist.filter(c => guildChannels.has(c))
    if (guildWhitelist.length && !guildWhitelist.includes(int.channel.id)) {
      return int.reply({
        content: "You can't use that in this channel!\n\nPermitted channels:\n" +
          guildWhitelist.map(c => `<#${c}>`).join('\n'),
        flags: InteractionResponseFlags.Ephemeral
      })
    }
  }

  if (!query) {
    return int.reply({ content: 'You must specify a search query.', flags: InteractionResponseFlags.Ephemeral })
  }

  const results = engine.search(query)
  if (results.length === 0) {
    return int.reply({ content: 'No results found.', flags: InteractionResponseFlags.Ephemeral })
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
      name: bot.user.username,
      url: bot.user.avatarURL({ dynamic: true, size: 128, format: 'png' })
    })
    .setColor(config.bot.color)
    .setDescription(data.description)
    .setTitle(data.title)
}

async function showCategoryList (engine, bot, int, results, categories) {
  // Stop any active collector for this user to prevent overlap
  if (collectors.get(int.user.id)) {
    collectors.get(int.user.id).stop('overlap')
  }

  const desc = categories.map((c, i) => `\`[${i + 1}]\` ${c}`)
  const embed = makeEmbed(bot, {
    title: 'Select a category',
    description: '**Type a # to select a category**\n\n' + desc.join('\n')
  }).setFooter({ text: 'Or type "exit" to close this prompt' })

  await int.reply({ embeds: [embed] })

  const filter = m => {
    if (m.author.id !== int.user.id) return false
    if (m.content.toLowerCase() === 'exit') return true
    const num = parseInt(m.content)
    return num >= 1 && num <= categories.length
  }

  const collector = int.channel.createMessageCollector({ filter, max: 1, time: 60000 })
  collectors.set(int.user.id, collector)

  collector.on('collect', async col => {
    await col.delete().catch(() => {})
    if (col.content.toLowerCase() === 'exit') return int.deleteReply()
    return showComponentList(engine, bot, int, results, categories[parseInt(col.content) - 1])
  })

  collector.on('end', () => collectors.delete(int.user.id))
}

async function showComponentList (engine, bot, int, results, category) {
  if (collectors.get(int.user.id)) {
    collectors.get(int.user.id).stop('overlap')
  }

  const components = results.filter(r => r.category === category)
  if (components.length === 1) return showComponent(engine, bot, int, components[0])

  const shown = components.slice(0, 9)
  const desc = shown.map((c, i) => {
    const fmt = engine.formatDiscord(c)
    return `\`[${i + 1}]\` ${fmt.title}`
  })

  const embed = makeEmbed(bot, {
    title: 'Select a component',
    description: '**Type a # to select a component**\n\n' + desc.join('\n')
  }).setFooter({ text: 'Or type "exit" to close this prompt' })

  if (int.replied) await int.editReply({ embeds: [embed] })
  else await int.reply({ embeds: [embed] })

  const filter = m => {
    if (m.author.id !== int.user.id) return false
    if (m.content.toLowerCase() === 'exit') return true
    const num = parseInt(m.content)
    return num >= 1 && num <= shown.length
  }

  const collector = int.channel.createMessageCollector({ filter, max: 1, time: 60000 })
  collectors.set(int.user.id, collector)

  collector.on('collect', async col => {
    await col.delete().catch(() => {})
    if (col.content.toLowerCase() === 'exit') return int.deleteReply()
    return showComponent(engine, bot, int, shown[parseInt(col.content) - 1])
  })

  collector.on('end', () => collectors.delete(int.user.id))
}

async function showComponent (engine, bot, int, component) {
  if (collectors.get(int.user.id)) {
    collectors.get(int.user.id).stop('overlap')
  }

  const fmt = engine.formatDiscord(component)
  if (!fmt) {
    const text = `Could not display info. Template for \`${component.category}\` not found.`
    if (int.replied) return int.editReply(text)
    return int.reply(text)
  }

  const embed = makeEmbed(bot, fmt)
    .setFooter({ text: 'Type "exit" to close this prompt' })

  if (int.replied) await int.editReply({ embeds: [embed] })
  else await int.reply({ embeds: [embed] })

  const filter = m => {
    if (m.author.id !== int.user.id) return false
    return m.content.toLowerCase() === 'exit'
  }

  const collector = int.channel.createMessageCollector({ filter, max: 1, time: 60000 })
  collectors.set(int.user.id, collector)

  collector.on('collect', async col => {
    await col.delete().catch(() => {})
    if (col.content.toLowerCase() === 'exit') return int.deleteReply()
  })

  collector.on('end', () => collectors.delete(int.user.id))
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
