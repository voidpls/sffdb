const SheetsFetcher = require('./sheets')
const SearchEngine = require('./search')
const { formatComponent, formatComponentJSON } = require('./formatter')
const config = require('../config')

class QueryEngine {
  constructor () {
    const { spreadsheetId, tabs } = config.sheets
    const credentials = {
      client_email: process.env.SHEETS_SERVICE_EMAIL,
      private_key: (process.env.SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    }

    this.fetcher = new SheetsFetcher(spreadsheetId, credentials)
    this.searchEngine = new SearchEngine()
    this.tabs = tabs
    this.templates = config.sheets.formatting
    this.lastRefresh = null
  }

  async init () {
    await this.refresh()
  }

  async refresh () {
    const raw = await this.fetcher.fetch(this.tabs)
    const items = this.buildIndex(raw)
    this.searchEngine.load(items)
    this.lastRefresh = new Date()
    console.info(`[engine] Indexed ${items.length} components across ${this.searchEngine.getCategories().length} categories`)
    return items.length
  }

  // Flattens all sheets into one array, enriches rows with category + INDEX field
  buildIndex (raw) {
    const items = []

    for (const [tabName, rows] of Object.entries(raw)) {
      const meta = this.tabs[tabName]
      if (!meta) continue

      for (const row of rows) {
        row.category = meta.category

        if (row.category === 'Graphics Cards') {
          // Extract GDDR type from model string, strip it, pull out simple model name
          // e.g. "RTX 2080 Ti 11GB GDDR6" -> Memory="GDDR6", simpleModel="2080 Ti"
          const memoryMatch = (row.Model || '').match(/\s(GDDR[^\s]+)/)
          row.Memory = memoryMatch ? memoryMatch[1] : ''
          row.Model = (row.Model || '').replace(/\sGDDR[^\s]+/g, '')
          const modelMatch = (row.Model || '').match(/\s(.+?)\s\d+GB/)
          row.simpleModel = modelMatch ? modelMatch[1] : ''
        }

        row.INDEX = this.buildIndexField(row, row.category)
        items.push(row)
      }
    }

    return items
  }

  // Build the fuzzy search key for each component type
  buildIndexField (row, category) {
    switch (category) {
      case 'Cases': return `${row.Seller || ''} ${row.Case || ''}`
      case 'Coolers (Air)': return `${row.Brand || ''} ${row.Cooler || ''}`
      case 'Coolers (AIO)': return `${row.Brand || ''} ${row.Model || ''}`
      case 'Slim Fans': return `${row.Brand || ''} ${row.Model || ''}`
      case 'Mobos (ITX)': return `${row.Brand || ''} ${row.Chipset || ''} ${row.Name || ''}`
      case 'Graphics Cards': {
        const cleanName = (row.Name || '').replace(row.simpleModel || '', '')
        return `${row.Brand || ''} ${row.Model || ''} ${cleanName}`
      }
      default: return ''
    }
  }

  search (query, opts = {}) {
    return this.searchEngine.search(query, opts)
  }

  getCategories () {
    return this.searchEngine.getCategories()
  }

  getByCategory (category) {
    return this.searchEngine.getByCategory(category)
  }

  formatDiscord (component) {
    return formatComponent(component, this.templates)
  }

  formatJSON (component) {
    return formatComponentJSON(component, this.templates)
  }

  getStats () {
    return {
      count: this.searchEngine.items.length,
      categories: this.searchEngine.getCategories(),
      lastRefresh: this.lastRefresh,
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    }
  }
}

module.exports = QueryEngine
