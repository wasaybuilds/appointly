import { defineConfig } from 'tsup';

/**
 * The API is bundled with esbuild so that workspace packages (`@appointly/shared`)
 * and extension-less relative imports resolve correctly under Node's ESM loader.
 */
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
  noExternal: ['@appointly/shared'],
});
