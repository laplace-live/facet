# @laplace.live/facet

Tiny parser for Gmail-style faceted search queries. Turn strings like
`to:me -from:joe@acme.com "project alpha" foobar` into structured conditions
and free-text segments — and serialize them back to a string when you're done.

- Zero runtime dependencies
- ESM only, ships with TypeScript types
- Conditions, negation, comma-grouping, single/double quoting, escapes
- Round-trips: `Facet.parse(s).toString()` produces a normalized, equivalent query
- Pluggable text transforms (e.g. `#tags`, `@mentions`, `<email@host>`)
- Optional numeric comparator helper for ranges like `>30`, `<=10`, `10..50`

## Install

```bash
bun add @laplace.live/facet
```

```bash
npm install @laplace.live/facet
# or: pnpm add @laplace.live/facet
# or: yarn add @laplace.live/facet
```

This package is ESM only and requires a runtime that supports modern ECMAScript
modules (Node 18+, Bun, Deno, modern browsers, or any bundler).

## Quick start

```ts
import Facet from "@laplace.live/facet";

const query = Facet.parse('to:me -from:joe@acme.com "project alpha" foobar');

query.getParsedQuery();
// {
//   to: ['me'],
//   exclude: { from: ['joe@acme.com'] }
// }

query.getTextSegments();
// [
//   { text: 'project alpha', negated: false },
//   { text: 'foobar', negated: false }
// ]

query.toString();
// 'to:me -from:joe@acme.com project alpha foobar'
```

## Query syntax

| Syntax                     | Meaning                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `keyword:value`            | A condition (filter)                                       |
| `-keyword:value`           | A negated condition (excluded)                             |
| `keyword:a,b,c`            | Comma-separated values for the same keyword                |
| `keyword:"a b"`            | Quoted operand — may contain spaces, commas, or colons     |
| `keyword:'a b'`            | Single quotes work too                                     |
| `keyword:"he said \"hi\""` | `\"` escapes a double quote inside a double-quoted operand |
| `foo bar`                  | Bare words become text segments                            |
| `-foo`                     | A negated text segment                                     |
| `"foo bar"`                | A quoted text segment is preserved as one unit             |

Notes:

- Dashes inside a word (`my-string`) are treated as literal characters; only a
  leading `-` at the start of a token marks negation.
- An unmatched trailing quote is treated as a literal character.
- A dangling `to:` (no value) parses as a condition with an empty string value.

## API

### `Facet.parse(input, transforms?)`

Parse a query string. Returns a `Facet` instance.

```ts
import Facet from "@laplace.live/facet";

const facet = Facet.parse('from:a@x.com,b@x.com to:me subject:"weekly sync"');

facet.getConditionArray();
// [
//   { keyword: 'from', value: 'a@x.com',     negated: false },
//   { keyword: 'from', value: 'b@x.com',     negated: false },
//   { keyword: 'to',   value: 'me',          negated: false },
//   { keyword: 'subject', value: 'weekly sync', negated: false }
// ]
```

