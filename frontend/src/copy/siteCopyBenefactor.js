/**
 * Site Copy registry — /benefactor, the paid-traffic landing page (one job: turn a cold visitor into a
 * CarryOn benefactor). Spine: PROBLEM → PROMISE → PROOF → PAYOFF → PRICE → CTA. Kept separate from the
 * homepage copy on purpose so the funnel can be iterated without touching carryon.us.
 * `{days}` = current free-exploration length; `{price}` = live Premium monthly price.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });

export const PAGES_BENEFACTOR = [
  {
    key: 'benefactor', label: 'Benefactor landing page (/benefactor — paid-traffic destination)', path: '/benefactor',
    sections: [
      { key: 'seo', label: 'Browser tab / link preview (page is not indexed by Google)', fields: [
        f('benefactor.seo.title', 'Page title', 'Get your family’s affairs in order — CarryOn'),
        f('benefactor.seo.description', 'Description (link previews)', 'One secure place for your documents, accounts, wishes, the people to call, and what to do next — so your family is never left searching.'),
      ] },
      { key: 'hero', label: 'Hero — problem + promise', fields: [
        f('benefactor.hero.eyebrow', 'Small gold line above the headline', 'If something happened to you tonight…'),
        f('benefactor.hero.h1a', 'Headline — line 1 (white)', 'Would your family know'),
        f('benefactor.hero.h1b', 'Headline — line 2 (gold)', 'where everything is?'),
        ML('benefactor.hero.sub', 'Sub-headline (the promise)', 'Get your family’s affairs in order. One secure place for your documents, accounts, wishes, the people to call, and the what-to-do-next plan — so the hardest day isn’t also the most confusing one.'),
        f('benefactor.hero.cta', 'Primary button', 'Get Started Free'),
        f('benefactor.hero.nocard', 'Line under the button ({days} = free days)', '{days} days free · No credit card · Cancel anytime'),
      ] },
      { key: 'problem', label: 'The problem', fields: [
        f('benefactor.problem.title', 'Heading', 'Most families are one phone call away from chaos.'),
        LIST('benefactor.problem.items', 'Bullets (one per line)', [
          'The will is “somewhere in the office.”',
          'Nobody knows the password to the phone, the bank, or the photos.',
          'The people who should be called first hear about it last.',
          'Everyone guesses what you would have wanted.',
        ].join('\n')),
        ML('benefactor.problem.closing', 'Closing line', 'It isn’t a money problem. It’s an organization problem — and it’s fixable in an evening.'),
      ] },
      { key: 'payoff', label: 'Emotional payoff — “You prepared. They’re ready.”', fields: [
        f('benefactor.payoff.h1', 'Heading — line 1 (white)', 'You prepared.'),
        f('benefactor.payoff.h2', 'Heading — line 2 (gold)', 'They’re ready.'),
        ML('benefactor.payoff.text', 'Intro paragraph', 'This isn’t really about paperwork. It’s about being the parent, spouse, or child who took care of it — so nobody has to guess what you wanted, and nobody has to carry the weight of finding out.'),
        f('benefactor.payoff.1.title', 'Card 1 title', 'Stop carrying it in your head'),
        f('benefactor.payoff.1.desc', 'Card 1 text', 'Once it’s written down and shared, you get to stop worrying about the what-ifs.'),
        f('benefactor.payoff.2.title', 'Card 2 title', 'Be the one who made it easy'),
        f('benefactor.payoff.2.desc', 'Card 2 text', 'Your family will remember that when everything else was hard, this part wasn’t.'),
        f('benefactor.payoff.3.title', 'Card 3 title', 'Share it on your terms'),
        f('benefactor.payoff.3.desc', 'Card 3 text', 'No awkward conversations. Each person sees what they need, when they need it — and nothing before.'),
      ] },
      { key: 'messages', label: 'Milestone Messages — “A message from Dad”', fields: [
        f('benefactor.mm.eyebrow', 'Small gold label', 'Milestone Messages'),
        f('benefactor.mm.title', 'Heading', 'Your words, at the moments you can’t be there for.'),
        ML('benefactor.mm.text', 'Paragraph', 'Record a message for a wedding, a graduation, a first home, a fortieth birthday. CarryOn holds it — and delivers it on the day you choose.\nA wedding morning. A phone buzzes. “A message from Dad.”'),
        f('benefactor.mm.tagline_a', 'Tagline — line 1', 'You can’t control how much time you have.'),
        f('benefactor.mm.tagline_b', 'Tagline — line 2 (gold)', 'You can control what you leave behind.'),
      ] },
      { key: 'trust', label: 'Trust & security', fields: [
        f('benefactor.trust.title', 'Heading', 'Built to be trusted with the most private things you own.'),
        LIST('benefactor.trust.items', 'Bullets (one per line)', [
          'Your files are scrambled before they’re stored, with a separate lock for every family.',
          'Two-step sign-in on every account. Passkeys supported.',
          'Nobody you invite sees anything until you say so — or until real people confirm something has happened.',
          'Your data is yours: export everything any time, backed by our written Wind-Down Promise.',
        ].join('\n')),
        f('benefactor.trust.link', 'Link to the Security page', 'Read exactly how we protect your family’s information →'),
      ] },
      { key: 'price', label: 'Price — one plan', fields: [
        f('benefactor.price.title', 'Heading', 'One plan. Everything your family needs.'),
        ML('benefactor.price.sub', 'Sub-heading', 'Your spouse, kids, and attorney see what you share at no charge while you’re alive.'),
        f('benefactor.price.tag', 'Small tag on the plan card', 'Your entire family preparedness plan'),
        f('benefactor.price.per', 'After the price', '/month'),
        f('benefactor.price.trial', 'Trial line on the card ({days} = free days)', '{days} days free. No credit card. Cancel anytime.'),
        LIST('benefactor.price.includes', 'What’s included (one per line)', [
          'Secure Document Vault — wills, trusts, policies, deeds',
          'Milestone Messages — video, audio, or written',
          'Immediate Action Checklist — what your family does first',
          'Passwords & accounts, handed to the right person',
          'Estate Guardian™ AI review of your documents',
          'Full financial picture and family notification list',
        ].join('\n')),
        f('benefactor.price.cta', 'Plan button ({days} = free days)', 'Start my {days}-day free trial'),
        f('benefactor.price.fine', 'Fine print under the button', 'Secure checkout by Stripe · Cancel in one click from Settings'),
        f('benefactor.price.compare', 'Link to all plans', 'Compare all plans, including reduced pricing for seniors, military and hospice →'),
        f('benefactor.price.all_title', 'Heading when all three plans are shown (?v=all)', 'Choose the plan that fits your family.'),
        f('benefactor.price.all_cta', 'Button on each plan (?v=all)', 'Start free'),
      ] },
      { key: 'faq', label: 'Questions', fields: [
        f('benefactor.faq.title', 'Heading', 'Questions people ask before they start'),
        ...[
          ['1', 'Do I need a credit card to start?', 'No. Explore for {days} days first — upload documents, invite people, build your checklist. You’ll be asked to choose a plan only when the exploration period ends.'],
          ['2', 'Who can see what I upload?', 'Only the people you name, and only what you assign to each of them. Nothing unlocks until you say so, or until real people confirm something has happened.'],
          ['3', 'What happens to my family’s access if something happens to me?', 'Your beneficiaries verify with us — a certified death certificate is reviewed by a person — and the documents, messages and checklist you prepared open to them, in the order you set.'],
          ['4', 'What if CarryOn goes out of business?', 'Our written Wind-Down Promise spells out the notice you would receive and how you would take your family’s entire plan with you. No family loses access without warning.'],
          ['5', 'Can I cancel?', 'Any time, in one click from Settings. Your data stays exportable.'],
        ].flatMap(([n, q, a]) => [
          f(`benefactor.faq.${n}.q`, `Question ${n}`, q),
          ML(`benefactor.faq.${n}.a`, `Answer ${n}`, a),
        ]),
      ] },
      { key: 'final', label: 'Final call to action', fields: [
        f('benefactor.final.title', 'Heading', 'Tonight, your family could know exactly what to do.'),
        ML('benefactor.final.text', 'Text', 'Upload one document and invite one person — that’s a real start. Everything else can follow, one evening at a time.'),
        f('benefactor.final.cta', 'Button', 'Get Started Free'),
      ] },
    ],
  },
];
