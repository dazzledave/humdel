import { defineConfig } from 'vite';

// Simple Vite config. `npm run dev` serves the app; `host: true` also
// exposes it on your local network so you can test on a phone.
export default defineConfig({
  server: { host: true, open: true },
  build: { target: 'es2020' }
});
