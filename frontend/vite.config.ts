/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // Vitest 4 用 test.projects 替代 workspace 机制。各 project 独立 include/exclude，
    // 互不干扰。project 未覆盖的选项从根 test 继承（如 environment / setupFiles）。
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    projects: [
      {
        test: {
          name: 'core',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['src/game/**/__tests__/**'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'monopoly',
          include: ['src/game/monopoly/__tests__/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'dice',
          include: ['src/game/dice/__tests__/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
  server: {
    // 开发期把 /api 转发到本地 LLM 网关（server/，监听 8787）；SSE 流式透传
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React 核心
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor-react'
          }
          // Ant Design UI 库
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design')) {
            return 'vendor-antd'
          }
          // 3D 引擎（demo-3d 专用）
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three') || id.includes('node_modules/@dimforge/rapier3d')) {
            return 'vendor-3d'
          }
          // 2D 引擎（demo-2d 专用）
          if (id.includes('node_modules/phaser')) {
            return 'vendor-2d'
          }
          // 工具库
          if (id.includes('node_modules/zustand') || id.includes('node_modules/jschardet') ||
              id.includes('node_modules/gif.js') || id.includes('node_modules/jszip') || id.includes('node_modules/omggif')) {
            return 'vendor-utils'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000, // 提高到 1000 KB（仅针对拆分后的 vendor chunk）
  },
})
