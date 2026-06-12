const fuzzysort = require('fuzzysort')

const DEFAULT_OPTIONS = {
  threshold: 0.5,
  limit: 200
}

class SearchEngine {
  constructor () {
    this.items = []
  }

  load (items) {
    this.items = items
  }

  search (query, { category, threshold, limit } = {}) {
    const pool = category ? this.getByCategory(category) : this.items

    return fuzzysort.go(query, pool, {
      key: 'INDEX',
      threshold: threshold ?? DEFAULT_OPTIONS.threshold,
      limit: limit ?? DEFAULT_OPTIONS.limit
    }).map(r => r.obj)
  }

  getCategories () {
    return [...new Set(this.items.map(i => i.category))]
  }

  getByCategory (category) {
    return this.items.filter(i => i.category === category)
  }
}

module.exports = SearchEngine
