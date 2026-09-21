/**
 * Site Copy registry — every founder-editable string on the public site.
 *
 * Each field: { k: stable key, label: what the founder sees, d: built-in default }.
 * Components read text with useCopy().t(key); the Founder portal (Admin → Marketing →
 * Site Copy) lists these fields page → section → field and saves overrides to
 * /api/admin/site-copy. Plain text + line breaks; `**bold**` is the only inline mark.
 * `locked` fields are platform law (official tool / pillar names) and render read-only.
 */
import { PAGES_PHASE2 } from './siteCopyPhase2';
import { PAGES_APP } from './siteCopyApp';
import { PAGES_READINESS } from './siteCopyReadiness';
import { PAGES_GUIDES } from './siteCopyGuides';
import { PAGES_BENEFACTOR } from './siteCopyBenefactor';
import { PAGES_LANDING } from './siteCopyLanding';
import { PAGES_SOURCES } from './siteCopySources';

const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const L = (k, label, d) => f(k, label, d, { locked: true });

const TOOLS = [
  ['beneficiaries', 'Beneficiaries', 'The people who matter, and what each one sees',
    'Name your spouse, kids, siblings, attorney — and decide exactly what each person can see, and when.',
    'Everything in CarryOn is built around the people you name. Each person gets their own access: your spouse sees the accounts, your attorney sees the will, your kids get the messages. Change it any time. Nothing unlocks until you say so, or until real people confirm something has happened.'],
  ['mm', 'Milestone Messages', 'Messages for the moments you’ll miss',
    'Your words at their wedding. Your voice on their birthday. Delivered exactly when it matters.',
    'Record written, audio, or video messages for graduations, births, first homes — any moment you want to be part of, even if you can’t be there. Add as many as you like, whenever you like.'],
  ['ffn', 'Family & Friends Notification', 'Who to notify',
    'The people who matter most should never hear important news through the grapevine.',
    'Keep a list of family, friends, colleagues, and anyone else your loved ones should reach out to. Names, numbers, relationships, and notes — organized so your family can make the calls without hunting through your phone.'],
  ['dts', 'Designated Trustee Services', 'Someone you trust can act for you',
    'Let an attorney, advisor, or family member step in and manage things on your behalf — with every action written down.',
    'Name a trustee and choose what they can do. They work inside your plan under their own login, and you can see every change they make and when they made it. Helpful when a parent needs a hand today, not just someday.'],
  ['sdv', 'Secure Document Vault', 'Every important document, in one place',
    'Wills, trusts, insurance policies, deeds — encrypted, organized, and shared only with the people you choose.',
    'Upload the paperwork your family would otherwise tear the house apart looking for. Your files are scrambled before they’re stored, with a separate lock for every family. They aren’t casually accessible to CarryOn staff — privileged access is limited to defined support tasks and every open is logged. Your loved ones see exactly what you allow — nothing more.'],
  ['dav', 'Digital Access Vault', 'Passwords and accounts',
    'Logins, subscriptions, crypto keys, and account numbers — saved, encrypted, and assigned to the right person.',
    'The average family has dozens of accounts nobody else can get into. Store them here, decide who gets what, and nothing gets locked away forever or forgotten.'],
  ['ega', 'Estate Guardian™ AI', 'An AI review of your documents',
    'An AI review, tuned to your state’s laws, that finds what you missed — and only reads your documents when you ask it to.',
    'It looks for contradictions, gaps, outdated provisions, and missing pieces, then pulls out the details your family will need in a hurry: claim phone numbers, executor contacts, filing deadlines. It uses a trusted AI service under contract, and your documents are never used to teach it.'],
  ['cfp', 'CarryOn Financial Picture', 'The full money picture',
    'Accounts, investments, policies, bills, debts, and property — the whole picture in one encrypted view.',
    'Not a budgeting app. A clear map of what you have, what you owe, and where it all lives, so the person settling your affairs isn’t piecing it together from mail and bank statements. Share the parts each person needs.'],
  ['ces', 'CarryOn Entities & Structures', 'How it all fits together',
    'Every trust, LLC, partnership, and charitable entity — and the people connected to each — on one visual chart.',
    'If you own a business, hold property in a trust, or have more than one entity, your family will need to see how the pieces connect. Pan, zoom, and follow the lines from each entity to its documents and its people.'],
  ['iac', 'Immediate Action Checklist', 'What to do first',
    'A step-by-step guide your family can follow on the hardest days of their lives.',
    'Started for you from your documents and finished by you. When something happens, your family opens one list and knows what to do, who to call, where every document is, and which deadlines matter. No guessing. No searching.'],
  ['ccp', 'Contingency Protocols', 'Emergency plans',
    'Plans your family builds now for the situations they might face — ready the moment they’re needed.',
    'A medical emergency. A natural disaster. A job loss. The passing of a family member. Each plan connects the right people, documents, checklists, and conversations so your family can act together instead of scrambling.'],
  ['ect', 'Estate Communications Tool', 'Private family messaging',
    'A secure place for the conversations that shouldn’t happen over group text.',
    'Encrypted, access-controlled messaging between you and the people you’ve chosen, built for sensitive family coordination. When an emergency plan kicks in, this is how everyone stays on the same page — privately.'],
  ['bec', 'Beneficiary Estate Concierge', 'Answers for your family, when you can’t give them',
    'After the transition, your family can ask plain-English questions — “what did Dad want done with the house?” — and get answers drawn only from what you released to them, with the source shown.',
    'It reads only the documents each person was given access to, never anything else, and points to the exact page it’s quoting. It doesn’t give legal advice and it doesn’t guess. It helps your family find what you already decided.'],
];

const PILLARS = [
  ['people', 'People', 'Who matters, what each of them sees, and who can act for you.'],
  ['access', 'Access', 'Documents, passwords, and a second set of eyes on all of it.'],
  ['money', 'Money', 'The full picture, and how the pieces fit together.'],
  ['action', 'Action', 'What your family does first, and how they stay on the same page.'],
];

const toolFields = TOOLS.flatMap(([key, product, title, bold, desc]) => [
  L(`home.tools.${key}.product`, `${product} — official name`, product),
  f(`home.tools.${key}.title`, `${product} — plain-English title`, title),
  f(`home.tools.${key}.bold`, `${product} — highlighted line`, bold),
  f(`home.tools.${key}.desc`, `${product} — description`, desc, { multiline: true }),
]);

const FAQ = [
  ['Does CarryOn replace my estate attorney?', 'No. CarryOn organizes everything your attorney creates — wills, trusts, powers of attorney, insurance policies — and flags gaps or contradictions your attorney should review. Think of it as the place your estate plan lives, not a replacement for legal counsel.'],
  ['CarryOn is new. How do I know it will be around?', 'Fair question. CarryOn was founded in 2024 and is founder-led. Your documents never depend on us: you can export everything at any time, and our written Wind-Down Promise guarantees at least 90 days’ notice and open export paths if the company ever closes. We would rather earn your trust with those guarantees than with numbers we can\'t back up.'],
  ['What happens to my family\'s documents if CarryOn closes?', 'Your data is yours. You can export everything at any time. Our written Wind-Down Promise commits us to at least 90 days’ advance notice, open export paths the entire time, and files you can read on your own computer forever. Your family\'s preparedness never depends on a single company.'],
  ['Is hospice access really free?', 'Yes — full platform access, no exceptions, for all U.S. citizens and resident aliens enrolled in certified hospice care. No credit card, no timer, no reduced features. This is a core part of our mission.'],
  ['How does military and veteran pricing verification work?', 'Select the Military or Veteran tier during signup. We verify service status through a simple document upload — a military ID, DD214, or VA Benefits Letter. Verification is typically completed within 24 hours.'],
  ['Can my family access the vault if I\'m overseas or unreachable?', 'Yes. CarryOn\'s Emergency Access protocol lets the people you\'ve designated request vault access when you are incapacitated or unreachable. Every request is verified by our Transition Verification Team — real people, not algorithms.'],
];

