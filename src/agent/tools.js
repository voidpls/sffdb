const { tool } = require('ai')
const { z } = require('zod')
const { slimComponent, createGenerousCompleteTracker } = require('../engine/query')
const config = require('../config')

const SEARCH_LIMIT = 15

function createToolBudgetTracker (maxToolCalls) {
  let used = 0
  const softReserve = 2

  function budgetHint (remaining) {
    if (remaining <= 0) {
      return 'No tool calls remaining — answer from research already gathered.'
    }
    if (remaining <= softReserve) {
      return `${remaining} tool call${remaining === 1 ? '' : 's'} remaining — STOP unless this call is essential.`
    }
    return `${remaining} tool call${remaining === 1 ? '' : 's'} remaining.`
  }

  return {
    beginCall () {
      if (used >= maxToolCalls) {
        return {
          ok: false,
          out: {
            error: 'Tool call budget exhausted.',
            hintCode: 'budget_exhausted',
            hint: budgetHint(0),
            budgetUsed: used,
            budgetRemaining: 0,
            budgetHint: budgetHint(0)
          }
        }
      }
      used++
      const remaining = maxToolCalls - used
      return {
        ok: true,
        budget: {
          budgetUsed: used,
          budgetRemaining: remaining,
          budgetHint: budgetHint(remaining)
        }
      }
    }
  }
}

function withToolBudget (budget, run) {
  const gate = budget.beginCall()
  if (!gate.ok) return gate.out
  return { ...run(), ...gate.budget }
}

function buildTools (engine) {
  const generousComplete = createGenerousCompleteTracker()
  const toolBudget = createToolBudgetTracker(config.agent.maxToolCalls)
  return {
    search_components: tool({
      description: 'Resolve a NAMED component the user mentioned (a specific case, GPU SKU, cooler, fan). Returns up to 15 (*) default-field matches for that category. Do NOT use for GPU chip families (5080, 4090, 1080, XTX, etc.) — use query_components with the fit recipe instead. Never browse variants.',
      inputSchema: z.object({
        query: z.string().describe('The component name to search for'),
        category: z.string().optional().describe('Optional category to restrict the search')
      }),
      execute: async ({ query, category }) => withToolBudget(toolBudget, () => {
        const results = engine.search(query, { category, limit: SEARCH_LIMIT })
        const out = {
          count: results.length,
          results: results.map(r => slimComponent(r, config.sheets.aliases, config.agent.defaultSelect))
        }
        if (results.length > 1) {
          out.hint = 'Multiple matches — pick one row; do not repeat search with spelling variants.'
          out.hintCode = 'search_ambiguous'
        }
        return out
      })
    }),
    query_components: tool({
      description: 'Filter and sort a whole category server-side; returns up to 30 (*) fields by default (omit select). If select is needed, request only the minimum non-(*) fields still required. Put ALL constraints in where and use sort when ordering matters. Prefer ONE call — never re-look-up the returned results individually.',
      inputSchema: z.object({
        category: z.string(),
        where: z.array(z.object({
          field: z.string(),
          op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'yes', 'known']),
          value: z.any().optional()
        })).optional(),
        sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']).optional() }).optional(),
        select: z.array(z.string()).optional()
      }),
      execute: async ({ category, where, sort, select }) => withToolBudget(toolBudget, () => {
        const spec = { category, where, sort, select }
        const result = engine.query(spec)
        const complete = generousComplete.afterQuery(spec, result, {
          aliases: config.sheets.aliases,
          getSample: (cat) => engine.getByCategory(cat)?.[0]
        })
        if (complete) {
          result.hint = complete.hint
          result.hintCode = complete.hintCode
        }
        return result
      })
    })
  }
}

module.exports = { buildTools, createToolBudgetTracker, withToolBudget }
