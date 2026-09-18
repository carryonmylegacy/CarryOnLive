/**
 * Site Copy registry — /guides (five evergreen family-continuity articles).
 * The section stays hidden until the founder presses Launch in Admin → Marketing → Guides.
 * Every word here is a draft for the founder to review; edit it in Site Copy before launching.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });
const BLOCKS = (k, label, d) => f(k, label, d, { multiline: true, blocks: true });
const P = (...lines) => lines.join('\n');

/* slug · icon name (lucide) · content. Section bodies: one paragraph per line, "- " for a bullet. */
export const GUIDE_ARTICLES = [
  {
    slug: 'twelve-documents-every-family-should-find-in-ten-minutes', icon: 'FolderOpen',
    title: 'The 12 documents every family should be able to find in ten minutes',
    dek: 'If you were unreachable tonight, could the people you love put their hands on these without calling a lawyer? Here is the list, why each one matters, and where families usually lose them.',
    seoTitle: '12 Documents Every Family Should Find in 10 Minutes',
    seoDescription: 'The twelve documents a family needs first when something happens — what each one does, where they usually go missing, and how to keep them findable.',
    intro: P(
      'Ask most people where their will is and you get a confident answer: "the safe", "the filing cabinet", "with the attorney". Ask their spouse or their adult child the same question and the answer is usually a pause. The document exists. The path to it does not.',
      'This guide is the path. Twelve documents, in the order a family tends to need them, with a plain note on what each one actually does. You do not need all twelve today. You need to know which ones you have, which you do not, and where the ones you have are.',
    ),
    sections: [
      ['The first hour', P(
        'These are the documents someone reaches for in the first day. They are also the ones most often locked in a place only you can open.',
        '- **Healthcare Directive / Living Will.** Your written wishes about treatment when you cannot speak for yourself. Hospitals ask for it at admission, not later.',
        '- **Medical Power of Attorney.** Names the person who makes medical decisions for you. Without it, the hospital decides who speaks for you — and it may not be who you would pick.',
        '- **A list of medications and doctors.** Not a legal document, but the one a spouse in an emergency room wishes they had. One page is enough.',
      )],
      ['The first week', P(
        'Once the immediate crisis passes, the practical world arrives: bills, accounts, insurance, the house.',
        '- **Financial Power of Attorney.** Lets someone pay your mortgage, talk to your bank and sign for you while you are alive but unable. It ends at death — which surprises many families.',
        '- **Last Will and Testament.** Says who receives what and names an executor. Only the signed original counts in most states; a photocopy usually does not.',
        '- **Revocable Living Trust**, if you have one. Holds property outside probate and names a successor trustee. Families often have the trust but forget which accounts were ever moved into it.',
        '- **Life insurance policies.** Policy numbers, the insurer, and — most missed — the beneficiary designations on file with the insurer, which override the will.',
      )],
      ['The first month', P(
        'Now the paperwork of an ordinary life has to be found, one institution at a time.',
        '- **Deeds and titles.** The house, the cars, any land. The deed says who owns the property and how — joint tenancy and tenancy in common behave very differently at death.',
        '- **Account statements.** One recent statement per bank, brokerage and retirement account. Retirement accounts also carry their own beneficiary forms, which again override the will.',
        '- **Tax returns for the last three years.** The executor needs them, and they are the fastest inventory of income sources you never mentioned.',
        '- **Marriage certificate, birth certificates, divorce decrees, military discharge papers.** Benefits offices ask for certified copies and will not accept scans.',
        '- **A list of digital accounts.** E-mail first — it is the key that resets everything else — then phone, banking apps, photo storage, and the subscriptions quietly charging a card each month.',
      )],
      ['Where families lose them', P(
        'The documents are rarely destroyed. They are stranded.',
        '- In a bank safe-deposit box only you can open — many states seal the box at death until a court order arrives.',
        '- On a laptop with a password no one else knows.',
        '- With an attorney who retired, merged or moved.',
        '- In an e-mail attachment from 2019.',
        'The fix is not a better hiding place. It is a **single, known location** plus **at least one other person who can reach it** — and a habit of putting new documents there the week they arrive.',
      )],
      ['The ten-minute test', P(
        'Pick someone who would be called first if something happened to you. Without warning them, ask: "Could you find my healthcare directive, my will and my insurance policy in ten minutes, starting now?"',
        'If the honest answer is no, that is the whole to-do list. Gather the twelve, name each one plainly, store them where that person can get to them, and tell them so. It takes an evening. It is the most useful evening of estate planning most families ever spend.',
      )],
    ],
    takeaways: [
      'Twelve documents; the first three matter in the first hour and are usually the hardest to reach.',
      'Beneficiary forms on insurance and retirement accounts override the will — check them.',
      'Documents are rarely lost; they are stranded in places only you can open.',
      'One known location, one other person who can reach it, one habit of filing new papers there.',
    ],
  },
  {
    slug: 'how-to-write-a-milestone-letter-your-child-will-open-in-fifteen-years', icon: 'Mail',
    title: 'How to write a milestone letter your child will open in fifteen years',
    dek: 'A letter for a graduation or a wedding you may not be there to see is one of the most valuable things you can leave. It is also one of the hardest to start. Here is a way in.',
    seoTitle: 'How to Write a Milestone Letter for Your Child',
    seoDescription: 'A practical way to write a letter your child will open at a graduation, a wedding or a first home — what to say, what to leave out, and how to start.',
    intro: P(
      'Most people who sit down to write a letter for a far-off milestone stop within ten minutes. Not because they have nothing to say — because they have everything to say and no idea where to begin. The blank page is asking them to be wise, warm and complete at once.',
      'Lower the bar. A milestone letter does not need to be complete. It needs to be **yours** — your voice, one or two specific memories, and something you genuinely believe about the person reading it. Here is how to get there.',
    ),
    sections: [
      ['Pick the moment before you pick the words', P(
        'Write to a day, not to a decade. "When you graduate from high school" gives you a scene: the gown, the folding chairs, the heat. "For when you are older" gives you fog.',
        'The most common milestones families choose: finishing high school, leaving for college or a first job, a wedding, a first child, a first home, a milestone birthday. For younger children, add the smaller ones — learning to drive, a first heartbreak, the first time they live alone.',
        'One letter per moment. Short is fine. Several short letters land harder than one long one.',
      )],
      ['Open with a memory, not a message', P(
        'Do not start with advice. Start with a moment only you could describe: the way they held a crayon at three, what they said in the car on the way home from a lost game, the song they insisted on every bedtime for a year.',
        'A specific memory does two things. It proves the letter is really from you, and it tells them they were seen. Advice can come from anyone. Being remembered exactly cannot.',
      )],
      ['Say the thing you would say in person', P(
        'Imagine you are at the milestone. The ceremony is over. You have thirty seconds alone with them before the crowd arrives. What do you say?',
        'That is the middle of the letter. Usually it is one of three things: **I am proud of you**, **I am not worried about you**, or **here is what I hope for you**. Say it plainly. Do not dress it up. The plainer the sentence, the more it will be read aloud to other people over the years.',
      )],
      ['Leave out what dates badly', P(
        '- Predictions about their career, their partner or where they will live. You will be wrong, and being wrong will distract from the letter.',
        '- Instructions about money. Put those in a separate note; do not let them share a page with love.',
        '- Apologies for not being there. One sentence at most. The letter itself is the proof you were thinking of them.',
        '- Anything you would not want read at their wedding. It may be.',
      )],
      ['Record it if you can', P(
        'A written letter is good. Your voice reading it is better. Your face saying it is best. Children who lose a parent young consistently say the same thing: they wish they could remember the voice.',
        'You do not need to perform. Read the letter once through, on a phone, in a quiet room. Do not re-record for a stumble — the stumble is you.',
      )],
      ['How to actually start tonight', P(
        'Set a timer for fifteen minutes. Choose one child and one milestone. Write the memory first, then the thirty-second sentence, then stop. Do not edit. Save it where it will be delivered on the right day, to the right person, whether or not you are there to send it.',
        'Then do the next one another night. Five letters over a month is a lifetime of arrivals for someone who will need them.',
      )],
    ],
    takeaways: [
      'Write to a specific day, not a vague future.',
      'Open with a memory only you could tell; put advice second.',
      'The heart of the letter is the sentence you would say with thirty seconds alone.',
      'Skip predictions and money; record your voice if you possibly can.',
      'Fifteen minutes, one letter, tonight. Then another.',
    ],
  },
  {
    slug: 'choosing-an-executor-and-why-you-also-need-a-digital-one', icon: 'UserCheck',
    title: 'Choosing an executor — and why you also need a digital one',
    dek: 'The person who settles your affairs will spend a year on paperwork. The person who unlocks your phone and e-mail may need to act in a day. They are rarely the same person — and most plans name only one.',
    seoTitle: 'Choosing an Executor and a Digital Executor',
    seoDescription: 'What an executor really does, how to choose one, why the job now has a digital half, and how to name someone for each without creating a conflict.',
    intro: P(
      'Executor is the most commonly assigned job in a family and the least commonly explained. People name a spouse or an eldest child, feel the relief of a decision made, and never describe what the job involves. Then the day comes and the executor learns it in real time, from a probate clerk.',
      'This guide covers what the role actually asks, how to pick someone who can carry it, and the newer problem: the half of your life that now lives behind passwords, which the traditional executor may not legally or practically be able to reach.',
    ),
    sections: [
      ['What an executor actually does', P(
        'In most places the executor (sometimes called a personal representative) is the person the court authorizes to act for your estate. Over roughly nine to eighteen months, they:',
        '- Locate the will and file it with the court',
        '- Notify banks, insurers, employers, government agencies and creditors',
        '- Inventory everything you owned and had it appraised where required',
        '- Pay debts and final taxes from the estate',
        '- Distribute what remains according to the will',
        '- Keep records of every step and account to the court and the beneficiaries',
        'It is administrative, relentless and largely thankless. It is also a legal duty: an executor who mishandles money can be personally liable.',
      )],
      ['How to choose one', P(
        'Love is not the qualification. Look for four things:',
        '- **Time.** Someone with a demanding job and young children will struggle. The work arrives in bursts and cannot be postponed.',
        '- **Temperament.** Calm under family pressure. Comfortable saying "the will says" to a sibling who disagrees.',
        '- **Organization.** Pays their own bills on time, keeps receipts, answers e-mail.',
        '- **Location.** Same state helps; some states restrict out-of-state executors or require a bond.',
        'Name an alternate. Ask both people first — in person — and tell them where the documents are. An executor who learns of the role from a lawyer is starting a year behind.',
      )],
      ['The digital half of the job', P(
        'Twenty years ago an executor opened a filing cabinet. Today the equivalent is your e-mail account — and it is locked.',
        'Behind that lock: bank alerts, the statements that stopped arriving on paper, photo libraries, two-factor codes for every other account, subscriptions still charging a card, social profiles that will keep posting birthday reminders, and the business or side income no one else knows about.',
        'Two problems make this different from paper. Terms of service often forbid anyone but the account holder from logging in, and some providers will delete rather than hand over. And unlike a filing cabinet, digital access is often needed **within days** — to stop payments, catch fraud, or simply retrieve the phone number of the person who should be called.',
      )],
      ['Why it is usually a second person', P(
        'The ideal executor is patient with paperwork and steady in a courtroom. The ideal digital executor is comfortable with password managers, two-factor prompts and the recovery flows of a dozen services. Those are different people more often than not, and the digital work starts sooner.',
        'Naming a separate digital executor — in your will where your state allows it, and in your own written instructions regardless — takes pressure off the primary executor and puts the right skills on the right task. Many states have adopted laws that let you grant this authority explicitly; a short conversation with an attorney will tell you what language yours requires.',
      )],
      ['Give both of them a running start', P(
        '- Write down where the original will is, and tell both people.',
        '- Keep an inventory of accounts — not passwords on paper, but a list of what exists and where.',
        '- Store credentials in a place designed for succession, where a named person can be granted access when the time comes and not before.',
        '- Leave a one-page "first calls" list: your attorney, your accountant, your closest colleague, the friend who knows your passwords anyway.',
        'A good executor with no map spends the first three months drawing one. Give them the map.',
      )],
    ],
    takeaways: [
      'An executor does a year of court-supervised paperwork and carries legal liability — choose for time, temperament and organization, not closeness.',
      'Name an alternate and tell both people in person.',
      'Your digital life needs its own executor, and that work often starts within days.',
      'Leave an inventory of accounts and a first-calls list; keep credentials somewhere built for hand-off.',
    ],
  },
  {
    slug: 'the-first-72-hours-after-a-death', icon: 'Clock',
    title: 'The first 72 hours after a death: what the family actually has to do',
    dek: 'Grief makes ordinary tasks impossible and yet a short list of them cannot wait. This is that list — what is urgent, what only feels urgent, and what should not be touched for a month.',
    seoTitle: 'The First 72 Hours After a Death: A Family Checklist',
    seoDescription: 'What a family must do in the first three days after a death, what can wait, and the decisions that should not be made for thirty days.',
    intro: P(
      'In the first three days after a death, a family is asked to make more decisions than in an ordinary year — while least able to make any. Most of those decisions can wait. A few cannot. Knowing which is which is the difference between a hard week and a hard year.',
      'This is written for the person who finds themselves holding the phone. It assumes nothing has been planned. If some of it has, so much the better.',
    ),
    sections: [
      ['The first hours', P(
        '- **If the death was at home and unexpected, call emergency services.** A death must be legally pronounced. Under hospice care, call the hospice line instead; they will guide the rest.',
        '- **Call the one person who needs to know first**, then let them help you call the next ones. You do not have to make every call yourself.',
        '- **Find out whether there is a designated executor or an existing arrangement with a funeral home.** Ask the spouse, check the refrigerator door, the desk, the will if it is reachable. Pre-paid arrangements are common and easily missed.',
        '- **Care for dependents and pets.** Someone must be named to take the children tonight and feed the dog. Say it out loud so it is not assumed.',
      )],
      ['The first day', P(
        '- **Choose a funeral home** if none was arranged. They will transport, and they will handle the death certificate paperwork with the physician or medical examiner.',
        '- **Request certified copies of the death certificate — at least ten.** Banks, insurers, pension offices and the DMV each require an original. Ordering later takes weeks.',
        '- **Secure the home.** Lock up, collect keys, take in mail, and if the house will be empty, ask a neighbor to watch it. Empty houses named in an obituary attract break-ins.',
        '- **Notify the employer.** Ask specifically about life insurance through work, the final paycheck, unused leave, and survivor health coverage.',
      )],
      ['The first three days', P(
        '- **Locate the will and the healthcare and financial documents.** The executor named in the will should be told now, if they do not already know.',
        '- **Call the attorney, if there is one.** If there is not, that is a problem for next week, not today.',
        '- **Make a list of accounts and recurring payments**, but do not close anything yet. Notify banks of the death so joint accounts are watched for fraud; they may freeze individual accounts, which is expected.',
        '- **Cancel the things that hurt to leave running**: scheduled deliveries, the daily reminders on a shared calendar, ride-share and food apps that will keep charging.',
        '- **Write down who called and what they offered.** In a month you will want to know who said "anything at all" and meant it.',
      )],
      ['What only feels urgent', P(
        'Family members will arrive with urgent-sounding tasks. Most are not.',
        '- Reading the will aloud. There is no legal reading of the will; it goes to the executor and the court.',
        '- Distributing belongings. Nothing should leave the house before the executor has an inventory.',
        '- Social media. A memorial post can wait a week; the accounts are not going anywhere.',
        '- Selling the car, the boat, the second home. Nothing.',
      )],
      ['The thirty-day rule', P(
        'Do not make any major financial decision for thirty days. Do not sell property, move investments, lend money to a relative, pay off a debt in a lump sum, or sign anything a salesperson brought to the house. Grief clouds judgment, and the research on this is consistent. Anyone who pressures a bereaved family to decide this week is not on their side.',
        'The one exception: keeping the lights on. Mortgage, utilities, insurance premiums and dependents\' needs should be paid from an account the executor or surviving spouse controls. Everything else keeps.',
      )],
      ['If some of this was prepared', P(
        'Families who arrive at this week with a list of first calls, ten certified copies on order, the documents in a known place and the executor already informed describe the same thing afterwards: they were able to grieve, because they were not also detectives. That is the entire purpose of preparing. Not to avoid the loss — to be allowed to feel it.',
      )],
    ],
    takeaways: [
      'Hours: pronouncement, first calls, dependents and pets, check for existing arrangements.',
      'Day one: funeral home, ten certified death certificates, secure the home, notify the employer.',
      'Days two and three: find the documents, inform the executor, list accounts but close nothing.',
      'Nothing leaves the house before the executor has an inventory; no major financial decisions for thirty days.',
    ],
  },
  {
    slug: 'a-family-contingency-plan-in-one-evening', icon: 'Radio',
    title: 'A family contingency plan in one evening: meetup point, go-bag, out-of-area contact',
    dek: 'Most family emergency plans fail on the same three things: no one knows where to meet, the bag is not packed, and the phones do not work. Fix all three at the kitchen table tonight.',
    seoTitle: 'A Family Contingency Plan in One Evening',
    seoDescription: 'Build a real family emergency plan in a single evening: a meetup point, a go-bag that is actually packed, and an out-of-area contact everyone can reach.',
    intro: P(
      'When emergency planners study why families come apart in a disaster, the pattern is consistent. It is rarely the disaster itself. It is that people could not find each other, could not reach each other, and left the house with the wrong things — or nothing.',
      'Three decisions solve most of that, and none of them require a weekend. Sit the household down for one evening. Here is the agenda.',
    ),
    sections: [
      ['Decision one: where we meet', P(
        'Choose two places, and make everyone say them back to you.',
        '- **Near the house** — for a fire or a gas leak, when you leave in a hurry: the neighbor\'s mailbox, the big tree at the corner. Somewhere you can see the house from and count heads.',
        '- **Out of the neighborhood** — for when you cannot get home: a relative\'s house, a library, a specific parking lot at a specific store. Pick a place with a name and an address, not "the mall".',
        'Write the addresses on a card for each wallet and backpack. Children should be able to tell an adult where their family meets.',
      )],
      ['Decision two: who we call', P(
        'In a regional emergency, local calls fail first while long-distance often still connects, and texts get through when voice does not. Pick one **out-of-area contact** — a relative or friend in another state — and give everyone in the household their number.',
        'The rule is simple: if you cannot reach each other, you each text the contact. They become the family\'s switchboard: "Mom is at the library, Dad is stuck on the highway, everyone is fine."',
        'Call them tonight and ask. Then put the number in every phone under a name a child can find — "EMERGENCY AUNT JO" — and on the wallet card.',
      )],
      ['Decision three: what we grab', P(
        'A go-bag is not a survival kit; it is what you wish you had on the second day in a hotel or a relative\'s spare room. Per bag:',
        '- Copies of ID, insurance cards and the wallet card; a list of medications',
        '- Three days of any prescription medication, and a spare pair of glasses',
        '- Phone charger and a small power bank',
        '- Water, a few shelf-stable snacks, and a change of clothes',
        '- Cash in small bills — card readers go down with the power',
        '- For children: one comfort item and a photo of the family, in case you are separated',
        '- For pets: a leash, three days of food, vaccination records',
        'Put the bags where you leave the house, not in the basement. Set a reminder to swap out the medication, food and water twice a year — the same day you change smoke-alarm batteries.',
      )],
      ['The five-minute drill', P(
        'Plans that are never rehearsed are forgotten by spring. Once or twice a year, without much warning, say "drill" and time it: everyone to the near meetup point with their bag, and a text to the out-of-area contact.',
        'You will find something. The bag is under a pile of sports gear. The eight-year-old thinks the meetup point is the school. The power bank is dead. Finding it during a drill is the point of the drill.',
      )],
      ['Write it down where it can be found', P(
        'One page: both meetup addresses, the out-of-area contact, where the bags live, which neighbor has a key, and where the important documents are. Tape a copy inside a kitchen cabinet, photograph it for every phone, and keep a copy with the documents themselves.',
        'A plan that lives in one person\'s head is not a family plan. The evening is done when everyone can recite the three decisions without looking.',
      )],
    ],
    takeaways: [
      'Two meetup points — one you can see the house from, one out of the neighborhood — with addresses on a wallet card.',
      'One out-of-area contact everyone texts when local phones fail.',
      'A go-bag per person by the door, rotated twice a year.',
      'A five-minute drill once or twice a year; the things you find are the reason you ran it.',
      'One written page, taped in a cabinet and photographed onto every phone.',
    ],
  },
];

