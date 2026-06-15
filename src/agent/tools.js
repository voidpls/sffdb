const { tool } = require('ai')
const { z } = require('zod')
const { slimComponent } = require('../engine/query')
const config = require('../config')

function buildTools (engine) {
  return {
    search_components: tool({
      description: 'Resolve a NAMED component the user mentioned (a specific case, GPU, cooler, fan). Returns (*) default fields for that category. Do not use this to browse or enumerate variants — use query_components for that.',
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
          results: results.map(r => slimComponent(r, config.sheets.aliases, config.agent.defaultSelect))
        }
      }
    }),
    query_components: tool({
      description: 'Filter and sort a whole category server-side; returns (*) fields by default (omit select). If select is needed, request only the minimum non-(*) fields still required. Bounded top-N, never the full list. Put ALL constraints in `where` and use sort+limit. Prefer ONE call — never re-look-up the returned results individually.',
      inputSchema: z.object({
        category: z.string(),
        where: z.array(z.object({
          field: z.string(),
          op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'yes', 'known']),
          value: z.any().optional()
        })).optional(),
        sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']).optional() }).optional(),
        limit: z.number().int().min(1).max(30).optional(),
        select: z.array(z.string()).optional()
      }),
      execute: async (spec) => engine.query(spec)
    })
  }
}

module.exports = { buildTools }
