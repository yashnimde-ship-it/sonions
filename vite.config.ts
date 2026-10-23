import { defineConfig } from 'vite';

// The dev server forwards the game's WebSocket to the Bun game server (server/index.ts),
// and listens on the network so other laptops on the same Wi-Fi can join.
export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
