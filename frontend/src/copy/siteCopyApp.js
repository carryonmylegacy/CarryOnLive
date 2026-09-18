/**
 * Site Copy registry — in-app screens (signup wizard, subscription paywall, onboarding).
 * Same shape as siteCopy.js. Text with {curly} placeholders is filled in at runtime
 * (e.g. {days}, {name}); keep the placeholder when rewording.
 */
const f = (k, label, d, extra = {}) => ({ k, label, d, ...extra });
const ML = (k, label, d) => f(k, label, d, { multiline: true });
const LIST = (k, label, d) => f(k, label, d, { multiline: true, list: true });

const ONBOARDING_STEPS = [
  ['add_beneficiary', 'Add Someone You Love', 'Just a name and relationship to get started'],
  ['create_message', 'Leave a Milestone Message', 'Use the Milestone Messages tool to record one'],
  ['upload_document', 'Upload a Document', 'Pick a file and give it a name'],
  ['review_readiness', 'Check Your Readiness', 'Get your personalized readiness score'],
  ['customize_checklist', 'Review Your Checklist', 'See the steps your loved ones will follow'],
  ['designate_primary', 'Set Succession Order', 'Arrange your beneficiary order (optional)'],
  ['add_credential', 'Save a Digital Login', 'Store an account login for your loved ones (optional)'],
  ['build_financial_picture', 'Build Your Financial Picture', 'Bills, debts, accounts, and property — get started'],
  ['review_settings', 'Review Your Settings', 'Open Settings and Security Settings to customize your portal'],
];

