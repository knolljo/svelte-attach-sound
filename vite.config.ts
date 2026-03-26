import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
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
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
