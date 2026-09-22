/**
 * Site Copy registry — Phase 2 pages (Customers, Compare, What's New, Voices,
 * Wind-Down Promise, Privacy, Terms, Accessibility). Same shape as siteCopy.js.
 *
 * Field flavours (all plain text):
 *   multiline — line breaks kept
 *   list      — one item per line (rendered as bullets / numbered points)
 *   blocks    — body text: each line is a paragraph; lines starting with "- " become bullets
 * Competitor names are fixed in code (data/compareData.js); every other word is editable.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });
const BLOCKS = (k, label, d) => f(k, label, d, { multiline: true, blocks: true });

const COMPARE_ROW_LABELS = [
  ['price', 'Price'], ['free', 'Free to start?'], ['family', 'Family members / sharing'], ['vault', 'Secure document vault'],
  ['checklist', '“What to do first” checklist'], ['emergency', 'Emergency plans (hospital stay, deployment, disaster)'],
  ['ai', 'AI review of your documents'], ['messages', 'Messages to loved ones'], ['passwords', 'Passwords & accounts'],
  ['verify', 'Who confirms a death or incapacity'], ['security', 'Security, in plain English'], ['compliance', 'Compliance reports'],
  ['export', 'Take your data with you'], ['apps', 'Apps'], ['support', 'Support'], ['partners', 'For advisors & organizations'],
];
const ROW_LABEL = Object.fromEntries(COMPARE_ROW_LABELS);

const CARRYON_ROWS = {
  price: 'Plans from the Base tier up; launch pricing shown on /pricing. Reduced rates for seniors, military, veterans and young adults; free for hospice families.',
  free: '30-day exploration period, no card required.',
  family: 'The people you invite pay nothing while you’re alive.',
  checklist: 'Yes — a “what to do first” checklist your family actually follows, with progress tracking.',
  emergency: 'Yes — Contingency Protocols for a hospital stay, deployment, disaster and more (Premium).',
  ai: 'Yes — Estate Guardian™ AI reviews your documents for gaps and contradictions, only when you ask.',
  messages: 'Yes — Milestone Messages delivered on the dates you choose.',
  passwords: 'Yes — Digital Asset Vault for accounts and passwords (see pricing for tiers).',
  verify: 'Real people confirm a death or incapacity before anything unlocks.',
  security: 'Files are scrambled before they’re stored, with a separate lock for every family. Two-step sign-in on by default. Every file open is logged.',
  compliance: 'Preparing for SOC 2 Type II; controls documented on /security.',
  export: 'Export everything any time; written Wind-Down Promise (90 days’ notice, open export paths).',
  apps: 'Web app — add to your phone’s home screen for alerts. No native iOS/Android apps yet.',
  support: 'Human support from the founder, in-app.',
  partners: 'Partner portal for advisors, planners and organizations, with client roster import.',
};

const COMPETITORS = [
  {
    slug: 'trustworthy', name: 'Trustworthy',
    tagline: 'The Family Operating System®',
    positioning: 'Automatically organizes household information into answers, guidance and action — an AI-assisted family vault with reminders and secure sharing.',
    summary: [
      'Trustworthy is a polished, well-established household organizer with native apps, a large content library and a SOC 2 Type II report.',
      'CarryOn is built around what your family does when something happens — the first-hours checklist, emergency plans and human-verified unlock — not only where the files live.',
      'If you mainly want a beautifully organized vault with AI answers, Trustworthy is a strong choice. If you want a plan your family can follow in a crisis, that is what CarryOn is for.',
    ],
    rows: {
      price: 'Free; Silver $10/mo, Gold $20/mo, Platinum $40/mo — each billed annually.',
      free: 'Free plan (2 GB, 1 family member, 10 AI answers/month).',
      family: 'Family members per plan: 1 (Free), 5 (Silver), 10 (Gold), unlimited (Platinum).',
      checklist: 'Not listed as a guided “what to do first” checklist; offers reminders and AI answers.',
      emergency: 'Not listed.',
      ai: 'Yes — “Household AI” answers about your information (10 or 25/month on lower tiers; unlimited on Gold+).',
      messages: 'Not listed.',
      verify: 'Legacy access / granular permissions; verification process not described on the pricing page.',
      security: 'AES-256 encryption and multi-factor authentication on all plans (per their site).',
      compliance: 'SOC 2 Type II and SOC 3 (per their site).',
      export: '“Download your information” included on all plans.',
      apps: 'iOS and Android apps with offline mode.',
      support: 'AI agent (Free), email (Silver), chat (Gold), dedicated concierge (Platinum).',
      partners: 'Advisor program, Certified Experts and a marketplace.',
    },
    theyHave: ['Native iOS and Android apps', 'SOC 2 Type II / SOC 3 reports', 'A large blog and article library', 'Six years of operating history'],
    weHave: ['A first-hours checklist your family follows, not just files', 'Emergency plans for a hospital stay, deployment or disaster', 'Real people confirm a death or incapacity before anything unlocks', 'A written Wind-Down Promise', 'Invited family pays nothing while you’re alive'],
    faq: [
      ['Is CarryOn cheaper than Trustworthy?', 'It depends on the tier. Trustworthy’s paid plans run $10–$40 per month billed annually; CarryOn’s plans are listed on our pricing page with launch pricing, and the people you invite pay nothing while you’re alive. Compare the current numbers on both pricing pages before you decide.'],
      ['Does CarryOn have an app like Trustworthy?', 'Not a native one yet. CarryOn is a web app you add to your phone’s home screen; it sends alerts and works on any phone. Trustworthy offers iOS and Android apps.'],
      ['Can I move from Trustworthy to CarryOn?', 'Yes. Trustworthy lets you download your information; CarryOn lets you upload documents one at a time or in bulk, and our checklist tells you what to add first.'],
    ],
  },
  {
    slug: 'everplans', name: 'Everplans',
    tagline: 'Organize and securely store your vital documents',
    positioning: 'A secure place to organize and store vital documents and information, guided by content and checklists, and shared with the people who need access (“deputies”).',
    summary: [
      'Everplans is one of the original digital estate organizers, with a deep content library and a simple $99.99-a-year Premium plan.',
      'CarryOn covers the same storage need and adds the operating layer: a first-hours checklist, emergency plans, AI review of your documents and human-verified unlock.',
      'If you want a guided library and a place to keep documents at a low yearly price, Everplans does that well. If you want your family to have a plan to follow — not only a folder to open — choose CarryOn.',
    ],
    rows: {
      price: 'Premium $99.99 per year.',
      free: 'Free plan (store up to 3 items, iOS app, content library).',
      family: 'Deputies get read-only access to the sections you designate and don’t need a subscription (per their help center).',
      checklist: 'Guidance and specialized checklists in the content library; a guided first-hours action list is not described on the pricing page.',
      emergency: 'Not listed.',
      ai: 'Not listed on the pricing page.',
      messages: 'Not listed on the pricing page.',
      passwords: 'Digital accounts can be recorded as items (per their site).',
      verify: 'Deputy access is set by you in advance; a verification process is not described on the pricing page.',
      security: 'Secure storage and secure sharing (per their site).',
      compliance: 'Not listed.',
      export: 'Not listed on the pricing page.',
      apps: 'iOS app.',
      support: 'Help center.',
      partners: 'Enterprise / partnership program.',
    },
    theyHave: ['A large, long-running content library', 'A low flat yearly price', 'An iOS app', 'A long operating history'],
    weHave: ['A first-hours checklist with progress tracking', 'Emergency plans for a hospital stay, deployment or disaster', 'Estate Guardian™ AI review of your documents', 'Milestone Messages delivered on dates you choose', 'Real people confirm a death or incapacity before anything unlocks', 'A written Wind-Down Promise'],
    faq: [
      ['Everplans is $99.99 a year. What does CarryOn cost?', 'CarryOn is billed monthly with launch pricing on our pricing page, and the people you invite pay nothing while you’re alive. Seniors, military, veterans and young adults pay less; hospice families pay nothing.'],
      ['Does CarryOn have deputies like Everplans?', 'Yes — you invite the people you choose and decide, per person, exactly what each one sees. Access to protected material unlocks only after real people confirm a death or incapacity.'],
      ['Can I try CarryOn first?', 'Yes. Explore for 30 days with no card required.'],
    ],
  },
  {
    slug: 'resolve-legacy', name: 'Resolve Legacy',
    tagline: 'Family legacy planning app',
    positioning: 'A Family Readiness Plan that organizes wishes, documents, contacts and next steps, with AI that helps organize and find gaps and permissions that can differ before and after a loss.',
    summary: [
      'Resolve Legacy and CarryOn share a philosophy: a plan your family can follow, not just a vault. Resolve Legacy is in early access, so pricing isn’t published yet.',
      'CarryOn is live today with published pricing, a 30-day exploration period, human-verified unlock, Milestone Messages and a written Wind-Down Promise.',
      'If you’re comparing the two, look at what you can use this week: CarryOn’s checklist, emergency plans and AI review are shipping now.',
    ],
    rows: {
      price: 'Not published — “Get Early Access” as of the date checked.',
      free: 'Not listed.',
      family: 'Family members and roles with scoped permissions (per their site).',
      checklist: 'Yes — five-step plan and “first-response actions” (per their site).',
      emergency: 'Not listed as separate scenario plans.',
      ai: 'Yes — AI helps organize documents, find gaps and translate; you approve suggestions (per their site).',
      messages: 'Not listed.',
      passwords: 'Digital accounts captured in the inventory step (per their site).',
      verify: 'Permission windows before and after a loss; a human verification process is not described.',
      security: 'AWS hosting, TLS in transit, encryption at rest, MFA (per their site).',
      compliance: 'Not listed.',
      export: 'Share and export with trusted access (per their site).',
      apps: 'Web app.',
      support: 'Not listed.',
      partners: 'Not listed.',
    },
    theyHave: ['AI-assisted translation for multilingual families', 'A conflict-aware, culturally sensitive planning approach'],
    weHave: ['Published pricing and a 30-day exploration period today', 'Real people confirm a death or incapacity before anything unlocks', 'Milestone Messages on dates you choose', 'A written Wind-Down Promise', 'Partner portal for advisors and organizations'],
    faq: [
      ['Is Resolve Legacy available now?', 'As of the date we checked, Resolve Legacy’s site offered early access and did not publish pricing. CarryOn is available today with published pricing.'],
      ['Both use AI — what’s the difference?', 'Both use AI to organize and find gaps. CarryOn’s Estate Guardian™ AI reads your documents only when you ask it to, uses a trusted AI service under contract, and your documents are never used to teach it.'],
      ['Which is better for a family with an advisor?', 'CarryOn includes a partner portal so an advisor or organization can set up client portals, import a roster and hand each family their plan.'],
    ],
  },
];

const competitorSection = (c) => ({
  key: c.slug, label: `CarryOn vs ${c.name} (/vs/${c.slug})`, fields: [
    f(`compare.${c.slug}.tagline`, `${c.name} — one-line tagline (index card)`, c.tagline),
    ML(`compare.${c.slug}.positioning`, `${c.name} — positioning (under the headline)`, c.positioning),
    LIST(`compare.${c.slug}.summary`, 'The short version — one point per line', c.summary.join('\n')),
    ...Object.entries(c.rows).map(([key, text]) => ML(`compare.${c.slug}.rows.${key}`, `Table — ${ROW_LABEL[key]} (${c.name} column)`, text)),
    LIST(`compare.${c.slug}.they_have`, `What ${c.name} has that we don’t — one per line`, c.theyHave.join('\n')),
    LIST(`compare.${c.slug}.we_have`, 'What CarryOn adds beyond the vault — one per line', c.weHave.join('\n')),
    ...c.faq.flatMap(([q, a], i) => [
      f(`compare.${c.slug}.faq.${i + 1}.q`, `FAQ ${i + 1} — question`, q),
      ML(`compare.${c.slug}.faq.${i + 1}.a`, `FAQ ${i + 1} — answer`, a),
    ]),
  ],
});

const legalSection = (prefix, n, title, body) => [
  f(`${prefix}.s${n}.title`, `Section ${n} — heading`, title),
  BLOCKS(`${prefix}.s${n}.body`, `Section ${n} — text`, body),
];

export const PAGES_PHASE2 = [
  {
    key: 'customers', label: 'Customers', path: '/customers',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('customers.seo.title', 'Page title', 'Customer Stories - CarryOn | Real Families, Real Words'),
        ML('customers.seo.description', 'Meta description', 'CarryOn publishes only real member stories, reviewed by the founder. Read them here, see the actual product, and share your own.'),
      ] },
      { key: 'hero', label: 'Hero', fields: [
        f('customers.hero.eyebrow', 'Small gold line above the headline', 'Customer stories'),
        f('customers.hero.h1a', 'Headline — white part', 'Real families. Real words.'),
        f('customers.hero.h1b', 'Headline — gold part', 'Nothing invented.'),
        ML('customers.hero.intro', 'Intro paragraph (**Verified member** is shown in green)', 'CarryOn became generally available in 2026. We don’t buy reviews, we don’t write our own, and we don’t publish a quote we can’t stand behind. Every story on this page comes from an actual member, is reviewed by the founder, and is marked **Verified member** when the email matches a CarryOn account.'),
      ] },
      { key: 'empty', label: 'When no stories are published yet', fields: [
        f('customers.empty.title', 'Heading', 'No published stories yet — on purpose.'),
        ML('customers.empty.text', 'Text', 'Our first families are still building their plans. We’d rather show you an empty page than a made-up one. When a member shares their words and the founder approves them, they appear here — and on the homepage — automatically.'),
      ] },
      { key: 'founder', label: 'Product video', fields: [
        f('customers.founder.eyebrow', 'Small gold line', 'Product video'),
        f('customers.founder.title', 'Heading', 'See CarryOn in Action.'),
      ] },
      { key: 'share', label: 'Share your story', fields: [
        f('customers.share.eyebrow', 'Small gold line', 'Already a member?'),
        f('customers.share.title', 'Heading', 'Share your story.'),
        ML('customers.share.text', 'Text', 'Tell other families what made you set this up and what changed. The founder reads every submission; nothing is published without your consent.'),
      ] },
      { key: 'cta', label: 'Closing call to action', fields: [
        f('customers.cta.title', 'Heading', 'Not a member yet?'),
        ML('customers.cta.text', 'Text', 'Explore first, no card needed. Upload one document and invite one person — that’s a real start.'),
        f('customers.cta.button', 'Button', 'Start Now'),
      ] },
      { key: 'footer', label: 'Small footer (Customers, Compare, What’s New pages)', fields: [
        f('footer.home', 'Footer: Home', 'Home'),
        f('footer.short_copyright', 'Copyright line (year is added automatically)', 'CarryOn Enterprises Inc'),
      ] },
    ],
  },
  {
    key: 'compare', label: 'Compare', path: '/vs', previewPaths: ['/vs', ...COMPETITORS.map(c => `/vs/${c.slug}`)],
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('compare.seo.title', 'Index page title', 'CarryOn vs Trustworthy, Everplans & Resolve Legacy — Honest Comparisons'),
        ML('compare.seo.description', 'Index meta description', 'Side-by-side, dated comparisons of CarryOn with Trustworthy, Everplans and Resolve Legacy: price, family sharing, checklists, emergency plans, AI review, security and data export.'),
        f('compare.detail.seo_title', 'Competitor page title ({name}, {month}, {year} are filled in)', 'CarryOn vs {name} — Which Is Right for Your Family? ({month} {year})'),
        ML('compare.detail.seo_description', 'Competitor page meta description ({name}, {checked})', 'An honest, dated comparison of CarryOn and {name}: price, family sharing, first-hours checklist, emergency plans, AI review, security and data export. Checked {checked}.'),
      ] },
      { key: 'index', label: 'Index page (/vs)', fields: [
        f('compare.index.eyebrow', 'Small gold line', 'Compare'),
        f('compare.index.h1a', 'Headline — white part', 'How CarryOn compares —'),
        f('compare.index.h1b', 'Headline — gold part', 'honestly.'),
        ML('compare.index.intro', 'Intro paragraph', 'Every comparison below quotes the other company’s public website, says when we checked, and lists what they do that we don’t. Pick the tool that fits your family — even if it isn’t us.'),
        f('compare.vs_word', 'Card heading prefix (followed by the competitor name)', 'CarryOn vs'),
        f('compare.index.card_cta', 'Card link', 'Read the comparison'),
      ] },
      { key: 'detail', label: 'Competitor pages — shared headings & lines', fields: [
        f('compare.checked', 'Date the competitor facts were checked', 'September 16, 2026'),
        f('compare.detail.facts_before', 'Facts line — before the link ({name})', 'Facts about {name} were read from'),
        f('compare.detail.facts_link', 'Facts line — link text', 'their public website'),
        f('compare.detail.facts_after', 'Facts line — after the link ({checked})', 'on {checked}. Trademarks belong to their owners.'),
        f('compare.detail.short_title', 'Heading: The short version', 'The short version'),
        f('compare.detail.side_title', 'Heading: Side by side', 'Side by side'),
        f('compare.table.col_what', 'Table — first column header', 'What matters'),
        f('compare.table.included', 'Table — “yes” cell', 'Included'),
        f('compare.table.not_offered', 'Table — “no” cell', 'Not offered'),
        f('compare.detail.they_title', 'Heading: what they have ({name})', 'What {name} has that we don’t (yet)'),
        f('compare.detail.we_title', 'Heading: what CarryOn adds', 'What CarryOn adds beyond the vault'),
        f('compare.detail.faq_title', 'Heading: Common questions', 'Common questions'),
        f('compare.detail.cta_title', 'Closing heading', 'See it for yourself'),
        ML('compare.detail.cta_text', 'Closing text', 'Explore CarryOn for 30 days with no card. Upload one document and invite one person — that’s a real start.'),
        f('compare.detail.cta_start', 'Button: Start Now', 'Start Now'),
        f('compare.detail.cta_pricing', 'Button: See pricing', 'See pricing'),
        f('compare.detail.corrections_before', 'Corrections line — before the e-mail ({name})', 'Spotted something out of date about {name}? Email'),
        f('compare.detail.corrections_after', 'Corrections line — after the e-mail', 'and we’ll correct it within one business day.'),
      ] },
      { key: 'rows', label: 'Table — row labels', fields: COMPARE_ROW_LABELS.map(([key, label]) => f(`compare.rows.${key}`, `Row: ${label}`, label)) },
      { key: 'carryon', label: 'Table — CarryOn column', fields: Object.entries(CARRYON_ROWS).map(([key, text]) => ML(`compare.carryon.${key}`, `CarryOn — ${ROW_LABEL[key]}${key === 'price' ? ' (shown until live prices load)' : ''}`, text)) },
      ...COMPETITORS.map(competitorSection),
    ],
  },
  {
    key: 'changelog', label: 'What’s New', path: '/changelog',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('changelog.seo.title', 'Page title', 'What’s New - CarryOn Product Updates'),
        ML('changelog.seo.description', 'Meta description', 'Every real CarryOn product update, dated. Founded 2025 in Arlington, Virginia.'),
      ] },
      { key: 'hero', label: 'Hero', fields: [
        f('changelog.hero.eyebrow', 'Small gold line', 'Built in the open'),
        f('changelog.hero.title', 'Headline', 'What’s new in CarryOn'),
        ML('changelog.hero.intro', 'Intro paragraph', 'Every real update, dated. No press releases, no awards we haven’t won. Founded 2025 · Arlington, Virginia.'),
        f('changelog.foundation', 'Label on the undated first entry', 'Foundation'),
      ] },
      { key: 'cta', label: 'Closing call to action', fields: [
        f('changelog.cta.title', 'Heading', 'See it for yourself.'),
        f('changelog.cta.text', 'Text', 'Explore first, no card needed.'),
        f('changelog.cta.button', 'Button', 'Start Now'),
      ] },
    ],
  },
  {
    key: 'voices', label: 'Voices', path: '/voices',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('voices.seo.title', 'Page title', 'Voices — CarryOn'),
        ML('voices.seo.description', 'Meta description', 'Real families on what readiness feels like — stories from the people CarryOn was built for.'),
      ] },
      { key: 'nav', label: 'Page header', fields: [
        f('voices.nav_voices', 'Menu: Voices', 'Voices'),
        f('nav.faq', 'Menu: FAQ', 'FAQ'),
        f('voices.signin', 'Sign in link', 'Sign in'),
      ] },
      { key: 'hero', label: 'Hero', fields: [
        f('voices.pill', 'Small pill above the headline', 'Voices'),
        f('voices.h1a', 'Headline — white part', 'The words our members'),
        f('voices.h1b', 'Headline — gold italic part (a period follows)', 'chose for themselves'),
        ML('voices.intro', 'Intro paragraph (**…** is shown in italics)', 'Real quotes from CarryOn members who opted to share publicly why they prepared. Not marketing copy. Not a testimonial request. Just their answer to a single question: **what does CarryOn mean to you?**'),
      ] },
      { key: 'grid', label: 'Quote grid', fields: [
        f('voices.loading', 'While loading', 'Loading voices…'),
        f('voices.empty.title', 'Empty state — line 1', 'The first voice will land here soon.'),
        ML('voices.empty.text', 'Empty state — line 2', 'Members get the option to share publicly as they personalize their CarryOn share card.'),
        f('voices.badge_founding', 'Badge: Founding Member', 'Founding Member'),
        f('voices.badge_member', 'Badge: Member', 'Member'),
      ] },
      { key: 'cta', label: 'Closing call to action', fields: [
        f('voices.closing.quote', 'Closing line', 'Your family deserves a plan, not a panic.'),
        f('voices.closing.cta', 'Button', 'Start your family’s plan'),
      ] },
    ],
  },
  {
    key: 'winddown', label: 'Wind-Down Promise', path: '/wind-down-promise',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('winddown.seo.title', 'Page title', 'Wind-Down & Data Portability Promise — CarryOn'),
        ML('winddown.seo.description', 'Meta description', 'Our binding written commitment in three states: what you can export today, what happens if a wind-down is ever announced (90 days minimum notice), and what stays yours after — in formats that never need our servers.'),
      ] },
      { key: 'hero', label: 'Top of page', fields: [
        f('winddown.back', 'Back link', 'Home'),
        f('winddown.pill', 'Small pill', 'Wind-down & Portability Promise'),
        f('winddown.h1a', 'Headline — white part', 'If we ever shut down, your family’s data'),
        f('winddown.h1b', 'Headline — gold italic part (a period follows)', 'comes home with you'),
        ML('winddown.intro', 'Intro paragraph', 'CarryOn’s founder, a retired 24-year military veteran, “boot-strapped” CarryOn from inception to what it is today because he believes this work matters. We also know nothing in tech lasts forever. So we want you to know exactly what would happen — long before anything ever needs to.'),
        f('winddown.intro2', 'Second line', 'This is a binding written promise. We commit to every line below.'),
      ] },
      { key: 'state1', label: 'State 1 — today', fields: [
        f('winddown.state1.title', 'Card heading', 'State 1 — Today, while CarryOn is healthy'),
        f('winddown.state1.intro', 'Card intro', 'You can take your data home right now, without asking us:'),
        LIST('winddown.state1.bullets', 'Bullets — one per line (e-mail addresses become links)', [
          'A complete data export from Settings → Privacy (protected by step-up verification) — your profile, estates, milestone message text, Digital Access Vault entries including their secret values, your full financial picture (bills, debts, accounts, property), entities & structures, Friends & Family contacts, contingency protocols, Immediate Action Checklist, and your plan’s change history — one readable JSON file.',
          'Every uploaded document, downloadable individually in its original file format (PDF, JPG, MP4, WAV…).',
          'Milestone message audio and video in original format.',
          'Formatted PDFs from your Estate Binder — Immediate Action Checklist, Contingency Protocols, Financial Picture hand-off package, Estate Guardian plan and transcript, Emergency Card, Family Readiness Report — for the sections you have generated in the Estate Binder.',
          'Or write to privacy@carryon.us and we assemble it with you.',
        ].join('\n')),
      ] },
      { key: 'state2', label: 'State 2 — if a wind-down is announced', fields: [
        f('winddown.state2.title', 'Card heading', 'State 2 — If a wind-down is ever announced'),
        ML('winddown.state2.intro', 'Card intro', 'No silent shutdown. Ever. If CarryOn is ever sunsetting — voluntarily, due to acquisition, or for any other reason:'),
        LIST('winddown.state2.bullets', 'Bullets — one per line (**bold** allowed)', [
          'Every active account receives at least **90 calendar days of advance written notice** (email + in-app banner) before any service degradation.',
          'Every feature stays fully functional for the whole window. Nothing removed early “to save costs.”',
          'Every export path in State 1 stays open all 90 days, and we will remind you to use them by email.',
          'There is no automated wind-down mode in the software today; these are commitments we carry out.',
          '**What happens at day 90:** the software deletes the **file content** of your uploaded documents (the stored PDFs, images, audio and video). Document metadata (names, categories, dates) and everything in the JSON export — including Digital Access Vault entries and milestone message text — survive. Download your files before day 90; after it they cannot be recovered.',
          'Founders Circle Lifetime members get **concierge migration support** — a real person walks you through your export and confirms you have everything.',
          'If we are acquired, the acquirer must honor this entire promise as a condition of the deal. If the founder is ever unable to operate the company, his own estate plan includes hand-off instructions to a successor with these same commitments.',
        ].join('\n')),
      ] },
      { key: 'state3', label: 'State 3 & formats', fields: [
        f('winddown.state3.title', 'Card heading', 'State 3 — After the last day'),
        ML('winddown.state3.text', 'Card text', 'Everything you downloaded stays readable forever on your own computer — original file formats and plain JSON. No proprietary formats, no CarryOn servers, no accounts, no internet connection required.'),
        f('winddown.formats.title', 'Card heading', 'No proprietary formats — ever'),
        ML('winddown.formats.text', 'Card text', 'Nothing we give you ever needs our servers to read. If we ever offer encrypted archive downloads, we commit to publishing an open-source decryption tool on GitHub at the same time, under a permissive license.'),
      ] },
      { key: 'closing', label: 'Quote & revision note', fields: [
        f('winddown.quote', 'Founder quote (quotation marks are added)', 'Your family deserves a plan, not a panic. So does the platform that holds it.'),
        f('winddown.attribution', 'Attribution', '— Barnet Harris, Founder'),
        ML('winddown.revision', 'Revision note at the bottom', 'First published: April 29, 2026. Last revised: September 7, 2026 (export scope, day-90 file deletion, no automated wind-down mode). Any change to this page must be accompanied by an updated changelog entry and 30 days’ notice to active members.'),
      ] },
    ],
  },
  {
    key: 'privacy', label: 'Privacy Policy', path: '/privacy',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('privacy.seo.title', 'Page title', 'Privacy Policy — CarryOn'),
        ML('privacy.seo.description', 'Meta description', 'How CarryOn collects, uses, protects, shares, and returns your family’s data.'),
      ] },
      { key: 'top', label: 'Top of page', fields: [
        f('legal.back', 'Back link (Privacy & Terms)', 'Back'),
        f('privacy.title', 'Page heading', 'Privacy Policy'),
        f('privacy.updated', 'Last-updated line', 'Last updated: September 22, 2026'),
      ] },
      { key: 'sections', label: 'Policy sections (a line starting with “- ” becomes a bullet)', fields: [
        ...legalSection('privacy', 1, '1. Introduction', 'CarryOn Technologies LLC, a CarryOn Enterprises Inc company (“CarryOn,” “we,” “us,” or “our”), is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our estate planning platform, including our website and related services (collectively, the “Service”).'),
        ...legalSection('privacy', 2, '2. Information We Collect', [
          'We collect information you provide directly to us, including:',
          '- Personal identification information (name, email address, phone number)',
          '- Date of birth — used to confirm you are 18 or older and to determine eligibility for age-based plans (New Adult 18–25, Seniors 65+)',
          '- Gender (optional) — used only to word family relationships correctly in your family tree (for example “mother” or “father”); it is never used for marketing or profiling',
          '- Account credentials (encrypted passwords)',
          '- Estate planning data (beneficiary information, documents, checklists)',
          '- Payment information (processed securely through Stripe)',
          '- Communications (support messages, feedback)',
        ].join('\n')),
        ...legalSection('privacy', 3, '3. How We Use Your Information', [
          '- Provide, maintain, and improve the Service',
          '- Process transactions and send related information',
          '- Send verification codes via email or SMS for two-factor authentication',
          '- Respond to customer service requests and support needs',
          '- Protect against fraud and unauthorized access',
          '- Comply with legal obligations',
        ].join('\n')),
        ...legalSection('privacy', 4, '4. SMS/Text Messaging', [
          'When you opt in to receive SMS messages from CarryOn™, you consent to receive text messages related to account verification and security (e.g., one-time passcodes for two-factor authentication). Message frequency varies based on your account activity. Message and data rates may apply.',
          'You can opt out of SMS messages at any time by replying STOP to any message or by updating your preferences in your account settings. For help, reply HELP or contact us at the information provided below.',
          'We do not sell, rent, or share your phone number or SMS opt-in data with third parties for marketing purposes. Your information is shared only with service providers who assist in delivering messages (e.g., Twilio).',
        ].join('\n')),
        ...legalSection('privacy', 5, '5. Data Security', 'In plain language: your files are scrambled before they’re stored, with a separate lock for every family. They aren’t casually accessible to CarryOn staff — privileged access is restricted to defined administrative functions and is controlled and audited — and every time a file is opened, we write down who did it and when. Technically, we implement industry-standard security measures, including AES-256 encryption with per-estate keys and two-factor authentication. Your sensitive documents are encrypted at rest and in transit. Conversations with our AI features are retained as chat transcripts until you delete them and may quote documents you flag for AI analysis. AI requests are processed by xAI under a zero-data-retention configuration — xAI does not store your content after the response is returned. Under xAI’s published API policy, content sent through the API is also not used to train their models.'),
        ...legalSection('privacy', 6, '6. Data Sharing and Disclosure', [
          'We may share your information only in the following circumstances:',
          '- With your designated beneficiaries, as configured by you',
          '- With service providers who perform services on our behalf (e.g., payment processing, email delivery, SMS messaging)',
          '- With Meta (Facebook) and Google (Analytics) only if you click “Allow” on our analytics notice: their cookies tell us which ads bring families to the site and where people stop during sign-up. Nothing you store in CarryOn™ is ever shared, and declining changes nothing about the service.',
          '- To comply with applicable laws, regulations, or legal processes',
          '- To protect the rights, property, and safety of CarryOn™, our users, or others',
          '**Who actually touches your data (our service providers).** We run CarryOn™ on a small number of well-known companies. Each one sees only what it needs to do its job, under a contract that forbids using your data for anything else:',
          '- **Stripe** (United States) — processes payments. Your card number goes straight to Stripe; we never see or store it. Stripe sees your name, e-mail and what you bought.',
          '- **Render** (United States) — hosts the servers that run CarryOn™. Every request to the app passes through them, encrypted in transit.',
          '- **Vercel** (United States) — hosts this website and the app screens you see in your browser. It does not store your account data. Its Speed Insights tool collects anonymous page-load timings.',
          '- **Amazon Web Services, S3** (United States) — stores the files and photos in your vault. Files are encrypted with AES-256-GCM before they are written; Amazon holds ciphertext, not documents.',
          '- **MongoDB Atlas** (United States) — the database for your account, estate, checklist and message records. Encrypted at rest.',
          '- **Resend** — sends our e-mails (verification codes, reminders, notices). Sees your e-mail address and the message itself.',
          '- **Twilio** — sends SMS verification codes. Sees your phone number and the code.',
          '- **xAI (Grok)** — powers the Estate Guardian assistant and its checklist suggestions. When you ask it something, it receives your question and the parts of your estate summary needed to answer; it never receives your vault files.',
          '- **Google** — address auto-complete while you type an address (sees what you type in that field); web fonts (sees your IP address); Google Analytics on our sign-up steps and YouTube videos only after you click Allow or press play.',
          '- **Meta (Facebook)** — the Meta Pixel, only after you click Allow on our analytics notice.',
          '- **Sentry** — error monitoring. When something breaks, it receives a technical report (page, browser, error text). We strip personal data from these reports.',
          '- **Apple App Store / Google Play** — if you subscribe inside our mobile apps, they handle the purchase and send us a receipt, never your card.',
          '- **HighLevel (LeadConnector)** — the booking calendar on our Speak With Us page. Sees the details you enter when you book a call.',
          'We will update this list before adding a new provider that handles personal data. Questions: privacy@carryon.us.',
        ].join('\n')),
        ...legalSection('privacy', 7, '7. Data Retention', 'We retain your personal information for as long as your account is active or as needed to provide you with our services. You may request deletion of your account and associated data by contacting us.'),
        ...legalSection('privacy', 8, '8. Your Rights', [
          'Depending on your jurisdiction, you may have the right to:',
          '- Access, correct, or delete your personal data',
          '- Object to or restrict processing of your data',
          '- Data portability',
          '- Withdraw consent at any time',
        ].join('\n')),
        ...legalSection('privacy', 9, '9. Changes to This Policy', 'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the “Last updated” date.'),
        f('privacy.s10.title', 'Section 10 — heading', '10. Contact Us'),
        f('privacy.s10.dsr', 'Section 10 — line before privacy@carryon.us', 'For data access, correction, deletion, or portability requests, contact:'),
        f('privacy.s10.general', 'Section 10 — line before support@carryon.us', 'For general questions about this Privacy Policy or our data practices, contact:'),
      ] },
    ],
  },
  {
    key: 'terms', label: 'Terms of Service', path: '/terms',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('terms.seo.title', 'Page title', 'Terms of Service — CarryOn'),
        ML('terms.seo.description', 'Meta description', 'The terms governing your use of the CarryOn family continuity platform.'),
      ] },
      { key: 'top', label: 'Top of page', fields: [
        f('terms.title', 'Page heading', 'Terms of Service'),
        f('terms.updated', 'Last-updated line', 'Last updated: September 21, 2026'),
      ] },
      { key: 'sections', label: 'Terms sections (a line starting with “- ” becomes a bullet)', fields: [
        ...legalSection('terms', 1, '1. Acceptance of Terms', 'These Terms of Service (“Terms”) are an agreement between you and CarryOn Technologies LLC, a CarryOn Enterprises Inc company (“CarryOn,” “we,” or “us”), the company that operates the CarryOn™ platform (the “Service”). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the Service. We reserve the right to modify these Terms at any time, and your continued use of the Service constitutes acceptance of any changes.'),
        ...legalSection('terms', 2, '2. Description of Service', 'CarryOn™ is an estate planning and estate plan management platform that enables users to organize, secure, and communicate their estate plans to designated beneficiaries. The Service includes document storage, beneficiary management, checklist tools, AI-powered estate analysis, and related features.'),
        ...legalSection('terms', 3, '3. Account Registration', [
          'To use the Service, you must create an account and provide accurate, complete, and current information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.',
          'You must be at least 18 years old to create an account. By registering, you represent that you are of legal age and have the capacity to enter into a binding agreement.',
        ].join('\n')),
        ...legalSection('terms', 4, '4. SMS Communications Consent', [
          'By providing your phone number and opting in to SMS communications during registration or account settings, you expressly consent to receive text messages from CarryOn™ for account verification and security purposes, including one-time passcodes (OTPs) for two-factor authentication.',
          '- Message frequency varies based on account activity',
          '- Message and data rates may apply',
          '- You may opt out at any time by replying STOP',
          '- For help, reply HELP or contact support',
          '- Carriers are not liable for delayed or undelivered messages',
        ].join('\n')),
        ...legalSection('terms', 5, '5. Acceptable Use', [
          'You agree not to:',
          '- Use the Service for any unlawful purpose',
          '- Attempt to gain unauthorized access to any part of the Service',
          '- Interfere with or disrupt the Service or its infrastructure',
          '- Upload malicious content, viruses, or harmful code',
          '- Impersonate any person or misrepresent your affiliation',
          '- Use automated means to access the Service without permission',
        ].join('\n')),
        ...legalSection('terms', 6, '6. Intellectual Property', 'The Service, including its design, features, content, and underlying technology, is owned by CarryOn Technologies LLC or its parent company, CarryOn Enterprises Inc, and protected by intellectual property laws. You retain ownership of the content you upload. By using the Service, you grant us a limited license to store, process, and display your content solely for the purpose of providing the Service.'),
        ...legalSection('terms', 7, '7. Payment Terms', 'Certain features of the Service may require a paid subscription. All payments are processed securely through our payment provider (Stripe). Subscription fees are billed in advance on a recurring basis. You may cancel your subscription at any time through your account settings.'),
        ...legalSection('terms', 8, '8. Disclaimer of Warranties', 'THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. CARRYON™ DOES NOT PROVIDE LEGAL, FINANCIAL, OR TAX ADVICE. THE SERVICE IS A TOOL FOR ORGANIZING ESTATE PLANNING INFORMATION AND IS NOT A SUBSTITUTE FOR PROFESSIONAL LEGAL COUNSEL.'),
        ...legalSection('terms', 9, '9. Limitation of Liability', 'TO THE FULLEST EXTENT PERMITTED BY LAW, CARRYON™ SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.'),
        ...legalSection('terms', 10, '10. Termination', 'We reserve the right to suspend or terminate your account at our discretion if you violate these Terms. Upon termination, your right to use the Service will immediately cease. You may request export of your data prior to account deletion.'),
        ...legalSection('terms', 11, '11. Governing Law', 'These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles.'),
        f('terms.s12.title', 'Section 12 — heading', '12. Contact Us'),
        f('terms.s12.contact', 'Section 12 — line before support@carryon.us', 'If you have questions about these Terms, please contact CarryOn Technologies LLC at:'),
      ] },
    ],
  },
  {
    key: 'a11y', label: 'Accessibility', path: '/accessibility',
    sections: [
      { key: 'seo', label: 'Search result (title & description)', fields: [
        f('a11y.seo.title', 'Page title', 'Accessibility — CarryOn'),
        ML('a11y.seo.description', 'Meta description', 'Our commitment to WCAG 2.1 AA conformance and how to report an accessibility barrier.'),
      ] },
      { key: 'hero', label: 'Top of page', fields: [
        f('a11y.back', 'Back link', 'Home'),
        f('a11y.pill', 'Small pill', 'Accessibility'),
        f('a11y.title', 'Headline', 'Accessibility at CarryOn'),
        ML('a11y.intro', 'Intro paragraph', 'CarryOn targets WCAG 2.1 Level AA. Because families often use the platform during medical crises, evacuations, and bereavement, accessibility is treated as a core requirement rather than a compliance exercise.'),
      ] },
      { key: 'cards', label: 'Cards', fields: [
        f('a11y.inplace.title', 'What is in place — heading', 'What is in place today'),
        LIST('a11y.inplace.bullets', 'What is in place — one per line', [
          'Keyboard navigation across the public site and application.',
          'Skip-to-content links so keyboard and screen-reader users can bypass navigation.',
          'Visible focus indicators on interactive elements.',
          'Text resizing and pinch-zoom support — we do not disable browser or device zoom.',
          'Semantic headings and landmarks for assistive technology.',
          'Color contrast targeting the AA threshold.',
        ].join('\n')),
        f('a11y.limits.title', 'Known limitations — heading', 'Known limitations'),
        ML('a11y.limits.text', 'Known limitations — text', 'No third-party accessibility audit has been completed yet. We make no conformance claim beyond what we have verified ourselves. When an independent audit is completed, its findings — including anything we still need to fix — will be published on this page.'),
        f('a11y.report.title', 'Report a barrier — heading', 'Report an accessibility barrier'),
        ML('a11y.report.intro', 'Report a barrier — text', 'If anything on CarryOn is hard to use with assistive technology, we want to know about it and we will respond within five business days.'),
        f('a11y.report.email_label', 'Label before the e-mail address', 'Email:'),
        f('a11y.report.phone_label', 'Label before the phone number', 'Phone:'),
        f('a11y.updated', 'Last-updated line', 'Last updated: August 31, 2026.'),
      ] },
    ],
  },
];
