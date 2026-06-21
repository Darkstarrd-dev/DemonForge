import { Button, Layout, Menu, Select, Segmented, Typography } from 'antd'
import {
  BookOutlined,
  PoweroffOutlined,
  HomeOutlined,
  DeploymentUnitOutlined,
  ImportOutlined,
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
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore, flushStoreWrites, pushSettingsNow } from '../store/appStore'

const MENU_ITEMS = [
  { key: '/', icon: <HomeOutlined />, label: '书库概览' },
  { key: '/m0', icon: <DeploymentUnitOutlined />, label: 'M0 立项·架构' },
  { key: '/m1', icon: <ImportOutlined />, label: 'M1 文本导入' },
  { key: '/m2', icon: <IdcardOutlined />, label: 'M2 设定卡片' },
  { key: '/m3', icon: <PlayCircleOutlined />, label: 'M3 角色推演' },
  { key: '/m4', icon: <FileTextOutlined />, label: 'M4 章节生成' },
  { key: '/m5', icon: <FolderOpenOutlined />, label: 'M5 章节管理' },
  { key: '/batch', icon: <RocketOutlined />, label: '批量生产' },
  { key: '/role-chat', icon: <MessageOutlined />, label: '角色交流' },
  { key: '/demo-3d', icon: <BlockOutlined />, label: '3D环境Demo' },
  { key: '/demo-2d', icon: <AppstoreOutlined />, label: '2D环境Demo' },
  { key: '/node-test', icon: <PictureOutlined />, label: '节点测试' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const books = useAppStore((s) => s.books)
  const currentBookId = useAppStore((s) => s.currentBookId)
  const showMenuBar = useAppStore((s) => s.showMenuBar)
  const theme = useAppStore((s) => s.theme)
  const setState = useAppStore((s) => s.setState)
  const projects = books.filter((b) => b.type === 'project')

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
      <Layout.Sider
        theme={theme === 'dark' ? 'dark' : 'light'}
        width={208}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: theme === 'dark' ? '#141414' : '#ffffff',
          borderRight: theme === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
        }}
      >
        <div style={{
          padding: '16px 20px',
          color: theme === 'dark' ? '#fff' : '#1F2421',
          fontSize: 17,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: theme === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
        }}>
          <span style={{ flex: 1 }}>NovelHelper</span>
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

        {/* 当前作品选择器（移到 sidebar） */}
        <div style={{
          padding: '8px 4px 8px 7px',
          borderBottom: theme === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
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
          theme={theme === 'dark' ? 'dark' : 'light'}
          mode="inline"
          items={MENU_ITEMS}
          selectedKeys={[location.pathname]}
          onClick={(e) => navigate(e.key)}
          style={{
            flex: 1,
            background: theme === 'dark' ? '#141414' : '#ffffff',
            paddingTop: 0,
            paddingLeft: 3,
          }}
        />
        <div style={{
          padding: '8px 12px',
          borderTop: theme === 'dark' ? '1px solid #303030' : '1px solid #f0f0f0',
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
      <Layout style={{ overflow: 'hidden' }}>
        <Layout.Content style={{ padding: 0, overflow: 'auto', height: '100vh' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
