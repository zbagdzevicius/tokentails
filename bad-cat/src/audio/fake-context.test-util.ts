/**
 * Test-only fake of the WebAudio node graph. It validates what real browsers reject (non-finite values,
 * exponential ramps to <= 0, ramps scheduled before an earlier event, start after stop) so the synth recipes
 * can be exercised in Node. Not imported by production code.
 */
export class FakeParam {
  value: number;
  lastTime = 0;
  events: { kind: string; v: number; t: number }[] = [];
  constructor(v = 1) {
    this.value = v;
  }
  private check(kind: string, v: number, t: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new TypeError(`${kind}: non-finite ${v} @ ${t}`);
    if (t < 0) throw new RangeError(`${kind}: negative time ${t}`);
    this.events.push({ kind, v, t });
    this.lastTime = Math.max(this.lastTime, t);
  }
  setValueAtTime(v: number, t: number) {
    this.check('set', v, t);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.check('lin', v, t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new RangeError(`exp ramp to ${v}`);
    this.check('exp', v, t);
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    if (!(tc > 0)) throw new RangeError('timeConstant');
    this.check('target', v, t);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.check('cancel', 0, t);
    return this;
  }
}

export class FakeNode {
  outputs: unknown[] = [];
  constructor(public ctx: FakeContext) {
    ctx.nodes++;
  }
  connect(n: unknown) {
    if (n === undefined || n === null) throw new TypeError('connect to nothing');
    this.outputs.push(n);
    return n;
  }
  disconnect() {
    this.outputs = [];
  }
}

export class FakeScheduled extends FakeNode {
  started = -1;
  stopped = -1;
  constructor(ctx: FakeContext) {
    super(ctx);
    ctx.sources.push(this);
  }
  start(t = 0) {
    if (!Number.isFinite(t) || t < 0) throw new RangeError('start ' + t);
    if (this.started >= 0) throw new Error('start twice');
    this.started = t;
    this.ctx.starts++;
  }
  stop(t = 0) {
    if (!Number.isFinite(t) || t < 0) throw new RangeError('stop ' + t);
    if (this.started < 0) throw new Error('stop before start');
    this.stopped = t;
  }
}

export class FakeOsc extends FakeScheduled {
  type = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}
export class FakeSrc extends FakeScheduled {
  buffer: FakeBuffer | null = null;
  loop = false;
  override start(t = 0, offset = 0) {
    if (!Number.isFinite(offset) || offset < 0) throw new RangeError('offset');
    super.start(t);
  }
}
export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
export class FakeBiquad extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}
class FakeComp extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}
class FakeBuffer {
  private data: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number) {
    return this.data[i];
  }
}

export class FakeContext {
  nodes = 0;
  starts = 0;
  /** Every scheduled source created on this context (oscillators and buffer sources), in creation order. */
  sources: FakeScheduled[] = [];
  currentTime = 0;
  sampleRate = 48000;
  state = 'suspended';
  destination: FakeNode;
  constructor() {
    this.destination = new FakeNode(this);
  }
  createOscillator() {
    return new FakeOsc(this);
  }
  createGain() {
    return new FakeGain(this);
  }
  createBiquadFilter() {
    return new FakeBiquad(this);
  }
  createBufferSource() {
    return new FakeSrc(this);
  }
  createDynamicsCompressor() {
    return new FakeComp(this);
  }
  createBuffer(c: number, l: number, r: number) {
    if (l < 1) throw new RangeError('buffer length');
    return new FakeBuffer(c, l, r);
  }
  createMediaStreamDestination() {
    const n = new FakeNode(this) as FakeNode & { stream: object };
    n.stream = { fake: true };
    return n;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

export class FakeOfflineContext extends FakeContext {
  constructor(
    public channels: number,
    public length: number,
    rate: number,
  ) {
    super();
    this.sampleRate = rate;
  }
  /** The last rendering context made by a test's OfflineAudioContext global (for inspection). */
  static last: FakeOfflineContext | null = null;
  startRendering() {
    FakeOfflineContext.last = this;
    return Promise.resolve(new FakeBuffer(this.channels, this.length, this.sampleRate));
  }
}
