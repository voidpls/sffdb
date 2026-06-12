const { Router } = require('express')

function createRoutes (engine) {
  const router = Router()

  // GET /api/search?q=text&category=cases&limit=50
  router.get('/search', (req, res) => {
    const { q, category, limit } = req.query

    if (!q) {
      return res.status(400).json({ error: 'Missing required parameter: q' })
    }

    const results = engine.search(q, {
      category: category || undefined,
      limit: limit ? parseInt(limit, 10) : undefined
    })

    const formatted = results.map(r => ({
      ...engine.formatJSON(r),
      category: r.category
    }))

    res.json({
      query: q,
      category: category || null,
      count: formatted.length,
      results: formatted
    })
  })

  // GET /api/categories
  router.get('/categories', (req, res) => {
    const categories = engine.getCategories()
    res.json({ categories })
  })

  // GET /api/components/:category
  router.get('/components/:category', (req, res) => {
    const { category } = req.params
    const categories = engine.getCategories()

    if (!categories.includes(category)) {
      return res.status(404).json({
        error: `Category not found: ${category}`,
        available: categories
      })
    }

    const items = engine.getByCategory(category)
    const formatted = items.map(r => engine.formatJSON(r))

    res.json({
      category,
      count: formatted.length,
      results: formatted
    })
  })

  // GET /api/health
  router.get('/health', (req, res) => {
    res.json(engine.getStats())
  })

  return router
}

module.exports = createRoutes