export const GUIDE_SLUGS = GUIDE_ARTICLES.map(a => a.slug);

const articleSection = (a) => ({
  key: a.slug, label: a.title, fields: [
    f(`guides.${a.slug}.title`, 'Title', a.title),
    ML(`guides.${a.slug}.dek`, 'Dek (the summary under the title)', a.dek),
    f(`guides.${a.slug}.seo.title`, 'Search result title (≤ 60 characters)', a.seoTitle),
    f(`guides.${a.slug}.seo.description`, 'Search result description (≤ 160 characters)', a.seoDescription),
    BLOCKS(`guides.${a.slug}.intro`, 'Introduction — one paragraph per line', a.intro),
    ...a.sections.flatMap(([h, body], i) => [
      f(`guides.${a.slug}.s${i + 1}.h`, `Section ${i + 1} — heading`, h),
      BLOCKS(`guides.${a.slug}.s${i + 1}.body`, `Section ${i + 1} — body ("- " for a bullet)`, body),
    ]),
    LIST(`guides.${a.slug}.takeaways`, 'Key takeaways — one per line', a.takeaways.join('\n')),
  ],
});

export const PAGES_GUIDES = [
  {
    key: 'guides', label: 'Guides', path: '/guides', previewPaths: ['/guides', ...GUIDE_SLUGS.map(s => `/guides/${s}`)],
    sections: [
      { key: 'index', label: 'Guides index page', fields: [
        f('guides.index.seo.title', 'Search result title (≤ 60 characters)', 'Family Continuity Guides | CarryOn'),
        f('guides.index.seo.description', 'Search result description (≤ 160 characters)', 'Plain-English guides on the documents, letters, people and plans a family needs in place before anything happens — written to be read in ten minutes.'),
        f('guides.index.eyebrow', 'Eyebrow', 'Guides'),
        f('guides.index.title', 'Headline', 'What every family should have in place — in plain English.'),
        ML('guides.index.intro', 'Intro paragraph', 'Short, practical guides on family continuity: the documents to gather, the letters to write, the people to name and the plan to rehearse. Each one is written to be read in about ten minutes and acted on the same evening.'),
        f('guides.index.byline', 'Byline shown on every article', 'Barnet Harris, Founder'),
        f('guides.index.byline_url', 'Byline link (path)', '/founder-about'),
        f('guides.index.published_prefix', 'Label before the published date', 'Published'),
        f('guides.index.read_time', 'Reading time label ({minutes} is filled in)', '{minutes} min read'),
        f('guides.index.read_more', 'Link on each card', 'Read the guide'),
        f('guides.index.back', 'Back link on an article', 'All guides'),
        f('guides.index.takeaways_title', 'Heading above the key takeaways', 'Key takeaways'),
        f('guides.index.more_title', 'Heading above the other guides at the end of an article', 'Keep reading'),
        ML('guides.index.disclaimer', 'Note at the end of every article', 'This guide is general information, not legal, tax or medical advice. Rules differ by state and by family; for decisions with legal weight, speak with a licensed professional where you live.'),
        f('guides.index.cta.title', 'Call to action — heading', 'Put it in place tonight.'),
        ML('guides.index.cta.text', 'Call to action — text', 'CarryOn is where the documents, the letters, the people and the plan live together — and reach the right person on the right day.'),
        f('guides.index.cta.button', 'Call to action — button', 'Start free'),
        f('guides.index.unlaunched.title', 'Shown to visitors before the section is launched — heading', 'This section isn’t open yet.'),
        ML('guides.index.unlaunched.text', 'Shown to visitors before the section is launched — text', 'We’re still writing. In the meantime, the rest of CarryOn is ready for you.'),
        f('guides.index.unlaunched.button', 'Shown to visitors before the section is launched — button', 'Back to home'),
        f('guides.index.preview_banner', 'Banner staff see when previewing before launch', 'Preview — this section is not public yet. Launch it from Admin → Marketing → Guides.'),
      ] },
      ...GUIDE_ARTICLES.map(articleSection),
    ],
  },
];
