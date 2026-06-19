import { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { App, Button, Col, Empty, Input, List, Row, Select, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useAppStore, pushStoreNow } from '../../store/appStore'
import type { Chapter } from '../../services/types'

/**
 * 书库阅读 / 编辑器：左侧章节列表 + 右侧正文，两侧均可编辑保存。
 *
 * 设计沿用 M5 的 viewing/editText/updateChapter 范本：
 *  - 左侧每章有「编辑标题」（受控 Input + 保存/取消）
 *  - 右侧正文默认只读展示（prose-view），点「编辑」切 TextArea，「保存」调 updateChapter 落库
 *  - 标题/正文任一保存都走 store 订阅 → 后端；标题保存因是关键写 → 额外 pushStoreNow 立即落库
 *
 * 路由：/book-reader?bookId=xxx（无 bookId 则取书库第一本）。
 */
export default function BookReaderPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const updateChapter = useAppStore((s) => s.updateChapter)

  // 当前书：优先 query；query 指向不存在的书则回退书库第一本。无独立 state，避免 effect 同步。
  const queryBookId = params.get('bookId') ?? ''
  const bookId =
    (queryBookId && books.some((b) => b.id === queryBookId) && queryBookId) || books[0]?.id || ''

  // 切书时同步 query（state 由 query 派生，无需 setBookId）
  const changeBook = (id: string) => {
    setParams({ bookId: id }, { replace: true })
    setSelectedId(null)
    setTitleDraft(null)
    setContentDraft(null)
  }

  const book = books.find((b) => b.id === bookId) ?? null
  const bookChapters = useMemo(
    () => chapters.filter((c) => c.bookId === bookId).sort((a, b) => a.index - b.index),
    [chapters, bookId],
  )

  const [selectedId, setSelectedId] = useState<string | null>(bookChapters[0]?.id ?? null)
  const [titleDraft, setTitleDraft] = useState<{ id: string; title: string } | null>(null)
  const [contentDraft, setContentDraft] = useState<string | null>(null)

  // 当前章节（随 store 实时变化，保证保存后右侧/左侧立刻反映）。
  // selectedId 失效（切书后旧 id 不在新书章节中）时回退第一章，避免 effect setState。
  const current = chapters.find((c) => c.id === selectedId) ?? bookChapters[0] ?? null

  const startEditTitle = (c: Chapter) => setTitleDraft({ id: c.id, title: c.title })
  const saveTitle = () => {
    if (!titleDraft) return
    updateChapter(titleDraft.id, { title: titleDraft.title })
    pushStoreNow()
    setTitleDraft(null)
    message.success('章节标题已保存')
  }
  const startEditContent = () => current && setContentDraft(current.content)
  const saveContent = () => {
    if (!current || contentDraft === null) return
    updateChapter(current.id, { content: contentDraft, updatedAt: new Date().toISOString() })
    pushStoreNow()
    setContentDraft(null)
    message.success('正文已保存')
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回书库
        </Button>
        <Typography.Text type="secondary">书籍</Typography.Text>
        <Select
          style={{ minWidth: 260 }}
          value={bookId || undefined}
          onChange={changeBook}
          placeholder="选择书籍"
          options={books.map((b) => ({
            value: b.id,
            label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}）`,
          }))}
        />
        {book && (
          <Tag color={book.type === 'project' ? 'blue' : 'default'}>
            {book.type === 'project' ? '作品库' : '素材库'}
          </Tag>
        )}
      </Space>

      {!book || bookChapters.length === 0 ? (
        <Empty description={book ? '该书暂无章节' : '未选择书籍'} style={{ marginTop: 60 }}>
          <Button type="primary" onClick={() => navigate('/m1')}>
            去导入文本
          </Button>
        </Empty>
      ) : (
        <Row gutter={16}>
          {/* 左侧：章节列表（标题可编辑） */}
          <Col span={8}>
            <Typography.Title level={5} style={{ margin: '0 0 8px 0' }}>
              章节列表（{bookChapters.length}）
            </Typography.Title>
            <List
              size="small"
              bordered
              style={{ maxHeight: 600, overflow: 'auto' }}
              dataSource={bookChapters}
              renderItem={(c, i) => {
                const editing = titleDraft?.id === c.id
                return (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      background: current?.id === c.id ? '#e6f4ff' : undefined,
                      alignItems: 'flex-start',
                    }}
                    onClick={() => {
                      if (editing) return
                      setSelectedId(c.id)
                      setContentDraft(null)
                    }}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      {editing ? (
                        <Space.Compact style={{ width: '100%' }} onClick={(e) => e.stopPropagation()}>
                          <Input
                            size="small"
                            value={titleDraft!.title}
                            onChange={(e) => setTitleDraft({ ...titleDraft!, title: e.target.value })}
                          />
                          <Button size="small" type="primary" onClick={saveTitle}>
                            保存
                          </Button>
                          <Button size="small" onClick={() => setTitleDraft(null)}>
                            取消
                          </Button>
                        </Space.Compact>
                      ) : (
                        <Space size={6} style={{ width: '100%' }}>
                          <Typography.Text type="secondary">{i + 1}</Typography.Text>
                          <Typography.Text ellipsis style={{ maxWidth: 150 }} strong={current?.id === c.id}>
                            {c.title}
                          </Typography.Text>
                          <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditTitle(c)
                            }}
                          />
                          <Typography.Text type="secondary" style={{ marginLeft: 'auto', fontSize: 12 }}>
                            {c.content.length} 字
                          </Typography.Text>
                        </Space>
                      )}
                    </Space>
                  </List.Item>
                )
              }}
            />
          </Col>

          {/* 右侧：正文（可编辑） */}
          <Col span={16}>
            <Space style={{ marginBottom: 8 }} align="center">
              <Typography.Title level={5} style={{ margin: 0 }}>
                {current?.title ?? '—'}
              </Typography.Title>
              {current && contentDraft === null && (
                <Button size="small" icon={<EditOutlined />} onClick={startEditContent}>
                  编辑正文
                </Button>
              )}
              {current && contentDraft !== null && (
                <>
                  <Button size="small" type="primary" onClick={saveContent}>
                    保存
                  </Button>
                  <Button size="small" onClick={() => setContentDraft(null)}>
                    取消
                  </Button>
                </>
              )}
            </Space>
            {current ? (
              contentDraft !== null ? (
                <Input.TextArea
                  value={contentDraft}
                  onChange={(e) => setContentDraft(e.target.value)}
                  autoSize={{ minRows: 22, maxRows: 30 }}
                  style={{ fontFamily: 'monospace' }}
                />
              ) : (
                <div
                  className="prose-view"
                  style={{
                    maxHeight: 560,
                    overflow: 'auto',
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    padding: 12,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {current.content}
                </div>
              )
            ) : (
              <Typography.Text type="secondary">左侧选择章节</Typography.Text>
            )}
          </Col>
        </Row>
      )}
    </Space>
  )
}
