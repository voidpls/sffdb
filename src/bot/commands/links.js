const { EmbedBuilder } = require('discord.js')
const config = require('../../config')

async function run (engine, bot, int) {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: bot.user.username,
      url: bot.user.avatarURL({ dynamic: true, size: 128, format: 'png' })
    })
    .setTitle('Useful SFF Resources')
    .setDescription(config.links.description)
    .setColor(config.bot.color)

  await int.reply({ embeds: [embed] })
}

module.exports = {
  run,
  info: {
    name: 'links',
    data: {
      name: 'links',
      description: 'Post a message containing links to SFF resources'
    }
  }
}
