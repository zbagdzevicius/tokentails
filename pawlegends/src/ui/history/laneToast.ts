/**
 * The load-in lane and role line (MATCH-MOMENTS.md §4): "Sunny Lane · marksman" under "Your base: bottom left", in
 * the same 1.2 s toast (no new HUD element). Crossing follows the pick screen's lane hint (ui/pingText.ts laneHint:
 * marksmen and mages go Sunny, tanks and fighters Puddle, the rest either one); Hearthwood names the lane of the
 * role the match assigned (sim/bots/roles.ts rolesOf). Pure.
 */
const HEARTH_LANE: Readonly<Record<string, string>> = Object.freeze({ solo: 'Fenceline', mid: 'Yarn Road', fish: 'Gutterway', prowl: 'Jungle', guard: 'Gutterway' });

/** Sim v34: the pool maps' lane names (data/maps/*.ts laneNames). */
const POOL_LANES: Readonly<Record<string, readonly string[]>> = {
  ridge: ['Ridge Road'],
  thicket: ['Bramble Lane', 'Brook Lane'],
  quarry: ['Cliff Path', 'Gravel Path'],
  pitch: ['North Touchline', 'South Touchline'],
};

export function laneToastLine(o: { map?: string; heroRole: string; role5?: string | null }): string {
  const role = o.heroRole.toLowerCase();
  if (o.map === 'hearthwood') {
    const lane = HEARTH_LANE[o.role5 ?? ''];
    return lane ? `${lane} · ${o.role5 === 'guard' ? 'support' : role}` : '';
  }
  // sim v34: the pool maps name their own lanes (Ridge has one)
  const names = POOL_LANES[o.map ?? ''];
  if (names) {
    if (names.length === 1) return `${names[0]} · ${role}`;
    const l = role === 'marksman' || role === 'mage' ? names[0] : role === 'tank' || role === 'fighter' ? names[1] : 'Either lane';
    return `${l} · ${role}`;
  }
  const lane = role === 'marksman' || role === 'mage' ? 'Sunny Lane' : role === 'tank' || role === 'fighter' ? 'Puddle Lane' : 'Either lane';
  return `${lane} · ${role}`;
}
