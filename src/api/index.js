require('dotenv').config()
const express = require('express')
const cors = require('cors')
const QueryEngine = require('../engine')
const createRoutes = require('./routes')
const config = require('../config')

async function startAPI () {
  const engine = new QueryEngine()
  await engine.init()

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use('/api', createRoutes(engine))

  setInterval(() => engine.refresh(), config.bot.refreshIntervalMs)

  const port = config.api.port
  app.listen(port, () => {
    console.info(`[api] Listening on http://localhost:${port}`)
  })

  return { app, engine }
}

module.exports = { startAPI }

if (require.main === module) {
  startAPI().catch(err => {
    console.error('[api] Failed to start:', err)
    process.exit(1)
  })
}
