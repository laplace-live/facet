/**
 * Shared bench fixtures.
 *
 * `keywords` is only used by `search-query-parser`, which requires keywords
 * to be declared up front; the other two libraries auto-detect them.
 */
export interface Scenario {
  name: string
  /** One-line description shown in the pre-bench summary. */
  notes: string
  query: string
  keywords: string[]
}

export const scenarios: Scenario[] = [
  {
    name: 'simple',
    notes: 'baseline: a couple of plain key:value pairs and one text segment',
    query: 'to:me from:joe@acme.com foobar',
    keywords: ['to', 'from'],
  },
  {
    name: 'negation',
    notes: 'all-negation, no text — exercises the negation hot path in isolation',
    query: '-from:alice@acme.com -from:bob@acme.com -to:carol@acme.com -tag:spam -tag:promo -priority:low',
    keywords: ['from', 'to', 'tag', 'priority'],
  },
  {
    name: 'quoted',
    notes: 'multiple double-quoted operands containing spaces, commas, and colons',
    query:
      'from:hello@acme.com template:"recruiting: reject email, inexperience" subject:"weekly sync, q2" -tag:spam foo bar',
    keywords: ['from', 'template', 'subject', 'tag'],
  },
  {
    name: 'long',
    notes: 'realistic kitchen-sink query mixing every feature',
    query:
      'to:alice@acme.com,bob@acme.com from:carol@acme.com,dan@acme.com,eve@acme.com cc:fred@acme.com ' +
      'subject:"Q1 planning, please review" -from:noreply@acme.com -tag:spam priority:high status:open ' +
      'label:starred,important has:attachment foo bar baz "exact phrase here" extra free text -drafts',
    keywords: ['to', 'from', 'cc', 'subject', 'tag', 'priority', 'status', 'label', 'has'],
  },
]
