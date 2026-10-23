import { defineConfig } from 'vite';

// The dev server forwards the game's WebSocket to the Bun game server (server/index.ts),
// and listens on the network so other laptops on the same Wi-Fi can join.
export default defineConfig({
  server: {
    host: true,
    proxy: {
      // 127.0.0.1, not localhost: on some machines localhost resolves to IPv6 (::1) first,
      // and the game server listens on IPv4 only.
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
});
