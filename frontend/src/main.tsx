import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/home'
import M1ImportPage from './pages/m1-import'
import M2CardsPage from './pages/m2-cards'
import M3SimulatePage from './pages/m3-simulate'
import M4GeneratePage from './pages/m4-generate'
import M5ChaptersPage from './pages/m5-chapters'
import SettingsPage from './pages/settings'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/m1" element={<M1ImportPage />} />
              <Route path="/m2" element={<M2CardsPage />} />
              <Route path="/m3" element={<M3SimulatePage />} />
              <Route path="/m4" element={<M4GeneratePage />} />
              <Route path="/m5" element={<M5ChaptersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
