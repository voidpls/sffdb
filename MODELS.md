# Model A/B Bench Results

Agentic fit-check regression bench (`npm run bench:regression`), 8 cases × 5 runs × 2 passes
(80 runs per config). Run 2026-08-09 on AI SDK `ai@7.0.58` (`@ai-sdk/deepseek@2.0.38`,
`@ai-sdk/xai@4.0.33`, `@ai-sdk/openai@4.0.36`). Bench version includes the answer verifier
(`answerOk` + reasons), per-provider pricing, p50/p90 latency, and persisted `answerSnippet`.

## Headline matrix

| Config | Model id | Reasoning | Quality (80 runs) | Median latency (8-case avg) | Cost / 80 runs | Cost / run |
|---|---|---|---|---|---|---|
| **deepseek default** | `deepseek-v4-flash` | thinking enabled | **76/80 (95.0%)** | ~22s | **$0.223** est.¹ | $0.0012–0.0040 |
| **grok-4.5 low** | `grok-4.5` | `reasoningEffort: low` | 72/80 → **~78/80**² | **~12s** | **$1.09 actual**³ | ~$0.014 |
| **deepseek high** | `deepseek-v4-flash` | `reasoningEffort: high` | 74/80 → **~76/80**⁴ | ~26s | $0.243 est.¹ | $0.0012–0.0045 |
| **muse-spark med** | `muse-spark-1.2-contributor` | `reasoningEffort: medium` | 74/80 | ~22s | $0.197 est.¹ | $0.0011–0.0046 |
| **muse-spark high** | `muse-spark-1.2-contributor` | `reasoningEffort: high` | **69/80 (86.3%)** | ~22s | $0.200 est.¹ | $0.0011–0.0045 |

¹ Estimated with the pre-fix token accounting (see Caveats) — overstates cost: AI SDK v7 moved the
cache breakdown to `inputTokenDetails`, which the bench didn't read, so every input token was billed
as cache-miss. ² 6 tight-GPU fails are a verifier artifact (chip-token rule, fixed in code after this run —
queries byte-identical to passing runs). ³ Actual xAI billing for the two grok passes; bench estimate
was $2.71 (2.5× high — measured ~99.9% cache hit on repeated prompts). ⁴ 2 bare-chip fails are a
decline-language false-fail (fixed after this run; snippets prove correct declines).

¹ 6 tight-GPU fails are a verifier artifact (chip-token rule, fixed in code after this run — queries
byte-identical to passing runs). ² 2 bare-chip fails are a decline-language false-fail (fixed after
this run; snippets prove correct declines). Corrected scores marked with `→`.

DSML corruption: 0/160. Run-level errors: 0/160. All 4 configs.

## Per-case pass rates (10 runs / case)

| Case | deepseek | grok low | deepseek high | muse med | muse high |
|---|---|---|---|---|---|
| p0-1 generous m3 | 10/10 | 10/10 | 10/10 | **8/10** | **1/10** |
| p0-1 generous raws1 | 10/10 | 9/10 | 10/10 | 10/10 | 10/10 |
| p0-3 cooler+RAM | 9/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| tight ghost S1 | 10/10 | 4/10 → 10/10¹ | 10/10 | 10/10 | 10/10 |
| case browse <10L | 10/10 | 9/10 | 10/10 | 10/10 | 10/10 |
| gpu filter 1080Ti | 9/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| bare-chip browse | 8/10 | 10/10 | 4/10 → 6/10² | 6/10 | 8/10 |
| perf-rank decline | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |

## Latency (p50 median, ms — 2-pass average)

| Case | deepseek | grok low | deepseek high | muse med | muse high |
|---|---|---|---|---|---|
| generous m3 | 15,922 | 12,607 | 14,785 | 21,420 | 19,737 |
| generous raws1 | 40,764 | 16,548 | 53,204 | 47,279 | 45,779 |
| cooler+RAM | 40,848 | 19,374 | 36,947 | 22,324 | 21,218 |
| tight ghost S1 | 30,243 | 13,193 | 28,931 | 24,233 | 20,957 |
| case browse | 19,701 | 8,771 | 18,981 | 20,684 | 19,652 |
| gpu filter | 23,431 | 18,793 | 34,360 | 16,567 | 16,635 |
| bare-chip | 10,097 | 5,686 | 11,035 | 15,331 | 17,126 |
| perf-rank | 5,834 | 4,390 | 6,220 | 9,459 | 10,171 |

## Token profile (avg/run)

| Config | avgTokIn | avgTokOut |
|---|---|---|
| deepseek | 7,832–20,582 | 437–5,065 |
| grok low | 8,226–19,546 | 176–1,344 |
| deepseek high | 7,842–22,277 | 413–6,706 |
| muse med | 7,594–28,012 | 1,522–8,933 |
| muse high | 8,510–27,422 | 1,343–9,334 |

## Findings

