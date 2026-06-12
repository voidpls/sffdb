const { AUTHOR_ID } = process.env

async function run (engine, bot, msg) {
  if (msg.author.id !== AUTHOR_ID) return

  for (const cmd of bot.slashCommands.values()) {
    const command = await bot.application?.commands.create(cmd.info.data)
    if (command) {
      console.info(`[discord] Deployed slash command: ${command.name}`)
      await msg.channel.send(`Deployed slash command: \`${command.name}\``)
    }
  }
}

module.exports = {
  run,
  info: {
    name: 'deploy',
    data: {
      name: 'deploy',
      description: 'Deploys slash commands'
    },
    aliases: []
  }
}
