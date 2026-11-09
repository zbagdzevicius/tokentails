/**
 * The skill card markup the champion browser and the in-match peek share: the skill's icon, slot and name, what it
 * does, its tags, its numbers, a tip and how to play against it. Pure strings from a codex card (ui/skillCodex.ts):
 * every number on it was read from the hero data when the card was built.
 */
import { HARD_CC_TAGS, TAG_TEXT, type SkillCard, type SkillTag } from '../skillCodex';
import { icon } from '../icons';
import type { IconId } from '../heroText';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Effect tags that change a fight: drawn warmer than the shape tags ("Skill shot", "Area"). */
const HARD = new Set<SkillTag>(HARD_CC_TAGS);
const SHAPE = new Set<SkillTag>(['skillshot', 'targeted', 'auto-target', 'area', 'cone', 'line', 'zone', 'self', 'ally', 'channel', 'recast', 'on-hit']);

const tagClass = (t: SkillTag): string => (HARD.has(t) ? 'cc' : t === 'windup' ? 'tele' : SHAPE.has(t) ? 'shape' : 'fx');

/** The icon a card shows: the ability's own; the passive a paw; the basic attack a sword (melee) or arrows (ranged). */
export function cardIcon(card: SkillCard, ranged = false): IconId {
  if (card.icon) return card.icon;
  if (card.slot === 'basic') return ranged ? 'arrows' : 'sword';
  return 'paw';
}

/** The short slot label on a skill button: P, ATK, Q, W, E, R. */
export const slotKey = (card: Pick<SkillCard, 'slot' | 'key'>): string => (card.slot === 'passive' ? 'P' : card.slot === 'basic' ? 'ATK' : card.key);

export function tagsHtml(tags: readonly SkillTag[]): string {
  return tags.length ? `<ul class="cb-tags" aria-label="Tags">${tags.map((t) => `<li class="${tagClass(t)}">${esc(TAG_TEXT[t])}</li>`).join('')}</ul>` : '';
}

export interface CardHtmlOpts {
  ranged?: boolean;
  /** The peek: fewer facts, no tip or counter, no minor facts. */
  compact?: boolean;
  /** In a match: the rank line ("Rank 2 of 5", "Unlocks at level 4"). */
  inMatch?: boolean;
}

/** A card's facts as a definition list (minor facts carry a class a small screen hides). */
export function factsHtml(card: SkillCard, max = Infinity, withMinor = true): string {
  const facts = card.facts.filter((f) => withMinor || !f.minor).slice(0, max);
  if (!facts.length) return '';
  return `<dl class="cb-facts">${facts.map((f) => `<div${f.minor ? ' class="minor"' : ''}><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>`;
}

function rankLine(card: SkillCard, inMatch: boolean): string {
  if (inMatch && card.rank !== undefined && card.maxRank !== undefined) {
    if (card.rank === 0) return card.unlocks ? `Unlocks at level ${card.unlocks}` : 'Not learned yet';
    return `Rank ${card.rank} of ${card.maxRank}`;
  }
  return card.unlocks ? `Unlocks at level ${card.unlocks}` : '';
}

/** The whole card (the browser's Skills tab) or its compact peek. */
export function skillCardHtml(card: SkillCard, o: CardHtmlOpts = {}): string {
  const kind = card.key ? `${card.kind} · ${card.key}` : card.kind;
  const rank = rankLine(card, o.inMatch === true);
  const head = `<header class="cb-card-head"><span class="cb-card-ico${card.slot === 'r' ? ' ult' : ''}" aria-hidden="true">${icon(cardIcon(card, o.ranged))}</span><span class="cb-card-name"><small class="cb-kind">${esc(kind)}${rank ? ` <em class="cb-rank">${esc(rank)}</em>` : ''}</small><b>${esc(card.name)}</b></span></header>`;
  const what = `<p class="cb-what">${esc(card.what)}</p>`;
  if (o.compact) return `${head}${what}${tagsHtml(card.tags.filter((t) => !SHAPE.has(t)).slice(0, 4))}${factsHtml(card, 4, false)}`;
  const tip = card.tip ? `<p class="cb-tip"><b>Tip</b> ${esc(card.tip)}</p>` : '';
  const counter = card.counter ? `<p class="cb-counter"><b>Against it</b> ${esc(card.counter)}</p>` : '';
  return `${head}${what}${tagsHtml(card.tags)}${factsHtml(card)}${tip}${counter}`;
}
