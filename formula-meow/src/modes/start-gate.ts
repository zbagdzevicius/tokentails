/**
 * An async race start (the time trial loads its ghosts first) must not land after the player moved on: Esc back
 * to the menu, Menu on the results under a Retry, or another mode's start. `begin()` takes a ticket; `cancel()`
 * voids every ticket out; `live(t)` is true while nothing cancelled it and the screen it started from is still on
 * top (null = no screen, the race view).
 */
export class StartGate {
  private gen = 0;

  constructor(private readonly top: () => string | null) {}

  begin(): { gen: number; top: string | null } {
    return { gen: ++this.gen, top: this.top() };
  }

  cancel(): void {
    this.gen++;
  }

  live(t: { gen: number; top: string | null }): boolean {
    return t.gen === this.gen && this.top() === t.top;
  }
}
