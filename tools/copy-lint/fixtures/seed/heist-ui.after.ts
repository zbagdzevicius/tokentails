// Seed fixture, after: the G11 Heist rail copy (pre-launch and exhausted states), cited to the
// treat config entry, and the fiction marker for the in-game rescue line. Must pass.

// claim: C-004 (pre-launch state: future tense)
export const titleFooter = () =>
  h('div.ch-foot', null, h('img', { src: img('heart'), alt: '' }), 'Play to save: real shelter treats open soon.');



export const rescue = (name: string, payoutsUrl: string) =>
  // claim:fiction the rescue is an in-game event; no money moves on this line
  h('div.ch-rescue', null, h('p', null, `You rescued ${name}!`, h('small', null, 'Real shelter treats open soon.'), h('a.ch-payouts', { href: payoutsUrl }, 'See shelter payouts')));

export const exhausted = () => "Today's treats are gone, back at 00:00 UTC.";
