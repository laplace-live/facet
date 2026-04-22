/**
 * Shared bench fixtures.
 *
 * `keywords` is only used by `search-query-parser`, which requires keywords
 * to be declared up front; the other two libraries auto-detect them.
 */
export interface Scenario {
  name: string
  query: string
  keywords: string[]
}

export const scenarios: Scenario[] = [
  {
    name: 'simple',
    query: 'to:me from:joe@acme.com foobar',
    keywords: ['to', 'from'],
  },
  {
    name: 'negation',
    query: 'to:me -from:joe@acme.com -spam foobar baz',
    keywords: ['to', 'from'],
  },
  {
    name: 'quoted',
    query:
      'from:hello@acme.com template:"recruiting: reject email, inexperience" subject:"weekly sync, q2" -tag:spam foo bar',
    keywords: ['from', 'template', 'subject', 'tag'],
  },
  {
    name: 'long',
    query:
      'to:alice@acme.com,bob@acme.com from:carol@acme.com,dan@acme.com,eve@acme.com cc:fred@acme.com ' +
      'subject:"Q1 planning, please review" -from:noreply@acme.com -tag:spam priority:high status:open ' +
      'label:starred,important has:attachment foo bar baz "exact phrase here" extra free text -drafts',
    keywords: ['to', 'from', 'cc', 'subject', 'tag', 'priority', 'status', 'label', 'has'],
  },
]
