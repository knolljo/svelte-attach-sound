import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type FakeSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  playbackRate: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type FakeGain = {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
};

type FakeContext = {
  destination: object;
  decodeAudioData: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
};

function createAudioHarness() {
  const createdSources: FakeSource[] = [];
  const createdGains: FakeGain[] = [];
  const destination = { kind: "destination" };

  const context: FakeContext = {
    destination,
    decodeAudioData: vi.fn(async () => ({ kind: "buffer" }) as unknown as AudioBuffer),
    resume: vi.fn(async () => undefined),
    createBufferSource: vi.fn(() => {
      const source: FakeSource = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        connect: vi.fn((node: GainNode) => node),
        start: vi.fn(),
        stop: vi.fn(),
      };
      createdSources.push(source);
      return source as unknown as AudioBufferSourceNode;
    }),
    createGain: vi.fn(() => {
      const gain: FakeGain = {
        gain: { value: 1 },
        connect: vi.fn(() => destination),
      };
      createdGains.push(gain);
      return gain as unknown as GainNode;
    }),
  };

  const AudioContextCtor = vi.fn(function MockAudioContext() {
    return context as unknown as AudioContext;
  });

  return { AudioContextCtor, context, createdGains, createdSources };
}

function mockFetch(arrayBuffer = new ArrayBuffer(8)) {
  const response = {
    arrayBuffer: vi.fn(async () => arrayBuffer),
  };
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, response };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function loadLibrary() {
  return import("../../src/index.ts");
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Sound", () => {
  it("loads audio eagerly and reuses a shared AudioContext", async () => {
    const { AudioContextCtor, context } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    const { fetchMock, response } = mockFetch();

    const { Sound } = await loadLibrary();
    const first = new Sound("/click.opus", { loop: true, rate: 1.5, volume: 0.25 });
    new Sound("/hover.opus");

    await flushAsyncWork();

    expect(AudioContextCtor).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/click.opus");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/hover.opus");
    expect(response.arrayBuffer).toHaveBeenCalledTimes(2);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);

    first.play();
    await flushAsyncWork();

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.createGain).toHaveBeenCalledTimes(1);
  });

  it("applies loop, rate, and volume when playing", async () => {
    const { AudioContextCtor, context, createdGains, createdSources } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    mockFetch();

    const { Sound } = await loadLibrary();
    const instance = new Sound("/click.opus", { loop: true, rate: 1.5, volume: 0.25 });

    await flushAsyncWork();
    instance.play();
    await flushAsyncWork();

    const source = createdSources[0];
    const gain = createdGains[0];

    expect(source.loop).toBe(true);
    expect(source.playbackRate.value).toBe(1.5);
    expect(gain.gain.value).toBe(0.25);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(context.destination);
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it("stops the current source without throwing on repeated stop", async () => {
    const { AudioContextCtor, createdSources } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    mockFetch();

    const { Sound } = await loadLibrary();
    const instance = new Sound("/click.opus");

    await flushAsyncWork();
    instance.play();
    await flushAsyncWork();

    const source = createdSources[0];
    instance.stop();
    instance.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
  });

  it("is SSR-safe when AudioContext is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { fetchMock } = mockFetch();

    const { Sound } = await loadLibrary();
    const instance = new Sound("/click.opus");

    instance.play();
    instance.stop();
    await flushAsyncWork();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns and stays inert when loading fails", async () => {
    const { AudioContextCtor, context } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { Sound } = await loadLibrary();
    const instance = new Sound("/broken.opus");

    await flushAsyncWork();
    instance.play();
    await flushAsyncWork();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(context.createBufferSource).not.toHaveBeenCalled();
  });

  it("does not start playback if stopped before the buffer resolves", async () => {
    const { AudioContextCtor, context } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    const responseDeferred = createDeferred<{ arrayBuffer: () => Promise<ArrayBuffer> }>();
    const decodeDeferred = createDeferred<AudioBuffer>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responseDeferred.promise),
    );
    context.decodeAudioData.mockImplementation(async () => decodeDeferred.promise);

    const { Sound } = await loadLibrary();
    const instance = new Sound("/slow.opus");

    instance.play();
    instance.stop();

    responseDeferred.resolve({
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    await flushAsyncWork();
    decodeDeferred.resolve({ kind: "buffer" } as unknown as AudioBuffer);
    await flushAsyncWork();

    expect(context.createBufferSource).not.toHaveBeenCalled();
  });
});

describe("attachments", () => {
  it("binds play and stop events and detaches cleanly", async () => {
    const { AudioContextCtor, createdSources } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    mockFetch();

    const { sound } = await loadLibrary();
    const button = document.createElement("button");
    const detach = sound({
      src: "/hover.opus",
      events: ["mouseenter", "mouseleave"],
      volume: 0.5,
    })(button);

    await flushAsyncWork();
    button.dispatchEvent(new MouseEvent("mouseenter"));
    await flushAsyncWork();

    expect(createdSources).toHaveLength(1);

    button.dispatchEvent(new MouseEvent("mouseleave"));
    expect(createdSources[0].stop).toHaveBeenCalledTimes(1);

    if (typeof detach === "function") {
      detach();
    }
    button.dispatchEvent(new MouseEvent("mouseenter"));
    await flushAsyncWork();

    expect(createdSources).toHaveLength(1);
  });

  it("merges useSound defaults with per-attachment overrides", async () => {
    const { AudioContextCtor, createdGains, createdSources } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    mockFetch();

    const { useSound } = await loadLibrary();
    const button = document.createElement("button");
    const attach = useSound("/click.opus", ["pointerdown"], {
      rate: 0.75,
      volume: 0.4,
    });

    attach({ loop: true, volume: 0.9 })(button);
    await flushAsyncWork();

    button.dispatchEvent(new Event("pointerdown"));
    await flushAsyncWork();

    expect(createdSources[0].loop).toBe(true);
    expect(createdSources[0].playbackRate.value).toBe(0.75);
    expect(createdGains[0].gain.value).toBe(0.9);
  });

  it("types useSound overrides as sound options only", async () => {
    const { useSound } = await loadLibrary();
    const attach = useSound("/click.opus", ["pointerdown"]);

    // @ts-expect-error `src` is not part of the override shape.
    void attach({ src: "/wrong.opus" });
    // @ts-expect-error `events` is not part of the override shape.
    void attach({ events: ["click"] });
  });

  it("cancels pending playback when the attachment is detached before loading completes", async () => {
    const { AudioContextCtor, context } = createAudioHarness();
    vi.stubGlobal("AudioContext", AudioContextCtor);
    const responseDeferred = createDeferred<{ arrayBuffer: () => Promise<ArrayBuffer> }>();
    const decodeDeferred = createDeferred<AudioBuffer>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responseDeferred.promise),
    );
    context.decodeAudioData.mockImplementation(async () => decodeDeferred.promise);

    const { sound } = await loadLibrary();
    const button = document.createElement("button");
    const detach = sound({
      src: "/slow.opus",
      events: ["mouseenter", "mouseleave"],
    })(button);

    button.dispatchEvent(new MouseEvent("mouseenter"));
    if (typeof detach === "function") {
      detach();
    }

    responseDeferred.resolve({
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    await flushAsyncWork();
    decodeDeferred.resolve({ kind: "buffer" } as unknown as AudioBuffer);
    await flushAsyncWork();

    expect(context.createBufferSource).not.toHaveBeenCalled();
  });
});
