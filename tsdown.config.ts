import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  exports: true,
  platform: "neutral",
  target: false,
  minify: true,
  deps: {
    neverBundle: ["svelte", /^svelte\//],
    skipNodeModulesBundle: true,
  },
  report: { brotli: true },
});
