import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port and prints its own output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // 工具或编辑器可能分多次写入同一个文件。不等待写入稳定时,Vite 会读到
    // 半截甚至空内容并把它缓存下来,表现为整页空白(控制台只剩一条
    // "does not provide an export named 'default'")。加上等待可消除该竞态。
    watch: {
      ignored: ['**/src-tauri/**'],
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 25 },
    },
  },
});
