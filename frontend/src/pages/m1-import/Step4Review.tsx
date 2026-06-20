import { useMemo, useState } from 'react'
import {
  App,
  Alert,
  Badge,
  Button,
  Checkbox,
  Col,
  Form,
  Input,
  List,
  Modal,
  Radio,
  Row,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  RedoOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useAppStore, genId, pushStoreNowChecked } from '../../store/appStore'
import { alignedDiff, applyLineDecisions } from '../../utils/alignedDiff'
import DiffView from './DiffView'
import type { BookType, Chapter, CleanStatus, ImportChapter, LineDecision } from '../../services/types'

const STATUS_META: Record<CleanStatus, { icon: React.ReactNode; text: string; color: string }> = {
  pending: { icon: <ClockCircleOutlined />, text: '待处理', color: 'default' },
  processing: { icon: <SyncOutlined spin />, text: '处理中', color: 'processing' },
  completed: { icon: <CheckCircleOutlined />, text: '待审核', color: 'warning' },
  accepted: { icon: <CheckCircleOutlined />, text: '已接受', color: 'success' },
  rejected: { icon: <CloseCircleOutlined />, text: '已拒绝', color: 'error' },
  failed: { icon: <CloseCircleOutlined />, text: '失败', color: 'error' },
  needsReprocess: { icon: <RedoOutlined />, text: '待重处理', color: 'magenta' },
}

