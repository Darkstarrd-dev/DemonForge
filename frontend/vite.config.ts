import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // 开发期把 /api 转发到本地 LLM 网关（server/，监听 8787）；SSE 流式透传
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
