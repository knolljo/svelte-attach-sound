import type { Attachment } from "svelte/attachments";
import { on } from "svelte/events";

type SoundSource = string;
type SoundEvents = [keyof HTMLElementEventMap, (keyof HTMLElementEventMap)?];

type SoundOptions = {
  /** Playback volume, 0.0 to 1.0. Default: 1. */
  volume?: number;
  /** Whether the sound loops. Default: false. */
  loop?: boolean;
  /** Playback rate multiplier. Default: 1. */
  rate?: number;
};

type Options = {
  src: SoundSource;
  events: SoundEvents;
} & SoundOptions;

let ctx: AudioContext | null = null;
function getContext(): AudioContext | null {
  // Check SSR
  if (typeof AudioContext === "undefined") return null;
  return (ctx ??= new AudioContext());
}

// SSR-safe. No server-side side effects. `getContext()` returns `null` when
// `AudioContext` is unavailable; `play` and `stop` become no-ops.
export class Sound {
  private buffer: Promise<AudioBuffer | null>;
  private source: AudioBufferSourceNode | null = null;
  private token = 0;
  private options: SoundOptions;

  constructor(src: SoundSource, options: SoundOptions = {}) {
    this.options = options;
    this.buffer = this.load(src);
  }

  private async load(src: SoundSource): Promise<AudioBuffer | null> {
    const context = getContext();
    if (!context) return null;

    try {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      return await context.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn("[svelte-attach-sound] Failed to load sound:", src, e);
      return null;
    }
  }

  play() {
    const token = this.token;
    void this.buffer.then((buffer) => {
      if (!buffer) return;
      if (token !== this.token) return;
      const context = getContext();
      if (!context) return;
      void context.resume();

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = this.options.loop ?? false;
      source.playbackRate.value = this.options.rate ?? 1;

      const gain = context.createGain();
      gain.gain.value = this.options.volume ?? 1;
      source.connect(gain).connect(context.destination);

      this.source = source;
      source.start();
    });
  }

  stop() {
    this.token += 1;
    try {
      this.source?.stop();
    } catch {
      // source may have already ended naturally
    }
    this.source = null;
  }
}

/**
 * Creates a sound attachment that binds playback to DOM events on the element.
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
    const { src, events, ...soundOptions } = options;
    const [playEvent, stopEvent] = events;

    const instance = new Sound(src, soundOptions);

    const offPlay = on(element, playEvent, () => instance.play());
    const offStop = stopEvent ? on(element, stopEvent, () => instance.stop()) : null;

    return () => {
      offPlay();
      offStop?.();
      instance.stop();
    };
  };
}

/**
 * Creates a pre-configured sound attachment factory reusable across elements.
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
 * <button {@attach click({ volume: 0.5 })}>Quieter</button>
 * ```
 */
export function useSound(src: SoundSource, events: SoundEvents, options?: SoundOptions) {
  return (overrideOptions: SoundOptions = {}): Attachment<HTMLElement> => {
    const {
      volume = options?.volume,
      loop = options?.loop,
      rate = options?.rate,
    } = overrideOptions;

    return sound({ src, events, volume, loop, rate });
  };
}
