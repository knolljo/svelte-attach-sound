import type { Howl, HowlOptions } from "howler";
import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";

type SoundSource = HowlOptions["src"];
type SoundEvents = [keyof HTMLElementEventMap, (keyof HTMLElementEventMap)?];
type SoundOptions = Omit<HowlOptions, "src">;

/**
 * Options for the sound attachment factory.
 */
type Options = {
  events: SoundEvents;
} & HowlOptions;

/**
 * A class representing a synthetic sound.
 * Can be used standalone for programmatic playback without any DOM dependency.
 */
export class Sound {
  private howl: Promise<Howl>;

  constructor(src: SoundSource, options: SoundOptions = {}) {
    // Dynamically imports howler core (without spatial plugin) to avoid
    // crashing during SSR (SvelteKit) - howler accesses browser APIs on load.
    this.howl = import("howler/src/howler.core")
      .then(({ Howl }) => new Howl({ ...options, src }))
      .catch((e) => {
        console.warn("[svelte-attach-sound] Failed to load sound:", e);
        throw e;
      });
  }

  play() {
    void this.howl.then((h) => h.play()).catch(() => {});
  }

  stop() {
    void this.howl.then((h) => h.stop()).catch(() => {});
  }

  destroy() {
    void this.howl
      .then((h) => {
        h.stop();
        h.unload();
      })
      .catch(() => {});
  }
}

/**
 * Creates a sound attachment that binds playback to DOM events on the element.
 *
 * Runs inside a Svelte effect — if options contain reactive state, the attachment
 * will automatically tear down and recreate when that state changes.
 *
 * @param options Options including `src`, `events`, and any Howler options.
 * @returns A Svelte attachment.
 *
 * @example
 * ```svelte
 * <button {@attach sound({ src: click_mp3, events: ["click"] })}>
 *   Click me
 * </button>
 * ```
 */
export function sound(options: Options): Attachment<HTMLElement> {
  return (element: HTMLElement) => {
    const { src, events, ...howlOptions } = options;
    const [playEvent, stopEvent] = events;

    const instance = new Sound(src, howlOptions);

    const handlePlay = () => instance.play();
    const handleStop = () => instance.stop();

    const offPlay = on(element, playEvent, handlePlay);

    // Use Svelte `on`: cleanup handle + correct ordering with delegated handlers.
    const offStop = stopEvent ? on(element, stopEvent, handleStop) : null;

    return () => {
      offPlay();
      offStop?.();
      instance.destroy();
    };
  };
}

/**
 * Creates a pre-configured sound attachment factory that can be reused across
 * multiple elements with optional per-element overrides.
 *
 * @param src The source URL(s) of the sound.
 * @param events The `[playEvent, stopEvent?]` tuple.
 * @param options Optional base Howler options.
 * @returns A factory function that returns a Svelte attachment.
 *
 * @example
 * ```svelte
 * <script>
 *   import { useSound } from "svelte-attach-sound";
 *   import click_mp3 from "./assets/click.mp3";
 *
 *   const click = useSound(click_mp3, ["click"]);
 * </script>
 *
 * <button {@attach click()}>Click me</button>
 *
 * <!-- Override options per-element -->
 * <button {@attach click({ volume: 0.5 })}>Click me (quieter)</button>
 * ```
 */
export function useSound(
  src: SoundSource,
  events: SoundEvents,
  options?: SoundOptions,
) {
  return (overrideOptions?: Partial<Options>): Attachment<HTMLElement> =>
    sound({ src, events, ...options, ...overrideOptions });
}
