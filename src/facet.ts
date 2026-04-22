import { getQuotePairMap } from './utils'

// State tokens
const RESET = 'RESET'
const IN_OPERAND = 'IN_OPERAND'
const IN_TEXT = 'IN_TEXT'
const SINGLE_QUOTE = 'SINGLE_QUOTE'
const DOUBLE_QUOTE = 'DOUBLE_QUOTE'

// Shared empty quote-pair map used when the input contains no quote
// characters. Frozen because the parser only reads from it.
const EMPTY_QUOTE_PAIR_MAP = Object.freeze({ single: {}, double: {} }) as {
  single: Record<number, boolean>
  double: Record<number, boolean>
}

// Hoisted regex so toString doesn't recompile it on every value.
const DOUBLE_QUOTE_RE = /"/g

export interface Condition {
  keyword: string
  value: string
  negated: boolean
}

export interface TextSegment {
  text: string
  negated: boolean
}

export interface ParsedQuery {
  [key: string]: string[] | Record<string, string[]>
  exclude: Record<string, string[]>
}

/**
 * **Facet** is a parsed search string which allows you to fetch conditions
 * and text being searched.
 */
export default class Facet {
  private conditionArray: Condition[]
  private textSegments: TextSegment[]
  private string: string
  private isStringDirty: boolean

  /**
   * Not intended for public use. API could change.
   */
  constructor(conditionArray: Condition[], textSegments: TextSegment[]) {
    this.conditionArray = conditionArray
    this.textSegments = textSegments
    this.string = ''
    this.isStringDirty = true
  }

  /**
   * @param str - String to parse e.g. `'to:me -from:joe@acme.com foobar'`.
   * @param transformTextToConditions - Array of functions to transform text into conditions.
   * @returns An instance of the **Facet** class.
   */
  static parse(
    str: string,
    transformTextToConditions: Array<(text: string) => { key: string; value: string } | null | undefined> = []
  ): Facet {
    if (!str) str = ''
    const conditionArray: Condition[] = []
    const textSegments: TextSegment[] = []

    const addCondition = (key: string, value: string, negated: boolean) => {
      const arrayEntry: Condition = { keyword: key, value, negated }
      conditionArray.push(arrayEntry)
    }

    const addTextSegment = (text: string, negated: boolean) => {
      let hasTransform = false
      transformTextToConditions.forEach(transform => {
        const result = transform(text)
        if (result?.key && result?.value) {
          addCondition(result.key, result.value, negated)
          hasTransform = true
        }
      })
      if (!hasTransform) {
        textSegments.push({ text, negated })
      }
    }

    let state: string = RESET
    let currentOperand = ''
    let isNegated = false
    let currentText = ''
    let quoteState: string = RESET
    let prevChar = ''

    const performReset = () => {
      state = RESET
      quoteState = RESET
      currentOperand = ''
      currentText = ''
      isNegated = false
      prevChar = ''
    }

    // Terminology, in this example: 'to:joe@acme.com'
    // 'to' is the operator
    // 'joe@acme.com' is the operand
    // 'to:joe@acme.com' is the condition

    performReset()

    // Skip the quote-pair pre-scan when the input contains no quotes —
    // it's a full O(n) pass, and the vast majority of real queries have
    // no quote characters at all. `String.prototype.indexOf` is heavily
    // vectorized in V8 and bails out far faster than the JS scanner.
    const hasQuote = str.indexOf('"') !== -1 || str.indexOf("'") !== -1
    const quotePairMap = hasQuote ? getQuotePairMap(str) : EMPTY_QUOTE_PAIR_MAP

    for (let i = 0; i < str.length; i++) {
      const char = str[i]
      if (char === ' ') {
        if (state === IN_OPERAND) {
          if (quoteState !== RESET) {
            currentOperand += char
          } else {
            addCondition(currentText, currentOperand, isNegated)
            performReset()
          }
        } else if (state === IN_TEXT) {
          if (quoteState !== RESET) {
            currentText += char
          } else {
            addTextSegment(currentText, isNegated)
            performReset()
          }
        }
      } else if (char === ',' && state === IN_OPERAND && quoteState === RESET) {
        addCondition(currentText, currentOperand, isNegated)
        // No reset here because we are still evaluating operands for the same operator
        currentOperand = ''
      } else if (char === '-' && state !== IN_OPERAND && state !== IN_TEXT) {
        isNegated = true
      } else if (char === ':' && quoteState === RESET) {
        if (state === IN_OPERAND) {
          // If we're in an operand, just push the string on.
          currentOperand += char
        } else if (state === IN_TEXT) {
          // Skip this char, move states into IN_OPERAND,
          state = IN_OPERAND
        }
      } else if (char === '"' && prevChar !== '\\' && quoteState !== SINGLE_QUOTE) {
        if (quoteState === DOUBLE_QUOTE) {
          quoteState = RESET
        } else if (quotePairMap.double[i]) {
          quoteState = DOUBLE_QUOTE
        } else if (state === IN_OPERAND) {
          currentOperand += char
        } else {
          currentText += char
        }
      } else if (char === "'" && prevChar !== '\\' && quoteState !== DOUBLE_QUOTE) {
        if (quoteState === SINGLE_QUOTE) {
          quoteState = RESET
        } else if (quotePairMap.single[i]) {
          quoteState = SINGLE_QUOTE
        } else if (state === IN_OPERAND) {
          currentOperand += char
        } else {
          currentText += char
        }
      } else if (char !== '\\') {
        // Regular character..
        if (state === IN_OPERAND) {
          currentOperand += char
        } else {
          currentText += char
          state = IN_TEXT
        }
      }
      prevChar = char ?? ''
    }
    // End of string, add any last entries
    if (state === IN_TEXT) {
      addTextSegment(currentText, isNegated)
    } else if (state === IN_OPERAND) {
      addCondition(currentText, currentOperand, isNegated)
    }

    return new Facet(conditionArray, textSegments)
  }

