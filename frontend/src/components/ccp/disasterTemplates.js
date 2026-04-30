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
    intro: 'A home invasion plan focuses on a fortified safe room, a silent alert system, and a clear escape route with a neighbor on the receiving end.',
    questions: [
      { key: 'safe_room', label: 'Designated safe room *', placeholder: 'e.g., Master bedroom — solid-core door with deadbolt', required: true },
      { key: 'escape_destination', label: 'Where to run if you escape', placeholder: 'e.g., Neighbor at 148 Maple — they know to call 911', required: false, type: 'address' },
      { key: 'silent_codeword', label: 'Silent alert codeword (a phrase that means "call 911" if you must speak in front of someone)', placeholder: 'e.g., "Tell Aunt Linda I said hi" — distinct enough to be unmistakable on a phone call', required: false },
      { key: 'door_reinforcement', label: 'Safe-room door — is it solid core with a deadbolt?', placeholder: 'Hollow doors fail to a kick in under 5 seconds', required: false, type: 'select', options: ['Solid core + deadbolt', 'Solid core, no deadbolt', 'Hollow door', 'Not sure'] },
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
};

/** Get the template for a given concern ID. Returns null if not found. */
export function getDisasterTemplate(concernId) {
  return DISASTER_TEMPLATES[concernId] || null;
}
