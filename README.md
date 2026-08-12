# SFF DB

Query engine & agentic assistant for the [SFF PC Masterlist](https://docs.google.com/spreadsheets/d/1AddRvGWJ_f4B6UC7_IftDiVudVc8CJ8sxLUqlxVsCz4/).

**Stack:** Node.js · discord.js · googleapis · fuzzysort · Vercel AI SDK

## Demo

https://github.com/user-attachments/assets/3510643c-f7ec-42bf-b818-2aaae9130b9f



## Architecture

```
src/
  config.js          # Configuration (sheets, templates, bot settings)
  engine/
    index.js         # QueryEngine - main entry point
    sheets.js        # Google Sheets fetching via googleapis
    search.js        # Fuzzysort-based search
    formatter.js     # Template rendering
  bot/
    index.js         # Discord bot
    commands/        # Slash commands (find, links, deploy)
  api/
    index.js         # Express HTTP server
    routes.js        # API endpoints
```

## Setup

```bash
npm install
cp .env.example .env
# Fill in .env with your credentials
```

## Running

```bash
# Discord bot only
npm start

# HTTP API only
npm run api

# Both bot + API
npm run dev
```

## HTTP API

| Endpoint | Description |
|---|---|
| `GET /api/search?q=text&category=cases&limit=50` | Search components |
| `GET /api/components/:category` | List all in category |
| `GET /api/categories` | List categories |
| `GET /api/health` | Stats and health check |

## Configuration

Edit `src/config.js`:
- `sheets.tabs` - Which Google Sheets tabs to fetch and their categories
- `sheets.formatting` - Display templates per category
- `bot.color` - Embed color
- `bot.refreshIntervalMs` - Data refresh interval

## Environment Variables

See `.env.example` for all required variables.

## Demo

![Bot Demo](https://i.imgur.com/kS5sagH.gif)
