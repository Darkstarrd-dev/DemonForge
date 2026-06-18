import { useState } from 'react'
import { App, Button, Card, Checkbox, Modal, Table, Tag, Typography, Space, Alert } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import type { Book } from '../../services/types'

export default function HomePage() {
  const { message } = App.useApp()
  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const cards = useAppStore((s) => s.cards)
  const scenes = useAppStore((s) => s.scenes)
  const deleteBook = useAppStore((s) => s.deleteBook)

  // 删除确认弹窗态
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)

  const openDelete = (b: Book) => {
    setDeleteTarget(b)
    setConfirmChecked(false)
  }
  const closeDelete = () => setDeleteTarget(null)

  const doDelete = () => {
    if (!deleteTarget) return
    const title = deleteTarget.title
    deleteBook(deleteTarget.id)
    setDeleteTarget(null)
    message.success(`已删除《${title}》及其全部关联数据`)
  }

  const columns = [
    { title: '书名', dataIndex: 'title', key: 'title' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (t: Book['type']) =>
        t === 'project' ? <Tag color="blue">作品库</Tag> : <Tag color="default">素材库</Tag>,
    },
    {
      title: '章节数',
      key: 'chapterCount',
      render: (_: unknown, b: Book) => chapters.filter((c) => c.bookId === b.id).length,
    },
    {
      title: '设定卡片数',
      key: 'cardCount',
      render: (_: unknown, b: Book) => cards.filter((c) => c.bookId === b.id).length,
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v.slice(0, 10) },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, b: Book) => (
        <Button danger size="small" icon={<DeleteOutlined />} onClick={() => openDelete(b)}>
          删除
        </Button>
      ),
    },
  ]

  // 删除预览：统计目标 book 关联数据量
  const targetStats = deleteTarget
    ? {
        chapters: chapters.filter((c) => c.bookId === deleteTarget.id).length,
        cards: cards.filter((c) => c.bookId === deleteTarget.id).length,
        scenes: scenes.filter((s) => s.bookId === deleteTarget.id).length,
      }
    : null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="mock 演示流程"
        description="M1 载入演示 raw 并切分清洗入库 → M2 提取/浏览设定卡片 → M3 构建场景推演角色 → M4 用采纳片段生成章节草稿 → M5 定稿并查看一致性报告。所有 AI 反馈均为前端模拟。"
      />
      <Card title="书库概览">
        <Table rowKey="id" columns={columns} dataSource={books} pagination={false} size="middle" />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          素材库 = 他人作品参考（只读提取设定）；作品库 = 自己的创作工作区。M1 导入时选择归属。
        </Typography.Paragraph>
      </Card>

      <Modal
        title="删除作品"
        open={!!deleteTarget}
        onCancel={closeDelete}
        onOk={doDelete}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !confirmChecked }}
        destroyOnClose
      >
        <Typography.Paragraph>
          即将删除《<Typography.Text strong>{deleteTarget?.title}</Typography.Text>》，此操作不可撤销。
        </Typography.Paragraph>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          将一并删除该作品下的全部关联数据：
        </Typography.Paragraph>
        <ul style={{ marginTop: 0, color: '#666' }}>
          <li>章节 {targetStats?.chapters ?? 0} 章</li>
          <li>设定卡片 {targetStats?.cards ?? 0} 张</li>
          <li>推演场景 {targetStats?.scenes ?? 0} 个</li>
          <li>大纲、架构、状态事件、一致性报告</li>
        </ul>
        <Checkbox checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)}>
          我已了解将删除以上全部数据
        </Checkbox>
      </Modal>
    </Space>
  )
}
