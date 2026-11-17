/**
 * The in-match chat button (docs/plans/moba/MATCH-CHAT.md §4.4): every match has one, bot matches included. Before it
 * the drawer opened only from a ticker line (painted only once someone had spoken) or from the party wheel's centre,
 * so a bot match on a phone had no way in at all.
 *
 * - Phones: a 36 px bubble in the minimap's top-left corner (the mirror of the ping paw; no new HUD area), 44 px hit
 *   area. One tap opens the drawer: quick-chat chips are the next tap.
 * - Desktop: a small "Chat · Enter" chip bottom left, under the chat log.
 *
 * A dot shows when a line arrived while the drawer was closed; opening it clears the dot.
 */
const BUBBLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/></svg>';

export class ChatButton {
  readonly el: HTMLButtonElement;

  constructor(parent: HTMLElement, opts: { touch: boolean; toggle(): void }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pl-chatopen${opts.touch ? " touch" : " desk"}`;
    b.dataset.testid = "chat-open";
    b.setAttribute("aria-label", "Chat");
    b.setAttribute("aria-expanded", "false");
    b.title = opts.touch ? "Chat" : "Chat (Enter)";
    b.innerHTML = `${BUBBLE}<span>Chat</span><kbd>Enter</kbd><i class="dot" aria-hidden="true"></i>`;
    // the button takes its own taps: nothing under it moves the hero or casts
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      opts.toggle();
    });
    // keyboard users (Space / Enter on the focused button) reach it through click
    b.addEventListener("click", (e) => {
      if (e.detail !== 0) return;
      opts.toggle();
    });
    parent.appendChild(b);
    this.el = b;
  }

  set open(on: boolean) {
    this.el.setAttribute("aria-expanded", String(on));
    this.el.classList.toggle("on", on);
    if (on) this.el.classList.remove("new");
  }

  /** A line arrived while the drawer was closed. */
  unread(): void {
    this.el.classList.add("new");
  }

  /** The match ended (results show next). */
  hide(): void {
    this.el.hidden = true;
  }

  dispose(): void {
    this.el.remove();
  }
}
