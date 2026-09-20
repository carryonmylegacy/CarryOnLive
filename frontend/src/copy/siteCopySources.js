/**
 * Site Copy registry — /sources, “Sources & Methodology”. Every precise figure used in CarryOn marketing
 * points here with a small superscript. One entry per figure: the claim as it appears on the site, what the
 * number actually measures, who published it, and the link. Add a new entry whenever a new statistic ships.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });

// Anchor ids used by <SourceRef id=…/> across the site — keep in sync with the entries below.
export const SOURCE_IDS = ['hours', 'will', 'hospice', 'live'];

const entry = (id, n, claim, measures, source, url, checked) => [
  f(`sources.${id}.claim`, `[${n}] Claim as used on the site`, claim),
  ML(`sources.${id}.measures`, `[${n}] What the figure actually measures`, measures),
  f(`sources.${id}.source`, `[${n}] Source (publisher, report, year)`, source),
  f(`sources.${id}.url`, `[${n}] Link to the source`, url),
  f(`sources.${id}.checked`, `[${n}] Last checked`, checked),
];

export const PAGES_SOURCES = [
  {
    key: 'sources', label: 'Sources & Methodology (/sources)', path: '/sources',
    sections: [
      { key: 'seo', label: 'Browser tab / search result', fields: [
        f('sources.seo.title', 'Page title', 'Sources & Methodology — CarryOn'),
        f('sources.seo.description', 'Description', 'Where every statistic on carryon.us comes from, what each figure actually measures, and how our live numbers are counted.'),
      ] },
      { key: 'hero', label: 'Heading', fields: [
        f('sources.hero.eyebrow', 'Small gold line', 'Show your work'),
        f('sources.hero.title', 'Heading', 'Sources & Methodology'),
        ML('sources.hero.intro', 'Intro paragraph', 'We ask families to trust us with the most private things they own, so we hold our own claims to the same standard. Every precise figure on this site links here. If a number can’t be sourced, we don’t use it.'),
        f('sources.back', 'Back link', 'Back to homepage'),
      ] },
      { key: 'hours', label: '[1] 570 hours to settle an estate', fields: entry('hours', 1,
        'Settling an estate without organized records takes an average of 570 hours.',
        'Executor effort, averaged across U.S. estates settled through EstateExec — roughly 570 hours per estate, with about 80% of estates finished in under 800 hours and an average settlement time of almost 16 months. The figure covers all estates, organized or not; CarryOn’s premise is that organized records remove a large share of that time.',
        'EstateExec, “General Statistics” (first nationwide statistics on after-death practices, 2018; page maintained since)',
        'https://www.estateexec.com/Docs/General_Statistics', 'September 2026') },
      { key: 'will', label: '[2] 76% of Americans', fields: entry('will', 2,
        '76% of American families will face exactly this.',
        'The share of U.S. adults who report they do not have a will — 24% said they had one in Caring.com’s 2025 survey, so 76% did not. It is a measure of missing wills, not of every kind of unpreparedness; some of those adults have other estate documents, and having a will does not by itself mean a family knows where things are.',
        'Caring.com, “2025 Wills and Estate Planning Survey”',
        'https://www.caring.com/resources/wills-survey', 'September 2026') },
      { key: 'hospice', label: '[3] 300,000 Americans in hospice', fields: entry('hospice', 3,
        'At any given time, over 300,000 Americans are in hospice.',
        'A conservative point-in-time estimate. NHPCO reports about 1.7 million Medicare beneficiaries receive hospice care each year with an average length of stay near 90 days; that implies well over 300,000 people enrolled on any given day, before counting patients outside Medicare.',
        'NHPCO (National Hospice and Palliative Care Organization), “Facts and Figures” report',
        'https://www.nhpco.org/hospice-care-overview/hospice-facts-figures/', 'September 2026') },
      { key: 'live', label: '[4] Live numbers on the homepage', fields: entry('live', 4,
        '“39 families · 25 documents · 16 milestone messages · 449 checklist steps · 65 people invited” (the counts change as families use CarryOn).',
        'Counted live from CarryOn’s production database and refreshed every ten minutes: estates created, documents in their vaults, milestone messages recorded, checklist items, and people invited. The counts include our own demonstration account — the one the product screenshots come from. Nothing is estimated, rounded up, or seeded; when the numbers are small it is because we are new.',
        'CarryOn production data, counted live',
        '/security', 'Live') },
    ],
  },
];
