/**
 * Numeric comparator support for facet condition values.
 *
 * The base parser (`Facet.parse`) only produces opaque `keyword:value`
 * conditions and substring text segments — it has no built-in concept of
 * numeric comparison. This module is a small, pure helper that turns a
 * comparison expression like `>30`, `<=10`, or `10..50` into a predicate
 * you can apply to a candidate number.
 *
 * It is intentionally decoupled from `Facet` so callers can opt into
 * numeric semantics on whichever conditions make sense for their domain
 * (e.g. `price`, `size`, `count`, `age`).
 */

/**
 * A predicate produced by `parseNumericComparator`. Returns `false` when the
 * candidate value is `undefined`, so callers can pass missing fields directly.
 */
export type NumericComparator = (value: number | undefined) => boolean

/**
 * Parse a numeric comparison expression into a predicate.
 *
 * Supported syntax (whitespace around operators is tolerated):
 *
 * - `30`        — exact match (===)
 * - `=30`       — exact match
 * - `>30`       — greater than
 * - `>=30`      — greater than or equal
 * - `<30`       — less than
 * - `<=30`      — less than or equal
 * - `10..50`    — inclusive range `[10, 50]`
 *
 * Decimals (`12.5`) and negative numbers (`-5`, `>-5`, `-10..10`) are
 * supported. Returns `null` for empty or unrecognized input so callers can
 * gracefully ignore the condition (e.g. while the user is mid-typing a query)
 * rather than treating it as "match nothing".
 *
 * @example
 * ```ts
 * const gte30 = parseNumericComparator('>=30')
 * gte30(50)        // true
 * gte30(10)        // false
 * gte30(undefined) // false (missing values never match)
 *
 * const range = parseNumericComparator('10..50')
 * range(25) // true
 *
 * parseNumericComparator('abc') // null (invalid syntax)
 * ```
 */
export function parseNumericComparator(raw: string): NumericComparator | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Range: `min..max` (inclusive)
  const rangeMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/)
  if (rangeMatch) {
    const min = Number(rangeMatch[1])
    const max = Number(rangeMatch[2])
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
  }

  // Comparison: `[op]number`, op defaults to `=`
  const compMatch = trimmed.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/)
  if (!compMatch) return null

  const op = compMatch[1] ?? '='
  const target = Number(compMatch[2])
  if (!Number.isFinite(target)) return null

  switch (op) {
    case '<':
      return value => typeof value === 'number' && Number.isFinite(value) && value < target
    case '<=':
      return value => typeof value === 'number' && Number.isFinite(value) && value <= target
    case '>':
      return value => typeof value === 'number' && Number.isFinite(value) && value > target
    case '>=':
      return value => typeof value === 'number' && Number.isFinite(value) && value >= target
    default:
      return value => typeof value === 'number' && Number.isFinite(value) && value === target
  }
}
