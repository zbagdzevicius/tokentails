import { describe, expect, it } from 'vitest';
import { initialTrack, parseParams } from './params';

describe('?track= and ?mixBase=', () => {
  it('reads synth and mix, drops anything else', () => {
    expect(parseParams('?track=mix', 'localhost:5180').track).toBe('mix');
    expect(parseParams('?track=synth', 'localhost:5180').track).toBe('synth');
    expect(parseParams('?track=MIX', 'localhost:5180').track ?? null).toBeNull();
    expect(parseParams('?track=1', 'tokentails.com').track ?? null).toBeNull();
    expect(parseParams('', 'tokentails.com').track ?? null).toBeNull();
  });
  it('accepts an http(s) or same-origin mix base only', () => {
    expect(parseParams('?mixBase=https://cdn.example/m/', 'tokentails.com').mixBase).toBe('https://cdn.example/m/');
    expect(parseParams('?mixBase=/music/back-on-track-v1/', 'tokentails.com').mixBase).toBe('/music/back-on-track-v1/');
    expect(parseParams('?mixBase=javascript:alert(1)', 'tokentails.com').mixBase ?? null).toBeNull();
    expect(parseParams('?mixBase=//evil.example/', 'tokentails.com').mixBase ?? null).toBeNull();
  });
});

describe('initial track', () => {
  it('og and embed always start on the synth', () => {
    expect(initialTrack({ og: true, embed: false, param: 'mix', stored: 'mix' })).toBe('synth');
    expect(initialTrack({ og: false, embed: true, param: 'mix', stored: 'mix' })).toBe('synth');
  });
  it('the param wins over the stored choice, which wins over the default', () => {
    expect(initialTrack({ og: false, embed: false, param: 'synth', stored: 'mix' })).toBe('synth');
    expect(initialTrack({ og: false, embed: false, param: 'mix', stored: null })).toBe('mix');
    expect(initialTrack({ og: false, embed: false, param: null, stored: 'mix' })).toBe('mix');
    expect(initialTrack({ og: false, embed: false, param: null, stored: 'junk' })).toBe('synth');
    expect(initialTrack({ og: false, embed: false, stored: null })).toBe('synth');
  });
});
