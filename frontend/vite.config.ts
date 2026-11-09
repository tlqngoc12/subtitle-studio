/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build:
    mode === 'public'
      ? {
          // The read-only public site (PublicApp), copied out of the jar and deployed by Publish.
          outDir: '../target/classes/public-site',
          emptyOutDir: true,
          rollupOptions: { input: 'public.html' },
        }
      : {
          // Served by Spring Boot from classpath:/static; packaged into the jar by Maven.
          outDir: '../target/classes/static',
          emptyOutDir: true,
        },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Process the project's own stylesheets (src/**/*.css) so a test can read the rules via test/css.ts;
    // third-party CSS stays unprocessed.
    // Only the ?raw imports are matched: components import their .css files too, and those stay empty in
    // jsdom so the page's layout rules (hidden bars, print) do not change what the behaviour tests can see.
    css: { include: [/\/src\/.*\.css\?.*raw/] },
  },
}));
