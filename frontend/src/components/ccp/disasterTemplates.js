/**
 * Disaster-specific question templates for the CCP Wizard.
 * Each disaster type defines its evacuation category, a short intro,
 * and 1-3 follow-up questions that feed richer context to the AI.
 */

export const DISASTER_TEMPLATES = {
  // ─── DISTANT EVACUATION ────────────────────────────
  hurricane: {
    evacuationType: 'distant',
    intro: 'Hurricanes require evacuating well outside the projected storm path. Local meetup points are dangerous — we need to know where your family would go.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary evacuation destination', placeholder: 'e.g., Aunt Sarah\'s house in Dallas, TX', required: true },
      { key: 'evacuation_secondary', label: 'Backup destination (different direction)', placeholder: 'e.g., Hotel in Atlanta, GA — in case the storm path shifts', required: true },
      { key: 'evacuation_tertiary', label: 'Third option (optional)', placeholder: 'e.g., Family cabin in Ozarks, AR', required: false },
    ],
  },
  flood: {
    evacuationType: 'distant',
    intro: 'Flooding can cut off roads fast. Your evacuation destination should be on high ground, well outside the flood zone.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary high-ground destination', placeholder: 'e.g., Friend\'s house on the hill in Westview', required: true },
      { key: 'evacuation_secondary', label: 'Backup destination (different route)', placeholder: 'e.g., Hotel in Springdale — avoids low-lying roads', required: true },
    ],
  },
  tsunami: {
    evacuationType: 'distant',
    intro: 'Tsunamis require immediate evacuation to high ground, far inland. Every minute counts.',
    questions: [
      { key: 'evacuation_primary', label: 'Nearest high-ground point (inland/uphill)', placeholder: 'e.g., Hilltop Park on Crest Rd — 200ft elevation', required: true },
      { key: 'evacuation_secondary', label: 'Backup inland destination', placeholder: 'e.g., Community center on Ridge Ave', required: true },
    ],
  },
  wildfire: {
    evacuationType: 'distant',
    intro: 'Wildfires move fast and unpredictably. Your evacuation should be well outside the fire zone, ideally upwind.',
    questions: [
      { key: 'evacuation_primary', label: 'Primary evacuation destination', placeholder: 'e.g., Town center in Lakeside — 30 miles east', required: true },
      { key: 'evacuation_secondary', label: 'Backup destination (different direction)', placeholder: 'e.g., Relative\'s home in Riverside', required: true },
    ],
  },

  // ─── LOCAL RENDEZVOUS ──────────────────────────────
  earthquake: {
    evacuationType: 'local',
    intro: 'After an earthquake, meet at an open area away from buildings, power lines, and overpasses.',
    questions: [
      { key: 'meetup_primary', label: 'Primary outdoor meetup point', placeholder: 'e.g., The park across from our house', required: true },
      { key: 'meetup_secondary', label: 'Backup meetup (if primary is damaged)', placeholder: 'e.g., School parking lot on Oak St', required: false },
    ],
  },
  tornado: {
    evacuationType: 'local',
    intro: 'During a tornado, shelter in the most interior, lowest room. After it passes, meet at a nearby point.',
    questions: [
      { key: 'shelter_location', label: 'Safe room in your home', placeholder: 'e.g., Basement under the stairs / interior bathroom', required: true },
      { key: 'meetup_after', label: 'Meetup point after the tornado passes', placeholder: 'e.g., Neighbor\'s driveway at 142 Elm St', required: true },
    ],
  },

  // ─── IMMEDIATE ESCAPE ──────────────────────────────
  house_fire: {
    evacuationType: 'immediate',
    intro: 'In a house fire, everyone exits immediately and meets at a single visible spot.',
    questions: [
      { key: 'meetup_outside', label: 'Family meetup spot outside', placeholder: 'e.g., Mailbox at the end of the driveway', required: true },
      { key: 'home_floors', label: 'Number of floors in your home', placeholder: 'e.g., 2', required: true },
    ],
  },
  home_invasion: {
    evacuationType: 'immediate',
    intro: 'A home invasion plan focuses on a safe room, silent alerting, and a clear escape route.',
    questions: [
      { key: 'safe_room', label: 'Designated safe room', placeholder: 'e.g., Master bedroom with locking door', required: true },
      { key: 'escape_destination', label: 'Where to run if you escape', placeholder: 'e.g., Neighbor at 148 Maple — they know to call 911', required: true },
    ],
  },

  // ─── SHELTER IN PLACE ──────────────────────────────
  nuclear: {
    evacuationType: 'shelter',
    intro: 'A nuclear event requires sheltering in the most fortified structure available, potentially for days. Seal windows and doors.',
    questions: [
      { key: 'shelter_building', label: 'Best shelter nearby (thick walls, basement)', placeholder: 'e.g., Our basement / community center on 5th Ave', required: true },
      { key: 'supply_days', label: 'Days of supplies on hand', placeholder: 'e.g., 7 days of water and food', required: false },
    ],
  },
  winter_storm: {
    evacuationType: 'shelter',
    intro: 'Winter storms can knock out power and heat for days. Plan around staying warm and supplied.',
    questions: [
      { key: 'backup_heat', label: 'Backup heating source', placeholder: 'e.g., Wood-burning fireplace / propane heater', required: true },
      { key: 'backup_shelter', label: 'Alternate shelter if pipes burst', placeholder: 'e.g., Grandma\'s house at 220 Pine St', required: false },
    ],
  },
  power_outage: {
    evacuationType: 'shelter',
    intro: 'Extended power outages affect food, heat, medical devices, and communication. Plan your backup systems.',
    questions: [
      { key: 'backup_power', label: 'Backup power source', placeholder: 'e.g., Generator in the garage / battery bank', required: false },
      { key: 'medical_devices', label: 'Any medical devices needing power?', placeholder: 'e.g., CPAP machine / oxygen concentrator / none', required: false },
    ],
  },
  water_failure: {
    evacuationType: 'shelter',
    intro: 'A water system failure means no drinking water, no flushing, no showers. Plan your reserves.',
    questions: [
      { key: 'water_reserve', label: 'Water storage you have or plan to get', placeholder: 'e.g., 10 gallons in jugs in the garage', required: false },
      { key: 'alt_water', label: 'Nearest alternative water source', placeholder: 'e.g., Creek behind neighborhood / water distribution center', required: false },
    ],
  },
  pandemic: {
    evacuationType: 'shelter',
    intro: 'Pandemics require isolation readiness — supplies, communication, and medical access.',
    questions: [
      { key: 'supply_duration', label: 'How many days of food/supplies can you sustain?', placeholder: 'e.g., 14 days', required: false },
      { key: 'nearest_medical', label: 'Nearest hospital or urgent care', placeholder: 'e.g., St. Mary\'s Hospital — 3 miles on Route 9', required: false },
    ],
  },
  cyber_attack: {
    evacuationType: 'shelter',
    intro: 'A cyber attack can disable banking, communications, and utilities. Plan for offline life.',
    questions: [
      { key: 'cash_reserve', label: 'Emergency cash on hand', placeholder: 'e.g., $500 in the home safe', required: false },
      { key: 'offline_comms', label: 'Offline communication backup', placeholder: 'e.g., Battery-powered radio / neighbor check-ins', required: false },
    ],
  },

  // ─── VARIABLE / SITUATIONAL ────────────────────────
  terrorism: {
    evacuationType: 'variable',
    intro: 'Terrorism response depends on proximity — evacuate if nearby, shelter if distant. Plan for both.',
    questions: [
      { key: 'workplace_school', label: 'Workplaces or schools to evacuate from', placeholder: 'e.g., Downtown office at 500 Main St / Lincoln High School', required: true },
      { key: 'safe_meetup', label: 'Safe meetup point away from crowded areas', placeholder: 'e.g., Parking lot behind the library on 3rd Ave', required: true },
    ],
  },
  civil_unrest: {
    evacuationType: 'variable',
    intro: 'Civil unrest can escalate unpredictably. Know your exit routes and a destination outside the area.',
    questions: [
      { key: 'evacuation_destination', label: 'Safe destination if you need to leave the area', placeholder: 'e.g., Sister\'s house in the suburbs — 25 miles north', required: true },
      { key: 'alt_route', label: 'Alternative route out of your neighborhood', placeholder: 'e.g., Back road via Elm St to Highway 7 — avoids downtown', required: false },
    ],
  },
  chemical_spill: {
    evacuationType: 'variable',
    intro: 'Chemical spills require moving upwind or sealing a room. Know the industrial facilities near you.',
    questions: [
      { key: 'nearest_facility', label: 'Nearest industrial or chemical facility', placeholder: 'e.g., Refinery on Industrial Blvd — 2 miles south', required: false },
      { key: 'upwind_destination', label: 'Upwind evacuation destination', placeholder: 'e.g., Community center on North Hill — opposite direction', required: true },
    ],
  },
};

/** Get the template for a given concern ID. Returns null if not found. */
export function getDisasterTemplate(concernId) {
  return DISASTER_TEMPLATES[concernId] || null;
}