export default function Step4Review() {
  const { message, modal } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const books = useAppStore((s) => s.books)
  const allChapters = useAppStore((s) => s.chapters)
  const cleanRunning = useAppStore((s) => s.cleanRun?.running ?? false)
  const setState = useAppStore((s) => s.setState)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [storeOpen, setStoreOpen] = useState(false)
  const [editDraft, setEditDraft] = useState<{ field: 'content' | 'cleanedContent'; text: string } | null>(null)
  const [form] = Form.useForm<{ title: string; type: BookType }>()
  const [rejectNodeOpen, setRejectNodeOpen] = useState(false)
  const [rejectNodeIds, setRejectNodeIds] = useState<string[]>([])

  const chapters = useMemo(() => session?.chapters ?? [], [session?.chapters])
  const current = useMemo(() => chapters.find((c) => c.id === selectedId) ?? chapters[0] ?? null, [chapters, selectedId])

  const rejectNodeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of chapters) {
      if (c.processedByNode && c.cleanStatus === 'completed' && !map.has(c.processedByNode.nodeId)) {
        map.set(c.processedByNode.nodeId, c.processedByNode.nodeName)
      }
    }
    return Array.from(map, ([nodeId, nodeName]) => ({ label: nodeName, value: nodeId }))
  }, [chapters])

  const patchChapter = (id: string, patch: Partial<ImportChapter>) => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })
  }

  if (!session) return null

  const computeFinal = (ch: ImportChapter): string => {
    if (!ch.cleanedContent) return ch.content
    const r = alignedDiff(ch.content, ch.cleanedContent)
    return applyLineDecisions(r, ch.lineDecisions)
  }

  const acceptChapter = (ch: ImportChapter) => {
    patchChapter(ch.id, { cleanStatus: 'accepted', finalText: computeFinal(ch) })
    // 自动跳到下一个待审核章
    const next = chapters.find((c) => c.id !== ch.id && c.cleanStatus === 'completed')
    if (next) setSelectedId(next.id)
    message.success(`已接受「${ch.title}」（行级决策已应用）`)
  }

  const rejectChapter = (ch: ImportChapter) => {
    patchChapter(ch.id, {
      cleanStatus: 'rejected',
      cleanedContent: undefined,
      finalText: undefined,
      lineDecisions: {},
    })
    message.info('已拒绝清理结果，该章将以原文入库')
  }

  const markReprocess = (ch: ImportChapter) => {
    patchChapter(ch.id, {
      cleanStatus: 'needsReprocess',
      cleanedContent: undefined,
      finalText: undefined,
      lineDecisions: {},
    })
    message.info('已标记重新处理：返回上一步将优先清理该章')
  }

  const acceptAll = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    let count = 0
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => {
          if (c.cleanStatus === 'completed' && c.cleanedContent) {
            count++
            return { ...c, cleanStatus: 'accepted' as const, finalText: computeFinal(c) }
          }
          return c
        }),
      },
    })
    message.success(`已全部接受 ${count} 章`)
  }

  const rejectAll = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    let count = 0
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => {
          if (c.cleanStatus === 'completed') {
            count++
            return { ...c, cleanStatus: 'rejected' as const, cleanedContent: undefined, finalText: undefined, lineDecisions: {}, processedByNode: undefined }
          }
          return c
        }),
      },
    })
    message.success(`已全部拒绝 ${count} 章`)
  }

  const rejectByNode = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    let count = 0
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => {
          if (c.cleanStatus === 'completed' && c.processedByNode && rejectNodeIds.includes(c.processedByNode.nodeId)) {
            count++
            return { ...c, cleanStatus: 'rejected' as const, cleanedContent: undefined, finalText: undefined, lineDecisions: {}, processedByNode: undefined }
          }
          return c
        }),
      },
    })
    setRejectNodeOpen(false)
    setRejectNodeIds([])
    message.success(`已拒绝 ${count} 章（${rejectNodeIds.length} 个节点）`)
  }

  const onDecide = (rowIdx: number, decision: LineDecision | null) => {
    if (!current) return
    const next = { ...current.lineDecisions }
    if (decision === null) delete next[rowIdx]
    else next[rowIdx] = decision
    patchChapter(current.id, { lineDecisions: next })
  }

  const doStore = async () => {
    const { title, type } = await form.validateFields()
    const notReviewed = chapters.filter(
      (c) => c.cleanStatus !== 'accepted' && c.cleanStatus !== 'rejected',
    ).length
    const proceed = async () => {
      const bookId = genId('book')
      const now = new Date().toISOString()
      const newChapters: Chapter[] = chapters.map((c, i) => ({
        id: genId('ch'),
        bookId,
        index: i + 1,
        title: c.title,
        content: c.cleanStatus === 'accepted' ? (c.finalText ?? c.content) : c.content,
        status: 'cleaned',
        updatedAt: now,
      }))
      setState({
        books: [...books, { id: bookId, title, type, createdAt: now }],
        chapters: [...allChapters, ...newChapters],
        importSession: null,
      })
      setStoreOpen(false)
      // 入库是关键写操作 → await 立即落库（绕过 1s debounce），确认写完再提示成功。
      // 用 pushStoreNowChecked（失败抛错，不吞）：后端 413（body 超限）/ 5xx / 断网会抛错，
      // 避免误报「已入库」实际只活在内存、重启后消失。
      try {
        await pushStoreNowChecked()
        // 入库成功 → 清理持久化的导入会话文件（进度数据已转为正式章节）
        fetch('/api/import-session', { method: 'DELETE' }).catch(() => {})
        message.success(`已入库《${title}》共 ${newChapters.length} 章（状态 cleaned）。可到 M2 提取设定、M5 查看章节。`)
      } catch (e) {
        message.error(`入库失败：${e instanceof Error ? e.message : String(e)}。数据未保存，请重试或检查章节内容大小。`)
        // 入库失败 → 撤回内存中的入库操作，避免「看似入库」的假象
        setState({ books, chapters: allChapters, importSession: session })
      }
    }
    if (notReviewed > 0) {
      modal.confirm({
        title: `${notReviewed} 章尚未审核`,
        content: '未接受清理结果的章节将以原文入库，确认继续？',
        onOk: proceed,
      })
    } else {
      await proceed()
    }
  }

  return (
    <>
      {cleanRunning && (
        <Alert
          type="info"
          showIcon
          message="文本清理任务正在后台运行，章节状态会实时更新"
          style={{ marginBottom: 12 }}
        />
      )}
      <Row gutter={16}>
      <Col span={7}>
        <Space style={{ marginBottom: 8 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            章节（{chapters.length}）
          </Typography.Title>
          <Button type="primary" size="small" icon={<DatabaseOutlined />} onClick={() => setStoreOpen(true)}>
            全部入库
          </Button>
          <Button size="small" onClick={acceptAll}>全部接受</Button>
          <Button size="small" onClick={rejectAll}>全部拒绝</Button>
          <Button size="small" onClick={() => setRejectNodeOpen(true)}>拒绝指定节点</Button>
        </Space>
        <List
          size="small"
          bordered
          style={{ maxHeight: 560, overflow: 'auto' }}
          dataSource={chapters}
          renderItem={(c, i) => {
            const meta = STATUS_META[c.cleanStatus]
            return (
              <List.Item
                style={{ cursor: 'pointer', background: current?.id === c.id ? '#e6f4ff' : undefined }}
                onClick={() => setSelectedId(c.id)}
              >
                <Space size={6}>
                  <Typography.Text type="secondary">{i + 1}</Typography.Text>
                  <Typography.Text ellipsis style={{ maxWidth: 150 }}>
                    {c.title}
                  </Typography.Text>
                </Space>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {c.processedByNode && (
                  <Tag color="purple" style={{ fontSize: 11 }}>
                    {c.processedByNode.nodeName}
                  </Tag>
                )}
                <Tag icon={meta.icon} color={meta.color}>
                  {meta.text}
                </Tag>
              </div>
              </List.Item>
            )
          }}
        />
      </Col>
      <Col span={17}>
        {current ? (
          <>
            <Space style={{ marginBottom: 8 }} wrap>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {current.title}
              </Typography.Title>
              <Button
                size="small"
                type="primary"
                disabled={!current.cleanedContent}
                onClick={() => acceptChapter(current)}
              >
                整章接受
              </Button>
              <Button size="small" disabled={!current.cleanedContent} onClick={() => rejectChapter(current)}>
                整章拒绝
              </Button>
              <Button size="small" onClick={() => markReprocess(current)}>
                标记重新处理
              </Button>
              {Object.keys(current.lineDecisions).length > 0 && (
                <Badge count={Object.keys(current.lineDecisions).length} color="blue" overflowCount={999}>
                  <Tag color="blue">行级决策</Tag>
                </Badge>
              )}
            </Space>
            <Tabs
              defaultActiveKey={current.cleanedContent ? 'diff' : 'original'}
              items={[
                {
                  key: 'original',
                  label: '原文',
                  children: (
                    <EditablePane
                      text={current.content}
                      editing={editDraft?.field === 'content' ? editDraft.text : null}
                      onStart={() => setEditDraft({ field: 'content', text: current.content })}
                      onChange={(t) => setEditDraft({ field: 'content', text: t })}
                      onSave={() => {
                        patchChapter(current.id, { content: editDraft!.text })
                        setEditDraft(null)
                        message.success('原文已保存')
                      }}
                      onCancel={() => setEditDraft(null)}
                    />
                  ),
                },
                {
                  key: 'cleaned',
                  label: '清理后',
                  disabled: !current.cleanedContent,
                  children: current.cleanedContent ? (
                    <EditablePane
                      text={current.cleanedContent}
                      editing={editDraft?.field === 'cleanedContent' ? editDraft.text : null}
                      onStart={() => setEditDraft({ field: 'cleanedContent', text: current.cleanedContent! })}
                      onChange={(t) => setEditDraft({ field: 'cleanedContent', text: t })}
                      onSave={() => {
                        patchChapter(current.id, { cleanedContent: editDraft!.text, lineDecisions: {} })
                        setEditDraft(null)
                        message.success('清理结果已保存（行级决策已重置）')
                      }}
                      onCancel={() => setEditDraft(null)}
                    />
                  ) : null,
                },
                {
                  key: 'diff',
                  label: '对比审核',
                  disabled: !current.cleanedContent,
                  children: current.cleanedContent ? (
                    <DiffView
                      key={current.id}
                      original={current.content}
                      cleaned={current.cleanedContent}
                      decisions={current.lineDecisions}
                      onDecide={onDecide}
                    />
                  ) : null,
                },
              ]}
            />
            {current.cleanedContent && current.cleanStatus === 'accepted' && (
              <Typography.Text type="secondary">
                已接受：最终文本 {current.finalText?.length ?? 0} 字（行级决策已应用，入库使用该结果）
              </Typography.Text>
            )}
          </>
        ) : (
          <Typography.Text type="secondary">左侧选择章节</Typography.Text>
        )}
      </Col>

      <Modal
        title="入库"
        open={storeOpen}
        onOk={doStore}
        onCancel={() => setStoreOpen(false)}
        okText="确认入库"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ title: session.fileName.replace(/\.txt$/i, ''), type: 'reference' }}
          style={{ marginTop: 8 }}
        >
          <Form.Item name="title" label="书名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="归属库" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="reference">素材库（他人作品参考）</Radio>
              <Radio value="project">作品库（自己的创作）</Radio>
            </Radio.Group>
          </Form.Item>
          <Typography.Text type="secondary">
            已接受章节使用「清理结果 + 行级决策」生成的最终文本；其余章节以原文入库。章节状态均为 cleaned。
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title="拒绝指定节点"
        open={rejectNodeOpen}
        onOk={rejectByNode}
        onCancel={() => {
          setRejectNodeOpen(false)
          setRejectNodeIds([])
        }}
        okText="确认拒绝"
        okButtonProps={{ disabled: rejectNodeIds.length === 0 }}
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          勾选要拒绝的节点，这些节点处理的所有「待审核」章节将被标记为拒绝（以原文入库）。
        </Typography.Text>
        <Checkbox.Group
          value={rejectNodeIds}
          onChange={(v) => setRejectNodeIds(v as string[])}
          options={rejectNodeOptions}
        />
      </Modal>
    </Row>
    </>
  )
}

function EditablePane(props: {
  text: string
  editing: string | null
  onStart: () => void
  onChange: (t: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  if (props.editing !== null) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input.TextArea
          value={props.editing}
          onChange={(e) => props.onChange(e.target.value)}
          autoSize={{ minRows: 16, maxRows: 24 }}
        />
        <Space>
          <Button type="primary" size="small" onClick={props.onSave}>
            保存
          </Button>
          <Button size="small" onClick={props.onCancel}>
            取消
          </Button>
        </Space>
      </Space>
    )
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div
        className="prose-view"
        style={{ maxHeight: 440, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}
      >
        {props.text}
      </div>
      <Button size="small" onClick={props.onStart}>
        编辑
      </Button>
    </Space>
  )
}