const PAGES_PHASE1 = [
  {
    key: 'home', label: 'Homepage', path: '/',
    sections: [
      { key: 'seo', label: 'Search result (Google)', fields: [
        f('home.seo.title', 'Page title', 'CarryOn - Get Your Family’s Affairs in Order, In One Secure Place'),
        f('home.seo.description', 'Meta description (keep under 155 characters)', 'One secure place for documents, passwords, who to call first, and what to do next — so your family can handle what comes next. Built by a 24-year veteran.', { multiline: true }),
      ] },
      { key: 'nav', label: 'Navigation bar & footer (all marketing pages)', fields: [
        f('nav.features', 'Menu: Features', 'Features'),
        f('nav.quiz', 'Menu: Readiness Quiz', 'Readiness Quiz'),
        f('nav.security', 'Menu: Security', 'Security'),
        f('nav.steps', 'Menu: How It Works', 'How It Works'),
        f('nav.pricing', 'Menu: Pricing', 'Pricing'),
        f('nav.compare', 'Menu: Compare', 'Compare'),
        f('nav.customers', 'Menu: Customers', 'Customers'),
        f('nav.about', 'Menu: About', 'About'),
        f('nav.founder', 'Menu: Founder (About page nav)', 'Founder'),
        f('nav.start', 'Button: Start Now', 'Start Now'),
        f('nav.signin', 'Button: Sign In', 'Sign In'),
        f('nav.start_plan', 'Sign-in page nav button', 'Start your family’s plan'),
        f('footer.pricing', 'Footer: Pricing', 'Pricing'),
        f('footer.customers', 'Footer: Customer Stories', 'Customer Stories'),
        f('footer.compare', 'Footer: Compare', 'Compare'),
        f('footer.security', 'Footer: Security', 'Security'),
        f('footer.winddown', 'Footer: Wind-Down Promise', 'Wind-Down Promise'),
        f('footer.changelog', 'Footer: What’s New', 'What’s New'),
        f('footer.about', 'Footer: About', 'About'),
        f('footer.privacy', 'Footer: Privacy Policy', 'Privacy Policy'),
        f('footer.terms', 'Footer: Terms of Service', 'Terms of Service'),
        f('footer.accessibility', 'Footer: Accessibility', 'Accessibility'),
        f('footer.readiness', 'Footer: How We Score Readiness', 'How We Score Readiness'),
        f('footer.sources', 'Footer: Sources & Methodology', 'Sources & Methodology'),
        f('footer.guides', 'Footer: Guides (shown once the Guides section is launched)', 'Guides'),
        f('footer.founder', 'Footer: Founder story (shown while the Founder story is public)', 'Founder story'),
        f('footer.copyright', 'Footer: copyright line (year is added automatically)', 'CarryOn Enterprises Inc. All rights reserved.'),
      ] },
      { key: 'hero', label: 'Hero (top of /home page)', fields: [
        f('home.hero.eyebrow', 'Small gold line above the headline', 'Every American Family. Ready.'),
        f('home.hero.h1a', 'Headline — line 1 (white)', 'Get your family’s affairs in order'),
        f('home.hero.h1b', 'Headline — line 2 (gold)', '— in one secure place.'),
        f('home.hero.sub', 'Sub-headline', 'So your family knows where everything lives, who to call first, and what to do next — if something happens to you.', { multiline: true }),
        f('home.hero.badge1', 'Trust badge 1', 'Scrambled before it’s stored'),
        f('home.hero.badge2', 'Trust badge 2', 'A separate lock for every family'),
        f('home.hero.badge3', 'Trust badge 3', 'Two-step sign-in'),
        f('home.hero.cta', 'Primary button', 'Start Now'),
        f('home.hero.see', 'Secondary button', 'See it in action'),
        f('home.hero.nocard', 'Line under the buttons (before the links)', 'Explore first — no credit card needed. Or'),
        f('home.hero.quizlink', 'Link text: readiness quiz', 'take the 60-second readiness quiz'),
        f('home.hero.pricinglink', 'Link text: pricing', 'view pricing'),
        f('home.hero.livecount', 'Live family count badge — text after the number', 'families set up — live count'),
      ] },
      { key: 'login', label: 'Sign-in page hero (/) — the page visitors land on', fields: [
        f('login.seo.title', 'Page title', 'CarryOn™ — The Family Continuity Platform'),
        f('login.seo.description', 'Meta description', 'If something happens tomorrow, your family knows exactly what to do. The complete continuity system for every disruption — hospital stay, deployment, disaster, or the final day.', { multiline: true }),
        f('login.hero.eyebrow', 'Small gold line above the headline', 'The Family Continuity Platform'),
        f('login.hero.h1a', 'Headline — line 1 (white)', 'If something happens tomorrow, your family knows'),
        f('login.hero.h1b', 'Headline — line 2 (gold, italic)', 'exactly what to do.'),
        f('login.hero.sub', 'Sub-headline (desktop)', 'CarryOn is the continuity system for your family — keeping everyone ready, connected, and clear through every disruption, from a hospital stay to the final day. Built calmly today; there the moment your family needs it.', { multiline: true }),
        f('login.hero.sub_mobile', 'Sub-headline (phone)', 'CarryOn is the continuity system for your family — ready, connected, and clear through every disruption, from a hospital stay to the final day.', { multiline: true }),
      ] },
      { key: 'more', label: 'Collapsed detail — “See everything CarryOn includes”', fields: [
        f('home.more.title', 'Expander heading', 'See everything CarryOn includes'),
        f('home.more.sub', 'Line under the heading', 'The twelve tools, how setup works in five steps, exactly how we protect your information, our hospice and military programs, and answers to the questions families ask.'),
        f('home.more.open', 'Button — expand', 'Show me everything'),
        f('home.more.close', 'Button — collapse', 'Show less'),
      ] },
      { key: 'video', label: 'Video section', fields: [
        f('home.video.title', 'Heading', 'See CarryOn in Action'),
        f('home.video.sub', 'Sub-heading', 'Learn how CarryOn™ keeps your family ready for anything.'),
      ] },
      { key: 'problem', label: '“Nobody knows where anything is”', fields: [
        f('home.problem.h1', 'Heading — line 1', 'Nobody knows where anything is.'),
        f('home.problem.h2', 'Heading — line 2 (gold)', 'Until now.'),
        f('home.problem.p1', 'Paragraph 1', 'When something happens, the first days look the same for almost every family: opening drawers, looking for a will that might not exist, calling numbers you\'re not sure are right, guessing at passwords. Not because anyone was careless — because nobody ever wrote it all down in one place.', { multiline: true }),
        f('home.problem.p2', 'Paragraph 2', 'CarryOn™ is that place. One secure spot to get your affairs in order — your documents, your passwords, the people to call, the messages you want to leave, and a clear plan your loved ones can actually follow — so they can handle what comes next instead of trying to figure it out alone.', { multiline: true }),
        f('home.problem.cta', 'Button', 'Get Started'),
        f('home.problem.italic', 'Italic gold line', 'Useful today — finding the deed, sharing a policy with your spouse — and essential on the day your family needs it most.'),
        f('home.problem.stat', 'Statistic line', 'Settling an estate takes the average executor about **570 hours**, spread over roughly 16 months. Writing it all down in one place is how that number comes down.'),
        f('home.problem.for_label', '“Built for” label', 'Built for'),
        f('home.problem.for_text', '“Built for” text', 'Everyday American families — a house, a phone full of accounts, a few policies, and people who\'d have to sort it all out. No estate attorney on retainer required.', { multiline: true }),
        f('home.problem.notfor_label', '“Probably not for” label', 'Probably not for'),
        f('home.problem.notfor_text', '“Probably not for” text', 'Families with a family office or a full-time advisor already keeping everything current. If that\'s you, you\'re covered — and we\'d rather say so than sell you something you don\'t need.', { multiline: true }),
      ] },
      { key: 'outcomes', label: '“For your peace of mind today”', fields: [
        f('home.outcomes.h1', 'Heading — line 1', 'For your peace of mind today.'),
        f('home.outcomes.h2', 'Heading — line 2 (gold)', 'For their relief when it counts.'),
        f('home.outcomes.intro', 'Intro paragraph', 'Getting your affairs in order isn\'t really about paperwork. It\'s about being the parent, spouse, or child who took care of it — so nobody has to guess what you would have wanted, and nobody has to carry the weight of finding out.', { multiline: true }),
        f('home.outcomes.1.title', 'Card 1 title', 'Stop carrying it in your head'),
        f('home.outcomes.1.desc', 'Card 1 text', 'Once it’s written down and shared, you get to stop worrying about the what-ifs.'),
        f('home.outcomes.2.title', 'Card 2 title', 'Be the one who made it easy'),
        f('home.outcomes.2.desc', 'Card 2 text', 'Your family will remember that when everything else was hard, this part wasn’t.'),
        f('home.outcomes.3.title', 'Card 3 title', 'Be seen as the one who cared enough to plan'),
        f('home.outcomes.3.desc', 'Card 3 text', 'No awkward conversations required — share what each person needs to know, when they need it, on your terms. What your family remembers is that you thought of them first.'),
        f('home.outcomes.closing', 'Closing italic line', 'CarryOn™ isn\'t something you set up and forget. It\'s a living plan your family uses today and relies on tomorrow.'),
      ] },
      { key: 'pillars', label: 'Four pillars · twelve tools', fields: [
        f('home.pillars.title', 'Heading', 'Everything your family will need. In one place.'),
        f('home.pillars.sub', 'Sub-heading', 'Your documents, your passwords, the people to call, your money, and what your family does first — twelve tools, grouped the way your family will use them, plus one that works for them after you\'re gone. Start with what matters most and add the rest over time.', { multiline: true }),
        f('home.pillars.pillar_word', 'Word before the pillar number (“Pillar 01”)', 'Pillar'),
        ...PILLARS.flatMap(([key, label, tagline]) => [
          L(`home.pillars.${key}.label`, `Pillar: ${label} — official name`, label),
          f(`home.pillars.${key}.tagline`, `Pillar: ${label} — tagline`, tagline),
        ]),
        ...toolFields,
        f('home.after.eyebrow', 'Family-side tool — small label', 'For your family, after'),
        f('home.after.title', 'Family-side tool — heading', 'Not a pillar'),
        f('home.after.tagline', 'Family-side tool — tagline', 'the one tool built for the people you leave behind.'),
        f('home.handled.title', 'Closing tile — heading', 'It\'s handled.'),
        f('home.handled.text', 'Closing tile — text', 'One place. One family. A living plan that grows with you — so that whatever life brings, your family is never left searching, wondering, or scrambling. And you get to stop carrying it all in your head.', { multiline: true }),
        f('home.handled.italic', 'Closing tile — italic line', 'They\'re ready. Because you prepared.'),
      ] },
      { key: 'platform', label: '“Built for Real Families”', fields: [
        f('home.platform.title', 'Heading', 'Built for Real Families.'),
        f('home.platform.sub', 'Sub-heading', 'Beyond the essentials, CarryOn™ is built around how families actually live — blended, spread out, busy, and human.', { multiline: true }),
        ...[
          ['1', 'Your people, your rules', 'Invite the people you trust. Decide exactly what each person can see, access, and manage.'],
          ['2', 'A backup for your backup', 'Rank who steps in if your first choice can’t. If someone can no longer serve, the next person is promoted automatically.'],
          ['3', 'More than one household', 'Manage a parent’s affairs alongside your own — built for blended, extended, and modern families.'],
          ['4', 'Family plan savings', 'Bundle your household on one plan. Added family members pay a reduced rate set in your plan details.'],
          ['5', 'Emergency access', 'A verified way for the people you’ve chosen to request access if you’re incapacitated or unreachable.'],
          ['6', 'Share only what’s needed', 'Your spouse sees the accounts. Your attorney sees the will. Your kids see the messages. You decide, per person.'],
          ['7', 'On your phone', 'Works on any phone — add it to your home screen and get alerts. Your plan goes wherever you go.'],
          ['8', 'Tuned to your state', 'Estate Guardian™ AI reviews your documents against the laws of the state you live in — not generic advice.'],
        ].flatMap(([n, title, desc]) => [
          f(`home.platform.${n}.title`, `Card ${n} title`, title),
          f(`home.platform.${n}.desc`, `Card ${n} text`, desc),
        ]),
      ] },
      { key: 'steps', label: 'Five steps', fields: [
        f('home.steps.title', 'Heading', 'Your affairs in order, in five steps.'),
        f('home.steps.sub', 'Sub-heading', 'You don\'t need to do it all at once. Start with what matters most and build the rest over time.'),
        ...[
          ['1', 'Add your people', 'Invite the people who matter most — spouse, kids, a sibling, your attorney. Decide what each of them can see.'],
          ['2', 'Leave your messages', 'Record messages for the moments you want to be part of — graduations, weddings, birthdays, or just a Tuesday. Add more whenever you like.'],
          ['3', 'Upload your documents', 'Add wills, policies, deeds, and account details to your vault. Estate Guardian™ AI reviews them and starts your family’s what-to-do-first list for you.'],
          ['4', 'Build your plans', 'Set up emergency plans for the situations that worry you. Connect the right people, documents, and checklists so everyone knows their part.'],
          ['5', 'Live your life', 'Save your passwords and accounts, list who to notify, and update things when life changes. That’s it. Your family will never be left searching.'],
        ].flatMap(([n, title, desc]) => [
          f(`home.steps.${n}.title`, `Step ${n} title`, title),
          f(`home.steps.${n}.desc`, `Step ${n} text`, desc),
        ]),
      ] },
      { key: 'security', label: 'Security section', fields: [
        f('home.security.title', 'Heading', 'Your Family\'s Privacy Is Non-Negotiable.'),
        f('home.security.sub', 'Sub-heading', 'The most important things your family will ever share live here. So we don\'t use broad labels. We say exactly what we do: a separate encryption key for every family, support staff who cannot open your files, two-step sign-in, real people who verify before anything unlocks, a record of every access, and your right to export or delete everything — any time.', { multiline: true }),
        ...[
          'Your files are scrambled before they’re stored, with a separate lock for every family — privileged staff access is restricted to defined administrative tasks, controlled and audited',
          'Estate Guardian™ AI only reads your documents when you ask it to. It uses a trusted AI service under contract, and your documents are never used to teach it',
          'Two-step sign-in, on by default, with trusted-device options for your family',
          'Real people — not algorithms — confirm a death or incapacity before anything unlocks',
          'If you ever leave, your records stay downloadable for 90 days, then are permanently deleted',
          'Every time a file is opened, we write down who did it and when — designed around SOC 2 controls, with the right to export or delete your data',
        ].map((text, i) => f(`home.security.${i + 1}`, `Card ${i + 1}`, text)),
      ] },
      { key: 'trust', label: '“We’re new. Here’s what we can promise.”', fields: [
        f('home.trust.title', 'Heading', 'We\'re new. Here\'s what we can promise.'),
        f('home.trust.sub', 'Sub-heading', 'You won\'t find invented testimonials or made-up customer counts here. Every number and every story on this site is real, or it isn\'t here. These are the things we can stand behind today.', { multiline: true }),
        f('home.trust.reviews.eyebrow', 'Independent reviews card — small label (shown once a Trustpilot link is set in Site Content)', 'Independent reviews'),
        f('home.trust.reviews.title', 'Independent reviews card — heading', 'What families say about us on Trustpilot'),
        f('home.trust.reviews.text', 'Independent reviews card — text', 'Reviews there are collected and shown by Trustpilot, not by us — we can\'t edit or remove them.'),
        f('home.trust.reviews.read', 'Independent reviews card — read link', 'Read the reviews'),
        f('home.trust.reviews.write', 'Independent reviews card — write link', 'Write a review'),
        ...[
          ['1', 'Your files, locked per family', 'Scrambled before they’re stored, with a separate lock for every family. They aren’t casually accessible to CarryOn staff — privileged access is limited to defined administrative functions, controlled and audited — and every time a file is opened, we write down who did it and when.'],
          ['2', 'Your data is yours. Leave anytime.', 'Export everything whenever you want and cancel from your account. No hoops, no phone calls.'],
          ['3', 'Try it before you pay', 'Every plan starts with an exploration period — no credit card needed. Set up your vault, invite one person, and see if it fits.'],
          ['4', 'Built in Arlington, Virginia since 2024', 'A registered U.S. company with a real address, a real phone number, and a founder who answers to his name.'],
        ].flatMap(([n, title, desc]) => [
          f(`home.trust.${n}.title`, `Card ${n} title`, title),
          f(`home.trust.${n}.desc`, `Card ${n} text`, desc),
        ]),
      ] },
      { key: 'faq', label: 'Common Questions (FAQ)', fields: [
        f('home.faq.title', 'Heading', 'Common Questions'),
        ...FAQ.flatMap(([q, a], i) => [
          f(`home.faq.${i + 1}.q`, `Question ${i + 1}`, q),
          f(`home.faq.${i + 1}.a`, `Answer ${i + 1}`, a, { multiline: true }),
        ]),
        f('home.faq.winddown_link', 'Link text shown after answers 2 and 3', 'Read the Wind-Down Promise'),
      ] },
      { key: 'hospice', label: 'Hospice, military & new adult', fields: [
        f('home.hospice.title', 'Heading', 'Free for Every American in Hospice Care.'),
        f('home.hospice.p1', 'Paragraph', 'At any given time, over 300,000 Americans are in hospice — and their families are about to carry a great deal at once. CarryOn™ is offered at no cost to all U.S. citizens and resident aliens enrolled in certified hospice care. Full platform access. No exceptions.', { multiline: true }),
        f('home.hospice.p2', 'Italic line', 'No one should be denied the ability to get their affairs in order and prepare their family — simply because of their circumstances.'),
        f('home.hospice.mil_title', 'Military card title', 'Military & Veteran Families'),
        f('home.hospice.mil_text', 'Military card text', 'Reduced pricing for active-duty service members, veterans, and their families. Your service prepared you for everything — let CarryOn help prepare your family for anything else.', { multiline: true }),
        f('home.hospice.young_title', 'New adult card title', 'New Adult Tier (18–25)'),
        f('home.hospice.young_text', 'New adult card text', 'A dedicated tier for young Americans just starting out. Because getting your affairs in order shouldn\'t start when you think you need it — it should start the day you\'re responsible for yourself.', { multiline: true }),
      ] },
      { key: 'final', label: 'Final call to action', fields: [
        f('home.final.title', 'Heading', 'Start getting your affairs in order today.'),
        f('home.final.text', 'Text', 'Upload one document and invite one person — that\'s a real start. Whatever comes next, your family will know where to look, who to call, and what to do.', { multiline: true }),
        f('home.final.cta', 'Button', 'Start Now'),
      ] },
    ],
  },
  {
    key: 'about', label: 'About page', path: '/about',
    sections: [
      { key: 'seo', label: 'Search result (Google)', fields: [
        f('about.seo.title', 'Page title', 'About CarryOn - Family Preparedness Mission & Team'),
        f('about.seo.description', 'Meta description', 'Why CarryOn exists: to make family readiness accessible to every American family, not just the wealthy. Founded by a 24-year military veteran.', { multiline: true }),
      ] },
      { key: 'hero', label: 'Hero', fields: [
        f('about.hero.title', 'Headline', 'We Believe Readiness Is the Greatest Gift a Family Can Give Itself.'),
        f('about.hero.sub', 'Sub-headline', 'CarryOn™ was built because every family deserves to be organized, informed, and prepared — regardless of income, background, or circumstance.', { multiline: true }),
      ] },
      { key: 'every', label: '“Built for Every Family. Period.”', fields: [
        f('about.every.title', 'Heading', 'Built for Every Family. Period.'),
        f('about.every.p1', 'Paragraph 1', 'You know the scenario. Someone you love is gone — and suddenly you\'re standing in their kitchen, opening drawers, looking for a will that might not exist, calling numbers you\'re not sure are right, trying to figure out what they wanted while barely holding yourself together.', { multiline: true }),
        f('about.every.p2', 'Paragraph 2', '76% of U.S. adults reported not having a will in a 2025 survey. And even having a will doesn\'t necessarily mean your family knows where everything is, who to call, or what to do first. Not because people don\'t care — but because no one gave them a simple, secure, affordable way to get ready.', { multiline: true }),
        f('about.every.why', 'Sub-heading', 'That\'s why CarryOn exists.'),
        f('about.every.p3', 'Paragraph 3 (the word **every** is bolded)', 'Not only for the wealthy families who already have estate attorneys on retainer. Not only for the tech-savvy early adopters who track everything in spreadsheets. For **every** family — the single parent working two jobs who needs a checklist their kids can follow, the young couple who just bought their first home and realized they have no plan, the grandparent who wants their voice heard at a graduation they might not make, the blended family navigating who gets what and who needs to know.', { multiline: true }),
        f('about.every.p4', 'Paragraph 4', 'CarryOn is the platform that meets all of them where they are — with security they can trust, simplicity they can use, and a price they can afford.', { multiline: true }),
        f('about.every.quote', 'Pull quote', 'We\'re not just an app. We build infrastructure for family preparedness — so that when the hardest day comes, your family isn\'t searching. They\'re ready.', { multiline: true }),
      ] },
      { key: 'mission', label: 'Mission & Vision', fields: [
        f('about.mission.title', 'Mission — title', 'Our Mission'),
        f('about.mission.text', 'Mission — text', 'Ensure every American family has the clarity, organization, and readiness they need for life\'s most critical transitions — reducing overwhelm through secure estate infrastructure and intelligent document analysis.', { multiline: true }),
        f('about.vision.title', 'Vision — title', 'Our Vision'),
        f('about.vision.text', 'Vision — text', 'Define the family readiness category and become the standard for families and institutions that refuse to leave their affairs to chance.', { multiline: true }),
      ] },
      { key: 'values', label: 'Our Values', fields: [
        f('about.values.title', 'Heading', 'Our Values'),
        ...[
          ['1', 'Readiness Over Reaction.', 'We don\'t wait for crisis. We prepare for it.'],
          ['2', 'Security you can inspect.', 'Your files are scrambled before they’re stored, with a separate lock for every family. Our AI only reads your documents when you ask it to. Privileged access is restricted to defined administrative functions and is controlled and audited — our Security page documents exactly how.'],
          ['3', 'Accessible to Every Family.', 'Not just the wealthy. Not just the tech-savvy. Not just the married, the traditional, or the conventional. Every family — however you define yours.'],
          ['4', 'Lean by Design.', 'Every dollar earns its keep. Every feature ships because families need it — not because investors want it.'],
          ['5', 'People First. Always.', 'Behind every document in our vault is a person someone loves. Behind every checklist item is a task someone will face on the worst day of their life. We never forget that. Our platform is secure and automated, but our operational teams are real people — trained, empathetic, and personally invested in getting this right for your family.'],
        ].flatMap(([n, title, desc]) => [
          f(`about.values.${n}.title`, `Value ${n} title`, title),
          f(`about.values.${n}.desc`, `Value ${n} text`, desc, { multiline: true }),
        ]),
      ] },
      { key: 'who', label: 'Who We Are', fields: [
        f('about.who.title', 'Heading', 'Who We Are'),
        f('about.who.p1', 'Paragraph 1', 'CarryOn is led by a small, focused team that believes this work matters. Our leadership brings deep experience across operations, legal, finance, and technology — but what unites us isn\'t our résumés. It\'s the shared conviction that three out of four adults without a will is an unacceptable number, and that every family — regardless of who they are, where they live, or what they look like — deserves to be ready.', { multiline: true }),
        f('about.who.p2', 'Paragraph 2', 'The people behind CarryOn are trained for empathy, precision, and the kind of care this work demands. Today that starts with the founder, who personally answers support and reviews every verification.', { multiline: true }),
        f('about.who.linkedin', 'Founder LinkedIn link text', 'LinkedIn Profile'),
        ...[
          ['1', 'Customer Service Team (CST)', 'Human support from the founder, in-app'],
          ['2', 'Transition Verification Team (TVT)', 'Death certificate verification and beneficiary activation'],
          ['3', 'Trustee Services Team (TST)', 'Confidential execution of Designated Trustee Services (DTS) tasks'],
        ].flatMap(([n, title, desc]) => [
          f(`about.team.${n}.title`, `Team card ${n} title`, title),
          f(`about.team.${n}.desc`, `Team card ${n} text`, desc),
        ]),
      ] },
      { key: 'cta', label: 'Call to action', fields: [
        f('about.cta.title', 'Heading', 'Your Family Deserves to Be Ready.'),
        f('about.cta.button', 'Button', 'Get Started'),
      ] },
    ],
  },
  {
    key: 'founder', label: 'Founder story (public or invite-only — Admin → Site Content)', path: '/founder-about',
    sections: [
      { key: 'seo', label: 'Search result (Google)', fields: [
        f('founder.seo.title', 'Page title', 'Founder — CarryOn'),
        f('founder.seo.description', 'Meta description', 'About the founder of CarryOn.'),
      ] },
      { key: 'story_hero', label: 'Story — Hero', fields: [
        f('founder.story.hero.h1a', 'Headline — line 1 (white)', 'CarryOn™ Technologies:'),
        f('founder.story.hero.h1b', 'Headline — line 2 (gold)', 'Why I Built It'),
        f('founder.story.hero.byline', 'Byline', 'A Founder\'s Story by Barnet L. Harris II'),
        f('founder.story.hero.epigraph', 'Opening line', 'In my family, legacy isn\'t an abstract word—it\'s a living thread.'),
      ] },
      { key: 'story_origins', label: 'Story — Family Origins', fields: [
        f('founder.story.origins.title', 'Heading', 'Family Origins — The Marine\'s Marine'),
        f('founder.story.origins.p1', 'Paragraph 1', 'The legacy I inherited began with my grandfather, Barnet L. Harris—an orphan who ran away from home as a boy, stowing away on a train to anywhere. He was taken in by a Scottish immigrant family who gave him their name and a new start. He became a Marine in World War I, right in the thick of it—in the places that forged the Corps\' legend: the "Devil Dog" grit, the blood-stripe pride. Decorated by the French Foreign Legion and later serving as one of the Corps\' premier bayonet instructors, he forged the lore that echoed at our dinner table.', { multiline: true }),
        f('founder.story.origins.p2', 'Paragraph 2 (**…** shows in gold italics)', 'After the war, he drove a taxi in New York City. Not glamorous, but honest. He carried people where they needed to go, and he used to say, **"if you always tell the truth, you ain\'t gotta remember notin\'!"** That simple practicality fit him. Over time, that plainspoken wisdom became something more—a quiet family ethos that shaped how we showed up in the world: direct, honorable, and accountable. Even so, much of his deeper guidance faded with the years, leaving only this surviving fragment despite my father\'s best efforts to keep his memory alive in mine.', { multiline: true }),
      ] },
      { key: 'story_father', label: 'Story — My Father', fields: [
        f('founder.story.father.title', 'Heading', 'My Father — The Warrior Turned Inventor'),
        f('founder.story.father.p1', 'Paragraph 1', 'My father, Arthur M. Harris, was a WWII Marine—a flamethrower in the first wave at Cape Gloucester—later a chief engineer aboard a Maritime Sea Transport Service ship operating with the U.S. Navy in the Korean War. At home, he turned that same courage into creation and invented things we take for granted: the mouth-to-mouth resuscitator, the inhaler, the aerosol valve, ultrasonic debonding, even the injection-molding process for golf balls—over 300 patents in a lifetime.', { multiline: true }),
        f('founder.story.father.p2', 'Paragraph 2', 'A stand-up comedian, singer, prize fighter, stock-car driver, international corporate president, CIA courier, and close friend of Albert Einstein in the twilight of Einstein\'s life—because, why not?! He had me at 50 and lived to 88. My father didn\'t just make products; he made possibility.', { multiline: true }),
        f('founder.story.father.p3', 'Paragraph 3', 'But all that he passed to me in his stories, his mentorship, and his fatherly legacy, I can feel fading as I try to pass it on to my own children.', { multiline: true }),
      ] },
      { key: 'story_son', label: 'Story — The Son', fields: [
        f('founder.story.son.title', 'Heading', 'The Son — Following in Their Footsteps'),
        f('founder.story.son.p1', 'Paragraph 1', 'Born on my grandfather\'s birthday—and thus carrying his name—I followed the only path that made sense in my lineage: service and discipline, with a little danger baked in.', { multiline: true }),
        f('founder.story.son.p2', 'Paragraph 2', 'Valedictorian of my Army and Navy Academy Class of 1996 and a 2000 graduate of the U.S. Naval Academy, I became a Naval Aviator—helicopters and fixed wing—served as a Squadron Commanding Officer and an Amphibious Aircraft Carrier Air Boss. I served as the U.S. Naval Attaché to Brazil, representing the most powerful maritime force in the world to the second largest Democracy and Military in the Western Hemisphere, worked as a military diplomat and Embassy pilot, and learned to think and feel in other languages—Japanese and Brazilian Portuguese.', { multiline: true }),
        f('founder.story.son.p3', 'Paragraph 3', 'I earned an Executive MBA from the Naval Postgraduate School and a Master\'s in National Security and Strategic Studies from the Naval War College, all while building a small real-estate investment portfolio.', { multiline: true }),
        f('founder.story.son.p4', 'Paragraph 4', 'After 24 years in uniform, I retired a U.S. Navy Captain at 46 years of age and continue flying as a pilot for United Airlines.', { multiline: true }),
      ] },
      { key: 'story_center', label: 'Story — My Center of Gravity', fields: [
        f('founder.story.center.title', 'Heading', 'My Center of Gravity'),
        f('founder.story.center.p1', 'Paragraph 1', 'Yes, I\'ve lived a high-speed, low-drag life—with plenty of stories and hard-won lessons my children can benefit from. But the gravitational center of my world is home: my wife—my childhood sweetheart since we were 13—and our two teenaged children.', { multiline: true }),
        f('founder.story.center.p2', 'Paragraph 2', 'Our daughter embodies relentless excellence—never less than an A, her AP catalog maxed out with 4s and 5s. She\'s President of her Model UN delegation and her school\'s National Honor Society, fluent in Japanese, a Battalion Commander in NJROTC, and both a musician and an athlete who swims, sails, and rides horses. Beautiful, inside and out, she\'s now a proud member of the Class of 2030 at the U.S. Naval Academy!', { multiline: true }),
        f('founder.story.center.p3', 'Paragraph 3', 'Our son won\'t be outdone by his sister: he\'s an athlete, a musician, a straight-A student, and a creator of value. At 15, his self-built investment portfolio already makes me wish I were his kid, and his natural hustle has "future entrepreneur" written all over it.', { multiline: true }),
        f('founder.story.center.quote', 'Pull quote', '"My wife depends on me for more than the bacon—she depends on me for ballast."'),
      ] },
      { key: 'story_realization', label: 'Story — The Realization', fields: [
        f('founder.story.realization.title', 'Heading', 'The Realization'),
        f('founder.story.realization.p1', 'Paragraph 1 (**…** shows in gold italics)', 'Aviation has a way of making you honest about mortality. The risk is non-zero. The requests from the people I love are constant and human—**Dad, what should I do about…? Honey, where is…? Papa, how do we…?**', { multiline: true }),
        f('founder.story.realization.p2', 'Paragraph 2', 'Life is complex: accounts, passwords, policies, documents. My will? Dusted off the other day realizing that the last time we updated it was in 2009. If I didn\'t make it home tomorrow, there would be heartbreak—and then there would be chaos. My family would be grieving and searching—for answers, for instructions, for me.', { multiline: true }),
        f('founder.story.realization.p3', 'Paragraph 3', 'One night, on some international layover, after yet another round of "Where\'s this account info? How should we handle x, y, z…?" I realized something simple and terrifying: my legacy wasn\'t organized for the people who need it most. Not my medals, not my résumé—my guidance. The operating manual for the most important mission of my life: my family after me.', { multiline: true }),
      ] },
      { key: 'story_threads', label: 'Story — Three Threads', fields: [
        f('founder.story.threads.title', 'Heading', 'Three Threads'),
        f('founder.story.threads.1', 'Thread 1', 'Our family pedigree of service and creation—carry your people forward.'),
        f('founder.story.threads.2', 'Thread 2', 'The aviator\'s discipline—checklists, flight plans, emergency procedures.'),
        f('founder.story.threads.3', 'Thread 3', 'And my Navy callsign, "Luggage." My best friend\'s callsign? "Carry On."'),
        f('founder.story.born.title', 'Banner line (gold, above the logo)', 'CarryOn Technologies was born.'),
      ] },
      { key: 'story_idea', label: 'Story — The Idea', fields: [
        f('founder.story.idea.title', 'Heading', 'The Idea'),
        f('founder.story.idea.p1', 'Paragraph 1', 'What if your family didn\'t have to scramble? What if every document was already organized, every checklist already built, every critical detail already in one secure place?', { multiline: true }),
        f('founder.story.idea.p2', 'Paragraph 2', 'What if readiness weren\'t something you did at the last minute—but something you maintained all along, like a flight plan?', { multiline: true }),
        f('founder.story.idea.closing', 'Closing line (italic, centered)', 'What if the people you love never had to wonder where to look, who to call, or what to do next—because you\'d already taken care of it?', { multiline: true }),
      ] },
      { key: 'story_platform', label: 'Story — The Platform', fields: [
        f('founder.story.platform.title', 'Heading', 'The Platform'),
        f('founder.story.platform.intro', 'Intro paragraph', 'CarryOn is the first family readiness platform designed for all American families—built so the people you love are never left searching.', { multiline: true }),
        f('founder.story.platform.items', 'Bullets (one per line; **name** shows in white)', [
          '**Secure Document Vault** — AES-256 encrypted storage for wills, trusts, policies, and digital assets, with an air-gapped AI Estate Guardian™ that analyzes your documents for gaps and contradictions.',
          '**Immediate Action Checklist** — A real-time updatable, step-by-step guide for your family after transition: who to call, what to do first, what comes next. Auto-populated by the Estate Guardian with key details from your vault.',
          '**Milestone Messages** — Video, audio, or written messages for life\'s biggest moments—weddings, births, graduations—delivered at the time you choose.',
        ].join('\n'), { multiline: true, list: true }),
        f('founder.story.platform.closing', 'Closing line (italic, centered)', 'It\'s the NATOPS of your life—the flight manual the people you love can actually use.'),
      ] },
      { key: 'story_how', label: 'Story — How It Works', fields: [
        f('founder.story.how.title', 'Heading', 'How It Works'),
        f('founder.story.how.steps', 'Numbered steps (one per line; **word** shows in white)', [
          '**Organize** what matters—upload documents, policies, and accounts into your encrypted vault. Estate Guardian analyzes everything and flags gaps.',
          '**Build** your checklist—step-by-step instructions for your family, auto-populated with key details from your vault.',
          '**Record** what only you can say—milestone messages for weddings, births, graduations, and the moments that matter most.',
          'When the time comes, your family **knows exactly what to do, where to look, and who to call**—because you made them ready.',
        ].join('\n'), { multiline: true, list: true }),
      ] },
      { key: 'story_why', label: 'Story — Why Now?', fields: [
        f('founder.story.why.title', 'Heading', 'Why Now?'),
        f('founder.story.why.p1', 'Paragraph 1', '76% of U.S. adults reported not having a will in a 2025 survey. Modern lives are digitally fragmented and procedurally fragile. The average family juggles dozens of accounts, policies, cloud drives, passwords, properties, and platforms—with no plan for what happens when the person who manages it all is gone.', { multiline: true }),
        f('founder.story.why.p2', 'Paragraph 2', 'In aviation, we don\'t leave emergencies to improvisation; we brief, rehearse, and checklist. Families deserve the same rigor—delivered with compassion.', { multiline: true }),
        f('founder.story.why.p3', 'Paragraph 3', 'And at the foundation of that rigor sits the same truth my grandfather lived by: clarity, honesty, and simplicity make everything easier to carry forward. CarryOn is built on that truth—designed so nothing essential is ever lost, forgotten, or left to chance.', { multiline: true }),
      ] },
      { key: 'story_promise', label: 'Story — The Promise', fields: [
        f('founder.story.promise.title', 'Heading', 'The Promise'),
        f('founder.story.promise.p1', 'Paragraph 1', 'CarryOn is the product I wish my grandfather had left my father, and my father had left me: not just memories, but organized clarity; not just stories, but instructions; not just love, but readiness.', { multiline: true }),
        f('founder.story.promise.p2', 'Paragraph 2', 'It\'s the platform I owe Emma and Kent, and the still-unseen grandchildren who will ask questions I won\'t be here to answer.', { multiline: true }),
        f('founder.story.promise.quote', 'Pull quote', '"I\'m not building a death product. I\'m building a readiness product."'),
        f('founder.story.promise.p3', 'Paragraph 3', 'My family\'s story began with Marines carrying colors through fire and mud. It continued with an inventor who put air back into people\'s lungs. I became an aviator who brought aircraft safely to pitching, rolling flight decks in the middle of the night, thousands of miles from shore.', { multiline: true }),
        f('founder.story.promise.p4', 'Paragraph 4', 'CarryOn Technologies is how I extend that purpose—that mission: to make the people I love—and yours—ready for whatever comes next.', { multiline: true }),
      ] },
      { key: 'story_closing', label: 'Story — Closing', fields: [
        f('founder.story.closing.l1', 'Closing — line 1 (white)', 'Because readiness shouldn\'t be an afterthought.'),
        f('founder.story.closing.l2', 'Closing — line 2 (gold)', 'It should be a gift you give the people you love—before they ever need it.'),
      ] },
      { key: 'gate', label: 'Request access', fields: [
        f('founder.gate.intro', 'Intro line above the card', 'This page holds the personal story of CarryOn’s founder, Barnet Harris, a retired 24-year military veteran — shared on request rather than published publicly.', { multiline: true }),
        f('founder.gate.title', 'Card heading', 'Meet the Founder'),
        f('founder.gate.text', 'Card text', 'Interested in learning more about the founder of CarryOn™ and what inspired him to build it? Request access below, and you’ll be notified when your request is approved.', { multiline: true }),
        f('founder.gate.button', 'Submit button', 'Request Access'),
        f('founder.gate.switch_login', 'Link: already have access', 'Already have access? Sign in here →'),
        f('founder.gate.submitted_title', 'After submitting — heading', 'Request Submitted'),
        f('founder.gate.submitted_text', 'After submitting — text', 'The founder will review your request. You’ll receive your access credentials once approved.'),
        f('founder.gate.pending_title', 'Already pending — heading', 'Request Already Pending'),
        f('founder.gate.pending_text', 'Already pending — text', 'You already have a pending request. The founder will review it shortly.'),
      ] },
      { key: 'login', label: 'Sign-in mode', fields: [
        f('founder.login.title', 'Heading', 'About the Founder'),
        f('founder.login.sub', 'Sub-heading', 'Enter your credentials to view'),
        f('founder.login.button', 'Button', 'View Founder Page'),
        f('founder.login.switch_request', 'Link: request access', '← Don’t have access? Request it here'),
      ] },
    ],
  },
  {
    key: 'security', label: 'Security & Trust page', path: '/security',
    sections: [
      { key: 'seo', label: 'Search result (Google)', fields: [
        f('security.seo.title', 'Page title', 'Security & Trust — CarryOn'),
        f('security.seo.description', 'Meta description', 'Files scrambled before they’re stored, a separate lock for every family, two-step sign-in, subprocessors — our full security posture, documented honestly.', { multiline: true }),
      ] },
      { key: 'hero', label: 'Hero', fields: [
        f('security.hero.pill', 'Small pill label', 'Trust & Security'),
        f('security.hero.h1a', 'Headline — before the italic words', 'Your family\'s most private information deserves'),
        f('security.hero.h1b', 'Headline — italic gold words', 'security you can inspect.'),
        f('security.hero.h1c', 'Headline — after the italic words (leave blank if not needed)', ''),
        f('security.hero.intro', 'Intro paragraph', 'We built CarryOn for families like ours. The same encryption, key handling, and operational controls we\'d want guarding our own wills, our own messages, our own kids\' inheritance. This page documents — honestly — exactly what those controls are today.', { multiline: true }),
      ] },
      { key: 'sections', label: 'Section titles', fields: [
        f('security.s.encryption', 'Encryption', 'Encryption — at rest and in transit'),
        f('security.s.auth', 'Authentication', 'Authentication & Session Security'),
        f('security.s.rotation', 'Key rotation', 'Key & Secret Rotation'),
        f('security.s.infra', 'Infrastructure', 'Infrastructure'),
        f('security.s.headers', 'Browser hardening', 'Browser-Side Hardening'),
        f('security.s.privacy', 'Privacy', 'Privacy & Data Protection'),
        f('security.s.compliance', 'Compliance', 'Compliance & Audits'),
        f('security.s.reporting', 'Reporting', 'Reporting a Vulnerability'),
      ] },
      { key: 'encryption', label: 'Encryption bullets', fields: [
        f('security.encryption.1', 'Bullet 1', '**Scrambled before it’s stored** — every document, message, and vault item is encrypted (AES-256-GCM).'),
        f('security.encryption.2', 'Bullet 2', '**Per-estate encryption salt** generated at estate creation. No two families share a key.'),
        f('security.encryption.3', 'Bullet 3', '**PBKDF2-HMAC-SHA256, 600,000 iterations** for password-derived keys (NIST recommends ≥600k).'),
        f('security.encryption.4', 'Bullet 4', '**TLS 1.3** with HSTS preload (max-age 1 year, includeSubDomains, preload).'),
        f('security.encryption.5', 'Bullet 5', '**Encrypted with per-estate keys; access controlled and audited.** Documents are stored AES-256-GCM encrypted with keys derived per estate from key material CarryOn operates. Because we hold that key material, this is not a zero-knowledge system: CarryOn staff access to stored content is restricted to administrator roles, limited to defined support and verification tasks, and every document download and vault view is written to an append-only audit trail — access is controlled and audited, not impossible. AI chat transcripts, which can quote documents you flagged for AI analysis, are encrypted at rest with the same per-estate keys and are deleted with the estate or account they belong to.', { multiline: true }),
      ] },
      { key: 'auth', label: 'Authentication bullets', fields: [
        f('security.auth.1', 'Bullet 1', 'HMAC-SHA256 signed JWTs with token blacklist + auto-expiring TTL index in MongoDB.'),
        f('security.auth.2', 'Bullet 2', 'Single-session enforcement for non-admin accounts — old sessions are invalidated when you log in elsewhere.'),
        f('security.auth.3', 'Bullet 3', 'Account lockout after 5 failed attempts within 15 minutes.'),
        f('security.auth.4', 'Bullet 4', 'A one-time email code at sign-in, on by default for every account, with an option to skip it for the rest of the day on a trusted connection; passkeys supported. SMS codes coming soon.'),
        f('security.auth.5', 'Bullet 5', 'WebAuthn / Passkey support for benefactor and beneficiary accounts.'),
      ] },
      { key: 'rotation', label: 'Key rotation bullets', fields: [
        f('security.rotation.1', 'Bullet 1', 'JWT signing secrets rotated at least annually and on any incident.'),
        f('security.rotation.2', 'Bullet 2', 'Stripe API keys rotated when staff change roles or leave.'),
        f('security.rotation.3', 'Bullet 3', 'VAPID push keys persisted to environment, not disk — survives pod restarts cleanly.'),
        f('security.rotation.4', 'Bullet 4', 'Per-estate AES salts are immutable for the life of the estate; we never re-key without explicit user consent because it would invalidate all encrypted data.'),
      ] },
      { key: 'infra', label: 'Infrastructure bullets', fields: [
        f('security.infra.1', 'Bullet 1', 'Backend hosted on Render (Virginia, US East); web app served by Vercel (global edge). MongoDB Atlas (encrypted-at-rest, automatic backups, point-in-time recovery).'),
        f('security.infra.2', 'Bullet 2', 'Distributed scheduler locks (MongoDB-backed) prevent duplicate background jobs in multi-pod deployments.'),
        f('security.infra.3', 'Bullet 3', 'MongoDB-backed sliding-window rate limiter on every authentication and high-value endpoint.'),
        f('security.infra.4', 'Bullet 4', 'Sentry error monitoring on both backend (FastAPI + Starlette) and frontend, gated behind env-based DSN so dev environments never report.'),
        f('security.infra.5', 'Bullet 5', 'K8s-style liveness + readiness probes (/api/health/live, /api/health/ready) for graceful rolling deploys.'),
      ] },
      { key: 'headers', label: 'Browser hardening bullets', fields: [
        f('security.headers.1', 'Bullet 1', 'Content Security Policy (default-src \'self\', tight allow-list for Stripe and fonts).'),
        f('security.headers.2', 'Bullet 2', 'HSTS with preload + includeSubDomains.'),
        f('security.headers.3', 'Bullet 3', 'X-Frame-Options: DENY (no clickjacking).'),
        f('security.headers.4', 'Bullet 4', 'X-Content-Type-Options: nosniff.'),
        f('security.headers.5', 'Bullet 5', 'Referrer-Policy: strict-origin-when-cross-origin.'),
        f('security.headers.6', 'Bullet 6', 'Permissions-Policy locks down camera, mic, geolocation, payment to first-party only.'),
        f('security.headers.7', 'Bullet 7', 'Cross-Origin-Opener-Policy: same-origin; Cross-Origin-Resource-Policy: same-origin by default (public images the site embeds are marked cross-origin).'),
      ] },
      { key: 'privacy', label: 'Privacy bullets', fields: [
        f('security.privacy.1', 'Bullet 1 (before the Wind-Down link)', 'You own your data. Full export tooling described on our'),
        f('security.privacy.1link', 'Bullet 1 — link text', 'Wind-Down & Data-Portability Promise'),
        f('security.privacy.2', 'Bullet 2', 'Beneficiaries see **nothing** until you choose. Pre-transition, the only surface they have is their own profile.'),
        f('security.privacy.3', 'Bullet 3', '"Public Device Mode" wipes the local cache (IndexedDB + JWT) on tab close or inactivity for shared devices (libraries, FEMA shelters).'),
        f('security.privacy.4', 'Bullet 4', 'We never sell, trade, or market your family data to third parties. Ever.'),
        f('security.privacy.5', 'Bullet 5', '**AI processing — zero data retention.** Estate Guardian, the Beneficiary Concierge, and our other AI features are powered by xAI (Grok). Our xAI account is configured for zero data retention: the content of each request is processed only to generate the response and is not stored by xAI afterward. Separately, xAI\'s published API policy excludes API content from model training. The conversation transcripts you see in the app are stored by CarryOn under the controls described above — not by xAI.', { multiline: true }),
      ] },
      { key: 'compliance', label: 'Compliance bullets', fields: [
        f('security.compliance.1', 'Bullet 1', '**Preparing for SOC 2 Type II.** We are preparing for a SOC 2 Type II audit. We do not claim SOC 2 attestation today. When the audit is complete, the report and the audit firm\'s name will be published on this page.', { multiline: true }),
        f('security.compliance.2', 'Bullet 2 (before the privacy@ email link)', 'GDPR & CCPA data-subject rights (access, deletion, portability) supported via in-app export and a written request to'),
        f('security.compliance.3', 'Bullet 3', 'HIPAA-style controls applied to medical directives stored in the Secure Document Vault, though we are not a covered entity.'),
      ] },
      { key: 'reporting', label: 'Reporting a vulnerability', fields: [
        f('security.reporting.intro', 'Paragraph', 'If you\'ve found a security issue, please tell us before you tell the internet. We don\'t have a paid bug bounty yet, but we will publicly credit you on this page (with your permission) and respond within 72 hours.', { multiline: true }),
        f('security.reporting.email_label', 'Email bullet label', 'Email:'),
        f('security.reporting.txt_label', 'security.txt bullet label', 'RFC 9116 security.txt:'),
        f('security.reporting.rules', 'Rules bullet', 'Please don\'t run brute-force, denial-of-service, or social-engineering tests against live accounts.'),
        f('security.contact.before', 'Contact box — before the email', 'Questions about how we protect your family\'s information? Write to'),
        f('security.contact.after', 'Contact box — after the email', '. We answer every legitimate inquiry, often within the same day.'),
        f('security.updated', 'Footer line', 'Last updated: September 7, 2026. This page is the source of truth for CarryOn\'s security posture. We change it before we change practice.', { multiline: true }),
      ] },
    ],
  },
  {
    key: 'pricing', label: 'Pricing page', path: '/pricing',
    sections: [
      { key: 'seo', label: 'Search result (Google)', fields: [
        f('pricing.seo.title', 'Page title', 'Pricing - CarryOn | One Plan for You, Invited Family Pays Nothing'),
      ] },
      { key: 'hero', label: 'Headline', fields: [
        f('pricing.hero.h1a', 'Headline — line 1', 'One plan for you.'),
        f('pricing.hero.h1b', 'Headline — line 2 (gold)', 'Nobody you invite pays.'),
        f('pricing.steps.1.title', 'How pricing works — step 1 title', 'You pick one plan'),
        f('pricing.steps.2.title', 'How pricing works — step 2 title', 'You invite your people — free'),
        f('pricing.steps.3.title', 'How pricing works — step 3 title', 'After you pass, they choose'),
      ] },
      { key: 'paying', label: 'How paying works', fields: [
        f('pricing.paying.title', 'Heading', 'How paying works'),
        f('pricing.paying.1.title', 'Step 1 title', 'Pick your plan'),
        f('pricing.paying.1.desc', 'Step 1 text', 'Right here. Change it or cancel from your account any time.'),
        f('pricing.paying.2.title', 'Step 2 title', 'Create your account'),
        f('pricing.paying.2.desc', 'Step 2 text', 'Name, email, password. About a minute. No card yet.'),
        f('pricing.paying.3.title', 'Step 3 title', 'Pay securely with Stripe'),
        f('pricing.paying.3.desc', 'Step 3 text', 'You finish on Stripe’s checkout page. Your card number never touches our servers; we never see or store it.'),
        f('pricing.stripe_note', 'Note under every plan button (all pages)', 'Secure checkout by **Stripe** · your card never touches our servers'),
      ] },
      { key: 'misc', label: 'Other headings', fields: [
        f('pricing.anchor', 'Value anchor — small line', 'Settling an estate takes the average executor about 570 hours.'),
        f('pricing.reduced.q', 'Reduced pricing — question', 'Do you qualify for reduced pricing?'),
        f('pricing.reduced.note', 'Reduced pricing — one-line summary under the question', 'Reduced pricing is available for seniors, military/first responders, veterans, and young adults. Certified hospice families receive full access free.'),
        f('pricing.winddown.q', 'Wind-Down Promise nudge — question (shown under the plans and on /start)', 'Worried about trusting a new company with long-term family information?'),
        f('pricing.winddown.cta', 'Wind-Down Promise nudge — link text', 'Read our Wind-Down Promise.'),
        f('pricing.which.title', 'Which plan is right — heading', 'Which plan is right for you?'),
        f('pricing.why.title', 'Why monthly — heading', 'Why monthly, and why more than three prices?'),
        f('pricing.why.p1', 'Why monthly — paragraph 1', 'Most tools in this category charge $49–$150 a year up front, usually with a free tier that caps how much you can store. We chose a different model on purpose:'),
        f('pricing.why.p2', 'Why monthly — closing paragraph', 'The trade-off is more prices on this page than a three-tier freemium grid. We think that\'s the fairer deal, and we\'d rather explain it than hide it.'),
        f('pricing.example.label', 'Real example — label', 'Real example'),
        f('pricing.compare.title', 'Compare plans — heading', 'Compare Plans'),
        f('pricing.popular', 'Badge on the Premium card', 'Most Popular'),
        f('pricing.household.title', 'More than one household — heading', 'More than one household?'),
        f('pricing.badge1', 'Bottom badge 1 (pricing & start pages)', 'Scrambled before it’s stored'),
        f('pricing.badge2', 'Bottom badge 2 (pricing & start pages)', 'Cancel Anytime'),
        f('pricing.badge3', 'Bottom badge 3 (pricing & start pages)', 'Your Data Is Yours Alone'),
      ] },
    ],
  },
  {
    key: 'start', label: 'Get Started page', path: '/start',
    sections: [
      { key: 'seo', label: 'Search result (Google)', fields: [
        f('start.seo.title', 'Page title', 'Get Started with CarryOn - Family Preparedness Platform'),
      ] },
      { key: 'hero', label: 'Headline', fields: [
        f('start.hero.title', 'Headline', 'Get your family\'s affairs in order'),
        f('start.hero.sub', 'Sub-headline', 'Choose how you\'d like to get started with CarryOn'),
      ] },
      { key: 'doors', label: 'The two doors', fields: [
        f('start.paid.badge', 'Paid door — badge', 'Recommended'),
        f('start.paid.title', 'Paid door — title', 'Start today'),
        f('start.paid.text', 'Paid door — text', 'Full access. Your plan is live in minutes. Cancel anytime.'),
        f('start.paid.cta', 'Paid door — button', 'Choose a Plan'),
        f('start.trial.badge', 'Explore door — badge', 'No card needed'),
        f('start.trial.title', 'Explore door — title', 'Explore first'),
        f('start.trial.text', 'Explore door — text ({days} is replaced by the trial length)', 'Not ready to pay? Build your family\'s plan first. No card needed. You\'ll be asked to subscribe when your {days}-day exploration period ends.', { multiline: true }),
        f('start.trial.cta', 'Explore door — button', 'Create Account'),
      ] },
      { key: 'plans', label: 'Plan list', fields: [
        f('start.plans.title', 'Heading', 'Simple, transparent pricing'),
        f('start.plans.sub', 'Sub-heading', 'Cancel anytime. Your data is yours alone.'),
        f('start.plans.special', 'Special pricing heading', 'Special Pricing'),
        f('start.family.title', 'One plan box — heading', 'One plan. Nobody you invite pays.'),
        f('start.family.text', 'One plan box — text', 'Your spouse, kids, and attorney see what you share at no charge while you\'re alive. Quarterly and annual billing saves you even more.'),
        f('start.hospice', 'Hospice link', 'Enrolled in certified hospice care? Full access at no cost.'),
      ] },
    ],
  },
];

export const PAGES = [...PAGES_PHASE1, ...PAGES_PHASE2, ...PAGES_READINESS, ...PAGES_GUIDES, ...PAGES_BENEFACTOR, ...PAGES_LANDING, ...PAGES_SOURCES, ...PAGES_APP];

export const COPY_DEFAULTS = Object.fromEntries(PAGES.flatMap(p => p.sections.flatMap(s => s.fields.map(x => [x.k, x.d]))));
export const COPY_FIELD_COUNT = Object.keys(COPY_DEFAULTS).length;
