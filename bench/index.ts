/**
 * Benchmarks `@laplace.live/facet` against `search-string` and
 * `search-query-parser` across a few representative query shapes.
 *
 * Run with `bun run bench`.
 *
 * Notes on fairness:
 * - `search-query-parser` requires `keywords` to be declared up front; the
 *   other two libraries auto-detect them from `key:value` pairs. Each
 *   scenario passes the matching keyword list.
 * - We benchmark with each library's *default* output shape — no special
 *   options to make any one of them faster than its real-world defaults.
 * - `do_not_optimize` is used to keep V8/JSC/etc. from eliminating the
 *   benchmark body as dead code.
 */
import { bench, do_not_optimize, group, run, summary } from 'mitata'
import { parse as sqpParse, stringify as sqpStringify } from 'search-query-parser'
import SearchString from 'search-string'

import Facet from '../src'
import { scenarios } from './scenarios'

console.log('Benchmark: @laplace.live/facet vs search-string vs search-query-parser')
console.log('-----------------------------------------------------------------------')

for (const scenario of scenarios) {
  group(`parse — ${scenario.name}`, () => {
    summary(() => {
      bench('@laplace.live/facet', () => do_not_optimize(Facet.parse(scenario.query)))
      bench('search-string', () => do_not_optimize(SearchString.parse(scenario.query)))
      bench('search-query-parser', () => do_not_optimize(sqpParse(scenario.query, { keywords: scenario.keywords })))
    })
  })
}

for (const scenario of scenarios) {
  group(`parse + read structured query — ${scenario.name}`, () => {
    summary(() => {
      bench('@laplace.live/facet', () => do_not_optimize(Facet.parse(scenario.query).getParsedQuery()))
      bench('search-string', () => do_not_optimize(SearchString.parse(scenario.query).getParsedQuery()))
      // `search-query-parser.parse` already returns the structured object,
      // so a separate "read" step would be a no-op.
      bench('search-query-parser', () => do_not_optimize(sqpParse(scenario.query, { keywords: scenario.keywords })))
    })
  })
}

for (const scenario of scenarios) {
  group(`round-trip (parse → string) — ${scenario.name}`, () => {
    summary(() => {
      bench('@laplace.live/facet', () => do_not_optimize(Facet.parse(scenario.query).toString()))
      bench('search-string', () => do_not_optimize(SearchString.parse(scenario.query).toString()))
      bench('search-query-parser', () => {
        const opts = { keywords: scenario.keywords }
        const parsed = sqpParse(scenario.query, opts)
        return do_not_optimize(sqpStringify(parsed, opts))
      })
    })
  })
}

await run()
