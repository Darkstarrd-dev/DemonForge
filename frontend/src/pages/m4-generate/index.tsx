import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Grid,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { FileAddOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useAppStore, genId } from '../../store/appStore'
import { generateChapterDraft } from '../../services/api'

export default function M4GeneratePage() {
  const screens = Grid.useBreakpoint()
  const { message, modal } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const outline = useAppStore((s) => s.outline)
  const chapters = useAppStore((s) => s.chapters)
  const scenes = useAppStore((s) => s.scenes)
  const fragments = useAppStore((s) => s.fragments)
  const cards = useAppStore((s) => s.cards)
  const setState = useAppStore((s) => s.setState)

  const bookOutline = outline.filter((o) => o.bookId === currentBookId).sort((a, b) => a.order - b.order)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null)
  const [selectedFragIds, setSelectedFragIds] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState('')

  const node = bookOutline.find((o) => o.id === nodeId) ?? null
  const summary = summaryDraft ?? node?.summary ?? ''

  // 前章摘要：取大纲顺序上一节点的已有章节开头，否则其大纲摘要
  const prevSummary = useMemo(() => {
    if (!node) return ''
    const prev = bookOutline.find((o) => o.order === node.order - 1)
    if (!prev) return '（本章为开篇，无前章）'
    const prevChapter = chapters.find((c) => c.outlineNodeId === prev.id)
    return prevChapter ? `${prevChapter.title}：${prevChapter.content.slice(0, 80)}…` : `（前章未成稿）大纲：${prev.summary}`
  }, [node, bookOutline, chapters])

  const adoptedFragments = useMemo(() => {
    const sceneIds = scenes.filter((s) => s.bookId === currentBookId).map((s) => s.id)
    return fragments
      .filter((f) => sceneIds.includes(f.sceneId) && f.adoptedText)
      .sort((a, b) => a.order - b.order)
  }, [fragments, scenes, currentBookId])

  const existingChapter = node ? chapters.find((c) => c.outlineNodeId === node.id) : null

  const run = async () => {
    if (!node) return
    setGenerating(true)
    setDraft('')
    const fragTexts = adoptedFragments
      .filter((f) => selectedFragIds.includes(f.id))
      .map((f) => f.adoptedText!)
    const result = await generateChapterDraft(
      { outlineTitle: node.title, outlineSummary: summary, fragments: fragTexts, prevSummary },
      setDraft,
    )
    setDraft(result)
    setGenerating(false)
    message.success('草稿生成完成（mock），可直接编辑后保存')
  }

  const save = () => {
    if (!node || !draft.trim()) return
    const now = new Date().toISOString()
    const doSave = () => {
      if (existingChapter) {
        setState({
          chapters: useAppStore.getState().chapters.map((c) =>
            c.id === existingChapter.id ? { ...c, content: draft, status: 'draft' as const, updatedAt: now } : c,
          ),
        })
      } else {
        const bookChapters = chapters.filter((c) => c.bookId === currentBookId)
        setState({
          chapters: [
            ...useAppStore.getState().chapters,
            {
              id: genId('ch'),
              bookId: currentBookId,
              index: Math.max(0, ...bookChapters.map((c) => c.index)) + 1,
              title: `第${'一二三四五六七八九十'[Math.max(0, ...bookChapters.map((c) => c.index))] ?? ''}章 ${node.title}`,
              content: draft,
              status: 'draft' as const,
              outlineNodeId: node.id,
              updatedAt: now,
            },
          ],
        })
      }
      message.success('已保存为草稿（M5 章节管理中可见，定稿后触发一致性检查）')
    }
    if (existingChapter) {
      modal.confirm({
        title: `大纲节点「${node.title}」已有章节`,
        content: `将覆盖《${existingChapter.title}》的内容并置为 draft 状态，确认？`,
        onOk: doSave,
      })
    } else {
      doSave()
    }
  }

  return (
    <div data-slot="m4-generate" style={{ maxWidth: '100%', width: '100%' }}>
      <Row gutter={[16, 16]}>
      <Col xs={24} lg={9} style={{ marginBottom: screens.lg ? 0 : 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card data-slot="context-panel" size="small" title="大纲节点">
            <Select
              data-slot="select-chapter"
              style={{ width: '100%' }}
              placeholder="选择本章对应的大纲节点"
              value={nodeId}
              onChange={(v) => {
                setNodeId(v)
                setSummaryDraft(null)
                setDraft('')
              }}
              options={[...new Set(bookOutline.map((o) => o.volume))].map((vol) => ({
                label: vol,
                title: vol,
                options: bookOutline
                  .filter((o) => o.volume === vol)
                  .map((o) => ({
                    value: o.id,
                    label: `${o.order}. ${o.title}${chapters.some((c) => c.outlineNodeId === o.id) ? '（已有章节）' : ''}`,
                  })),
              }))}
            />
            {node && (
              <>
                <Typography.Title level={5} style={{ marginTop: 12 }}>
                  本章大纲（可编辑）
                </Typography.Title>
                <Input.TextArea
                  data-slot="editor-summary"
                  value={summary}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  autoSize={{ minRows: 3 }}
                />
              </>
            )}
          </Card>

          {node && (
            <>
              <Card size="small" title="前章摘要（自动带出）">
                <Typography.Text type="secondary">{prevSummary}</Typography.Text>
              </Card>
              <Card
                data-slot="fragment-panel"
                size="small"
                title={
                  <span>
                    已采纳推演片段 <Tag color="red">硬约束：关键对话与动作逐字保留</Tag>
                  </span>
                }
              >
                {adoptedFragments.length === 0 ? (
                  <Typography.Text type="secondary">
                    暂无已采纳片段——到 M3 推演并采纳后，这里可勾选作为本章硬约束。
                  </Typography.Text>
                ) : (
                  <Checkbox.Group
                    data-slot="checkbox-group"
                    style={{ width: '100%' }}
                    value={selectedFragIds}
                    onChange={(v) => setSelectedFragIds(v as string[])}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {adoptedFragments.map((f) => {
                        const c = cards.find((x) => x.id === f.characterId)
                        return (
                          <Checkbox key={f.id} value={f.id} style={{ alignItems: 'flex-start' }}>
                            <Typography.Text strong>{c?.name}</Typography.Text>
                            <Typography.Paragraph
                              type="secondary"
                              ellipsis={{ rows: 2 }}
                              style={{ fontSize: 13, marginBottom: 0 }}
                            >
                              {f.adoptedText}
                            </Typography.Paragraph>
                          </Checkbox>
                        )
                      })}
                    </Space>
                  </Checkbox.Group>
                )}
              </Card>
              <Button
                data-slot="btn-draft"
                type="primary"
                size="large"
                block
                icon={<ThunderboltOutlined />}
                loading={generating}
                onClick={run}
              >
                {generating ? '生成中…' : `生成章节草稿（引用 ${selectedFragIds.length} 个片段，mock 流式）`}
              </Button>
            </>
          )}
        </Space>
      </Col>

      <Col xs={24} lg={15}>
        <Card
          data-slot="output-panel"
          size="small"
          title="章节草稿"
          extra={
            <Button data-slot="btn-save" type="primary" icon={<FileAddOutlined />} disabled={!draft.trim() || generating} onClick={save}>
              保存为草稿（入 M5）
            </Button>
          }
        >
          {existingChapter && (
            <Alert
              style={{ marginBottom: 8 }}
              type="info"
              showIcon
              message={`该大纲节点已有章节《${existingChapter.title}》（${existingChapter.status}），保存将覆盖。`}
            />
          )}
          {generating ? (
            <div data-slot="stream-text" className="stream-pane" style={{ minHeight: 320, maxHeight: 480 }}>
              {draft || '等待生成…'}
            </div>
          ) : (
            <Input.TextArea
              data-slot="editor-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="生成后在此编辑，或直接手写"
              autoSize={{ minRows: 20, maxRows: 26 }}
            />
          )}
        </Card>
      </Col>
    </Row>
    </div>
  )
}
