import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: false,
    // App chạy tại máy, không cần chia nhỏ gói để tải nhanh qua mạng.
    chunkSizeWarningLimit: 4000,
  },
});