1. **Quality is a near-tie** between deepseek default and grok (within noise at 80 runs), except:
2. **muse refuses the flagship generous-fit case** — medium 8/10, **high 1/10** (9/10 refusals):
   claims "research incomplete / limits not retrieved" despite complete tool history and correct
   queries. More reasoning effort makes the confabulated refusal *more* consistent — the effort
   hypothesis is rejected. Also declines bare-chip perfectly in prose, but only after attempting
   the rejected query first.
3. **Bare-chip compliance is the real differentiator**: grok 10/10 (never attempts), deepseek default
   8/10 (2 real dump-answers), deepseek high 4/10 (worse with more reasoning), muse 6/10 (medium)
   → 8/10 (high) (query-then-decline).
4. **deepseek high buys nothing**: no quality gain, slower on hard cases (raws1 53s vs 41s p50),
   +9% cost. Drop the variant.
5. **Speed**: grok ~2× faster end-to-end (28–33s vs 60–170s wall per 40 jobs); muse mid; deepseek
   high slowest on hard cases.
6. **Cost**: muse and deepseek cheapest; grok ~8–10× (actual billed $1.09 for 80 runs ≈ $0.014/run,
   not the 12× estimate). Grok also emits 3–4× fewer output tokens.
7. Grok's only blemish: 1/80 zero-tool memory answer (case browse). DeepSeek family: 0.

## Recommendation

- **Workhorse: deepseek default** — best quality-per-dollar.
- **grok-4.5 low** — use for latency-sensitive `/ask`; real cost ≈ $0.01–0.02/ask (cache-served),
  not the $0.02–0.05 first estimate.
- **deepseek high** — drop.
- **muse-spark contributor** — not ready for this task at any tested effort (generous-fit refusal
  gets worse with effort: medium 8/10 → high 1/10).

## How to run

> Production default since 2026-08-09: `config.agent.provider = 'xai'`, `config.agent.model = 'grok-4.5'`
> (reasoningEffort low). Bench without env = prod default. DeepSeek remains reachable via
> `AGENT_PROVIDER=deepseek`.

```bash
# grok-4.5 low — prod default
npm run bench:regression -- --runs 5

# deepseek-v4-flash (thinking enabled)
AGENT_PROVIDER=deepseek npm run bench:regression -- --runs 5

# deepseek-v4-flash, reasoningEffort high
AGENT_PROVIDER=deepseek AGENT_REASONING_EFFORT=high npm run bench:regression -- --runs 5

# muse-spark-1.2-contributor, reasoningEffort medium (default)
# --parallel N: bounded worker pool (meta contributor tier: 100 RPM)
AGENT_PROVIDER=meta npm run bench:regression -- --runs 5 --parallel 6

# muse-spark-1.2-contributor, reasoningEffort high
AGENT_PROVIDER=meta AGENT_REASONING_EFFORT=high npm run bench:regression -- --runs 5 --parallel 6
```

Env: `AGENT_PROVIDER` (deepseek|xai|meta), `AGENT_MODEL` (override model id),
`AGENT_REASONING_EFFORT` (per-provider defaults: deepseek unset = API default, xai low, meta
medium). API keys: `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `MODEL_API_KEY`. Run each model in its own
invocation; two passes per config for intra-model variance (oracle protocol).

## Configs & pricing (per 1M tokens)

| Provider | Model | Input | Cached | Output |
|---|---|---|---|---|
| deepseek | deepseek-v4-flash | $0.14 | $0.003 | $0.28 |
| xai | grok-4.5 (<200k prompt) | $2.00 | $0.30 | $6.00 |
| meta | muse-spark-1.2-contributor | $0.10 | $0.002 | $0.20 |

## Caveats

- Cost accounting was fixed after these runs: AI SDK v7 reports cache hits in
  `usage.inputTokenDetails.noCacheTokens/cacheReadTokens`, which `tokenUsage` didn't read —
  every input token was billed as cache-miss. Measured: a repeated grok prompt got 99.9% cache
  hits. The table marks affected estimates `est.¹`; grok shows the actual bill. Historical
  result JSONs keep the wrong token splits (raw details weren't persisted); re-run for exact numbers.
- Verifier corrections above: chip-token rule (tight/fit_list now chip **OR** component alias) and
  decline anyOf (`specific`, `open-ended` added) — both fixed in code after these runs.
- `answerSnippet` (≤200 chars of the final answer) persisted since 2026-08-09T01:56Z; earlier
  result files lack it.
- Case pass/fail is brittle at 5 runs (`minPassRate` 1.0); per-run rates are the signal.

## Result artifacts

`scripts/bench-results/regression-<ts>.json` per invocation:

- deepseek default: `...01-45-12-152Z`, `...01-46-27-603Z`
- grok low: `...01-47-01-989Z`, `...01-47-40-363Z`
- deepseek high: `...02-08-31-080Z`, `...02-10-16-346Z`
- muse med: `...02-15-00-653Z`, `...02-17-55-562Z`
- muse high: `...02-26-15-284Z`, `...02-29-10-767Z`
