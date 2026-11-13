/**
 * The load-in lane and role line (MATCH-MOMENTS.md §4): "Sunny Lane · marksman" under "Your base: bottom left", in
 * the same 1.2 s toast (no new HUD element). Crossing follows the pick screen's lane hint (ui/pingText.ts laneHint:
 * marksmen and mages go Sunny, tanks and fighters Puddle, the rest either one); Hearthwood names the lane of the
 * role the match assigned (sim/bots/roles.ts rolesOf). Pure.
 */
const HEARTH_LANE: Readonly<Record<string, string>> = Object.freeze({ solo: 'Fenceline', mid: 'Yarn Road', fish: 'Gutterway', prowl: 'Jungle', guard: 'Gutterway' });

export function laneToastLine(o: { map?: string; heroRole: string; role5?: string | null }): string {
  const role = o.heroRole.toLowerCase();
  if (o.map === 'hearthwood') {
    const lane = HEARTH_LANE[o.role5 ?? ''];
    return lane ? `${lane} · ${o.role5 === 'guard' ? 'support' : role}` : '';
  }
  const lane = role === 'marksman' || role === 'mage' ? 'Sunny Lane' : role === 'tank' || role === 'fighter' ? 'Puddle Lane' : 'Either lane';
  return `${lane} · ${role}`;
}
