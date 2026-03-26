// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

async function loadLibrary() {
  return import("../../src/index.ts");
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SSR safety", () => {
  it("can be imported and used without AudioContext", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { Sound } = await loadLibrary();
    const sound = new Sound("/click.opus");

    sound.play();
    sound.stop();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates attachment factories without touching browser APIs", async () => {
    vi.stubGlobal("AudioContext", undefined);

    const { sound, useSound } = await loadLibrary();

    expect(typeof sound({ src: "/click.opus", events: ["click"] })).toBe("function");
    expect(typeof useSound("/click.opus", ["click"])).toBe("function");
  });
});
