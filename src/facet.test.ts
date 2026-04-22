import { describe, expect, test } from 'bun:test'

import Facet from './facet'

function getConditionMap(facet: Facet) {
  const map: Record<string, { value: string; negated: boolean }[]> = {}
  facet.getConditionArray().forEach(({ keyword, value, negated }) => {
    const mapValue = { value, negated }
    if (map[keyword]) {
      map[keyword].push(mapValue)
    } else {
      map[keyword] = [mapValue]
    }
  })
  return map
}

function getNumKeywords(facet: Facet) {
  return Object.keys(getConditionMap(facet)).length
}

describe('Facet', () => {
  describe('parse', () => {
    describe('input handling', () => {
      test('returns empty result for missing, empty, whitespace, or null input', () => {
        // @ts-expect-error - TS doesn't like that we're not passing a string
        expect(Facet.parse().getConditionArray()).toEqual([])
        expect(Facet.parse('').getConditionArray()).toEqual([])
        expect(Facet.parse('   ').getConditionArray()).toEqual([])
        // @ts-expect-error - TS doesn't like that we're passing null
        expect(Facet.parse(null).getConditionArray()).toEqual([])
        // @ts-expect-error - TS doesn't like that we're passing null
        expect(Facet.parse(null).getParsedQuery()).toEqual({ exclude: {} })
      })

      test('keeps a dangling colon as an empty operand', () => {
        expect(Facet.parse('to:').getConditionArray()).toEqual([{ keyword: 'to', value: '', negated: false }])
      })

      test('treats an unmatched trailing quote as a literal text character', () => {
        const parsed = Facet.parse('quoted text"')
        expect(parsed.getTextSegments()).toEqual([
          { text: 'quoted', negated: false },
          { text: 'text"', negated: false },
        ])
      })
    })

    describe('conditions', () => {
      test('parses a basic key:value pair alongside text and a negated condition', () => {
        const parsed = Facet.parse('to:me -from:joe@acme.com foobar')
        expect(parsed.getTextSegments()).toEqual([{ text: 'foobar', negated: false }])
        expect(getNumKeywords(parsed)).toEqual(2)
        expect(getConditionMap(parsed).to).toEqual([{ value: 'me', negated: false }])
        expect(getConditionMap(parsed).from).toEqual([{ value: 'joe@acme.com', negated: true }])
      })

      test('parses comma-separated operands as multiple conditions for the same key', () => {
        const str = 'from:hi@mericsson.com,foo@gmail.com to:me subject:vacations date:1/10/2013-15/04/2014 photos'
        const parsed = Facet.parse(str)
        const conditionMap = getConditionMap(parsed)
        expect(getNumKeywords(parsed)).toEqual(4)
        expect(conditionMap.from).toEqual([
          { value: 'hi@mericsson.com', negated: false },
          { value: 'foo@gmail.com', negated: false },
        ])
        expect(conditionMap.date).toEqual([{ value: '1/10/2013-15/04/2014', negated: false }])
      })

      test('treats a dash inside a word as a literal character', () => {
        const parsed = Facet.parse('my-string op1:val')
        const conditionMap = getConditionMap(parsed)
        expect(parsed.getTextSegments()[0]).toEqual({ text: 'my-string', negated: false })
        expect(conditionMap.op1).toEqual([{ value: 'val', negated: false }])
      })
    })

    describe('text segments', () => {
      test('captures multiple bare text segments', () => {
        const parsed = Facet.parse('to:me foobar zoobar')
        expect(parsed.getTextSegments()).toEqual([
          { text: 'foobar', negated: false },
          { text: 'zoobar', negated: false },
        ])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).to).toEqual([{ value: 'me', negated: false }])
      })

      test('captures negation on individual text segments', () => {
        const parsed = Facet.parse('hello -big -fat is:condition world')
        expect(parsed.getTextSegments()).toEqual([
          { text: 'hello', negated: false },
          { text: 'big', negated: true },
          { text: 'fat', negated: true },
          { text: 'world', negated: false },
        ])
        expect(getNumKeywords(parsed)).toEqual(1)
      })

      test('captures bare quoted strings as text segments', () => {
        const parsed = Facet.parse('"string one" "string two"')
        expect(parsed.getTextSegments()).toEqual([
          { text: 'string one', negated: false },
          { text: 'string two', negated: false },
        ])
        expect(getNumKeywords(parsed)).toEqual(0)
      })
    })

    describe('quoting', () => {
      test('a quoted operand may contain spaces', () => {
        const parsed = Facet.parse('to:"Marcus Ericsson" foobar')
        expect(parsed.getTextSegments()).toEqual([{ text: 'foobar', negated: false }])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).to).toEqual([{ value: 'Marcus Ericsson', negated: false }])
      })

      test('a quoted operand may contain commas without splitting into multiple values', () => {
        const parsed = Facet.parse('from:hello@mixmax.com template:"recruiting: reject email, inexperience"')
        expect(parsed.getTextSegments()).toEqual([])
        expect(getNumKeywords(parsed)).toEqual(2)
        expect(getConditionMap(parsed).template).toEqual([
          { value: 'recruiting: reject email, inexperience', negated: false },
        ])
      })

      test('a quoted text segment may contain a colon', () => {
        const parsed = Facet.parse('op1:value "semi:string"')
        expect(parsed.getTextSegments()).toEqual([{ text: 'semi:string', negated: false }])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).op1).toEqual([{ value: 'value', negated: false }])
      })

      test('an unmatched single quote inside a text segment is treated as a literal', () => {
        const parsed = Facet.parse("foo'bar from:aes")
        expect(parsed.getTextSegments()).toEqual([{ text: "foo'bar", negated: false }])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).from).toEqual([{ value: 'aes', negated: false }])
      })

      test('an unmatched single quote inside an operand is treated as a literal', () => {
        const parsed = Facet.parse("foobar from:ae's")
        expect(parsed.getTextSegments()).toEqual([{ text: 'foobar', negated: false }])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).from).toEqual([{ value: "ae's", negated: false }])
        expect(parsed.toString()).toEqual("from:ae's foobar")
      })

      test('a single-quoted segment is preserved verbatim inside a double-quoted operand', () => {
        const parsed = Facet.parse('foobar template:" hello \'there\': other"')
        expect(parsed.getTextSegments()).toEqual([{ text: 'foobar', negated: false }])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).template).toEqual([{ value: " hello 'there': other", negated: false }])
        expect(parsed.toString()).toEqual('template:" hello \'there\': other" foobar')
      })

      test('escaped double quote inside a double-quoted operand', () => {
        const parsed = Facet.parse('foobar template:" hello \\"there\\": other"')
        expect(parsed.getTextSegments()).toEqual([{ text: 'foobar', negated: false }])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(getConditionMap(parsed).template).toEqual([{ value: ' hello "there": other', negated: false }])
        expect(parsed.toString()).toEqual('template:" hello \\"there\\": other" foobar')
      })

      test('escaped single quote inside a single-quoted operand', () => {
        // Source string: from:'it\'s me' — backslash escapes the inner apostrophe so
        // the surrounding single quotes still pair up as a single quoted operand.
        const parsed = Facet.parse("from:'it\\'s me'")
        expect(parsed.getConditionArray()).toEqual([{ keyword: 'from', value: "it's me", negated: false }])
        // toString re-quotes with double quotes because the operand contains a space.
        expect(parsed.toString()).toEqual('from:"it\'s me"')
      })
    })

    describe('transformTextToConditions', () => {
      test('a matching transform converts a text segment into a condition', () => {
        const transform = (text: string) => (text === '<a@b.com>' ? { key: 'to', value: 'a@b.com' } : null)
        const parsed = Facet.parse('<a@b.com> to:c@d.com', [transform])
        expect(parsed.getTextSegments()).toEqual([])
        expect(getNumKeywords(parsed)).toEqual(1)
        expect(parsed.getParsedQuery().to).toEqual(['a@b.com', 'c@d.com'])
      })

      test('a non-matching transform leaves the text segment intact', () => {
        // Regression: previously crashed with `Cannot destructure property 'key' from null`
        // whenever a text segment did not match the transform.
        const transform = (text: string) => (text === '<a@b.com>' ? { key: 'to', value: 'a@b.com' } : null)

        const mixed = Facet.parse('<a@b.com> hello to:c@d.com', [transform])
        expect(mixed.getTextSegments()).toEqual([{ text: 'hello', negated: false }])
        expect(mixed.getParsedQuery().to).toEqual(['a@b.com', 'c@d.com'])

        const onlyNonMatching = Facet.parse('hello world', [transform])
        expect(onlyNonMatching.getTextSegments()).toEqual([
          { text: 'hello', negated: false },
          { text: 'world', negated: false },
        ])
        expect(onlyNonMatching.getConditionArray()).toEqual([])
      })

      test('all transforms run on each text segment', () => {
        const tagTransform = (text: string) => (text.startsWith('#') ? { key: 'tag', value: text.slice(1) } : null)
        const mentionTransform = (text: string) =>
          text.startsWith('@') ? { key: 'mention', value: text.slice(1) } : null

        const parsed = Facet.parse('hello #urgent @alice', [tagTransform, mentionTransform])

        expect(parsed.getTextSegments()).toEqual([{ text: 'hello', negated: false }])
        expect(parsed.getParsedQuery().tag).toEqual(['urgent'])
        expect(parsed.getParsedQuery().mention).toEqual(['alice'])
      })

      test('transforms returning empty key or value are ignored and the text is kept', () => {
        const emptyKey = (text: string) => ({ key: '', value: text })
        const emptyValue = (_text: string) => ({ key: 'noop', value: '' })

        const parsed = Facet.parse('hello', [emptyKey, emptyValue])
        expect(parsed.getConditionArray()).toEqual([])
        expect(parsed.getTextSegments()).toEqual([{ text: 'hello', negated: false }])
      })
    })
  })

  describe('getParsedQuery', () => {
    test('groups positive conditions under their keyword', () => {
      const parsed = Facet.parse('to:a to:b from:c')
      const query = parsed.getParsedQuery()
      expect(query.to).toEqual(['a', 'b'])
      expect(query.from).toEqual(['c'])
      expect(query.exclude).toEqual({})
    })

    test('groups negated conditions under exclude', () => {
      const parsed = Facet.parse('-to:foo@foo.com,foo2@foo.com text')
      expect(parsed.getParsedQuery().exclude.to).toEqual(['foo@foo.com', 'foo2@foo.com'])
    })

    test('returns both include and exclude buckets for the same key', () => {
      const parsed = Facet.parse('to:a -to:b to:c -to:d')
      const query = parsed.getParsedQuery()
      expect(query.to).toEqual(['a', 'c'])
      expect(query.exclude.to).toEqual(['b', 'd'])
    })
  })

  describe('addEntry', () => {
    test('appends conditions and invalidates the toString cache', () => {
      const parsed = Facet.parse('to:me')
      // Prime the cache so we can prove addEntry busts it.
      expect(parsed.toString()).toEqual('to:me')
      // @ts-expect-error - TS doesn't like that we're accessing a private property
      expect(parsed.isStringDirty).toEqual(false)

      parsed.addEntry('to', 'you', false)
      parsed.addEntry('from', 'spam', true)

      // @ts-expect-error - TS doesn't like that we're accessing a private property
      expect(parsed.isStringDirty).toEqual(true)
      expect(parsed.getConditionArray()).toEqual([
        { keyword: 'to', value: 'me', negated: false },
        { keyword: 'to', value: 'you', negated: false },
        { keyword: 'from', value: 'spam', negated: true },
      ])
      expect(parsed.toString()).toEqual('to:me,you -from:spam')
      // Re-read after rebuild to make sure the cache is consistent.
      expect(parsed.toString()).toEqual('to:me,you -from:spam')
    })
  })

  describe('removeKeyword', () => {
    test('removes all entries with the matching keyword and negation', () => {
      const parsed = Facet.parse('op1:value op1:value2 -op3:value text')
      parsed.removeKeyword('op1', false)
      expect(parsed.getConditionArray()).toEqual([{ keyword: 'op3', value: 'value', negated: true }])
      expect(parsed.toString()).toEqual('-op3:value text')
    })

    test('distinguishes by negated flag', () => {
      const parsed = Facet.parse('-op3:value text')
      // Trying to remove the non-negated variant leaves the negated entry in place.
      parsed.removeKeyword('op3', false)
      expect(parsed.getConditionArray()).toEqual([{ keyword: 'op3', value: 'value', negated: true }])
      // Removing with negated=true clears it.
      parsed.removeKeyword('op3', true)
      expect(parsed.getConditionArray()).toEqual([])
      expect(parsed.toString()).toEqual('text')
    })

    test('is a no-op when the keyword is absent', () => {
      const parsed = Facet.parse('to:me')
      expect(parsed.toString()).toEqual('to:me')

      parsed.removeKeyword('from', false)

      expect(parsed.toString()).toEqual('to:me')
      expect(parsed.getConditionArray()).toEqual([{ keyword: 'to', value: 'me', negated: false }])
    })
  })

  describe('removeEntry', () => {
    test('removes a single matching entry', () => {
      const parsed = Facet.parse('foo:bar,baz')
      expect(parsed.getParsedQuery().foo).toEqual(['bar', 'baz'])

      parsed.removeEntry('foo', 'baz', false)

      expect(parsed.getParsedQuery().foo).toEqual(['bar'])
    })

    test('removes only the first match when duplicates exist', () => {
      const parsed = Facet.parse('-foo:bar,baz,bar,bar,bar')
      expect(parsed.getParsedQuery().exclude.foo).toEqual(['bar', 'baz', 'bar', 'bar', 'bar'])

      parsed.removeEntry('foo', 'bar', true)

      expect(parsed.getParsedQuery().exclude.foo).toEqual(['baz', 'bar', 'bar', 'bar'])
    })

    test('is a no-op when the entry is not found and leaves the cache valid', () => {
      const parsed = Facet.parse('foo:bar')
      expect(parsed.getParsedQuery().foo).toEqual(['bar'])
      expect(parsed.toString()).toEqual('foo:bar')
      // @ts-expect-error - TS doesn't like that we're accessing a private property
      expect(parsed.isStringDirty).toEqual(false)

      parsed.removeEntry('foo', 'qux', false)

      expect(parsed.getParsedQuery().foo).toEqual(['bar'])
      // @ts-expect-error - TS doesn't like that we're accessing a private property
      expect(parsed.isStringDirty).toEqual(false)
    })
  })

  describe('clone', () => {
    test('produces an independent instance', () => {
      const original = Facet.parse('to:me foo')
      const copy = original.clone()

      copy.addEntry('from', 'you', true)
      copy.removeKeyword('to', false)

      expect(original.toString()).toEqual('to:me foo')
      expect(original.getConditionArray()).toEqual([{ keyword: 'to', value: 'me', negated: false }])
      expect(copy.toString()).toEqual('-from:you foo')
      expect(copy.getConditionArray()).toEqual([{ keyword: 'from', value: 'you', negated: true }])
      // Both instances retain the same parsed text segments.
      expect(original.getTextSegments()).toEqual([{ text: 'foo', negated: false }])
      expect(copy.getTextSegments()).toEqual([{ text: 'foo', negated: false }])
    })
  })

  describe('toString', () => {
    const complexInput = 'op1:value op1:value2 op2:"multi, \'word\', value" sometext -op3:value more text'
    const complexExpected = 'op1:value,value2 op2:"multi, \'word\', value" -op3:value sometext more text'

    test('serializes a complex query with grouping, negation, and quoted values', () => {
      const parsed = Facet.parse(complexInput)

      expect(parsed.getTextSegments()).toEqual([
        { text: 'sometext', negated: false },
        { text: 'more', negated: false },
        { text: 'text', negated: false },
      ])
      expect(getNumKeywords(parsed)).toEqual(3)
      expect(parsed.getConditionArray()).toEqual([
        { keyword: 'op1', value: 'value', negated: false },
        { keyword: 'op1', value: 'value2', negated: false },
        { keyword: 'op2', value: "multi, 'word', value", negated: false },
        { keyword: 'op3', value: 'value', negated: true },
      ])
      expect(parsed.toString()).toEqual(complexExpected)
    })

    test('caches the result and invalidates on mutation', () => {
      const parsed = Facet.parse(complexInput)
      // Build the cache.
      expect(parsed.toString()).toEqual(complexExpected)
      // Cached read returns the same string.
      expect(parsed.toString()).toEqual(complexExpected)

      parsed.removeKeyword('op1', false)
      expect(parsed.toString()).toEqual('op2:"multi, \'word\', value" -op3:value sometext more text')
    })

    test('groups two negative conditions written separately into one negated key', () => {
      const parsed = Facet.parse('-to:foo@foo.com -to:foo2@foo.com text')
      expect(parsed.getParsedQuery().exclude.to).toEqual(['foo@foo.com', 'foo2@foo.com'])
      expect(parsed.toString()).toEqual('-to:foo@foo.com,foo2@foo.com text')
    })

    test('preserves a comma-grouped negation as written', () => {
      const parsed = Facet.parse('-to:foo@foo.com,foo2@foo.com text')
      expect(parsed.getParsedQuery().exclude.to).toEqual(['foo@foo.com', 'foo2@foo.com'])
      expect(parsed.toString()).toEqual('-to:foo@foo.com,foo2@foo.com text')
    })
  })
})
