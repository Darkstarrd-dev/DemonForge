// @vitest-environment jsdom
//
// ErrorBoundary 护网测试（A-10）。
// 锁两个修复点 + 基本降级契约——tsc 抓不到「渲染期抛错被捕获」与「跳转用对 location API」：
//   ① 无错误 → 原样渲染子树。
//   ② 子树渲染抛错 → 捕获并降级为错误页（不白屏）。
//   ③ 点「返回首页」→ 走 HashRouter 的 location.hash='#/'
//      （原 assign('/') 在 Electron file:// 下会导航到文件系统根而白屏，本测试锁死修复）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import ErrorBoundary from './ErrorBoundary'

// 故意在渲染期抛错，触发 error boundary 的 getDerivedStateFromError。
function Bomb(): ReactNode {
  throw new Error('boom')
}

function renderBoundary(children: ReactNode) {
  return render(
    <ConfigProvider>
      <ErrorBoundary>{children}</ErrorBoundary>
    </ConfigProvider>,
  )
}

beforeEach(() => {
  // React 捕获子树异常时会 console.error 多条诊断；测试期静音以免污染输出。
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.location.hash = ''
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('无错误时原样渲染子树', () => {
    renderBoundary(<div>正常内容</div>)
    expect(screen.getByText('正常内容')).toBeInTheDocument()
  })

  it('子树渲染抛错时降级为错误页而非白屏', () => {
    renderBoundary(<Bomb />)
    expect(screen.getByText('页面运行出错')).toBeInTheDocument()
  })

  it('点「返回首页」走 HashRouter 跳转（location.hash=#/）', () => {
    renderBoundary(<Bomb />)
    fireEvent.click(screen.getByRole('button', { name: /返回首页/ }))
    expect(window.location.hash).toBe('#/')
  })
})
