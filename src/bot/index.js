require('dotenv').config()
const { Client, Collection, GatewayIntentBits } = require('discord.js')
const fs = require('fs').promises
const path = require('path')
const QueryEngine = require('../engine')
const config = require('../config')

const { BOT_TOKEN, BOT_PREFIX } = process.env

async function startBot () {
  const engine = new QueryEngine()

  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  })

  bot.slashCommands = new Collection()
  bot.commands = new Collection()

  const commandFiles = (
    await fs.readdir(path.join(__dirname, 'commands'))
  ).filter(f => f.endsWith('.js'))
  for (const file of commandFiles) {
    const cmd = require(`./commands/${file}`)
    bot.slashCommands.set(cmd.info.name, cmd)

    if (BOT_PREFIX && cmd.info.aliases) {
      bot.commands.set(cmd.info.name, cmd)
      for (const alias of cmd.info.aliases) {
        bot.commands.set(alias, cmd)
      }
    }
  }
  console.log(`[discord] Loaded ${bot.slashCommands.size} slash commands`)

  bot.once('clientReady', async () => {
    console.info(`[discord] Connected as ${bot.user.username}`)
    await engine.init()
    bot.index = engine

    bot.user.setActivity(`${engine.getStats().count} components`, {
      type: 'WATCHING'
    })

    setInterval(async () => {
      await engine.refresh()
      bot.user.setActivity(`${engine.getStats().count} components`, {
        type: 'WATCHING'
      })
    }, config.bot.refreshIntervalMs)
  })

  if (BOT_PREFIX) {
    bot.on('messageCreate', async msg => {
      if (msg.author.id === bot.user.id || msg.author.bot) return
      if (!msg.content.startsWith(BOT_PREFIX)) return

      const args = msg.content.slice(BOT_PREFIX.length).trim().split(' ')
      const cmd = args.shift().toLowerCase()
      const cmdFile = bot.commands.get(cmd)

      if (cmdFile) return cmdFile.run(engine, bot, msg, args)
    })
  }

  bot.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return
    const cmd = bot.slashCommands.get(interaction.commandName)
    if (cmd) return cmd.run(engine, bot, interaction)
  })

  bot.on('error', console.error)

  await bot.login(BOT_TOKEN)
}

module.exports = { startBot }

if (require.main === module) {
  startBot().catch(err => {
    console.error('[discord] Failed to start:', err)
    process.exit(1)
  })
}
