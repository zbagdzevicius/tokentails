// Seed fixture: catnip-heist/src/ui/ui.ts:732 before the G11 seed change (task 1a log). Must fail.
export const rescue = (name: string, payoutsUrl: string) =>
  h('div.ch-rescue', null, h('p', null, `You rescued ${name}!`, h('small', null, 'Play to save: heists help fund real shelter rescues.'), h('a.ch-payouts', { href: payoutsUrl }, 'Every heist funds a real shelter: see payouts')));
