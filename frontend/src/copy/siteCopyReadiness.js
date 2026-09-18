/**
 * Site Copy registry — /readiness-score (how the dashboard's Total Family Continuity score is calculated).
 * Numbers mirror frontend/src/pages/DashboardPage.js (FEATURE_WEIGHTS / FEATURE_PERCENTS / SECTION_FEATURES),
 * backend/services/readiness.py (Documents, Messages, Checklist, Financials) and routes/ccp_depth.py.
 * If the formula changes, change the code, this text, and the date in `readiness.updated`.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });
const BLOCKS = (k, label, d) => f(k, label, d, { multiline: true, blocks: true });

export const READINESS_PILLARS = [
  { key: 'people', section: 'estate', icon: 'Heart', color: '#3B82F6' },
  { key: 'access', section: 'vault', icon: 'Lock', color: '#d4af37' },
  { key: 'money', section: 'financial', icon: 'Landmark', color: '#22C993' },
  { key: 'action', section: 'preparedness', icon: 'Clock', color: '#B794F6' },
];
export const READINESS_DETAILS = ['documents', 'messages', 'checklist', 'financials'];

export const PAGES_READINESS = [
  {
    key: 'readiness', label: 'Readiness Score', path: '/readiness-score',
    sections: [
      { key: 'seo', label: 'Search listing', fields: [
        f('readiness.seo.title', 'Search result title (≤ 60 characters)', 'How CarryOn Scores Family Readiness'),
        f('readiness.seo.description', 'Search result description (≤ 160 characters)', 'A plain-English explanation of the readiness score on your CarryOn dashboard: the four pillars, the nine tools behind them, the exact points, and what never counts.'),
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
          'Nine of the tools in your plan are scored **0–100** each. They sit in the four pillars you see on the dashboard: **People**, **Access**, **Money** and **Action**.',
          'Each tool carries a **weight** — how much it matters to a family in the first weeks. A pillar’s number is the weighted average of its tools; the overall number is the weighted average of every scored tool that is switched on for your plan.',
          'Tools that are not part of your plan are left out entirely — nothing you have not switched on can lower your number. Tools with no natural score (Trustee Services, Estate Guardian™ AI, Estate Communications, Beneficiary Concierge) never count.',
          'The score is recalculated every time your dashboard loads. There is nothing to submit and no one reviews it by hand.',
          'Labels: **80 and above** — Protected · **60–79** — Strong · **40–59** — Building · **below 40** — Getting Started.',
        ].join('\n')),
      ] },
      { key: 'pillars', label: 'The four pillars', fields: [
        f('readiness.pillars.title', 'Heading', 'The four pillars, tool by tool'),
        f('readiness.pillars.weight_label', 'Word before each weight number', 'weight'),
        f('readiness.pillar.people.title', 'People — heading', 'People'),
        f('readiness.pillar.people.weights', 'People — weights line', 'Beneficiaries 6 · Milestone Messages 4 · Family & Friends Notification 2'),
        BLOCKS('readiness.pillar.people.body', 'People — how each tool is scored ("- " for a bullet)', [
          '- **Beneficiaries (weight 6).** Three or more people named = 100. One person is 33, two are 67. Everything else in CarryOn is built around the people you name, so this is the heaviest single tool.',
          '- **Milestone Messages (weight 4).** The messages you have recorded divided by the messages expected for the people you have added, based on their ages — the exact table is below.',
          '- **Family & Friends Notification (weight 2).** Three or more people on the who-to-call list = 100; one is 33, two are 67.',
        ].join('\n')),
        f('readiness.pillar.access.title', 'Access — heading', 'Access'),
        f('readiness.pillar.access.weights', 'Access — weights line', 'Secure Document Vault 3 · Digital Access Vault 2'),
        BLOCKS('readiness.pillar.access.body', 'Access — how each tool is scored', [
          '- **Secure Document Vault (weight 3).** Scored on the three core documents — will, trust, power of attorney — with a bonus tier for a second POA, a healthcare directive or a property document. The exact tiers are below.',
          '- **Digital Access Vault (weight 2).** Five or more saved logins or accounts = 100; each one below that is worth 20.',
        ].join('\n')),
        f('readiness.pillar.money.title', 'Money — heading', 'Money'),
        f('readiness.pillar.money.weights', 'Money — weights line', 'CarryOn Financial Picture 2 · CarryOn Entities & Structures 1'),
        BLOCKS('readiness.pillar.money.body', 'Money — how each tool is scored', [
          '- **CarryOn Financial Picture (weight 2).** Coverage, detail, sharing decisions and notes across your bills, debts, accounts and property — 30 + 25 + 25 + 20 points, explained below. Dollar amounts never matter.',
          '- **CarryOn Entities & Structures (weight 1).** At least one trust, company or other entity on the chart = 100; none = 0.',
        ].join('\n')),
        f('readiness.pillar.action.title', 'Action — heading', 'Action'),
        f('readiness.pillar.action.weights', 'Action — weights line', 'Immediate Action Checklist 5 · Contingency Protocols 1'),
        BLOCKS('readiness.pillar.action.body', 'Action — how each tool is scored', [
          '- **Immediate Action Checklist (weight 5).** Fifteen prepared steps = 100; fewer score proportionally. Completing steps is your family’s job later and never changes your number.',
          '- **Contingency Protocols (weight 1).** Each plan you create is worth 10, up to five plans; each plan you have drilled at least once is worth another 10. Five plans, all drilled, = 100.',
        ].join('\n')),
        ML('readiness.pillars.example', 'Worked example under the pillars', 'Example: with everything switched on, the weights add up to 26. Documents at 80 contribute 80 × 3, Beneficiaries at 67 contribute 67 × 6, and so on; the total is divided by 26. That is the number on the dial.'),
      ] },
      { key: 'details', label: 'The four detailed rule sets', fields: [
        f('readiness.details.title', 'Heading', 'The four tools with detailed rules'),
        f('readiness.detail.documents.title', 'Documents — heading', 'Secure Document Vault'),
        BLOCKS('readiness.detail.documents.body', 'Documents — body ("- " for a bullet)', [
          'We look for three core documents by name: a **Last Will and Testament**, a **Revocable Living Trust**, and at least one **Power of Attorney** (financial or medical). Each core document is worth about 27 points; all three together bring the tool to **80**.',
          'To reach **100**, add any one of the following:',
          '- A second Power of Attorney, so you hold both the financial and the medical one',
          '- A Healthcare Directive or Living Will',
          '- A deed, title, mortgage or other property document',
          'Name documents plainly — "Last Will and Testament", not "scan_0042.pdf". The score reads the name you give a document, not its contents, and never opens the file.',
        ].join('\n')),
        f('readiness.detail.messages.title', 'Milestone Messages — heading', 'Milestone Messages'),
        BLOCKS('readiness.detail.messages.body', 'Milestone Messages — body', [
          'For every person you have added, we expect a number of recorded messages based on their age today:',
          '- Under 14: **8** messages (graduations, first job, wedding, first child, first home, a milestone birthday)',
          '- 14–17: **7** messages',
          '- 18–22: **5** messages',
          '- 23–30: **3** messages',
          '- 31 and older, or no birth date on file: **1** message',
          'The tool’s score is the messages you have recorded divided by the messages expected across everyone, capped at 100. A message addressed to several people counts for each of them, and a message with no named recipient counts for everyone. With no one added yet, this tool is 0 and the dashboard asks you to add someone.',
        ].join('\n')),
        f('readiness.detail.checklist.title', 'Checklist — heading', 'Immediate Action Checklist'),
        BLOCKS('readiness.detail.checklist.body', 'Checklist — body', [
          'This tool measures how many after-transition steps you have prepared for your family — the calls to make, the accounts to freeze, the people to notify. Preparing the steps is your work; completing them is theirs, later, so completion never affects your score.',
          '**15 items is 100.** Fewer items score proportionally: 6 items is 40, 12 items is 80. Every new account starts with five getting-started items, so the earliest score you will see here is about 33.',
        ].join('\n')),
        f('readiness.detail.financials.title', 'Financials — heading', 'CarryOn Financial Picture'),
        BLOCKS('readiness.detail.financials.body', 'Financials — body', [
          'The 100 points are split four ways:',
          '- **Coverage — 30 points.** Having at least one bill (8), one debt (7), one account (8) and one property (7) on record.',
          '- **Detail — 25 points.** The share of fields filled in: amount, due day and provider contact for bills; balance and institution for debts and accounts; value and location for property.',
          '- **Sharing decisions — 25 points.** The share of items where you have decided who may see it, or when. Financial items are private by default; a decision either way earns the points.',
          '- **Notes — 20 points.** The share of items with a note for your family — "this one auto-pays on the 3rd", "call Maria at the bank".',
          'Dollar amounts never affect the score. A $400 account documented well scores exactly like a $4 million one.',
        ].join('\n')),
      ] },
      { key: 'moves', label: 'What moves the number', fields: [
        f('readiness.moves.title', 'Heading', 'What moves the number'),
        LIST('readiness.moves.items', 'What raises it — one per line', [
          'Naming three people, with their dates of birth — the heaviest tool on the dial, and it sets the messages we expect.',
          'Uploading the three core documents with clear names — the single biggest jump most families see in Access.',
          'Adding checklist steps — every item counts until you reach fifteen, and the checklist carries the second-highest weight.',
          'Recording milestone messages for the youngest people in your life first; they carry the most expected messages.',
          'Saving the first five logins, the first three who-to-call contacts, and filling in details on the money you already have.',
        ].join('\n')),
        f('readiness.moves.not_title', 'Heading — what never counts', 'What never counts'),
        LIST('readiness.moves.not_items', 'What never affects it — one per line', [
          'How much money, property or insurance you have.',
          'How large your documents are, how many pages they run, or what they say inside.',
          'How often you log in, which device you use, or which subscription tier you are on — beyond which tools are switched on.',
          'Anything about your beneficiaries other than their age.',
          'Tools you have not switched on, and tools that have no natural score.',
        ].join('\n')),
      ] },
      { key: 'ccp', label: 'Family Contingency Plan score', fields: [
        f('readiness.ccp.title', 'Heading', 'The Family Contingency Plan score is separate'),
        ML('readiness.ccp.intro', 'Intro', 'The Connected Contingency Plan has its own 0–100 score, shown on its own page and printed on the Family Readiness Report. It never feeds into the dashboard number above. Points are earned like this:'),
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
      { key: 'elsewhere', label: 'Where else you’ll see a number', fields: [
        f('readiness.elsewhere.title', 'Heading', 'Where else you’ll see a number'),
        LIST('readiness.elsewhere.items', 'One per line', [
          '**The weekly digest e-mail** reports an Estate Readiness Score that is the plain average of the four detailed tools above — Documents, Milestone Messages, Checklist and Financials — so it can move a little differently from the dial.',
          '**The Family Readiness Report PDF** prints the Contingency Plan score described above.',
          'Every number comes from the same data in your account, at the moment it is calculated. None of them is ever adjusted by hand.',
        ].join('\n')),
      ] },
      { key: 'promise', label: 'Our commitments', fields: [
        f('readiness.promise.title', 'Heading', 'Our commitments about the score'),
        LIST('readiness.promise.items', 'Commitments — one per line', [
          'The same formula applies to every family. There are no hidden adjustments and no manual overrides.',
          'If the formula changes, we announce it on What’s New and update the date at the top of this page.',
          'Your score never leaves your account. It is not shared with partners or advertisers, and it appears in a PDF or e-mail only when you ask for one.',
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
