import { useState } from 'react'
import { App, Button, Card, Checkbox, Form, Input, Modal, Table, Tag, Typography, Space } from 'antd'
import { DeleteOutlined, FolderOpenOutlined, EditOutlined, DownloadOutlined, ImportOutlined, ClearOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import type { Book } from '../../services/types'

export default function HomePage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const cards = useAppStore((s) => s.cards)
  const scenes = useAppStore((s) => s.scenes)
  const deleteBook = useAppStore((s) => s.deleteBook)
  const setState = useAppStore((s) => s.setState)

  // 删除确认弹窗态
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)
  // 编辑弹窗态（仅编辑 title/author/platform）
  const [editTarget, setEditTarget] = useState<Book | null>(null)
  const [form] = Form.useForm<{ title: string; author?: string; platform?: string }>()

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

  const openEdit = (b: Book) => {
    setEditTarget(b)
    form.setFieldsValue({ title: b.title, author: b.author, platform: b.platform })
  }
  const closeEdit = () => {
    setEditTarget(null)
    form.resetFields()
  }
  const doEdit = () => {
    if (!editTarget) return
    const values = form.getFieldsValue()
    setState({
      books: books.map((b) => (b.id === editTarget.id ? { ...b, ...values } : b)),
    })
    message.success('已保存修改')
    closeEdit()
  }

  const exportTxt = (b: Book) => {
    const bookChapters = chapters.filter((c) => c.bookId === b.id).sort((a, z) => a.index - z.index)
    if (bookChapters.length === 0) {
      message.warning('该书暂无章节内容')
      return
    }
    // 拼接全文：每章标题 + 两个换行 + 正文 + 两个换行
    const fullText = bookChapters.map((c) => `${c.title}\n\n${c.content}`).join('\n\n')
    // 文件名：书名 + 作者名（无作者则仅书名）
    const filename = b.author ? `${b.title}_${b.author}.txt` : `${b.title}.txt`
    // 创建 Blob 并触发下载
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    message.success(`已导出《${b.title}》（${bookChapters.length} 章）`)
  }

  const columns = [
    { title: '书名', dataIndex: 'title', key: 'title' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (t: Book['type']) =>
        t === 'project' ? (
          <Tag style={{ color: '#C4612F', borderColor: '#C4612F', background: '#FFF' }}>作品库</Tag>
        ) : (
          <Tag style={{ color: '#5C635D', borderColor: '#E7E1D7', background: '#FFF' }}>素材库</Tag>
        ),
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      render: (v: string | undefined, b: Book) =>
        b.type === 'reference' ? v || <Typography.Text type="secondary">—</Typography.Text> : null,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (v: string | undefined, b: Book) =>
        b.type === 'reference' ? v || <Typography.Text type="secondary">—</Typography.Text> : null,
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
      width: 300,
      render: (_: unknown, b: Book) => (
        <Space size={4} wrap onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<FolderOpenOutlined />}
            onClick={() => navigate(`/book-reader?bookId=${b.id}`)}
          >
            打开
          </Button>
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={() => {
              const bookChapters = chapters
                .filter((c) => c.bookId === b.id)
                .sort((a, z) => a.index - z.index)
              if (bookChapters.length === 0) {
                message.warning('该书暂无章节，无法清理')
                return
              }
              setState({
                importSession: {
                  fileName: b.title,
                  rawText: '',
                  encoding: 'utf-8',
                  detectedEncoding: '已入库（清理模式）',
                  step: 2,
                  chapters: bookChapters.map((c) => ({
                    id: c.id,
                    title: c.title,
                    content: c.content,
                    cleanStatus: 'pending' as const,
                    cleanedContent: undefined,
                    lineDecisions: {},
                    retryCount: 0,
                  })),
                  targetBookId: b.id,
                },
              })
              navigate('/m1')
            }}
          >
            清理
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => exportTxt(b)}>
            导出
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(b)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => openDelete(b)}>
            删除
          </Button>
        </Space>
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
    <div style={{ maxWidth: '100%', width: '100%' }}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Card title="书库概览" extra={
        <Button
          type="primary"
          icon={<ImportOutlined />}
          onClick={() => {
            setState({ importSession: null })
            navigate('/m1')
          }}
        >
          导入文件
        </Button>
      }>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={books}
          pagination={false}
          size="middle"
          scroll={{ x: 'max-content' }}
          onRow={(b: Book) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/book-reader?bookId=${b.id}`),
          })}
          locale={{
            emptyText: (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                书库暂无作品。可前往 <Typography.Link onClick={() => navigate('/m0')}>M0 立项·架构</Typography.Link>{' '}
                新建一个作品，或点击右上角「导入文件」导入素材。
              </Typography.Paragraph>
            ),
          }}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          素材库 = 他人作品参考（只读提取设定）；作品库 = 自己的创作工作区。M1 导入时选择归属。
        </Typography.Paragraph>
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑书籍信息"
        open={!!editTarget}
        onOk={doEdit}
        onCancel={closeEdit}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="书名" rules={[{ required: true, message: '请输入书名' }]}>
            <Input placeholder="书名" />
          </Form.Item>
          {editTarget?.type === 'reference' && (
            <>
              <Form.Item name="author" label="作者">
                <Input placeholder="作者名（可选）" />
              </Form.Item>
              <Form.Item name="platform" label="平台">
                <Input placeholder="原始发布平台（可选）" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* 删除确认弹窗 */}

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
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          <ul style={{ marginTop: 0, paddingLeft: 20 }}>
            <li>章节 {targetStats?.chapters ?? 0} 章</li>
            <li>设定卡片 {targetStats?.cards ?? 0} 张</li>
            <li>推演场景 {targetStats?.scenes ?? 0} 个</li>
            <li>大纲、架构、状态事件、一致性报告</li>
          </ul>
        </Typography.Paragraph>
        <Checkbox checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)}>
          我已了解将删除以上全部数据
        </Checkbox>
      </Modal>
    </Space>
    </div>
  )
}
