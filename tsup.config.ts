import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli/cli.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  sourcemap: true,
  splitting: false,
  noExternal: [
    "@stoplight/spectral-core",
    "@stoplight/spectral-functions",
    "@stoplight/spectral-rulesets",
  ],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
