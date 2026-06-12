import { Card, Table, Tag, Typography, Space, Alert } from 'antd'
import { useAppStore } from '../../store/appStore'
import type { Book } from '../../services/types'

export default function HomePage() {
  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const cards = useAppStore((s) => s.cards)

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
  ]

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
    </Space>
  )
}
