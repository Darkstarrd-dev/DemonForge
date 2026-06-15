import { Button, Layout, Menu, Select, Space, Tag, Typography } from 'antd'
import {
  BookOutlined,
  PoweroffOutlined,
  HomeOutlined,
  ImportOutlined,
  IdcardOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'

const MENU_ITEMS = [
  { key: '/', icon: <HomeOutlined />, label: '书库概览' },
  { key: '/m1', icon: <ImportOutlined />, label: 'M1 文本导入' },
  { key: '/m2', icon: <IdcardOutlined />, label: 'M2 设定卡片' },
  { key: '/m3', icon: <PlayCircleOutlined />, label: 'M3 角色推演' },
  { key: '/m4', icon: <FileTextOutlined />, label: 'M4 章节生成' },
  { key: '/m5', icon: <FolderOpenOutlined />, label: 'M5 章节管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const books = useAppStore((s) => s.books)
  const currentBookId = useAppStore((s) => s.currentBookId)
  const setState = useAppStore((s) => s.setState)
  const projects = books.filter((b) => b.type === 'project')

  const handleExit = async () => {
    try {
      await fetch('/api/shutdown', { method: 'POST' })
    } catch {
      // 后端可能已关闭
    }
    window.close()
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider theme="dark" width={208} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '16px 20px', color: '#fff', fontSize: 17, fontWeight: 600 }}>
          <BookOutlined style={{ marginRight: 8 }} />
          novelhelper
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={MENU_ITEMS}
          selectedKeys={[location.pathname]}
          onClick={(e) => navigate(e.key)}
          style={{ flex: 1 }}
        />
        <div style={{ padding: '8px 12px', borderTop: '1px solid #303030' }}>
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
        <Layout.Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Space>
            <Typography.Text type="secondary">当前作品</Typography.Text>
            <Select
              style={{ minWidth: 180 }}
              value={currentBookId}
              onChange={(v) => setState({ currentBookId: v })}
              options={projects.map((b) => ({ value: b.id, label: b.title }))}
            />
          </Space>
          <Tag color="orange">mock 演示模式 · AI 反馈均为模拟</Tag>
        </Layout.Header>
        <Layout.Content style={{ padding: 16, overflow: 'auto' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