export const PAGES_APP = [
  {
    key: 'signup', label: 'Sign-up wizard', path: '/signup',
    sections: [
      { key: 'hero', label: 'Left panel / mobile header', fields: [
        f('signup.hero.join', 'Headline — line 1 ({company} is CarryOn or the partner’s name)', 'Join {company}.'),
        f('signup.hero.h1b', 'Headline — line 2 (gold)', 'Get your family ready.'),
        f('signup.hero.sub', 'Sub-headline', 'Start in under a minute. Build the rest at your pace.'),
        f('signup.hero.badge1', 'Badge 1', 'Scrambled before it’s stored'),
        f('signup.hero.badge2', 'Badge 2', 'A separate lock for every family'),
        f('signup.hero.badge3', 'Badge 3', 'Two-step sign-in'),
        f('signup.step_counter', 'Step counter ({n} of {total})', 'Step {n} of {total}'),
        f('signup.trust_line', 'Security line under the card', 'Scrambled before it’s stored · A separate lock for every family · Secure connection'),
      ] },
      { key: 'name', label: 'Step: your name', fields: [
        f('signup.name.title', 'Heading', 'What’s your full legal name?'),
        f('signup.name.sub', 'Sub-heading', 'Use the name your family knows you by.'),
        f('signup.name.gender_hint', 'Gender helper text', 'Used for relationship terms in your family plan.'),
      ] },
      { key: 'minor', label: 'Step: under 18 (invitation required)', fields: [
        f('signup.minor.title', 'Heading', 'Invitation Required'),
        ML('signup.minor.sub', 'Sub-heading', 'Accounts for family members under 18 are created through an invitation from a benefactor.'),
        ML('signup.minor.text', 'Box text', 'Ask your parent or guardian to add you as a beneficiary from their CarryOn dashboard. They’ll send you an invitation link to create your account.'),
        f('signup.minor.link', 'Link to sign in', 'Already have an invitation? Sign in here'),
      ] },
      { key: 'eligibility', label: 'Step: special eligibility', fields: [
        f('signup.eligibility.title', 'Heading', 'Special Eligibility'),
        f('signup.eligibility.sub', 'Sub-heading', 'Select if any apply for discounted pricing.'),
        f('signup.eligibility.verify', 'Small note on each option', 'Verification required'),
        f('signup.eligibility.optional', 'Footnote', 'Selections are optional.'),
      ] },
      { key: 'account', label: 'Step: secure your account', fields: [
        f('signup.account.title', 'Heading', 'Secure your account'),
        ML('signup.account.sub', 'Sub-heading', 'Choose a unique username and strong password to protect your family’s data.'),
        f('signup.account.username_hint', 'Username helper text', 'This is how you’ll sign in. Letters, numbers, and underscores only.'),
        f('signup.account.email_hint', 'E-mail helper text', 'For verification codes and notifications. Can be shared with family members.'),
        ML('signup.account.consent', 'Consent sentence (the Terms and Privacy links follow it)', 'I agree to receive text messages from CarryOn™ for account verification. Message and data rates may apply. I also agree to the'),
      ] },
      { key: 'partner', label: 'Step: enterprise access code', fields: [
        f('signup.partner.badge', 'Small badge', 'Last step'),
        f('signup.partner.title', 'Heading', 'Enterprise Access Code'),
        ML('signup.partner.text_generic', 'Text when no partner is known (**Skip** is highlighted)', 'If you arrived from a CarryOn partner’s portal, enter your access code below. Otherwise tap **Skip** to continue.'),
        ML('signup.partner.text_partner', 'Text when a partner is known ({company}; **Skip** is highlighted)', 'Enter the code **{company}** shared with you to unlock your custom CarryOn experience. No code? Tap **Skip** below.'),
        ML('signup.partner.info', 'Info box', 'An enterprise code unlocks the custom feature set your B2B partner negotiated with CarryOn. You can skip this and add a code later from your profile.'),
        f('signup.partner.skip', 'Skip link', 'I don’t have a code — skip'),
        f('signup.partner.applied_sub', 'After a code is applied', 'Your custom feature set is now active. Taking you to your dashboard…'),
      ] },
      { key: 'buttons', label: 'Buttons', fields: [
        f('signup.btn.continue', 'Continue', 'Continue'),
        f('signup.btn.back', 'Back', 'Back'),
        f('signup.btn.signin', 'Sign In (first step)', 'Sign In'),
        f('signup.btn.create', 'Create Account', 'Create Account'),
        f('signup.btn.none_create', 'No eligibility selected — create', 'None Apply — Create Account'),
        f('signup.btn.apply_code', 'Apply Code', 'Apply Code'),
        f('signup.btn.skip_code', 'Skip — No Code', 'Skip — No Code'),
      ] },
    ],
  },
  {
    key: 'paywall', label: 'Subscription paywall', path: '/subscription',
    sections: [
      { key: 'header', label: 'Header (three states)', fields: [
        f('paywall.expired.title', 'Exploration ended — heading', 'Your Exploration Period Has Ended'),
        ML('paywall.expired.sub', 'Exploration ended — text', 'Choose a plan to continue protecting your family’s estate plan with CarryOn.'),
        f('paywall.active.title', 'Exploring — heading', 'Choose Your Plan'),
        f('paywall.active.days', 'Exploring — days line ({days})', '{days} days left in your exploration period'),
        ML('paywall.active.sub', 'Exploring — text', 'Select a plan now to ensure uninterrupted access when your exploration period ends.'),
        f('paywall.default.title', 'No trial — heading', 'Choose Your Plan'),
        f('paywall.default.sub', 'No trial — text', 'Subscribe to access the full CarryOn platform.'),
        f('paywall.continue', 'Continue exploring link ({days})', 'Continue exploring ({days} days remaining)'),
        f('paywall.dashboard', 'Go to Dashboard link', 'Go to Dashboard'),
        f('paywall.pending_review', 'Verification under review ({tier})', 'Your {tier} verification is under review'),
      ] },
      { key: 'cards', label: 'Plan cards', fields: [
        f('paywall.badge.popular', 'Premium ribbon', 'Most Popular'),
        f('paywall.badge.recommended', 'Premium ribbon when recommended', 'Recommended — Best Value'),
        f('paywall.badge.best_value', 'Annual toggle badge', 'Best Value'),
        f('paywall.cta.subscribe', 'Button: Subscribe', 'Subscribe'),
        f('paywall.cta.verify', 'Button: Verify & Subscribe', 'Verify & Subscribe'),
        f('paywall.cta.upgrade_best', 'Button: Upgrade to Best Value', 'Upgrade to Best Value'),
        f('paywall.cta.current', 'Current plan label', 'Current Plan'),
        f('paywall.cta.confirming', 'Payment confirming label', 'Confirming your payment…'),
        f('paywall.cta.upgrade', 'Upgrade label', 'Upgrade'),
        f('paywall.cta.downgrade', 'Downgrade label', 'Downgrade'),
        f('paywall.cta.ages', 'Age-restricted label ({ages})', 'Ages {ages} only'),
        f('paywall.discount_line', 'Line above the reduced-price tiers', 'Dedicated tiers · same features · eligibility verified after subscribe'),
      ] },
      { key: 'family', label: 'Family Plan tile & details', fields: [
        f('paywall.family.title', 'Tile heading', 'Family Plan'),
        f('paywall.family.price', 'Tile price line', 'Bundle & Save'),
        f('paywall.family.ben_line', 'Beneficiary line ({pct})', 'All beneficiaries: {pct}% off their tier rate'),
        LIST('paywall.family.bullets', 'Tile bullets — one per line ({benefactor}/{beneficiary} = discount %)', 'Owner pays their regular tier rate\nAdded benefactors save {benefactor}%\nBeneficiaries save {beneficiary}%\nSuccessor inherits ownership'),
        f('paywall.family.note', 'Tile footnote', 'Subscribe individually, then add family from Settings'),
        f('paywall.family.learn', 'Tile button', 'Learn More'),
        f('paywall.family.details_title', 'Details heading', 'Family Plan Details'),
        f('paywall.family.owner_label', 'Owner — label', 'Plan Owner'),
        f('paywall.family.owner_text', 'Owner — text', 'Pays their regular tier rate. Sets the plan anchor.'),
        f('paywall.family.benefactors_label', 'Added benefactors — label', 'Added Benefactors'),
        f('paywall.family.benefactors_text', 'Added benefactors — text ({pct})', '{pct}% off their individual tier rate'),
        f('paywall.family.beneficiaries_label', 'Beneficiaries — label', 'All Beneficiaries'),
        f('paywall.family.beneficiaries_text', 'Beneficiaries — text ({pct})', '{pct}% off their tier’s beneficiary rate'),
        ML('paywall.family.details_note', 'Details footnote', 'Subscribe to any individual plan first, then set up your Family Plan from Settings. Designate a successor who inherits ownership upon transition.'),
      ] },
      { key: 'footer', label: 'Disclosures', fields: [
        ML('paywall.disclosure.protection', 'Protection line', 'Every plan includes the same protection: your files are scrambled before they’re stored, with a separate lock for every family.'),
        ML('paywall.disclosure.payment', 'Payment terms ({method} = Apple ID or payment method)', 'Payment will be charged to your {method} at confirmation of purchase. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.'),
        f('paywall.disclosure.apple', 'Extra sentence on iPhone (App Store)', 'Manage subscriptions in your iPhone Settings > Apple ID > Subscriptions.'),
        f('paywall.restore', 'Restore Purchases (iPhone)', 'Restore Purchases'),
      ] },
      { key: 'verification', label: 'Eligibility verification dialog', fields: [
        f('paywall.verify.title', 'Heading ({tier})', '{tier} Verification'),
        f('paywall.verify.intro', 'Intro', 'Please upload one of the following documents to verify your eligibility:'),
        f('paywall.verify.doc_type', 'Label: document type', 'Document Type'),
        f('paywall.verify.upload', 'Label: upload', 'Upload Document'),
        f('paywall.verify.pick', 'File picker text', 'Click to select file'),
        f('paywall.verify.submit', 'Button', 'Submit for Review'),
        f('paywall.verify.footnote', 'Footnote', 'Documents are reviewed within 24 hours. You’ll be notified once approved.'),
      ] },
    ],
  },
  {
    key: 'onboarding', label: 'Onboarding', path: '/dashboard', previewPaths: ['/dashboard', '/onboarding'],
    sections: [
      { key: 'welcome', label: 'Welcome page (/onboarding)', fields: [
        f('onboarding.welcome.title', 'Heading ({name} = first name)', 'Welcome, {name}! 🎉'),
        f('onboarding.welcome.sub', 'Sub-heading', 'Let’s add the people who matter most to your estate plan'),
        f('onboarding.welcome.step1', 'Progress: step 1', 'Account Created'),
        f('onboarding.welcome.step2', 'Progress: step 2', 'Add Beneficiaries'),
        f('onboarding.welcome.step3', 'Progress: step 3', 'Dashboard'),
        f('onboarding.welcome.card_title', 'Card heading', 'Your Beneficiaries'),
        f('onboarding.welcome.card_empty', 'Card text when none added', 'Add the people who will inherit your estate plan'),
        f('onboarding.welcome.add_first', 'Button: add first', 'Add Your First Beneficiary'),
        f('onboarding.welcome.add_another', 'Button: add another', 'Add Another Beneficiary'),
        f('onboarding.welcome.skip', 'Button: skip', 'Skip for Now'),
        f('onboarding.welcome.continue', 'Button: continue', 'Continue to Dashboard'),
        f('onboarding.welcome.footnote', 'Footnote', 'You can always add or manage beneficiaries from your dashboard'),
      ] },
      { key: 'guide', label: 'Setup Guide (dashboard tile)', fields: [
        f('onboarding.guide.title', 'Tile heading', 'Setup Guide'),
        f('onboarding.guide.progress', 'Progress line ({done}, {total})', '{done} of {total} done'),
        f('onboarding.guide.view_all', 'Link: view all steps', 'View all steps'),
        f('onboarding.guide.hide_all', 'Link: hide all steps', 'Hide all steps'),
        f('onboarding.guide.done', 'Column: Done', 'Done'),
        f('onboarding.guide.skip', 'Column: Skip', 'Skip'),
        f('onboarding.guide.step', 'Column: Step', 'Step'),
        ...ONBOARDING_STEPS.flatMap(([id, label, desc]) => [
          f(`onboarding.steps.${id}.label`, `Step “${label}” — title`, label),
          f(`onboarding.steps.${id}.desc`, `Step “${label}” — description`, desc),
        ]),
      ] },
      { key: 'dismiss', label: 'Hiding the guide', fields: [
        f('onboarding.dismiss.title', 'Confirm heading', 'Close Getting Started?'),
        ML('onboarding.dismiss.text', 'Confirm text', 'This will hide the Getting Started guide. You won’t see it again unless you re-enable it in Settings.'),
        f('onboarding.dismiss.cancel', 'Button: cancel', 'Cancel'),
        f('onboarding.hidden.title', 'Hidden heading', 'Guide Hidden'),
        ML('onboarding.hidden.text', 'Hidden text (**Settings** is highlighted)', 'To see the Getting Started guide again, go to **Settings** and toggle it back on.'),
      ] },
      { key: 'tips', label: 'Tips shown with the guide', fields: [
        f('onboarding.views.title', 'Two views — heading', 'Welcome — Two Views'),
        ML('onboarding.views.text', 'Two views — text ({menu} = left menu / hamburger menu)', 'Switch between your **Benefactor** estate and **Beneficiary** access anytime via **Switch View** in the {menu}.'),
        f('onboarding.offline.title', 'Offline — heading', 'Offline Mode — Quick Setup'),
        LIST('onboarding.offline.steps', 'Offline — steps, one per line', 'Install CarryOn to your **home screen** (PWA only).\nSign in once while **online** and wait ~30s for sync.\nEnable in **Settings → Offline**. Stays 90 days; revoke anytime.\nYour password is **never stored** — only an encrypted credential.'),
      ] },
    ],
  },
];
