import { defineConfig } from 'tsup';

/**
 * Bundled to a single ESM entry point so both the Node API and the Next.js
 * client can consume the package without relative-extension resolution issues.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  external: ['zod'],
});
