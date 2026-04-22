import { describe, expect, test } from 'bun:test'

import { type NumericComparator, parseNumericComparator } from './numeric-comparator'

/**
 * Asserts that the input parses to a non-null comparator and returns it.
 * Used to keep tests free of non-null assertions.
 */
function expectComparator(input: string): NumericComparator {
  const comparator = parseNumericComparator(input)
  if (comparator === null) {
    throw new Error(`Expected '${input}' to parse to a comparator`)
  }
  return comparator
}

describe('parseNumericComparator', () => {
  describe('invalid input', () => {
    test('returns null for empty/whitespace input', () => {
      expect(parseNumericComparator('')).toBeNull()
      expect(parseNumericComparator('   ')).toBeNull()
    })

    test('returns null for non-numeric input', () => {
      expect(parseNumericComparator('abc')).toBeNull()
      expect(parseNumericComparator('foo123')).toBeNull()
      expect(parseNumericComparator('30bar')).toBeNull()
    })

    test('returns null for incomplete operator-only input', () => {
      expect(parseNumericComparator('>')).toBeNull()
      expect(parseNumericComparator('<=')).toBeNull()
      expect(parseNumericComparator('=')).toBeNull()
    })

    test('returns null for malformed range', () => {
      expect(parseNumericComparator('..')).toBeNull()
      expect(parseNumericComparator('10..')).toBeNull()
      expect(parseNumericComparator('..50')).toBeNull()
      expect(parseNumericComparator('10..foo')).toBeNull()
    })

    test('returns null for unknown operator combinations', () => {
      expect(parseNumericComparator('!=30')).toBeNull()
      expect(parseNumericComparator('==30')).toBeNull()
      expect(parseNumericComparator('><30')).toBeNull()
    })

    test('returns null for unsupported number formats', () => {
      // Explicit `+` prefix is not part of the grammar (only `-` is).
      expect(parseNumericComparator('+30')).toBeNull()
      expect(parseNumericComparator('=+30')).toBeNull()
      // Scientific notation is not supported.
      expect(parseNumericComparator('1e3')).toBeNull()
      expect(parseNumericComparator('>1e3')).toBeNull()
      // Hex / binary / octal literals are not supported either.
      expect(parseNumericComparator('0x10')).toBeNull()
    })
  })

  describe('exact match', () => {
    test('bare number matches exactly', () => {
      const eq30 = expectComparator('30')
      expect(eq30(30)).toBe(true)
      expect(eq30(30.0)).toBe(true)
      expect(eq30(29.999)).toBe(false)
      expect(eq30(31)).toBe(false)
    })

    test('explicit `=` operator matches exactly', () => {
      const eq30 = expectComparator('=30')
      expect(eq30(30)).toBe(true)
      expect(eq30(31)).toBe(false)
    })

    test('decimals match exactly', () => {
      const eqHalf = expectComparator('0.5')
      expect(eqHalf(0.5)).toBe(true)
      expect(eqHalf(0.4)).toBe(false)
    })
  })

  describe('comparison operators', () => {
    test('`>` is strict greater than', () => {
      const gt30 = expectComparator('>30')
      expect(gt30(31)).toBe(true)
      expect(gt30(30)).toBe(false)
      expect(gt30(29)).toBe(false)
    })

    test('`>=` is greater than or equal', () => {
      const gte30 = expectComparator('>=30')
      expect(gte30(31)).toBe(true)
      expect(gte30(30)).toBe(true)
      expect(gte30(29)).toBe(false)
    })

    test('`<` is strict less than', () => {
      const lt30 = expectComparator('<30')
      expect(lt30(29)).toBe(true)
      expect(lt30(30)).toBe(false)
      expect(lt30(31)).toBe(false)
    })

    test('`<=` is less than or equal', () => {
      const lte30 = expectComparator('<=30')
      expect(lte30(29)).toBe(true)
      expect(lte30(30)).toBe(true)
      expect(lte30(31)).toBe(false)
    })

    test('whitespace between operator and number is tolerated', () => {
      const gte30 = expectComparator('>= 30')
      expect(gte30(30)).toBe(true)
      expect(gte30(29)).toBe(false)
    })

    test('leading/trailing whitespace in input is tolerated', () => {
      const gte30 = expectComparator('  >=30  ')
      expect(gte30(30)).toBe(true)
    })
  })

  describe('range syntax', () => {
    test('`a..b` is inclusive on both ends', () => {
      const range = expectComparator('10..50')
      expect(range(10)).toBe(true)
      expect(range(50)).toBe(true)
      expect(range(30)).toBe(true)
      expect(range(9.999)).toBe(false)
      expect(range(50.001)).toBe(false)
    })

    test('inverted range never matches', () => {
      const inverted = expectComparator('50..10')
      expect(inverted(10)).toBe(false)
      expect(inverted(50)).toBe(false)
      expect(inverted(30)).toBe(false)
    })

    test('range with decimals', () => {
      const range = expectComparator('1.5..2.5')
      expect(range(2.0)).toBe(true)
      expect(range(1.5)).toBe(true)
      expect(range(2.5)).toBe(true)
      expect(range(1.49)).toBe(false)
    })

    test('range with surrounding whitespace around `..`', () => {
      const range = expectComparator('10 .. 50')
      expect(range(30)).toBe(true)
    })

    test('single-value range matches only the exact value', () => {
      const range = expectComparator('5..5')
      expect(range(5)).toBe(true)
      expect(range(4.999)).toBe(false)
      expect(range(5.001)).toBe(false)
    })
  })

  describe('negative numbers', () => {
    test('bare negative number matches exactly', () => {
      const eqNeg5 = expectComparator('-5')
      expect(eqNeg5(-5)).toBe(true)
      expect(eqNeg5(5)).toBe(false)
    })

    test('comparison against negative number', () => {
      const gtNeg5 = expectComparator('>-5')
      expect(gtNeg5(-4)).toBe(true)
      expect(gtNeg5(-5)).toBe(false)
      expect(gtNeg5(-6)).toBe(false)
      expect(gtNeg5(0)).toBe(true)
    })

    test('range spanning zero', () => {
      const range = expectComparator('-10..10')
      expect(range(0)).toBe(true)
      expect(range(-10)).toBe(true)
      expect(range(10)).toBe(true)
      expect(range(-11)).toBe(false)
      expect(range(11)).toBe(false)
    })
  })

  describe('candidate value handling', () => {
    test('undefined candidate never matches (positive predicates)', () => {
      expect(expectComparator('>0')(undefined)).toBe(false)
      expect(expectComparator('<100')(undefined)).toBe(false)
      expect(expectComparator('=0')(undefined)).toBe(false)
      expect(expectComparator('0..100')(undefined)).toBe(false)
    })

    test('NaN candidate never matches', () => {
      expect(expectComparator('>0')(Number.NaN)).toBe(false)
      expect(expectComparator('<100')(Number.NaN)).toBe(false)
      expect(expectComparator('0..100')(Number.NaN)).toBe(false)
    })

    test('Infinity candidate never matches (require finite values)', () => {
      expect(expectComparator('>0')(Number.POSITIVE_INFINITY)).toBe(false)
      expect(expectComparator('<100')(Number.NEGATIVE_INFINITY)).toBe(false)
    })
  })
})
