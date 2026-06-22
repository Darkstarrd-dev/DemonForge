// 在 Electron 生产模式下，将 /api/ 请求重定向到后端服务器 (127.0.0.1:8787)
// 开发模式下 Vite proxy 自动转发，此处无需干预
if (typeof window !== 'undefined' && (window as any).electronAPI) {
  const _fetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return _fetch('http://127.0.0.1:8787' + input, init)
    }
    return _fetch(input, init)
  }
}

import { StrictMode, lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider, App as AntApp, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/home'
import M0ArchitecturePage from './pages/m0-architecture'
import M1ImportPage from './pages/m1-import'
import M2CardsPage from './pages/m2-cards'
import M3SimulatePage from './pages/m3-simulate'
import M4GeneratePage from './pages/m4-generate'
import M5ChaptersPage from './pages/m5-chapters'
import BatchGeneratePage from './pages/batch-generate'
import BookReaderPage from './pages/book-reader'
import NodeTestPage from './pages/node-test'
import RoleChatPage from './pages/role-chat'
import ImageHelperPage from './pages/image-helper'
import SettingsPage from './pages/settings'
import { bootstrapStore, useAppStore } from './store/appStore'
import ErrorBoundary from './components/ErrorBoundary'
import ScaleWrapper from './components/ScaleWrapper'
import { lightTheme, darkTheme } from './styles/theme'
import './index.css'

// eslint-disable-next-line react-refresh/only-export-components
const Demo3DPage = lazy(() => import('./pages/demo-3d'))
// eslint-disable-next-line react-refresh/only-export-components
const Demo2DPage = lazy(() => import('./pages/demo-2d'))

// 主题包装组件
function AppWithTheme() {
  const theme = useAppStore((s) => s.theme)

  // 设置 body data-theme 属性用于 CSS 变量
  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ConfigProvider locale={zhCN} theme={theme === 'dark' ? darkTheme : lightTheme}>
      <AntApp message={{ maxCount: 3 }}>
        <ScaleWrapper baseWidth={3840}>
          <HashRouter>
            <ErrorBoundary>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/m0" element={<M0ArchitecturePage />} />
                  <Route path="/m1" element={<M1ImportPage />} />
                  <Route path="/m2" element={<M2CardsPage />} />
                  <Route path="/m3" element={<M3SimulatePage />} />
                  <Route path="/m4" element={<M4GeneratePage />} />
                  <Route path="/m5" element={<M5ChaptersPage />} />
                  <Route path="/batch" element={<BatchGeneratePage />} />
                  <Route path="/book-reader" element={<BookReaderPage />} />
                  <Route path="/node-test" element={<NodeTestPage />} />
                  <Route path="/demo-image" element={<NodeTestPage />} />
                  <Route path="/role-chat" element={<RoleChatPage />} />
                  <Route path="/image-helper" element={<ImageHelperPage />} />
                  <Route path="/demo-3d" element={<Suspense fallback={<Spin size="large" />}><Demo3DPage /></Suspense>} />
                  <Route path="/demo-2d" element={<Suspense fallback={<Spin size="large" />}><Demo2DPage /></Suspense>} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Routes>
            </ErrorBoundary>
          </HashRouter>
        </ScaleWrapper>
      </AntApp>
    </ConfigProvider>
  )
}

// 渲染前先从后端载入数据（设置 + 业务数据/种子），避免先显示种子再被替换的闪烁
bootstrapStore().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppWithTheme />
    </StrictMode>,
  )
})
