/**
 * Hands for the app on the landing page: a pointer that moves, presses and
 * types in the real app inside the frame, the way a reader would.
 *
 * The frame is the same origin as the page, so the driver works on the app's
 * own document: it finds the real field and the real link, and sends the
 * events a hand would send. Nothing in the app knows it is a demo.
 *
 * Every wait takes the scene's signal, so a reader who takes over stops the
 * scene at once, and the gate, so a reader who only points at the frame holds
 * it where it is.
 */

/** A scene stopped because the reader took over or left the tab. */
export class Stopped extends Error {}

export interface Pointer {
  /** Moves the drawn pointer to a point in the app's own pixels. */
  move(x: number, y: number, ms: number): void;
  press(down: boolean): void;
  show(visible: boolean): void;
}

export interface Cues {
  /** A key the scene presses, shown one at a time. */
  key(label: string | null): void;
  /** How long the last page took to draw, from the press. */
  opened(title: string, ms: number): void;
}

/** The app's page title, once the page has drawn. */
const pageTitle = (doc: Document) => doc.querySelector("article h1 span")?.textContent?.trim() ?? null;

/**
 * Runs `act`, then times the page `title` from `start()` to the frame that
 * paints it. Watched from before the act, so a fast page is not missed. 0 when
 * the page does not come: an unwritten page draws the note page instead.
 */
export async function timeOpen(
  win: Window & typeof globalThis,
  title: string,
  act: () => unknown,
  start?: () => number,
) {
  let painted = 0;
  const begun = performance.now();
  const watch = new win.MutationObserver(() => {
    if (painted || pageTitle(win.document) !== title) return;
    win.requestAnimationFrame(() => (painted ||= performance.now()));
  });
  watch.observe(win.document.body, { subtree: true, childList: true, characterData: true });
  try {
    await act();
    for (let waited = 0; !painted && waited < 3000; waited += 20) await new Promise((done) => setTimeout(done, 20));
  } finally {
    watch.disconnect();
  }
  return painted && Math.max(1, Math.round(painted - (start?.() ?? begun)));
}

/** The controls the app acts on at the press (`src/lib/ui/press.ts`): they get
    no click event of their own, or they would act twice. */
const CONTROLS = 'a[href], button, [role="button"]';

export class Driver {
  private at = { x: 600, y: 420 };
  private hovered: Element | null = null;
  private pressedAt = 0;

  constructor(
    private frame: HTMLIFrameElement,
    private pointer: Pointer,
    private cues: Cues,
    private signal: AbortSignal,
    /** Resolves while the scene may run; a new promise while it is held. */
    private gate: () => Promise<void>,
  ) {}

  get doc() {
    return this.frame.contentDocument!;
  }

  get win() {
    return this.frame.contentWindow! as Window & typeof globalThis;
  }

