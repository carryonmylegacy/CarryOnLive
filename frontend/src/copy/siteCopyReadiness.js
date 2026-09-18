/**
 * Site Copy registry — /readiness-score (how the Estate Readiness Score is calculated).
 * Numbers here mirror backend/services/readiness.py and routes/ccp_depth.py; if the formula
 * changes, change both the code and this text, and date it in `readiness.updated`.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });
const BLOCKS = (k, label, d) => f(k, label, d, { multiline: true, blocks: true });

export const PAGES_READINESS = [
  {
    key: 'readiness', label: 'Readiness Score', path: '/readiness-score',
    sections: [
      { key: 'seo', label: 'Search listing', fields: [
        f('readiness.seo.title', 'Search result title (≤ 60 characters)', 'How CarryOn Scores Family Readiness'),
        f('readiness.seo.description', 'Search result description (≤ 160 characters)', 'A plain-English explanation of the Estate Readiness Score: the four parts, the exact points behind each, what moves the number and what never does.'),
      ] },
      { key: 'hero', label: 'Top of page', fields: [
        f('readiness.back', 'Back link', 'Back to home'),
        f('readiness.hero.eyebrow', 'Eyebrow', 'Readiness Score policy'),
        f('readiness.hero.title', 'Headline', 'How your readiness score is calculated.'),
        ML('readiness.hero.intro', 'Intro paragraph', 'The number on your dashboard is not a grade on your family or your wealth. It measures one thing: if something happened to you tonight, how much of what your family needs is already in place. This page explains every part of it in plain English, so nothing about the score is a mystery.'),
        f('readiness.updated', 'Formula last changed (date shown on the page)', 'September 18, 2026'),
        f('readiness.updated_prefix', 'Label before the date', 'Formula last changed'),
      ] },
      { key: 'short', label: 'The short version', fields: [
        f('readiness.short.title', 'Heading', 'The short version'),
        LIST('readiness.short.items', 'Points — one per line', [
          'Four parts, equal weight: **Documents**, **Milestone Messages**, **Checklist** and **Financials**. Each is scored 0–100 and the overall score is their average.',
          'The score is recalculated every time your dashboard loads. There is nothing to submit and no one reviews it by hand.',
          'Labels: **80 and above** — Protected · **60–79** — Strong · **40–59** — Building · **below 40** — Getting Started.',
          'If the Financial Portal is not part of your plan, the overall score is the average of the other three parts. Nothing you have not switched on can lower your number.',
        ].join('\n')),
      ] },
      { key: 'parts', label: 'The four parts', fields: [
        f('readiness.parts.title', 'Heading', 'The four parts, one at a time'),
        f('readiness.parts.weight', 'Weight chip on each card', '25% of the overall score'),
        f('readiness.parts.documents.title', 'Documents — heading', 'Documents'),
        BLOCKS('readiness.parts.documents.body', 'Documents — body ("- " for a bullet)', [
          'We look for three core documents by name: a **Last Will and Testament**, a **Revocable Living Trust**, and at least one **Power of Attorney** (financial or medical). Each core document is worth about 27 points; all three together bring you to **80**.',
          'To reach **100**, add any one of the following:',
          '- A second Power of Attorney, so you hold both the financial and the medical one',
          '- A Healthcare Directive or Living Will',
          '- A deed, title, mortgage or other property document',
          'Name documents plainly — "Last Will and Testament", not "scan_0042.pdf". The score reads the name you give a document, not its contents, and never opens the file.',
        ].join('\n')),
        f('readiness.parts.messages.title', 'Milestone Messages — heading', 'Milestone Messages'),
        BLOCKS('readiness.parts.messages.body', 'Milestone Messages — body', [
          'For every person you have added, we expect a number of recorded messages based on their age today:',
          '- Under 14: **8** messages (graduations, first job, wedding, first child, first home, a milestone birthday)',
          '- 14–17: **7** messages',
          '- 18–22: **5** messages',
          '- 23–30: **3** messages',
          '- 31 and older, or no birth date on file: **1** message',
          'The score is the messages you have recorded divided by the messages expected across everyone, capped at 100. A message addressed to several people counts for each of them, and a message with no named recipient counts for everyone. With no one added yet, this part is 0 and the dashboard asks you to add someone.',
        ].join('\n')),
        f('readiness.parts.checklist.title', 'Checklist — heading', 'Checklist'),
        BLOCKS('readiness.parts.checklist.body', 'Checklist — body', [
          'This part measures how many after-transition steps you have prepared for your family — the calls to make, the accounts to freeze, the people to notify. Preparing the steps is your work; completing them is theirs, later, so completion never affects your score.',
          '**15 items is 100.** Fewer items score proportionally: 6 items is 40, 12 items is 80. Every new account starts with five getting-started items, so the earliest score you will see here is about 33.',
        ].join('\n')),
        f('readiness.parts.financials.title', 'Financials — heading', 'Financials'),
        BLOCKS('readiness.parts.financials.body', 'Financials — body', [
          'Counted only when the Financial Portal is part of your plan. The 100 points are split four ways:',
          '- **Coverage — 30 points.** Having at least one bill (8), one debt (7), one account (8) and one property (7) on record.',
          '- **Detail — 25 points.** The share of fields filled in: amount, due day and provider contact for bills; balance and institution for debts and accounts; value and location for property.',
          '- **Designations — 25 points.** The share of items where you have decided who may see it, or when. Financial items are private by default; a decision either way earns the points.',
          '- **Notes — 20 points.** The share of items with a note for your family — "this one auto-pays on the 3rd", "call Maria at the bank".',
          'Dollar amounts never affect the score. A $400 account documented well scores exactly like a $4 million one.',
        ].join('\n')),
      ] },
      { key: 'moves', label: 'What moves the number', fields: [
        f('readiness.moves.title', 'Heading', 'What moves the number'),
        LIST('readiness.moves.items', 'What raises it — one per line', [
          'Adding a person with their date of birth — it sets the messages we expect and unlocks that whole part of the score.',
          'Uploading the three core documents with clear names — the single biggest jump most families see.',
          'Recording milestone messages for the youngest people in your life first; they carry the most expected messages.',
          'Adding checklist steps — every item counts until you reach fifteen.',
          'Filling in the details on the financial items you already have — the score rewards thoroughness, not totals.',
        ].join('\n')),
        f('readiness.moves.not_title', 'Heading — what never counts', 'What never counts'),
        LIST('readiness.moves.not_items', 'What never affects it — one per line', [
          'How much money, property or insurance you have.',
          'How large your documents are, how many pages they run, or what they say inside.',
          'How often you log in, which device you use, or which subscription tier you are on — beyond which tools are switched on.',
          'Anything about your beneficiaries other than their age.',
        ].join('\n')),
      ] },
      { key: 'ccp', label: 'Family Contingency Plan score', fields: [
        f('readiness.ccp.title', 'Heading', 'The Family Contingency Plan score is separate'),
        ML('readiness.ccp.intro', 'Intro', 'The Connected Contingency Plan has its own 0–100 score, shown on its own page and printed on the Family Readiness Report. It never feeds into the estate readiness number above. Points are earned like this:'),
        LIST('readiness.ccp.items', 'Points — one per line', [
          'At least one contingency plan — **20**',
          'A household roster with at least one person — **15**',
          'A go-bag with five or more items — **15**',
          'Nothing in the go-bag expiring within 30 days — **10**',
          'A primary meetup point — **10**',
          'An out-of-area relay contact with a phone or e-mail — **10**',
          'A family drill run in the last 12 months — **10**',
          'A plan linked to documents in your vault — **10**',
        ].join('\n')),
        f('readiness.ccp.labels', 'Labels line', 'Labels: 85+ Mission-Ready · 65–84 Well-Prepared · 40–64 Getting There · 15–39 Just Started · below 15 Unprepared.'),
      ] },
      { key: 'promise', label: 'Our commitments', fields: [
        f('readiness.promise.title', 'Heading', 'Our commitments about the score'),
        LIST('readiness.promise.items', 'Commitments — one per line', [
          'The same formula applies to every family. There are no hidden adjustments and no manual overrides.',
          'If the formula changes, we announce it on What’s New and update the date at the top of this page.',
          'Your score never leaves your account. It is not shared with partners or advertisers, and it appears in a PDF only when you generate one yourself.',
          'If a number looks wrong, write to support@carryon.us — we will walk through it with you line by line.',
        ].join('\n')),
      ] },
      { key: 'cta', label: 'Call to action', fields: [
        f('readiness.cta.title', 'Heading', 'See your own number.'),
        ML('readiness.cta.text', 'Text', 'Every plan starts at zero. Ten minutes is enough to see where you stand — and exactly what the next step is.'),
        f('readiness.cta.button', 'Button', 'Start free'),
        f('readiness.cta.signin', 'Sign-in link', 'Already a member? Open your dashboard'),
      ] },
    ],
  },
];
