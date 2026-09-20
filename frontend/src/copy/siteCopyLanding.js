/**
 * Site Copy registry — the two extra paid-traffic landing pages. Each tests one proposition against
 * the same audience; the Marketing Funnel tab compares them by landing page.
 *   /ready   — Family Readiness: the 60-second quiz is the ask, CarryOn is the fix.
 *   /moments — Milestone Messages: the emotional hook.
 * `{days}` = current free-exploration length.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });

export const PAGES_LANDING = [
  {
    key: 'ready', label: 'Family Readiness landing page (/ready — quiz first)', path: '/ready',
    sections: [
      { key: 'seo', label: 'Browser tab / link preview (page is not indexed by Google)', fields: [
        f('ready.seo.title', 'Page title', 'Would your family know what to do? — CarryOn'),
        f('ready.seo.description', 'Description (link previews)', 'Eight questions, sixty seconds, no email. Find out how ready your family really is — and the three things to fix first.'),
      ] },
      { key: 'hero', label: 'Hero — the question', fields: [
        f('ready.hero.eyebrow', 'Small gold line above the headline', 'A 60-second check. No email, no sign-up.'),
        f('ready.hero.h1a', 'Headline — line 1 (white)', 'If something happened to you tomorrow,'),
        f('ready.hero.h1b', 'Headline — line 2 (gold)', 'would your family know what to do?'),
        ML('ready.hero.sub', 'Sub-headline', 'Most families would be searching — for the will, the passwords, the person to call first. Eight honest questions tell you where you stand, and exactly what to fix.'),
        f('ready.hero.cta', 'Primary button (scrolls to the quiz)', 'Find out in 60 seconds'),
        f('ready.hero.skip', 'Secondary link ({days} = free days)', 'Skip the quiz — start free for {days} days, no card'),
      ] },
      { key: 'after', label: 'Under the quiz — what CarryOn does about the gaps', fields: [
        f('ready.after.title', 'Heading', 'Every gap the quiz finds has a place in CarryOn.'),
        LIST('ready.after.items', 'Bullets (one per line)', [
          'The will and every important paper — in one encrypted vault your family can actually reach.',
          'Phone, email and bank logins — handed to the right person, and nobody else.',
          'Who to call first — ranked, with a backup for each person.',
          'What to do in the first 72 hours — a checklist drafted from your documents, finished in your words.',
        ].join('\n')),
      ] },
      { key: 'final', label: 'Final call to action', fields: [
        f('ready.final.title', 'Heading', 'Turn your score into a plan tonight.'),
        ML('ready.final.text', 'Text ({days} = free days)', 'Explore CarryOn free for {days} days — no credit card. Upload one document and name one person, and your family is already better off than this morning.'),
        f('ready.final.cta', 'Button', 'Start Free'),
      ] },
    ],
  },
  {
    key: 'moments', label: 'Milestone Messages landing page (/moments — emotional hook)', path: '/moments',
    sections: [
      { key: 'seo', label: 'Browser tab / link preview (page is not indexed by Google)', fields: [
        f('moments.seo.title', 'Page title', 'Your words for the moments you might miss — CarryOn'),
        f('moments.seo.description', 'Description (link previews)', 'Record a message for a wedding, a graduation, a first home. CarryOn holds it and delivers it on the day you choose.'),
      ] },
      { key: 'hero', label: 'Hero', fields: [
        f('moments.hero.eyebrow', 'Small gold line above the headline', 'Milestone Messages'),
        f('moments.hero.h1a', 'Headline — line 1 (white)', 'Your words for the moments'),
        f('moments.hero.h1b', 'Headline — line 2 (gold)', 'you might miss.'),
        ML('moments.hero.sub', 'Sub-headline', 'A wedding morning. A graduation. A fortieth birthday. Record a message today — video, voice, or written — and CarryOn delivers it on the day you choose, whether or not you can be there.'),
        f('moments.hero.cta', 'Primary button', 'Record your first message free'),
        f('moments.hero.nocard', 'Line under the button ({days} = free days)', '{days} days free · No credit card · Cancel anytime'),
      ] },
      { key: 'how', label: 'How it works — three steps', fields: [
        f('moments.how.title', 'Heading', 'Three steps. About two minutes.'),
        f('moments.how.1.title', 'Step 1 title', 'Record it'),
        f('moments.how.1.desc', 'Step 1 text', 'On your phone or computer. Video, audio, or a written letter — whatever feels like you.'),
        f('moments.how.2.title', 'Step 2 title', 'Choose the moment'),
        f('moments.how.2.desc', 'Step 2 text', 'A date, a birthday, a milestone — or “when I’m gone.” You decide who receives it and when.'),
        f('moments.how.3.title', 'Step 3 title', 'CarryOn delivers it'),
        f('moments.how.3.desc', 'Step 3 text', 'Encrypted until the day arrives. Then it lands exactly where you meant it to — in their hands, in your voice.'),
      ] },
      { key: 'final', label: 'Final call to action', fields: [
        f('moments.final.title', 'Heading', 'The message only you can leave.'),
        ML('moments.final.text', 'Text ({days} = free days)', 'Start free for {days} days — no credit card. Record one message tonight; the rest of your family’s plan can follow one evening at a time.'),
        f('moments.final.cta', 'Button', 'Record your first message free'),
      ] },
    ],
  },
];
