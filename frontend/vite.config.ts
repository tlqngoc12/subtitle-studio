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
  },
}));
