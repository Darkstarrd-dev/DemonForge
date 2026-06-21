import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Input,
  List,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { checkConsistency } from '../../services/api'
import type { Chapter, ChapterStatus, ConsistencyIssue, StateEventType } from '../../services/types'

const STATUS_COLORS: Record<ChapterStatus, string> = {
  raw: 'default',
  cleaned: 'cyan',
  draft: 'gold',
  final: 'green',
}

const EVENT_META: Record<StateEventType, { label: string; color: string }> = {
  location: { label: '位置', color: 'blue' },
  relationship: { label: '关系', color: 'purple' },
  injury: { label: '伤势', color: 'orange' },
  possession: { label: '持有物', color: 'cyan' },
  death: { label: '死亡', color: 'red' },
  other: { label: '其他', color: 'default' },
}

export default function M5ChaptersPage() {
  const { message } = App.useApp()
  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const cards = useAppStore((s) => s.cards)
  const outline = useAppStore((s) => s.outline)
  const stateEvents = useAppStore((s) => s.stateEvents)
  const issues = useAppStore((s) => s.issues)
  const currentBookId = useAppStore((s) => s.currentBookId)
  const setState = useAppStore((s) => s.setState)
  const updateChapter = useAppStore((s) => s.updateChapter)
  const updateIssue = useAppStore((s) => s.updateIssue)

  const [bookId, setBookId] = useState(currentBookId)
  const [viewing, setViewing] = useState<Chapter | null>(null)
  const [editText, setEditText] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [report, setReport] = useState<{ chapter: Chapter; issues: ConsistencyIssue[] } | null>(null)
  const [eventFilter, setEventFilter] = useState<string | null>(null)

  const bookChapters = chapters.filter((c) => c.bookId === bookId).sort((a, b) => a.index - b.index)
  const bookEvents = stateEvents.filter((e) => e.bookId === bookId)
  const filteredEvents = eventFilter ? bookEvents.filter((e) => e.entityId === eventFilter) : bookEvents
  const eventEntities = [...new Set(bookEvents.map((e) => e.entityId))]
    .map((id) => cards.find((c) => c.id === id))
    .filter(Boolean)

  const runCheck = async (chapter: Chapter, thenFinalize: boolean) => {
    setCheckingId(chapter.id)
    const result = await checkConsistency(bookId, chapter, cards, stateEvents, issues)
    // 本章 open issues 以本次结果为准（已忽略/已处理的保留）
    setState({
      issues: [
        ...useAppStore.getState().issues.filter((i) => i.chapterId !== chapter.id || i.status !== 'open'),
        ...result,
      ],
    })
    if (thenFinalize) {
      updateChapter(chapter.id, { status: 'final', updatedAt: new Date().toISOString() })
      message.success(`《${chapter.title}》已定稿（检查不阻断定稿，报告供人工处理）`)
    }
    setCheckingId(null)
    setReport({ chapter: { ...chapter, status: thenFinalize ? 'final' : chapter.status }, issues: result })
  }

  const columns = [
    { title: '#', dataIndex: 'index', width: 50 },
    {
      title: '标题',
      dataIndex: 'title',
      render: (v: string, c: Chapter) => (
        <Typography.Link
          onClick={() => {
            setViewing(c)
            setEditText(null)
          }}
        >
          {v}
        </Typography.Link>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: ChapterStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    { title: '字数', width: 80, render: (_: unknown, c: Chapter) => c.content.length },
    {
      title: '大纲节点',
      width: 140,
      render: (_: unknown, c: Chapter) => {
        const node = outline.find((o) => o.id === c.outlineNodeId)
        return node ? `${node.volume} · ${node.title}` : '—'
      },
    },
    {
      title: '冲突',
      width: 80,
      render: (_: unknown, c: Chapter) => {
        const open = issues.filter((i) => i.chapterId === c.id && i.status === 'open')
        if (!open.length) return <Typography.Text type="secondary">—</Typography.Text>
        return (
          <Tag
            color={open.some((i) => i.level === 'error') ? 'red' : 'orange'}
            style={{ cursor: 'pointer' }}
            onClick={() => setReport({ chapter: c, issues: open })}
          >
            {open.length} 项
          </Tag>
        )
      },
    },
    { title: '更新', dataIndex: 'updatedAt', width: 110, render: (v: string) => v.slice(0, 10) },
    {
      title: '操作',
      width: 230,
      render: (_: unknown, c: Chapter) => (
        <Space size="small">
          {c.status === 'draft' && (
            <Button
              size="small"
              type="primary"
              icon={<SafetyCertificateOutlined />}
              loading={checkingId === c.id}
              onClick={() => runCheck(c, true)}
            >
              定稿+检查
            </Button>
          )}
          <Button
            size="small"
            icon={<FileSearchOutlined />}
            loading={checkingId === c.id}
            onClick={() => runCheck(c, false)}
          >
            手动检查
          </Button>
          {c.status === 'final' && (
            <Button size="small" onClick={() => updateChapter(c.id, { status: 'draft' })}>
              退回草稿
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const chaptersTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space>
        <Typography.Text type="secondary">书籍</Typography.Text>
        <Select
          style={{ minWidth: 200 }}
          value={bookId}
          onChange={setBookId}
          options={books.map((b) => ({
            value: b.id,
            label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}）`,
          }))}
        />
        <Alert
          type="info"
          showIcon
          style={{ padding: '2px 10px' }}
          message="演示默认：定稿自动触发检查 + 可随时手动检查（最终方案待 DESIGN §7 问题 3 拍板）；检查不阻断定稿。"
        />
      </Space>
      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={bookChapters}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
    </Space>
  )

  const timelineTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space>
        <Typography.Text type="secondary">按角色筛选</Typography.Text>
        <Select
          style={{ minWidth: 180 }}
          allowClear
          placeholder="全部角色"
          value={eventFilter}
          onChange={setEventFilter}
          options={eventEntities.map((c) => ({ value: c!.id, label: c!.name }))}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          正式版：章节定稿后由 AI 抽取「状态变更事件」入时间线，反哺 M3 推演上下文（取角色当前状态）与本页一致性检查。
        </Typography.Text>
      </Space>
      <Card size="small" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <Timeline
          items={filteredEvents.map((e) => {
            const entity = cards.find((c) => c.id === e.entityId)
            const ch = chapters.find((c) => c.id === e.chapterId)
            const meta = EVENT_META[e.eventType]
            return {
              color: meta.color === 'red' ? 'red' : meta.color === 'default' ? 'gray' : 'blue',
              children: (
                <Space direction="vertical" size={0}>
                  <Space size={6}>
                    <Tag color={meta.color}>{meta.label}</Tag>
                    <Typography.Text strong>{entity?.name ?? e.entityId}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {ch?.title ?? e.chapterId}
                    </Typography.Text>
                  </Space>
                  <Typography.Text>{e.description}</Typography.Text>
                </Space>
              ),
            }
          })}
        />
      </Card>
    </Space>
  )

  return (
    <>
      <Tabs
        items={[
          { key: 'chapters', label: '章节管理', children: chaptersTab },
          { key: 'timeline', label: `状态时间线（${bookEvents.length}）`, children: timelineTab },
        ]}
      />

      {/* 章节详情/编辑 */}
      <Drawer
        title={viewing?.title}
        width={Math.min(640, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 640)}
        open={!!viewing}
        onClose={() => {
          setViewing(null)
          setEditText(null)
        }}
        extra={
          viewing && editText === null ? (
            <Button onClick={() => setEditText(viewing.content)}>编辑</Button>
          ) : viewing ? (
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  updateChapter(viewing.id, {
                    content: editText!,
                    updatedAt: new Date().toISOString(),
                    ...(viewing.status === 'final' ? { status: 'draft' as const } : {}),
                  })
                  setViewing({ ...viewing, content: editText! })
                  setEditText(null)
                  message.success(viewing.status === 'final' ? '已保存（定稿章节被修改，状态退回 draft）' : '已保存')
                }}
              >
                保存
              </Button>
              <Button onClick={() => setEditText(null)}>取消</Button>
            </Space>
          ) : null
        }
      >
        {viewing && editText === null && (
          <div className="prose-view">{viewing.content}</div>
        )}
        {viewing && editText !== null && (
          <Input.TextArea value={editText} onChange={(e) => setEditText(e.target.value)} autoSize={{ minRows: 20 }} />
        )}
      </Drawer>

      {/* 一致性报告 */}
      <Drawer
        title={
          report && (
            <Space>
              <SafetyCertificateOutlined />
              一致性检查报告：{report.chapter.title}
            </Space>
          )
        }
        width={Math.min(600, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 600)}
        width={600}
        open={!!report}
        onClose={() => setReport(null)}
      >
        {report &&
          (report.issues.length === 0 ? (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="未发现冲突"
              description="本章与设定卡片、状态时间线比对未见矛盾（mock 检查：预置样例 + 已死亡角色出场规则）。"
            />
          ) : (
            <List
              dataSource={report.issues}
              renderItem={(issue) => {
                const live = issues.find((i) => i.id === issue.id) ?? issue
                return (
                  <List.Item style={{ display: 'block' }}>
                    <Card
                      size="small"
                      style={{ opacity: live.status === 'open' ? 1 : 0.55 }}
                      title={
                        <Space>
                          {live.level === 'error' ? (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                          ) : (
                            <WarningOutlined style={{ color: '#faad14' }} />
                          )}
                          <Tag color={live.level === 'error' ? 'red' : 'orange'}>{live.type}</Tag>
                          {live.status !== 'open' && <Tag>{live.status === 'ignored' ? '已忽略' : '已处理'}</Tag>}
                        </Space>
                      }
                      extra={
                        live.status === 'open' && (
                          <Space size="small">
                            <Button size="small" onClick={() => updateIssue(live.id, { status: 'ignored' })}>
                              忽略
                            </Button>
                            <Button size="small" type="primary" onClick={() => updateIssue(live.id, { status: 'resolved' })}>
                              标记已处理
                            </Button>
                          </Space>
                        )
                      }
                    >
                      <Typography.Paragraph>{live.description}</Typography.Paragraph>
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
                        建议：{live.suggestion}
                      </Typography.Paragraph>
                      <Space size={4} wrap>
                        涉及卡片：
                        {live.relatedCardIds.map((id) => {
                          const c = cards.find((x) => x.id === id)
                          return c ? <Tag key={id}>{c.name}</Tag> : null
                        })}
                      </Space>
                    </Card>
                  </List.Item>
                )
              }}
            />
          ))}
      </Drawer>
    </>
  )
}