  /**
   * @returns Conditions array, may contain multiple conditions for a particular key.
   */
  getConditionArray(): Condition[] {
    return this.conditionArray
  }

  /**
   * @returns Map of conditions and includes a special key `'exclude'`.
   * `'exclude'` itself is a map of conditions which were negated.
   */
  getParsedQuery(): ParsedQuery {
    const parsedQuery: ParsedQuery = { exclude: {} }
    this.conditionArray.forEach(condition => {
      if (condition.negated) {
        if (parsedQuery.exclude[condition.keyword]) {
          parsedQuery.exclude[condition.keyword]?.push(condition.value)
        } else {
          parsedQuery.exclude[condition.keyword] = [condition.value]
        }
      } else {
        const existing = parsedQuery[condition.keyword]
        if (Array.isArray(existing)) {
          existing.push(condition.value)
        } else {
          parsedQuery[condition.keyword] = [condition.value]
        }
      }
    })
    return parsedQuery
  }

  /**
   * @returns All text segments concatenated together joined by a space.
   * If a text segment is negated, it is preceded by a `-`.
   */
  getAllText(): string {
    return this.textSegments
      ? this.textSegments.map(({ text, negated }) => (negated ? `-${text}` : text)).join(' ')
      : ''
  }

  /**
   * @returns All text segment objects, negative or positive.
   * E.g., `{ text: 'foobar', negated: false }`
   */
  getTextSegments(): TextSegment[] {
    return this.textSegments
  }

  /**
   * Removes keyword-negated pair that matches inputted.
   * Only removes if entry has same keyword/negated combo.
   * @param keywordToRemove - Keyword to remove.
   * @param negatedToRemove - Whether or not the keyword removed is negated.
   */
  removeKeyword(keywordToRemove: string, negatedToRemove: boolean): void {
    this.conditionArray = this.conditionArray.filter(
      ({ keyword, negated }) => keywordToRemove !== keyword || negatedToRemove !== negated
    )
    this.isStringDirty = true
  }

  /**
   * Adds a new entry to search string. Does not dedupe against existing entries.
   * @param keyword - Keyword to add.
   * @param value - Value for respective keyword.
   * @param negated - Whether or not keyword/value pair should be negated.
   */
  addEntry(keyword: string, value: string, negated: boolean): void {
    this.conditionArray.push({
      keyword,
      value,
      negated,
    })
    this.isStringDirty = true
  }

  /**
   * Removes an entry from the search string. If more than one entry with the same settings is found,
   * it removes the first entry matched.
   *
   * @param keyword - Keyword to remove.
   * @param value - Value for respective keyword.
   * @param negated - Whether or not keyword/value pair is negated.
   */
  removeEntry(keyword: string, value: string, negated: boolean): void {
    const index = this.conditionArray.findIndex(entry => {
      return entry.keyword === keyword && entry.value === value && entry.negated === negated
    })

    if (index === -1) return

    this.conditionArray.splice(index, 1)
    this.isStringDirty = true
  }

  /**
   * @returns A new instance of this class based on current data.
   */
  clone(): Facet {
    return new Facet([...this.conditionArray], [...this.textSegments])
  }

  /**
   * @returns Returns this instance synthesized to a string format.
   * Example string: `'to:me -from:joe@acme.com foobar'`
   */
  toString(): string {
    if (this.isStringDirty) {
      // Group keyword, negated pairs as keys
      const conditionGroups: Record<string, string[]> = {}
      for (const { keyword, value, negated } of this.conditionArray) {
        const groupKey = negated ? `-${keyword}` : keyword
        const existing = conditionGroups[groupKey]
        if (existing) existing.push(value)
        else conditionGroups[groupKey] = [value]
      }
      // Build conditionStr
      let conditionStr = ''
      for (const groupKey in conditionGroups) {
        const values = conditionGroups[groupKey]
        if (!values) continue
        const safeValues: string[] = []
        for (const v of values) {
          if (!v) continue
          // Three vectorized indexOf scans beat one JS char loop in V8
          // for the overwhelmingly common case of "value contains none of
          // these chars". Only fall back to replace() when we actually
          // need to escape inner double quotes.
          const hasDoubleQuote = v.indexOf('"') !== -1
          const needsQuote = hasDoubleQuote || v.indexOf(' ') !== -1 || v.indexOf(',') !== -1
          const safe = hasDoubleQuote ? v.replace(DOUBLE_QUOTE_RE, '\\"') : v
          safeValues.push(needsQuote ? `"${safe}"` : safe)
        }
        if (safeValues.length > 0) {
          conditionStr += ` ${groupKey}:${safeValues.join(',')}`
        }
      }
      this.string = `${conditionStr} ${this.getAllText()}`.trim()
      this.isStringDirty = false
    }
    return this.string
  }
}
