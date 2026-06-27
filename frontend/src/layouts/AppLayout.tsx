import { Button, Layout, Menu, Select, Segmented, Typography } from 'antd'
import {
  PoweroffOutlined,
  HomeOutlined,
  DeploymentUnitOutlined,
  IdcardOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  RocketOutlined,
  SettingOutlined,
  BlockOutlined,
  AppstoreOutlined,
  PictureOutlined,
  MessageOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAppStore, flushStoreWrites, pushSettingsNow } from '../store/appStore'
import SessionSidebar from '../pages/node-test/SessionSidebar'

const MENU_ITEMS = [
  { key: '/', icon: <HomeOutlined />, label: '书库概览' },
  { key: '/m0', icon: <DeploymentUnitOutlined />, label: 'M0 立项·架构' },
  { key: '/m2', icon: <IdcardOutlined />, label: 'M2 设定卡片' },
  { key: '/m3', icon: <PlayCircleOutlined />, label: 'M3 角色推演' },
  { key: '/m4', icon: <FileTextOutlined />, label: 'M4 章节生成' },
  { key: '/m5', icon: <FolderOpenOutlined />, label: 'M5 章节管理' },
  { key: '/batch', icon: <RocketOutlined />, label: '批量生产' },
  { key: '/role-chat', icon: <MessageOutlined />, label: '角色交流' },
  { key: '/image-helper', icon: <PictureOutlined />, label: '图片辅助' },
  { key: '/demo-3d', icon: <BlockOutlined />, label: '3D环境Demo' },
  { key: '/demo-2d', icon: <AppstoreOutlined />, label: '2D环境Demo' },
  { key: '/node-test', icon: <ExperimentOutlined />, label: '节点测试' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const books = useAppStore((s) => s.books)
  const currentBookId = useAppStore((s) => s.currentBookId)
  const showMenuBar = useAppStore((s) => s.showMenuBar)
  const theme = useAppStore((s) => s.theme)
  const nodeTestSidebarMode = useAppStore((s) => s.nodeTestSidebarMode)
  const setState = useAppStore((s) => s.setState)
  const projects = books.filter((b) => b.type === 'project')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [floatingButtonHovered, setFloatingButtonHovered] = useState(false)

  // 节点测试模式下：左上角 logo 点击切换左侧栏内容（app 导航 / session 列表）；其它路由维持折叠行为
  const isNodeTest = location.pathname === '/node-test'
  const showSessions = isNodeTest && nodeTestSidebarMode === 'sessions'
  const onLogoClick = () => {
    if (isNodeTest) {
      setState({ nodeTestSidebarMode: nodeTestSidebarMode === 'sessions' ? 'app' : 'sessions' })
    } else {
      setSidebarCollapsed(true)
    }
  }

  // 同步 showMenuBar 到 Electron 主进程（兜底，确保前端状态与主窗口一致）
  useEffect(() => {
    window.electronAPI?.setMenuBarVisibility(showMenuBar)
  }, [showMenuBar])

  const handleExit = async () => {
    // 先冲刷未提交的 debounce 写入（删除/编辑等），再触发后端 shutdown，
    // 否则后端被杀掉，最后一次状态丢失，重启后数据回归。
    try {
      await flushStoreWrites()
    } catch {
      /* 忽略 */
    }
    try {
      await fetch('/api/shutdown', { method: 'POST' })
    } catch {
      // 后端可能已关闭
    }
    window.close()
  }

  return (
    <Layout style={{ height: '100vh' }}>
      {/* 折叠后的悬浮按钮（鼠标悬停区域触发显示） */}
      {sidebarCollapsed && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: 120,
            height: 80,
            zIndex: 1000,
          }}
          onMouseEnter={() => setFloatingButtonHovered(true)}
          onMouseLeave={() => setFloatingButtonHovered(false)}
        >
          {floatingButtonHovered && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                background: 'var(--app-sider-bg)',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                padding: '12px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 17,
                color: 'var(--app-sider-text)',
                transition: 'opacity 0.2s',
              }}
              onClick={() => setSidebarCollapsed(false)}
            >
              NovelHelper
            </div>
          )}
        </div>
      )}

      {/* Sidebar */}
      {!sidebarCollapsed && (
        <Layout.Sider
          theme={theme === 'dark' ? 'dark' : 'light'}
          width={208}
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--app-sider-bg)',
            borderRight: '1px solid var(--app-sider-border)',
          }}
        >
          <div style={{
            padding: '16px 20px',
            color: 'var(--app-sider-text)',
            fontSize: 17,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: '1px solid var(--app-sider-border)',
          }}>
            <span
              style={{ flex: 1, cursor: 'pointer' }}
              onClick={onLogoClick}
            >
              NovelHelper
            </span>
            <Segmented
              value={theme}
              onChange={(v) => {
                setState({ theme: v as 'light' | 'dark' })
                pushSettingsNow()
              }}
              options={[
                { value: 'light', label: '🌞' },
                { value: 'dark', label: '🌙' },
              ]}
              size="small"
              style={{ flexShrink: 0 }}
            />
          </div>

          {showSessions ? (
            /* 节点测试 · 多 session 列表（替代 app 导航；logo 点击切回） */
            <SessionSidebar />
          ) : (
            <>
              {/* 当前作品选择器（移到 sidebar） */}
              <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--app-sider-border)',
              }}>
                {projects.length > 0 ? (
                  <Select
                    style={{ width: '100%' }}
                    size="small"
                    value={currentBookId}
                    onChange={(v) => setState({ currentBookId: v })}
                    options={projects.map((b) => ({ value: b.id, label: b.title }))}
                    placeholder="选择作品"
                  />
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12, paddingLeft: 8 }}>
                    暂无作品
                  </Typography.Text>
                )}
              </div>

              <Menu
                className="hide-scrollbar"
                theme={theme === 'dark' ? 'dark' : 'light'}
                mode="inline"
                items={MENU_ITEMS}
                selectedKeys={[location.pathname]}
                onClick={(e) => navigate(e.key)}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  background: 'var(--app-sider-bg)',
                  paddingTop: 0,
                }}
              />
            </>
          )}
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--app-sider-border)',
          }}>
            <Button
              block
              danger
              icon={<PoweroffOutlined />}
              onClick={handleExit}
            >
              退出系统
            </Button>
          </div>
        </Layout.Sider>
      )}

      <Layout style={{ overflow: 'hidden' }}>
        <Layout.Content style={{ padding: 0, overflow: 'auto', height: '100vh' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
