/**
 * EntityOrgChart — shared constants.
 *
 * Extracted from EntityOrgChart.js during Monolith Reduction 4/6 (Feb 2026).
 * These values are imported by both the live chart renderer and the
 * static print-page renderer; centralizing them ensures the two stay
 * in lock-step.
 */
import { Building2, Shield, Landmark, Home, User as UserIcon, Settings } from 'lucide-react';

// Pseudo-node key under which the legend's drag-position lives in the
// chart's `overrides` map. Treating the legend like a tile (key in
// overrides + positionOf + obstacle list for edge routing) lets the
// existing tile-drag pipeline move it with zero additional plumbing,
// which is exactly what the user asked for.
export const LEGEND_KEY = '__legend__';

export const BUCKET_ICON = {
  business: Building2, trust: Shield, charity: Landmark,
  property: Home, external_person: UserIcon, specialized: Settings,
};

// Tile size constants — width/height are uniform so routing math stays sane.
export const ENTITY_W = 200;
export const ENTITY_H = 92;
export const PERSON_W = 110;
// Extra height (was 96) to make room for the role-title chips beneath
// the last name (e.g., "Trustee" / "Co-trustee + Member (LLC)" /
// "Benefactor"). Chips wrap onto a second line when a person holds
// multiple roles, so this height accommodates up to ~2 rows of chips.
export const PERSON_H = 124;
export const PADDING = 24;          // canvas inner padding
export const ROW_GAP = 70;          // vertical gap between layout rows
export const COL_GAP = 30;          // horizontal gap between sibling tiles
export const STEP_OUT = 18;         // how far a line steps perpendicular out of a tile before turning
export const CORNER_R = 10;         // rounded-corner radius

// ---- Beneficiary cluster tile geometry --------------------------------
// A "cluster" is a single composite tile that contains every
// beneficiary relationship pointing at a given entity. Per user
// request: each member renders as a half-sized avatar (32 px) with
// first-name underneath; members lay out 5-per-row, with each row
// staggered by half a column so the grid reads as a brick pattern;
// only ONE connection line is drawn from the cluster up to its parent
// entity (the individual avatars carry no edges of their own).
export const CLUSTER_AVATAR = 36;
export const CLUSTER_SLOT_W = 50;          // per-member horizontal slot
export const CLUSTER_SLOT_H = 76;          // per-member vertical slot (avatar 36 + label ~14 + generous buffer 26)
export const CLUSTER_COLS = 5;
export const CLUSTER_HEADER_H = 22;        // entity-label strip above the grid
export const CLUSTER_PAD_X = 10;
export const CLUSTER_PAD_Y = 14;
// Brick-pattern offset: odd rows shift right by half a slot so the
// avatars stagger between columns. Hoisted here (module scope) so the
// tile-width math and the per-row stagger inside BeneficiaryClusterNode
// stay in lock-step — never edit one without the other.
export const CLUSTER_HALF_STEP = CLUSTER_SLOT_W / 2;
// Brick-pattern grid offsets odd rows by half a slot, so the
// rightmost avatar on those rows sits HALF_STEP past the last column.
// We add that buffer into CLUSTER_W so the staggered avatar never
// clips against the tile edge (previously: 270 → Meg at col=4 row=1
// rendered at right-edge=265 vs. inner-right=250 → 15px crop).
export const CLUSTER_W = CLUSTER_PAD_X * 2 + CLUSTER_COLS * CLUSTER_SLOT_W + CLUSTER_HALF_STEP; // 295
export const clusterHeight = (memberCount) => {
  const rows = Math.max(1, Math.ceil(memberCount / CLUSTER_COLS));
  return CLUSTER_HEADER_H + CLUSTER_PAD_Y * 2 + rows * CLUSTER_SLOT_H;
};

// LocalStorage key for per-estate position overrides
export const POS_KEY = (estateId) => `cfp_entity_chart_positions:${estateId || 'global'}`;
// LocalStorage key for per-estate hidden node-keys. The user can hide
// individual tiles (including their own benefactor tile) from the
// chart visualization without deleting the underlying database
// record. The hidden set persists per estate.
export const HIDDEN_KEY = (estateId) => `cfp_entity_chart_hidden:${estateId || 'global'}`;