  /** Sets a field's value so React takes it as typed: the setter of the
      frame's own input, since the page's belongs to another window. */
  private setValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(this.win.HTMLInputElement.prototype, "value")!.set!.call(input, value);
  }

  private check() {
    if (this.signal.aborted) throw new Stopped();
  }

  /** Waits, and waits longer while the reader holds the scene. */
  async sleep(ms: number) {
    let left = ms;
    while (left > 0) {
      this.check();
      await this.gate();
      const step = Math.min(left, 50);
      await new Promise((done) => setTimeout(done, step));
      left -= step;
    }
    this.check();
  }

  async waitFor<T>(find: () => T | null | undefined | false, timeout = 5000): Promise<T> {
    const end = performance.now() + timeout;
    for (;;) {
      this.check();
      const found = find();
      if (found) return found;
      if (performance.now() > end) throw new Stopped();
      await new Promise((done) => setTimeout(done, 30));
    }
  }

  $(selector: string) {
    return this.doc.querySelector<HTMLElement>(selector);
  }

  /** The first `selector` that passes `test`. */
  find(selector: string, test: (el: HTMLElement) => boolean) {
    return [...this.doc.querySelectorAll<HTMLElement>(selector)].find(test) ?? null;
  }

  /** The first element under `root` whose own text is `text`. */
  byText(text: string, selector = "a, button", root: ParentNode = this.doc) {
    return [...root.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.trim() === text) ?? null;
  }

  private fire(el: Element, type: string, extra: Record<string, unknown> = {}) {
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: this.at.x,
      clientY: this.at.y,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      view: this.win,
      ...extra,
    };
    const Kind = type.startsWith("pointer") ? this.win.PointerEvent : this.win.MouseEvent;
    el.dispatchEvent(new Kind(type, init));
  }

  /** Moves the pointer onto `el`, and the app sees it arrive. */
  async point(el: Element, { dwell = 0 }: { dwell?: number } = {}) {
    this.check();
    const box = el.getBoundingClientRect();
    const to = { x: box.left + Math.min(box.width / 2, 40), y: box.top + box.height / 2 };
    const distance = Math.hypot(to.x - this.at.x, to.y - this.at.y);
    const ms = Math.round(Math.min(900, 280 + distance * 0.7));
    this.pointer.show(true);
    this.pointer.move(to.x, to.y, ms);
    await this.sleep(ms);
    this.at = to;
    if (this.hovered && this.hovered !== el) {
      this.fire(this.hovered, "pointerout", { relatedTarget: el });
      this.fire(this.hovered, "mouseout", { relatedTarget: el });
    }
    this.hovered = el;
    for (const type of ["pointerover", "mouseover", "pointermove", "mousemove"]) this.fire(el, type);
    if (dwell) await this.sleep(dwell);
  }

  async press(el: Element) {
    await this.point(el);
    await this.sleep(120);
    this.pointer.press(true);
    this.pressedAt = performance.now();
    this.fire(el, "pointerdown", { buttons: 1 });
    this.fire(el, "mousedown", { buttons: 1 });
    if (el instanceof this.win.HTMLElement && !el.closest(CONTROLS)) el.focus();
    await this.sleep(90);
    this.pointer.press(false);
    this.fire(el, "pointerup");
    this.fire(el, "mouseup");
    if (!el.closest(CONTROLS)) this.fire(el, "click", { detail: 1 });
  }

  async type(input: HTMLInputElement, text: string) {
    input.focus();
    for (const char of text) {
      this.setValue(input, input.value + char);
      input.dispatchEvent(new this.win.InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
      await this.sleep(45 + Math.random() * 70);
    }
  }

  async clear(input: HTMLInputElement) {
    input.focus();
    while (input.value) {
      this.setValue(input, input.value.slice(0, -Math.max(1, Math.ceil(input.value.length / 6))));
      input.dispatchEvent(new this.win.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      await this.sleep(28);
    }
    // A scope (`vex:`) is a chip before the field, and Backspace on an empty
    // field takes it off, as it does for a reader.
    for (let tries = 0; input.previousElementSibling && tries < 3; tries++) {
      input.dispatchEvent(new this.win.KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
      await this.sleep(60);
    }
  }

  async key(key: string, { label, target }: { label?: string; target?: Element } = {}) {
    const el = target ?? this.doc.activeElement ?? this.doc.body;
    const ctrlKey = label?.startsWith("Ctrl") ?? false;
    if (label) this.cues.key(label);
    el.dispatchEvent(new this.win.KeyboardEvent("keydown", { key, ctrlKey, bubbles: true, cancelable: true }));
    el.dispatchEvent(new this.win.KeyboardEvent("keyup", { key, ctrlKey, bubbles: true, cancelable: true }));
    if (label) {
      await this.sleep(900);
      this.cues.key(null);
    }
  }

  /** The app's own move to a page, as a link would make it. */
  go(path: string) {
    const win = this.win;
    const idx = ((win.history.state as { idx?: number } | null)?.idx ?? 0) + 1;
    win.history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx }, "", path);
    win.dispatchEvent(new win.PopStateEvent("popstate", { state: win.history.state }));
  }

  /** The page's own title, once it has drawn. */
  pageTitle() {
    return pageTitle(this.doc);
  }

  /** Presses `el` (or runs `act`), then times the page `title` from the press
      to its paint: the time is the app's, not the pointer's pause between its
      press and its release. */
  async open(el: Element | (() => Promise<void>), title: string) {
    const ms = await timeOpen(
      this.win,
      title,
      () => (typeof el === "function" ? ((this.pressedAt = performance.now()), el()) : this.press(el)),
      () => this.pressedAt,
    );
    this.check();
    if (ms) this.cues.opened(title, ms);
  }

  /** Scrolls `shell` until `target` sits `offset` pixels below its top. */
  async scroll(shell: Element, target: Element, offset: number) {
    const top = target.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop - offset;
    shell.scrollTo({ top, behavior: "smooth" });
    await this.sleep(750);
  }

  hide() {
    this.pointer.show(false);
  }
}
