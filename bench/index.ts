/**
 * Benchmarks `@laplace.live/facet` against `search-string` and
 * `search-query-parser` across a few representative query shapes.
 *
 * Run with `bun run bench`. Optionally pass a regex to filter groups by
 * name (matched against the full group label):
 *   bun run bench '^parse —'    # only the pure-parse groups
 *   bun run bench round-trip    # only round-trip groups
 *   bun run bench long          # only the "long" scenario
 *
 * Notes on fairness:
 * - `search-query-parser` requires `keywords` to be declared up front; the
 *   other two libraries auto-detect them from `key:value` pairs. Each
 *   scenario passes the matching keyword list, so sqp is benched in its
 *   intended-use mode rather than as a no-op text passthrough.
 * - We benchmark each library with its *default* output shape — no special
 *   options are tuned to make any one of them faster than its real-world
 *   defaults. The pre-bench shape preview makes the differences visible.
 * - `do_not_optimize` is used to keep V8/JSC/etc. from eliminating the
 *   benchmark body as dead code. mitata's recomputed-parameter pattern
 *   (the heavier `function* () { yield { [0](){…}, bench(p){…} } }` form)
 *   would be more defensive against loop-invariant-code-motion, but the
 *   parsers are stateful enough that JIT can't prove purity here, so the
 *   simple form is sufficient and far more readable.
 */
import { bench, do_not_optimize, group, run, summary } from 'mitata'
import { parse as sqpParse, stringify as sqpStringify } from 'search-query-parser'
import SearchString from 'search-string'

import Facet from '../src'
import { scenarios } from './scenarios'

console.log('Benchmark: @laplace.live/facet vs search-string vs search-query-parser')
console.log('-----------------------------------------------------------------------\n')

console.log('Scenarios:')
for (const s of scenarios) {
  console.log(`  • ${s.name.padEnd(10)} (${s.query.length.toString().padStart(3)} chars) — ${s.notes}`)
}
console.log()

const sample = scenarios[0]
if (sample) {
  console.log(`Output shape preview (scenario: "${sample.name}")`)
  console.log(`  query: ${JSON.stringify(sample.query)}\n`)
  const facetOut = Facet.parse(sample.query).getParsedQuery()
  const ssOut = SearchString.parse(sample.query).getParsedQuery()
  const sqpOut = sqpParse(sample.query, { keywords: sample.keywords })
  console.log(`  @laplace.live/facet  → ${JSON.stringify(facetOut)}`)
  console.log(`  search-string        → ${JSON.stringify(ssOut)}`)
  console.log(`  search-query-parser  → ${JSON.stringify(sqpOut)}`)
}
console.log(
  [
    '',
    'Caveats — the three libraries do not produce identical results:',
    '  • search-query-parser returns single strings for single-value keys',
    '    (e.g. `to: "me"`) and only switches to arrays when commas are used.',
    '    Facet and search-string always return arrays.',
    '  • search-query-parser concatenates text into one string by default',
    '    (set `tokenize: true` to get per-word arrays). Negated bare words',
    '    end up under `exclude.text` rather than as separate negated segments.',
    '  • search-query-parser allocates an `offsets` array on every parse',
    '    (set `offsets: false` to skip it). Facet and search-string never do.',
    '  • search-query-parser splits quoted operands on inner commas',
    '    (e.g. `subject:"Q1 planning, please review"` becomes two values),',
    '    which Facet and search-string both preserve verbatim.',
    'Read the numbers below as "time to produce each library\'s default output",',
    'not "time to produce the same output".',
    '',
  ].join('\n')
)

// mitata's `run({ filter })` only matches bench names (e.g.
// `@laplace.live/facet`), which is the wrong axis for filtering by
// scenario or operation. We filter at the group level instead by simply
// skipping `group()` calls that don't match the regex.
const filterArg = process.argv[2]
const filter = filterArg ? new RegExp(filterArg) : null
if (filter) console.log(`(group filter: /${filter.source}/)\n`)

function maybeGroup(name: string, fn: () => void): void {
  if (filter && !filter.test(name)) return
  group(name, fn)
}

for (const scenario of scenarios) {
  // Hoisted so the options object is not re-allocated on every iteration.
  const sqpOpts = { keywords: scenario.keywords }

  maybeGroup(`parse — ${scenario.name}`, () => {
    summary(() => {
      bench('@laplace.live/facet', () => do_not_optimize(Facet.parse(scenario.query)))
      bench('search-string', () => do_not_optimize(SearchString.parse(scenario.query)))
      bench('search-query-parser', () => do_not_optimize(sqpParse(scenario.query, sqpOpts)))
    })
  })
}

for (const scenario of scenarios) {
  const sqpOpts = { keywords: scenario.keywords }

  maybeGroup(`parse + read structured query — ${scenario.name}`, () => {
    summary(() => {
      bench('@laplace.live/facet', () => do_not_optimize(Facet.parse(scenario.query).getParsedQuery()))
      bench('search-string', () => do_not_optimize(SearchString.parse(scenario.query).getParsedQuery()))
      // sqp.parse already returns the structured object, so a separate
      // "read" step would be a no-op — the bench captures the same step.
      bench('search-query-parser', () => do_not_optimize(sqpParse(scenario.query, sqpOpts)))
    })
  })
}

for (const scenario of scenarios) {
  const sqpOpts = { keywords: scenario.keywords }

  maybeGroup(`round-trip (parse → string) — ${scenario.name}`, () => {
    summary(() => {
      bench('@laplace.live/facet', () => do_not_optimize(Facet.parse(scenario.query).toString()))
      bench('search-string', () => do_not_optimize(SearchString.parse(scenario.query).toString()))
      bench('search-query-parser', () => do_not_optimize(sqpStringify(sqpParse(scenario.query, sqpOpts), sqpOpts)))
    })
  })
}

await run()
