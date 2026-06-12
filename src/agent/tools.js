const { tool } = require('ai')
const { z } = require('zod')

function buildTools (engine) {
  return {
    search_components: tool({
      description: 'Fuzzy lookup for a named component (specific case, GPU, cooler, fan). Returns a small set of matches with their specs.',
      inputSchema: z.object({
        query: z.string().describe('The component name to search for'),
        category: z.string().optional().describe('Optional category to restrict the search'),
        limit: z.number().int().min(1).max(8).optional()
      }),
      execute: async ({ query, category, limit }) => {
        const cap = Math.min(limit || 8, 8)
        const results = engine.search(query, { category, limit: cap })
        return {
          count: results.length,
          results: results.map(r => ({ category: r.category, ...engine.formatJSON(r).data }))
        }
      }
    }),
    query_components: tool({
      description: 'Structured filter/sort over a whole category. Use for constraint and superlative questions. Returns bounded top-N results, never the full list.',
      inputSchema: z.object({
        category: z.string(),
        where: z.array(z.object({
          field: z.string(),
          op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'yes', 'known']),
          value: z.any().optional()
        })).optional(),
        sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']).optional() }).optional(),
        limit: z.number().int().min(1).max(10).optional(),
        select: z.array(z.string()).optional()
      }),
      execute: async (spec) => engine.query(spec)
    })
  }
}

module.exports = { buildTools }
