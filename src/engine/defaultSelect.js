function validateDefaultSelect (catalog, defaultSelectByCategory = {}) {
  const missing = []
  for (const [category, fields] of Object.entries(defaultSelectByCategory)) {
    const headers = new Set((catalog[category] || []).map(f => f.header))
    for (const field of fields) {
      if (!headers.has(field)) missing.push({ category, field })
    }
  }
  return { ok: missing.length === 0, missing }
}

module.exports = { validateDefaultSelect }