The optional second argument is described in [Custom text transforms](#custom-text-transforms).

### `getConditionArray(): Condition[]`

The flat list of conditions in the order they appeared in the input.

```ts
Facet.parse("to:a to:b").getConditionArray();
// [
//   { keyword: 'to', value: 'a', negated: false },
//   { keyword: 'to', value: 'b', negated: false }
// ]
```

### `getParsedQuery(): ParsedQuery`

A grouped view of conditions. Negated conditions are bucketed under a special
`exclude` key.

```ts
const facet = Facet.parse("to:a -to:b to:c -to:d");
facet.getParsedQuery();
// {
//   to: ['a', 'c'],
//   exclude: { to: ['b', 'd'] }
// }
```

### `getTextSegments(): TextSegment[]`

The bare text portions of the query, with per-segment negation preserved.

```ts
Facet.parse("hello -big -fat is:condition world").getTextSegments();
// [
//   { text: 'hello', negated: false },
//   { text: 'big',   negated: true },
//   { text: 'fat',   negated: true },
//   { text: 'world', negated: false }
// ]
```

### `getAllText(): string`

All text segments joined by a single space, with `-` prepended to negated ones.

```ts
Facet.parse("hello -world").getAllText();
// 'hello -world'
```

### `addEntry(keyword, value, negated)`

Append a new condition. Does not deduplicate against existing entries.

```ts
const facet = Facet.parse("to:me");
facet.addEntry("to", "you", false);
facet.addEntry("from", "spam", true);
facet.toString();
// 'to:me,you -from:spam'
```

### `removeEntry(keyword, value, negated)`

Remove a single condition matching all three fields. If duplicates exist, only
the first match is removed. No-op when nothing matches.

```ts
const facet = Facet.parse("foo:bar,baz");
facet.removeEntry("foo", "baz", false);
facet.getParsedQuery().foo; // ['bar']
```

### `removeKeyword(keyword, negated)`

Remove every condition with the given keyword and negation flag. The negation
flag matters — `removeKeyword('to', false)` will not touch `-to:foo`.

```ts
const facet = Facet.parse("op1:value op1:value2 -op3:value text");
facet.removeKeyword("op1", false);
facet.toString();
// '-op3:value text'
```

### `clone(): Facet`

Returns an independent `Facet` instance. Mutations on the clone do not affect
the original.

```ts
const original = Facet.parse("to:me foo");
const copy = original.clone();
copy.addEntry("from", "you", true);

original.toString(); // 'to:me foo'
copy.toString(); // 'to:me -from:you foo'
```

### `toString(): string`

Serialize back to a normalized query string. Conditions with the same keyword
and negation are grouped with commas, and operands containing spaces or commas
are automatically quoted (with embedded `"` escaped).

```ts
Facet.parse("-to:foo@x.com -to:bar@x.com hello").toString();
// '-to:foo@x.com,bar@x.com hello'

Facet.parse('subject:"weekly sync, q2"').toString();
// 'subject:"weekly sync, q2"'
```

The result is cached internally and recomputed automatically after any
mutation (`addEntry`, `removeEntry`, `removeKeyword`).

## Custom text transforms

Pass an array of transforms to `Facet.parse` to lift bare text into structured
conditions. Each transform receives a text segment and may return
`{ key, value }` to convert it, or `null` / `undefined` to leave it alone.

```ts
import Facet from "@laplace.live/facet";

const tagTransform = (text: string) =>
  text.startsWith("#") ? { key: "tag", value: text.slice(1) } : null;

const mentionTransform = (text: string) =>
  text.startsWith("@") ? { key: "mention", value: text.slice(1) } : null;

const facet = Facet.parse("hello #urgent @alice", [
  tagTransform,
  mentionTransform,
]);

facet.getTextSegments(); // [{ text: 'hello', negated: false }]
facet.getParsedQuery().tag; // ['urgent']
facet.getParsedQuery().mention; // ['alice']
```

All transforms run on every text segment, so multiple lifters can coexist.
Negation is preserved — if the source token was `-#urgent`, the resulting
condition will be negated.

## Numeric comparators

`Facet.parse` produces opaque `keyword:value` pairs — it has no built-in
concept of numbers or ranges. The `parseNumericComparator` helper turns a
comparison expression into a predicate you can apply to your own data.

Supported syntax (whitespace around operators is tolerated):

| Expression | Meaning                         |
| ---------- | ------------------------------- |
| `30`       | Exact match (`===`)             |
| `=30`      | Exact match (explicit operator) |
| `>30`      | Greater than                    |
| `>=30`     | Greater than or equal           |
| `<30`      | Less than                       |
| `<=30`     | Less than or equal              |
| `10..50`   | Inclusive range `[10, 50]`      |

Decimals (`12.5`) and negative numbers (`-5`, `>-5`, `-10..10`) are supported.
Returns `null` for empty or unrecognized input so callers can ignore the
condition gracefully (e.g. while a user is mid-typing) instead of treating it
as "match nothing".

```ts
import Facet, { parseNumericComparator } from "@laplace.live/facet";

const facet = Facet.parse("price:>=30 price:<100 type:book");
const query = facet.getParsedQuery();

const predicates = (query.price as string[]).map(parseNumericComparator);

const items = [
  { title: "A", price: 25 },
  { title: "B", price: 30 },
  { title: "C", price: 99 },
  { title: "D", price: 150 },
];

const matches = items.filter((item) =>
  predicates.every((p) => p?.(item.price) ?? true),
);
// [{ title: 'B', price: 30 }, { title: 'C', price: 99 }]
```

Candidate handling is strict by design: `undefined`, `NaN`, and `Infinity`
never match, so it's safe to feed missing fields directly into the predicate.

## Utilities

### `getQuotePairMap(input)`

Returns an index map of paired single and double quotes in a string, ignoring
backslash-escaped quotes. Useful if you're building tooling on top of the same
quoting rules `Facet` uses.

```ts
import { getQuotePairMap } from "@laplace.live/facet";

getQuotePairMap('a "real" end');
// { single: {}, double: { 2: true, 7: true } }

getQuotePairMap('a \\" "real" end');
// Escaped " at index 3 is ignored; the surrounding quotes still pair up.
// { single: {}, double: { 5: true, 10: true } }
```

## TypeScript

All public types are re-exported from the package root.

```ts
import type {
  Condition,
  ParsedQuery,
  TextSegment,
  NumericComparator,
} from "@laplace.live/facet";
```

```ts
interface Condition {
  keyword: string;
  value: string;
  negated: boolean;
}

interface TextSegment {
  text: string;
  negated: boolean;
}

interface ParsedQuery {
  [key: string]: string[] | Record<string, string[]>;
  exclude: Record<string, string[]>;
}

type NumericComparator = (value: number | undefined) => boolean;
```

## Development

This project uses [Bun](https://bun.com) for installs, tests, and scripts, and
[tsdown](https://github.com/rolldown/tsdown) for builds.

```bash
bun install        # install dependencies
bun test           # run the test suite
bun run check      # type-check with tsc --noEmit
bun run lint       # run Biome
bun run build      # build dist/index.mjs and dist/index.d.mts
```

Releases are managed with [Changesets](https://github.com/changesets/changesets):

```bash
bunx changeset           # add a changeset describing your change
bun run version          # bump versions and update CHANGELOG (CI usually does this)
bun run release          # publish to npm (CI usually does this)
```

## Prior art

This project is heavily inspired by [`mixmaxhq/search-string`](https://github.com/mixmaxhq/search-string),
which pioneered the `Facet.parse` / `getConditionArray` / `getParsedQuery` /
`toString` API shape used here. `@laplace.live/facet` is a modernized take —
ESM only, zero runtime dependencies, first-class TypeScript types, additional
test coverage, and an optional numeric comparator helper — but the credit for
the original design belongs to Mixmax.

## License

MIT
