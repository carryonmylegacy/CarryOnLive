/**
 * Disaster-specific question templates for the CarryOn Contingency
 * Protocols (CCP) Wizard.
 *
 * Each disaster type defines its evacuation category, a short intro,
 * and a set of follow-up questions that feed richer context to the AI
 * plan generator.
 *
 * Design rules (Apr 2026 founder directive):
 *  1. ONLY the primary evacuation/destination/meetup address (or its
 *     equivalent core safety field) is `required: true`. Backups and
 *     alternates are `required: false` so the gold "Generate Plan"
 *     CTA illuminates after a single asterisked field is filled.
 *  2. Each template MUST contain at least one question that is
 *     NON-OBVIOUS to a layperson — something that makes the user think
 *     "interesting, I never thought of that." This is what separates
 *     CarryOn from a fill-in-the-blank form.
 *
 * type: 'address' → renders AddressAutocomplete with Google Places
 * type: 'select'  → renders <select> with options[]
 * type: 'text' (default) → renders plain input
 */

export const DISASTER_TEMPLATES = {
  // ─── DISTANT EVACUATION ────────────────────────────
  hurricane: {
    evacuationType: 'distant',
    intro: 'Hurricanes require evacuating well outside the projected storm path. Local meetup points are dangerous — we need to know where your family would go, when, and what travels with you.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary evacuation destination *', placeholder: "e.g., Aunt Sarah's house in Dallas, TX", required: true, type: 'address' },
      { key: 'evacuation_secondary', label: 'Backup destination (different direction)', placeholder: 'e.g., Hotel in Atlanta, GA — in case the storm path shifts', required: false, type: 'address' },
      { key: 'evac_trigger', label: 'When do you commit to leaving?', placeholder: 'Pick when you stop watching and start driving', required: true, type: 'select', options: ['Voluntary watch issued', 'Cat 2 warning issued', 'Cat 3+ warning issued', 'Mandatory evacuation order'] },
      { key: 'pet_plan', label: 'Pets — who carries which animal?', placeholder: 'e.g., Dogs ride with Mom in the SUV; cats with Dad in carriers in the car', required: false },
      { key: 'gobag_docs', label: 'Where are insurance + IDs grab-and-go ready?', placeholder: 'e.g., Fireproof folder by the front door; backup scans on phone', required: false },
    ],
  },
  flood: {
    evacuationType: 'distant',
    intro: 'Flooding can cut off roads in 30 minutes. Your destination must be on high ground; your prep must include what gets lifted before you leave.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary high-ground destination *', placeholder: "e.g., Friend's house on the hill in Westview", required: true, type: 'address' },
      { key: 'evacuation_secondary', label: 'Backup destination (different route)', placeholder: 'e.g., Hotel in Springdale — avoids low-lying roads', required: false, type: 'address' },
      { key: 'lift_priority', label: 'What gets lifted to the top floor before you leave?', placeholder: 'e.g., Family photos, hard drives, kids\' baby books, passports', required: false },
      { key: 'sump_pump', label: 'Sump pump — last tested when?', placeholder: 'e.g., March 2026; battery backup OK', required: false, type: 'select', options: ['No sump pump', 'Tested in last 3 months', 'Tested 3-12 months ago', 'Never tested', 'Not sure'] },
      { key: 'flood_policy', label: 'NFIP flood policy number (or "none")', placeholder: 'e.g., FL-2456893 — saved in vault', required: false },
    ],
  },
  tsunami: {
    evacuationType: 'distant',
    intro: 'Tsunamis give 10-30 minutes of warning at most. Speed and elevation matter more than distance — the goal is high ground or up, not far.',
    questions: [
      { key: 'evacuation_primary', label: 'Nearest high-ground point (inland or uphill) *', placeholder: 'e.g., Hilltop Park on Crest Rd — 200ft elevation', required: true, type: 'address' },
      { key: 'evacuation_secondary', label: 'Backup inland destination', placeholder: 'e.g., Community center on Ridge Ave', required: false, type: 'address' },
      { key: 'vertical_evac', label: 'Vertical-evacuation building if roads are gridlocked', placeholder: 'e.g., 7th floor of the parking garage at City Hall', required: false, type: 'address' },
      { key: 'siren_recognition', label: 'Do you recognize your local tsunami siren tone?', placeholder: 'Most municipalities run a monthly test — knowing the sound saves seconds', required: false, type: 'select', options: ['Yes, and I know the test schedule', 'I\'ve heard tests but not paid attention', 'I don\'t know if my area has sirens', 'I rely on phone alerts only'] },
    ],
  },
  wildfire: {
    evacuationType: 'distant',
    intro: 'Wildfires move with wind and terrain — sometimes a mile a minute. Your plan needs a destination, a defensible-space audit, and a red-flag-day routine.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary evacuation destination *', placeholder: 'e.g., Town center in Lakeside — 30 miles east', required: true, type: 'address' },
      { key: 'evacuation_secondary', label: 'Backup destination (different direction)', placeholder: "e.g., Relative's home in Riverside", required: false, type: 'address' },
      { key: 'defensible_space', label: 'Defensible space — how much around the home is cleared of brush/trees?', placeholder: 'CalFire recommends 30ft minimum, 100ft ideal', required: false, type: 'select', options: ['Less than 30ft', '30-100ft', 'More than 100ft', 'Not sure'] },
      { key: 'red_flag_routine', label: 'Red-flag-day routine — what gets done by 9am?', placeholder: "e.g., Cars pointed out of driveway, hose hooked up, go-bags loaded, pets crated", required: false },
      { key: 'gobag_inventory', label: "Per-person go-bag — what's in the kids' bags?", placeholder: 'e.g., Comfort item, photo of parents, allergy meds, change of clothes', required: false },
    ],
  },

  // ─── LOCAL RENDEZVOUS ──────────────────────────────
  earthquake: {
    evacuationType: 'local',
    intro: 'After a major quake, infrastructure is unreliable for 72 hours. Your plan covers where to meet, who shuts off the gas, and which household items become projectiles.',
    questions: [
      { key: 'meetup_primary', label: 'Primary outdoor meetup point *', placeholder: 'e.g., The park across from our house — away from buildings and lines', required: true, type: 'address' },
      { key: 'meetup_secondary', label: 'Backup meetup (if primary is damaged)', placeholder: 'e.g., School parking lot on Oak St', required: false, type: 'address' },
      { key: 'gas_shutoff', label: 'Gas shutoff — who knows how, and is there a wrench tied to the meter?', placeholder: 'e.g., Wrench is zip-tied to the meter; Mom and oldest kid know how', required: false },
      { key: 'water_heater_strap', label: 'Is the water heater strapped to the wall?', placeholder: 'A 50-gallon water heater becomes a battering ram in a 6.0+', required: false, type: 'select', options: ['Yes, double-strapped', 'Yes, single strap', 'No', 'Not sure'] },
      { key: 'drop_cover_drill', label: 'Last drop-cover-hold drill with the kids?', placeholder: 'e.g., October 2025 (ShakeOut Day)', required: false },
    ],
  },
  tornado: {
    evacuationType: 'local',
    intro: 'You have 5-15 minutes from siren to impact. Your plan covers shelter location, head protection, and meetup after the all-clear.',
    questions: [
      { key: 'shelter_location', label: 'Safe room in your home *', placeholder: 'e.g., Basement under the stairs / interior bathroom on lowest floor', required: true },
      { key: 'meetup_after', label: 'Meetup point after the tornado passes', placeholder: "e.g., Neighbor's driveway at 142 Elm St", required: false, type: 'address' },
      { key: 'head_protection', label: 'Head protection in the safe room?', placeholder: 'Most tornado deaths are from head trauma — bike helmets work', required: false, type: 'select', options: ['Helmets stored in safe room', 'Pillows/cushions only', 'Mattress pulled overhead', 'Nothing yet'] },
      { key: 'weather_radio', label: 'NOAA weather radio with battery backup?', placeholder: 'Phone alerts fail when towers are hit — radios don\'t', required: false, type: 'select', options: ['Yes, tested monthly', 'Yes, never tested', 'No, only phone alerts', 'No backup at all'] },
    ],
  },

  // ─── IMMEDIATE ESCAPE ──────────────────────────────
  house_fire: {
    evacuationType: 'immediate',
    intro: 'You have 2-3 minutes to be out. Plan covers two ways out of every bedroom, a single visible meetup, and a yearly drill with the kids.',
    questions: [
      { key: 'meetup_outside', label: 'Family meetup spot outside *', placeholder: 'e.g., Mailbox at the end of the driveway — visible from the street', required: true },
      { key: 'home_floors', label: 'Number of floors in your home', placeholder: 'e.g., 2', required: false },
      { key: 'two_ways_out', label: 'Two ways out of each bedroom', placeholder: 'e.g., Master: door + window with collapsible ladder under bed; kids: door + window onto porch roof', required: false },
      { key: 'smoke_alarm_type', label: 'Smoke alarms — interconnected or standalone?', placeholder: 'Interconnected = one alarm trips them all; saves 1-2 minutes', required: false, type: 'select', options: ['All interconnected (wired or wireless)', 'Mixed', 'All standalone', 'Not sure'] },
      { key: 'kids_drill', label: 'When did kids last practice the fire drill?', placeholder: 'NFPA recommends every 6 months', required: false, type: 'select', options: ['Within last 6 months', '6-12 months ago', 'Over a year ago', 'Never with the kids'] },
    ],
  },
  home_invasion: {
    evacuationType: 'immediate',
    intro: 'A home invasion plan layers Run / Hide / Fight on top of a fortified safe room, a silent alert, and clear escape options. Self-defense tools are a LAST resort — but if you have them, the plan needs to know where they are.',
    questions: [
      { key: 'safe_room', label: 'Designated safe room *', placeholder: 'e.g., Master bedroom — solid-core door with deadbolt', required: true },
      { key: 'escape_destination', label: 'Where to run if you escape', placeholder: 'e.g., Neighbor at 148 Maple — they know to call 911', required: false, type: 'address' },
      { key: 'silent_codeword', label: 'Silent alert codeword (a phrase that means "call 911" if you must speak in front of someone)', placeholder: 'e.g., "Tell Aunt Linda I said hi" — distinct enough to be unmistakable on a phone call', required: false },
      { key: 'door_reinforcement', label: 'Safe-room door — is it solid core with a deadbolt?', placeholder: 'Hollow doors fail to a kick in under 5 seconds', required: false, type: 'select', options: ['Solid core + deadbolt', 'Solid core, no deadbolt', 'Hollow door', 'Not sure'] },
      { key: 'defensive_resources', label: 'Self-defense items and where each is stored (LAST resort only)', placeholder: 'e.g., Pistol — bedroom safe (combo XXXX); shotgun — closet, top shelf; aluminum bat — under bed; pepper spray — nightstand drawer', required: false, type: 'textarea' },
    ],
  },

  // ─── SHELTER IN PLACE ──────────────────────────────
  nuclear: {
    evacuationType: 'shelter',
    intro: 'A nuclear event requires sheltering in the most fortified structure available, potentially 14+ days. Distance, shielding, and time are the three protective factors.',
    questions: [
      { key: 'shelter_building', label: 'Best shelter nearby (thick walls, basement, no windows) *', placeholder: 'e.g., Our basement / community center on 5th Ave', required: true, type: 'address' },
      { key: 'supply_days', label: 'Days of food + water on hand', placeholder: '14 days minimum recommended', required: false },
      { key: 'ki_tablets', label: 'Potassium iodide (KI) — stocked for thyroid protection?', placeholder: 'KI blocks radioactive iodine uptake; effective if taken within hours of exposure', required: false, type: 'select', options: ['Yes, full 14-day supply per family member', 'Yes, partial supply', 'Aware but not stocked', 'Was not aware'] },
      { key: 'air_seal_kit', label: 'Air-sealing kit (plastic sheeting + duct tape) staged?', placeholder: 'You seal one interior room to keep contaminated air out', required: false, type: 'select', options: ['Yes, staged in the shelter room', 'Have materials but not staged', 'Not yet'] },
      { key: 'radiation_meter', label: 'Personal radiation detector or dosimeter?', placeholder: 'Cheap NukAlert keychain or similar — a few hundred dollars saves guesswork', required: false },
    ],
  },
  winter_storm: {
    evacuationType: 'shelter',
    intro: 'A multi-day winter event tests heat, water, and food redundancy. Burst pipes are the #1 secondary disaster.',
    questions: [
      { key: 'backup_heat', label: 'Backup heating source *', placeholder: 'e.g., Wood-burning fireplace / propane heater (vented!) / pellet stove', required: true },
      { key: 'backup_shelter', label: 'Alternate shelter if pipes burst', placeholder: "e.g., Grandma's house at 220 Pine St", required: false, type: 'address' },
      { key: 'pipe_insulation', label: 'Pipe insulation — exposed pipes wrapped?', placeholder: 'Especially garage, crawl space, exterior wall plumbing', required: false, type: 'select', options: ['Yes, all exposed pipes wrapped', 'Some pipes wrapped', 'No', 'Not sure'] },
      { key: 'vehicle_winter_kit', label: "What's in your car emergency kit?", placeholder: 'e.g., Wool blankets, traction mats, jumper cables, granola bars, full tank', required: false },
      { key: 'co_detector', label: 'CO detectors on every floor?', placeholder: 'Backup heating + sealed home = #1 cause of CO deaths', required: false, type: 'select', options: ['Yes, every floor + battery backup', 'Yes, some floors', 'No CO detectors', 'Not sure'] },
    ],
  },
  power_outage: {
    evacuationType: 'shelter',
    intro: 'Extended outages cascade — refrigeration fails first, then heat or AC, then medical devices, then communications. Plan the cascade.',
    questions: [
      { key: 'backup_power', label: 'Backup power source *', placeholder: 'e.g., Whole-home generator / portable + transfer switch / battery wall', required: true },
      { key: 'medical_devices', label: 'Medical devices needing continuous power?', placeholder: 'e.g., CPAP machine / oxygen concentrator / insulin refrigeration / none', required: false },
      { key: 'fridge_triage', label: 'Refrigerator triage order — what gets eaten first, frozen second?', placeholder: 'USDA rule: fridge safe 4 hours unopened, freezer 48 hours full', required: false },
      { key: 'comms_fallback', label: 'Communication fallback if cell towers go down?', placeholder: 'e.g., GMRS handheld radios / battery satellite messenger / nearest tower with backup gen', required: false },
      { key: 'gas_station_dist', label: 'Nearest gas station with backup generator', placeholder: 'Most pumps need power — knowing the closest one with backup matters', required: false, type: 'address' },
    ],
  },
  water_failure: {
    evacuationType: 'shelter',
    intro: 'Water system failure means no drinking, no flushing, no showers — sometimes for a week. Plan reserves, sanitation, and disinfection.',
    questions: [
      { key: 'water_reserve', label: 'Water reserve on hand *', placeholder: 'FEMA: 1 gallon per person per day x 14 days', required: true },
      { key: 'alt_water_source', label: 'Nearest alternative water source', placeholder: 'e.g., Creek behind neighborhood / municipal distribution point', required: false },
      { key: 'emergency_toilet', label: 'Emergency toilet plan?', placeholder: '5-gallon bucket + heavy-duty bags + cat litter is the standard', required: false, type: 'select', options: ['Bucket + bags + absorbent', 'Camping toilet stored', 'No plan yet'] },
      { key: 'disinfection_method', label: 'Water disinfection method known?', placeholder: 'Bleach: 8 drops per gallon, wait 30 min. Or boil 1 minute (3 min above 6500ft).', required: false, type: 'select', options: ['Bleach + measuring dropper stocked', 'Filter (Berkey, Sawyer)', 'UV (SteriPen)', 'Boil only', 'No method ready'] },
    ],
  },
  pandemic: {
    evacuationType: 'shelter',
    intro: 'Pandemics test isolation readiness — supplies, masks, telehealth access, and a plan for when one family member gets sick mid-shelter.',
    questions: [
      { key: 'supply_duration', label: 'Days of food + supplies for full isolation *', placeholder: '14 days minimum; 30 days ideal', required: true },
      { key: 'nearest_medical', label: 'Nearest hospital or urgent care', placeholder: "e.g., St. Mary's Hospital — 3 miles on Route 9", required: false, type: 'address' },
      { key: 'mask_supply', label: 'N95 / KN95 masks per person on hand?', placeholder: 'CDC guideline: 3 per person per day in active outbreak', required: false, type: 'select', options: ['100+ per person', '20-100 per person', 'Under 20', 'Surgical only', 'None'] },
      { key: 'telehealth_provider', label: 'Telehealth provider account already set up?', placeholder: 'e.g., Teladoc / our PCP\'s portal / nothing yet', required: false },
      { key: 'isolation_room', label: 'Designated isolation room if one of you gets sick?', placeholder: 'e.g., Spare bedroom with attached bath; separate ventilation if possible', required: false },
    ],
  },
  cyber_attack: {
    evacuationType: 'shelter',
    intro: 'A major cyber event can knock out banking, utilities, and comms for days. Cash, paper records, and offline 2FA codes are the moat.',
    questions: [
      { key: 'cash_reserve', label: 'Emergency cash on hand *', placeholder: 'e.g., $500 in small bills in the home safe', required: true },
      { key: 'offline_comms', label: 'Offline communication backup', placeholder: 'e.g., Battery-powered NOAA radio / GMRS handhelds with neighbors', required: false },
      { key: 'paper_records', label: 'Paper copies of which docs are stored?', placeholder: 'e.g., Last 3 months of bank statements, IDs, deeds, insurance cards, contact list', required: false },
      { key: '2fa_recovery', label: 'Where are 2FA recovery codes stored offline?', placeholder: 'e.g., Sealed envelope in fireproof safe + duplicate at parents\' house', required: false, type: 'select', options: ['Sealed offline + offsite copy', 'Offline only', 'In a password manager only', 'Not sure'] },
      { key: 'manual_payments', label: 'Vendors that accept paper checks if cards fail?', placeholder: 'e.g., Pharmacy, grocer, utilities — pre-printed checks ready', required: false },
    ],
  },

  // ─── VARIABLE / SITUATIONAL ────────────────────────
  terrorism: {
    evacuationType: 'variable',
    intro: 'Terrorism response depends on proximity — evacuate if nearby, shelter if distant, and rendezvous away from crowded landmarks.',
    questions: [
      { key: 'safe_meetup', label: 'Safe meetup point away from crowded areas *', placeholder: 'e.g., Parking lot behind the library on 3rd Ave — not a transit hub or stadium', required: true, type: 'address' },
      { key: 'workplace_school', label: 'Workplaces or schools to evacuate from', placeholder: 'e.g., Downtown office at 500 Main St / Lincoln High School', required: false, type: 'address' },
      { key: 'run_hide_fight', label: '"Run, Hide, Fight" — does the family know the order?', placeholder: 'DHS-recommended order: get out → barricade → only fight as last resort', required: false, type: 'select', options: ['Yes, all family members briefed', 'Some family members', 'Aware but not briefed', 'Was not aware'] },
      { key: 'out_of_area_contact', label: 'Out-of-area contact (one number everyone calls)', placeholder: 'e.g., Aunt Mary in Phoenix at 555-0123 — long-distance often works when local doesn\'t', required: false },
      { key: 'family_text_check', label: 'Family text-check phrase that means "I\'m safe"', placeholder: 'e.g., "Sun is up." — distinct enough to be unmistakable', required: false },
    ],
  },
  civil_unrest: {
    evacuationType: 'variable',
    intro: 'Civil unrest can escalate without notice. Vehicle prep, exit routes, and a 5-minute grab-list are the difference between leaving early and being stuck.',
    questions: [
      { key: 'evacuation_destination', label: 'Safe destination if you need to leave the area *', placeholder: "e.g., Sister's house in the suburbs — 25 miles north", required: true, type: 'address' },
      { key: 'alt_route', label: 'Alternative route out of your neighborhood', placeholder: 'e.g., Back road via Elm St to Highway 7 — avoids downtown', required: false },
      { key: 'fuel_level', label: 'Fuel-level rule during high-tension periods?', placeholder: 'Common rule: never drop below ½ tank', required: false, type: 'select', options: ['Always above ½ tank', 'Above ¼ tank', 'Fill when low', 'No rule yet'] },
      { key: 'grab_list', label: '5-minute grab-list — top 3 documents/items you take', placeholder: 'e.g., Passports + birth certs + external hard drive', required: false },
      { key: 'kid_pickup', label: 'School-pickup contingency if you can\'t reach the school?', placeholder: 'e.g., Grandma is on the auth list and lives 4 blocks from the school', required: false },
    ],
  },
  chemical_spill: {
    evacuationType: 'variable',
    intro: 'Chemical spills are wind-direction problems first, distance problems second. The plan moves you upwind or seals you in the room with the fewest air gaps.',
    questions: [
      { key: 'upwind_destination', label: 'Upwind evacuation destination *', placeholder: 'e.g., Community center on North Hill — opposite the prevailing wind', required: true, type: 'address' },
      { key: 'nearest_facility', label: 'Nearest industrial or chemical facility', placeholder: 'e.g., Refinery on Industrial Blvd — 2 miles south', required: false, type: 'address' },
      { key: 'prevailing_wind', label: 'Prevailing wind direction at your home?', placeholder: 'e.g., Wind blows southwest-to-northeast 80% of the year — look it up on weather.gov', required: false, type: 'select', options: ['I know the direction', 'I have a wind app on my phone', 'Not sure'] },
      { key: 'seal_room', label: 'Best seal-in-place room (fewest windows/vents)', placeholder: 'e.g., Interior hallway bathroom with one small vent — duct tape ready in the cabinet', required: false },
    ],
  },

  // ─── ADDED FEB 2026 — 12 NEW DISASTER TILES ──────────
  active_shooter: {
    evacuationType: 'variable',
    intro: 'Run, Hide, Fight — in that order. The hardest part isn\'t the seconds of the event itself; it\'s the reunification AFTER police clear the scene. Your plan needs a post-incident rendezvous and a way to confirm every family member is safe before anyone moves.',
    questions: [
      { key: 'reunification_point', label: 'Post-incident reunification point *', placeholder: 'e.g., Starbucks on Main + 5th — open 24/7, well-lit, away from likely targets', required: true, type: 'address' },
      { key: 'code_word', label: 'Family code word that confirms a "safe" message is real (not coerced)', placeholder: 'e.g., "Pancakes" — if anyone texts without it, treat the message as suspect', required: false },
      { key: 'kid_school_protocol', label: 'Schools your kids attend — do they run lockdown drills?', placeholder: 'e.g., Maple Elem runs ALICE drills quarterly; kids know to listen to teachers and not leave', required: false },
      { key: 'silent_911', label: 'Do you know how to text 911 silently?', placeholder: 'Most US carriers support it — verify it works in your area', required: false, type: 'select', options: ['Yes, tested it', 'I know it exists but haven\'t tested', 'I didn\'t know that was possible'] },
      { key: 'defensive_resources', label: 'Self-defense items at home and where each is stored (Fight stage — LAST resort only)', placeholder: 'e.g., Pistol — bedroom safe; bear spray — kitchen pantry; aluminum bat — hall closet', required: false, type: 'textarea' },
    ],
  },
  heat_wave: {
    evacuationType: 'shelter',
    intro: 'Extreme heat kills more Americans per year than every other weather event combined, mostly in homes that lost AC or never had it. Your plan identifies the coolest space, the high-risk people, and a public cooling center as backup.',
    questions: [
      { key: 'coolest_room', label: 'Coolest room in the home (lowest floor, north-facing, blackout shades) *', placeholder: 'e.g., Basement guest room — stays 10° cooler than upstairs', required: true },
      { key: 'cooling_center', label: 'Nearest public cooling center', placeholder: 'e.g., Public library at 5th & Oak — opens 9am during heat advisories', required: false, type: 'address' },
      { key: 'high_risk_check', label: 'Who in the household needs check-ins every 2 hours?', placeholder: 'e.g., Mom (elderly, on heart meds); Lucas (5, asthma — needs hydration prompts)', required: false },
      { key: 'ac_failure', label: 'AC failure plan — who do you call first?', placeholder: 'e.g., HVAC contractor on speed dial; emergency window unit in garage', required: false },
    ],
  },
  drought: {
    evacuationType: 'shelter',
    intro: 'Drought is slow-onset but compounds with fire risk and well-pump failure. The plan focuses on water reserves, conservation routines, and the increased wildfire-risk posture during dry months.',
    questions: [
      { key: 'water_source', label: 'Primary water source *', placeholder: 'e.g., Municipal water; private well 280ft deep tested clean Jan 2026', required: true, type: 'select', options: ['Municipal water', 'Private well', 'Cistern / rainwater', 'Mixed sources'] },
      { key: 'stored_water', label: 'Days of stored drinking water on hand (1 gal/person/day target)', placeholder: 'e.g., 14 days for a family of 4 = 56 gallons in 7-gal jerry cans in garage', required: false },
      { key: 'graywater_use', label: 'Graywater reuse — do you capture shower/sink water for plants?', placeholder: 'Optional but a big mindset shift during long droughts', required: false, type: 'select', options: ['Yes, dedicated system', 'Bucket method when reminded', 'Not yet', 'Not allowed by HOA / municipality'] },
      { key: 'restriction_alerts', label: 'How do you learn about water restrictions in your area?', placeholder: 'e.g., City utility text alerts at 555-WATER', required: false },
    ],
  },
  hailstorm: {
    evacuationType: 'shelter',
    intro: 'Hail rarely kills people but routinely costs $10K+ in damage. Your plan moves vehicles under cover, gets everyone inside, and sets up the insurance-documentation routine for the morning after.',
    questions: [
      { key: 'covered_parking', label: 'Where do vehicles go when a hail warning hits? *', placeholder: 'e.g., Garage (1 car); covered carport at the office (the other); neighbor\'s garage as backup', required: true },
      { key: 'safe_interior_room', label: 'Safe interior room (away from skylights / large windows)', placeholder: 'e.g., First-floor laundry room — no windows', required: false },
      { key: 'insurance_carrier', label: 'Homeowner\'s insurance carrier + claim hotline', placeholder: 'e.g., State Farm — 1-800-SF-CLAIM (saved in vault)', required: false },
      { key: 'roof_age', label: 'Approximate roof age (insurers ask this)', placeholder: 'e.g., 8 years — asphalt shingle, last inspected 2024', required: false },
    ],
  },
  lightning_storm: {
    evacuationType: 'shelter',
    intro: 'Most lightning deaths happen to people who didn\'t see the storm coming. The 30/30 rule: if thunder follows lightning within 30 seconds, go inside and stay inside for 30 minutes after the last clap.',
    questions: [
      { key: 'safe_indoor_zone', label: 'Safe indoor area (away from plumbing, corded electronics, windows) *', placeholder: 'e.g., Interior living room — no exterior wall outlets', required: true },
      { key: 'outdoor_activities', label: 'Family outdoor activities that need clear-out rules', placeholder: 'e.g., Soccer practice at Riverside Park — coach blows whistle, everyone to the clubhouse', required: false },
      { key: 'surge_protection', label: 'Surge-protected critical electronics', placeholder: 'e.g., Home office + entertainment center on whole-house surge protector; sensitive items unplugged ahead of storms', required: false },
      { key: 'lightning_app', label: 'Lightning-tracker app or alert source', placeholder: 'e.g., RadarScope / My Lightning Tracker — alerts when strikes within 8 mi', required: false },
    ],
  },
  volcanic: {
    evacuationType: 'distant',
    intro: 'Ash, not lava, is what affects most volcano-zone households. It can collapse roofs, ruin engines, and damage lungs. Your plan stockpiles respirators, seals the home, and gets you AWAY from the prevailing-wind plume direction.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary evacuation destination (crosswind, not downwind) *', placeholder: 'e.g., Aunt Lisa\'s house in Bend, OR — west of the prevailing wind', required: true, type: 'address' },
      { key: 'n95_count', label: 'N95+ respirators on hand (1 per person + spares)', placeholder: 'e.g., 12 N95s in the kitchen pantry; replaced annually', required: false },
      { key: 'ash_sealing', label: 'Plan for sealing windows, doors, and HVAC intakes?', placeholder: 'e.g., Duct tape + plastic sheeting in garage; HVAC switch labeled on thermostat', required: false },
      { key: 'pet_ash_plan', label: 'Pet protection from ash', placeholder: 'e.g., Dogs come inside; pet face shields ordered after 2023 Mauna Loa scare', required: false },
    ],
  },
  landslide: {
    evacuationType: 'distant',
    intro: 'Landslides give minutes of warning at most. The plan recognizes the warning signs (new wall cracks, sticking doors, cracking-tree sounds), commits to a downhill-but-not-river-valley evacuation route, and stays out post-event because secondary slides are common.',
    questions: [
      { key: 'evacuation_route', label: 'Evacuation destination (downhill, away from river valleys) *', placeholder: 'e.g., Town center across the highway — 3 miles, downhill route via West Ave', required: true, type: 'address' },
      { key: 'warning_signs', label: 'Have you noticed any warning signs at the home recently?', placeholder: 'e.g., New cracks in the basement wall last spring; door at the back sticks more than it used to', required: false, type: 'select', options: ['No signs noticed', 'Sticking doors / new wall cracks', 'Sounds of cracking trees / boulders', 'Visible ground movement / leaning trees', 'Not sure what to look for'] },
      { key: 'wildfire_proximity', label: 'Was a wildfire in the area within the last 2 years?', placeholder: 'Post-burn slopes are massively more landslide-prone in the next rainy season', required: false, type: 'select', options: ['No', 'Yes — within 1 mile', 'Yes — within 5 miles', 'Not sure'] },
    ],
  },
  avalanche: {
    evacuationType: 'shelter',
    intro: 'Avalanches are a backcountry-recreation and mountain-residence risk. The plan requires beacons, training, and a clear understanding of the avalanche path that your home or favorite trails sit in.',
    questions: [
      { key: 'transceiver_gear', label: 'Every backcountry-going family member has beacon + probe + shovel? *', placeholder: 'e.g., Yes — refreshed batteries Dec 2025; everyone took AIARE Level 1 in 2024', required: true, type: 'select', options: ['Yes — all trained and equipped', 'Equipped but untrained', 'Equipped for some, not all', 'No / don\'t backcountry'] },
      { key: 'safe_room', label: 'Reinforced shelter area in the home (uphill side, low ceiling, structural walls)', placeholder: 'e.g., Mudroom — backs into the hill, framed in concrete', required: false },
      { key: 'forecast_source', label: 'Local avalanche forecast service you check before any trip', placeholder: 'e.g., Northwest Avalanche Center — nwac.us; check 12hr before departing', required: false },
      { key: 'evacuation_route', label: 'Downhill evacuation route if a slide threatens the home', placeholder: 'e.g., Drive south on Mountain Loop Hwy — never north (into the bowl)', required: false },
    ],
  },
  train_derailment: {
    evacuationType: 'variable',
    intro: 'East Palestine showed how a single derailment can require multi-mile evacuations. If you live within 2 miles of rail lines, your plan treats any visible smoke/vapor from a derailment as hazmat until proven otherwise.',
    questions: [
      { key: 'upwind_destination', label: 'Upwind / uphill evacuation destination *', placeholder: 'e.g., My sister\'s house in Maplewood — 12 miles west, opposite prevailing wind', required: true, type: 'address' },
      { key: 'rail_distance', label: 'Approximate distance from your home to the nearest rail line', placeholder: 'e.g., 0.4 miles — Norfolk Southern freight runs through downtown', required: false, type: 'select', options: ['Under 0.5 mile', '0.5–1 mile', '1–2 miles', 'Over 2 miles', 'Not sure'] },
      { key: 'shelter_room', label: 'Seal-in-place room (backup if you can\'t safely leave)', placeholder: 'e.g., Interior bedroom — duct tape + plastic sheeting in the closet', required: false },
      { key: 'alerts_subscribed', label: 'Are you signed up for local emergency-alert texts?', placeholder: 'e.g., Yes — county RAVE alerts; sign up at county.gov/alerts', required: false, type: 'select', options: ['Yes — text alerts', 'Phone-only (no texts)', 'Not signed up', 'Not sure if my county offers them'] },
    ],
  },
  gas_leak: {
    evacuationType: 'shelter',
    intro: 'A natural-gas leak in the home is a "leave NOW, call from outside" emergency. The plan rehearses the do-not-touch list (light switches, phones, anything that sparks) and gets everyone — including pets — to a meetup at least 300 ft away.',
    questions: [
      { key: 'outdoor_meetup', label: 'Outdoor meetup at least 300 ft from the home *', placeholder: 'e.g., End of the driveway by the mailbox — well away from the gas meter', required: true },
      { key: 'gas_meter_location', label: 'Where is the gas meter / main shutoff?', placeholder: 'e.g., Side of house under the kitchen window — wrench hanging next to it', required: false },
      { key: 'utility_emergency', label: 'Gas utility emergency line', placeholder: 'e.g., SoCalGas: 1-800-427-2200 — saved in everyone\'s phone', required: false },
      { key: 'detector_check', label: 'Combustible-gas detectors — last battery check?', placeholder: 'e.g., All 3 detectors batteries replaced Jan 2026; tested monthly', required: false, type: 'select', options: ['Tested in last 3 months', 'Tested 3-12 months ago', 'Never tested', 'No detectors yet'] },
    ],
  },
  medical_emergency: {
    evacuationType: 'shelter',
    intro: 'Most medical-emergency outcomes are decided in the first 10 minutes — and most households freeze instead of acting. Your plan pre-decides who calls 911, who drives, who notifies family, and where every critical med + the medication list lives.',
    questions: [
      { key: 'nearest_er', label: 'Nearest ER *', placeholder: 'e.g., St. Vincent Hospital — 4 miles via West Ave (avoid I-5 during rush)', required: true, type: 'address' },
      { key: 'med_list_location', label: 'Where is the household medication list (with dosages)?', placeholder: 'e.g., Fridge magnet — pic on every family member\'s phone; copy in the go-bag', required: false },
      { key: 'role_calls', label: 'Who calls 911 vs. who drives vs. who notifies family?', placeholder: 'e.g., Spouse calls 911 and stays with patient; oldest kid drives any siblings to neighbor\'s; cousin texted as point-of-contact for extended family', required: false },
      { key: 'condition_triggers', label: 'Known chronic conditions in the home + their action triggers', placeholder: 'e.g., Dad — type 1 diabetic; if disoriented + cold sweats, give Gatorade then check BG; if unconscious, glucagon shot then 911', required: false },
      { key: 'allergies', label: 'Severe allergies / anaphylaxis risks', placeholder: 'e.g., Lily — peanut anaphylaxis; 2 EpiPens (kitchen + her backpack); 911 even after EpiPen', required: false },
    ],
  },
};

/** Get the template for a given concern ID. Returns null if not found. */
export function getDisasterTemplate(concernId) {
  return DISASTER_TEMPLATES[concernId] || null;
}
