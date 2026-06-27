// 全局测试 setup：引入 jest-dom 自定义匹配器（toBeInTheDocument 等）。
// 匹配器扩展 expect，环境无关——node 纯函数测试加载也安全（不触碰 DOM）。
// 组件测试文件需在顶部声明 `// @vitest-environment jsdom` 单文件切 jsdom 环境。
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每个测试后卸载渲染的组件树，避免跨用例 DOM 残留。
// 守卫 document：本 setup 全局加载，node 环境（纯函数测试）无 DOM，跳过 cleanup。
afterEach(() => {
  if (typeof document !== 'undefined') cleanup()
})
