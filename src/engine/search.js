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
    const opts = {
      key: 'INDEX',
      threshold: threshold ?? DEFAULT_OPTIONS.threshold,
      limit: limit ?? DEFAULT_OPTIONS.limit
    }

    let results = fuzzysort.go(query, this.items, opts).map(r => r.obj)

    if (category) {
      results = results.filter(r => r.category === category)
    }

    return results
  }

  getCategories () {
    return [...new Set(this.items.map(i => i.category))]
  }

  getByCategory (category) {
    return this.items.filter(i => i.category === category)
  }
}

module.exports = SearchEngine
