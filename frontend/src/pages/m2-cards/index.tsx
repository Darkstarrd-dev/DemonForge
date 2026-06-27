import { useMemo, useState } from 'react'
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  List,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ExperimentOutlined,
  MergeCellsOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { useAppStore, pushStoreNow } from '../../store/appStore'
import { extractEntities } from '../../services/api'
import type { CardImage, EntityCard, EntityType } from '../../services/types'
import type { ExtractProgress } from '../../services/api'
import CardEditorModal from './CardEditorModal'
import ImageBatchModal from './ImageBatchModal'

const TYPE_META: Record<EntityType, { label: string; color: string }> = {
  character: { label: '人物', color: 'blue' },
  location: { label: '地点', color: 'green' },
  item: { label: '物品', color: 'orange' },
  skill: { label: '技能', color: 'purple' },
  faction: { label: '势力', color: 'red' },
}

export default function M2CardsPage() {
  const { message } = App.useApp()
  const cards = useAppStore((s) => s.cards)
  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const currentBookId = useAppStore((s) => s.currentBookId)
  const mergeCandidates = useAppStore((s) => s.mergeCandidates)
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const setState = useAppStore((s) => s.setState)
  const updateCard = useAppStore((s) => s.updateCard)

  const [scope, setScope] = useState<'project' | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<EntityType | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [refModal, setRefModal] = useState<{ chapterId: string; excerpt: string } | null>(null)
  const [extractOpen, setExtractOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null)
  const [activeTab, setActiveTab] = useState<'cards' | 'merge'>('cards')
  const [newIds, setNewIds] = useState<string[]>([])
  const [cardEditor, setCardEditor] = useState<{ mode: 'manual' | 'ai' } | null>(null)
  const [batchCardId, setBatchCardId] = useState<string | null>(null)
  const [extractForm] = Form.useForm<{ bookId: string }>()
  const [editForm] = Form.useForm()

  const defaultTextNodeId = moduleMapping.m2Extract?.nodeId ?? undefined
  const defaultImageNodeId = providers.find((p) => p.nodeType === 'image' && p.enabled)?.id ?? undefined

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (scope === 'project' && c.bookId !== currentBookId) return false
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (
        keyword &&
        !c.name.includes(keyword) &&
        !c.aliases.some((a) => a.includes(keyword)) &&
        !c.description.includes(keyword)
      )
        return false
      return true
    })
  }, [cards, scope, typeFilter, keyword, currentBookId])

  const detail = cards.find((c) => c.id === detailId) ?? null
  const pendingMerges = mergeCandidates.filter((m) => m.status === 'pending')

  const runExtract = async () => {
    const { bookId } = await extractForm.validateFields()
    setExtracting(true)
    setExtractProgress(null)
    try {
      const bookChapters = chapters.filter((c) => c.bookId === bookId)
      const existing = cards.map((c) => c.name)
      const result = await extractEntities(
        bookId,
        bookChapters,
        existing,
        (progress) => setExtractProgress(progress),
      )
      if (result.cards.length === 0) {
        message.info('未提取到新实体（已有卡片覆盖，或章节中无可识别实体）')
      } else {
        setState({
          cards: [...useAppStore.getState().cards, ...result.cards],
          mergeCandidates: [...useAppStore.getState().mergeCandidates, ...result.mergeCandidates],
        })
        setNewIds(result.cards.map((c) => c.id))
        message.success(`提取到 ${result.cards.length} 张新卡片`)
        if (result.mergeCandidates.length > 0) {
          message.info(`发现 ${result.mergeCandidates.length} 组潜在重复实体，已自动跳转到合并裁决`)
          setActiveTab('merge')
        }
      }
    } catch (err) {
      message.error(`提取失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExtracting(false)
      setExtractProgress(null)
      setExtractOpen(false)
    }
  }

  const doMerge = (mergeId: string, action: 'merged' | 'kept') => {
    const m = mergeCandidates.find((x) => x.id === mergeId)
    if (!m) return
    if (action === 'merged') {
      const a = cards.find((c) => c.id === m.cardAId)
      const b = cards.find((c) => c.id === m.cardBId)
      if (a && b) {
        updateCard(a.id, {
          aliases: [...new Set([...a.aliases, b.name, ...b.aliases])],
          refs: [...a.refs, ...b.refs],
        })
        setState({
          cards: useAppStore.getState().cards.filter((c) => c.id !== b.id),
          mergeCandidates: mergeCandidates.map((x) => (x.id === mergeId ? { ...x, status: 'merged' } : x)),
        })
        message.success(`已合并：「${b.name}」并入「${a.name}」（别名与出处已迁移）`)
        return
      }
    }
    setState({
      mergeCandidates: mergeCandidates.map((x) => (x.id === mergeId ? { ...x, status: 'kept' } : x)),
    })
    message.info('已保持独立')
  }

  const saveEdit = async () => {
    const values = await editForm.validateFields()
    updateCard(detail!.id, {
      name: values.name,
      aliases: values.aliases,
      description: values.description,
      styleNote: values.styleNote,
      styleExamples: (values.styleExamples as string | undefined)
        ?.split('\n')
        .filter((s: string) => s.trim()),
      updatedAt: new Date().toISOString(),
    })
    setEditing(false)
    message.success('卡片已保存')
  }

  const handleCardSaved = (card: EntityCard) => {
    setState({ cards: [...useAppStore.getState().cards, card] })
    pushStoreNow()
    setCardEditor(null)
    setNewIds([card.id])
    setDetailId(card.id)
    setEditing(false)
    message.success(`已新增卡片「${card.name}」`)
  }

  const handleSaveImage = (cardId: string, img: CardImage) => {
    const c = useAppStore.getState().cards.find((x) => x.id === cardId)
    if (!c) return
    updateCard(cardId, { images: [...(c.images ?? []), img], updatedAt: new Date().toISOString() })
    pushStoreNow()
  }

  const handleDeleteImage = (cardId: string, imgId: string) => {
    const c = useAppStore.getState().cards.find((x) => x.id === cardId)
    if (!c) return
    updateCard(cardId, { images: (c.images ?? []).filter((i) => i.id !== imgId), updatedAt: new Date().toISOString() })
    pushStoreNow()
  }

  // 下载归档图片：经 fetch→blob 触发（走 Electron 下被 patch 的 fetch），保留原文件扩展名。
  const downloadImage = async (url: string) => {
    try {
      const blob = await (await fetch(url)).blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      // eslint-disable-next-line react-hooks/purity -- 下载处理器内生成文件名兜底，非渲染期
      a.download = decodeURIComponent(url.split('/').pop() || `image-${Date.now()}`)
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      message.error('下载失败')
    }
  }

  const cardsTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space data-slot="filter-panel" wrap>
        <Radio.Group
          data-slot="select-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: 'project', label: '仅当前作品' },
            { value: 'all', label: '含素材库（全部书）' },
          ]}
          optionType="button"
        />
        <Select
          data-slot="select-type"
          style={{ minWidth: 120 }}
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: '全部类型' },
            ...Object.entries(TYPE_META).map(([v, m]) => ({ value: v, label: m.label })),
          ]}
        />
        <Input.Search
          data-slot="input-search"
          placeholder="搜索名称/别名/描述（正式版为语义检索）"
          style={{ width: 280 }}
          allowClear
          onSearch={setKeyword}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <Button data-slot="btn-extract" type="primary" icon={<ExperimentOutlined />} onClick={() => setExtractOpen(true)}>
          从章节提取设定
        </Button>
        <Button data-slot="btn-add-manual" icon={<PlusOutlined />} onClick={() => setCardEditor({ mode: 'manual' })}>
          手动新增
        </Button>
        <Button data-slot="btn-add-ai" icon={<ThunderboltOutlined />} onClick={() => setCardEditor({ mode: 'ai' })}>
          AI 生成
        </Button>
      </Space>
      {filtered.length === 0 ? (
        <Empty description="无匹配卡片" />
      ) : (
        <Row data-slot="list-panel" gutter={[12, 12]}>
          {filtered.map((c) => {
            const book = books.find((b) => b.id === c.bookId)
            return (
              <Col key={c.id} xs={24} sm={12} lg={8} xl={6}>
                <Badge.Ribbon
                  text="新提取"
                  color="volcano"
                  style={{ display: newIds.includes(c.id) ? undefined : 'none' }}
                >
                  <Card
                    data-slot={`card-${c.id}`}
                    size="small"
                    hoverable
                    onClick={() => {
                      setDetailId(c.id)
                      setEditing(false)
                    }}
                    title={
                      <Space size={6}>
                        <Tag color={TYPE_META[c.type].color} style={{ margin: 0 }}>
                          {TYPE_META[c.type].label}
                        </Tag>
                        {c.name}
                      </Space>
                    }
                    extra={
                      <Tag color={book?.type === 'project' ? 'blue' : 'default'} style={{ margin: 0 }}>
                        {book?.title}
                      </Tag>
                    }
                  >
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>
                      {c.description}
                    </Typography.Paragraph>
                    {c.aliases.length > 0 && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        别名：{c.aliases.join(' / ')}
                      </Typography.Text>
                    )}
                  </Card>
                </Badge.Ribbon>
              </Col>
            )
          })}
        </Row>
      )}
    </Space>
  )

  const mergeTab = (
    <List
      dataSource={pendingMerges}
      locale={{ emptyText: '无待裁决的合并候选（M2 提取时由 embedding 相似度 + LLM 判定产生）' }}
      renderItem={(m) => {
        const a = cards.find((c) => c.id === m.cardAId)
        const b = cards.find((c) => c.id === m.cardBId)
        if (!a || !b) return null
        return (
          <List.Item>
            <Card size="small" style={{ width: '100%' }}>
              <Row gutter={16} align="middle">
                <Col span={9}>
                  <Card size="small" title={a.name}>
                    <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>
                      {a.description}
                    </Typography.Paragraph>
                  </Card>
                </Col>
                <Col span={6} style={{ textAlign: 'center' }}>
                  <Progress
                    type="circle"
                    size={64}
                    percent={Math.round(m.similarity * 100)}
                    format={(p) => `${p}%`}
                  />
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      embedding 相似度
                    </Typography.Text>
                  </div>
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" size="small" onClick={() => doMerge(m.id, 'merged')}>
                      确认合并 →
                    </Button>
                    <Button size="small" onClick={() => doMerge(m.id, 'kept')}>
                      保持独立
                    </Button>
                  </Space>
                </Col>
                <Col span={9}>
                  <Card size="small" title={`${b.name}（并入左侧后删除）`}>
                    <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>
                      {b.description}
                    </Typography.Paragraph>
                  </Card>
                </Col>
              </Row>
            </Card>
          </List.Item>
        )
      }}
    />
  )

  return (
    <div data-slot="m2-cards">
      <Tabs
        data-slot="tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'cards' | 'merge')}
        items={[
          { key: 'cards', label: `卡片库（${filtered.length}）`, children: cardsTab },
          {
            key: 'merge',
            label: (
              <Badge count={pendingMerges.length} size="small" offset={[8, 0]}>
                <span>
                  <MergeCellsOutlined /> 合并裁决
                </span>
              </Badge>
            ),
            children: mergeTab,
          },
        ]}
      />

      <Drawer
        title={
          detail && (
            <Space>
              <Tag color={TYPE_META[detail.type].color}>{TYPE_META[detail.type].label}</Tag>
              {detail.name}
            </Space>
          )
        }
        width={560}
        open={!!detail}
        onClose={() => setDetailId(null)}
        extra={
          detail && !editing ? (
            <Button
              onClick={() => {
                editForm.setFieldsValue({
                  name: detail.name,
                  aliases: detail.aliases,
                  description: detail.description,
                  styleNote: detail.styleNote,
                  styleExamples: detail.styleExamples?.join('\n'),
                })
                setEditing(true)
              }}
            >
              编辑
            </Button>
          ) : detail ? (
            <Space>
              <Button type="primary" onClick={saveEdit}>
                保存
              </Button>
              <Button onClick={() => setEditing(false)}>取消</Button>
            </Space>
          ) : null
        }
      >
        {detail && !editing && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: 'aliases', label: '别名', children: detail.aliases.join(' / ') || '—' },
                ...Object.entries(detail.fields).map(([k, v]) => ({ key: k, label: k, children: v })),
              ]}
            />
            <div>
              <Typography.Title level={5}>描述</Typography.Title>
              <Typography.Paragraph>{detail.description}</Typography.Paragraph>
            </div>
            {detail.styleNote && (
              <div>
                <Typography.Title level={5}>语言风格（M3 推演约束）</Typography.Title>
                <Typography.Paragraph>{detail.styleNote}</Typography.Paragraph>
                {detail.styleExamples?.map((ex, i) => (
                  <Typography.Paragraph key={i} style={{ marginBottom: 4 }}>
                    <Tag>例句</Tag> {ex}
                  </Typography.Paragraph>
                ))}
              </div>
            )}
            <div>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  <PictureOutlined /> 图片素材
                </Typography.Title>
                <Button size="small" icon={<ThunderboltOutlined />} onClick={() => setBatchCardId(detail.id)}>
                  批量生成图片
                </Button>
              </Space>
              {(() => {
                const imgs = detail.images ?? []
                if (imgs.length === 0) {
                  return (
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                      暂无图片，点击「批量生成图片」准备表情差分 / 全身形象 / 场景背景等素材。
                    </Typography.Text>
                  )
                }
                const groups = new Map<string, CardImage[]>()
                for (const im of imgs) {
                  const g = im.group || '默认'
                  if (!groups.has(g)) groups.set(g, [])
                  groups.get(g)!.push(im)
                }
                return (
                  <Image.PreviewGroup>
                    <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
                      {[...groups.entries()].map(([g, list]) => (
                        <div key={g}>
                          <Tag color="geekblue">{g}（{list.length}）</Tag>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                              gap: 8,
                              marginTop: 6,
                            }}
                          >
                            {list.map((im) => (
                              <div key={im.id} style={{ position: 'relative' }}>
                                <Tooltip title={im.prompt}>
                                  <Image
                                    src={im.url}
                                    width="100%"
                                    height={110}
                                    style={{ objectFit: 'cover', borderRadius: 6 }}
                                  />
                                </Tooltip>
                                <Space
                                  size={2}
                                  style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.45)', borderRadius: 4 }}
                                >
                                  <Tooltip title="下载">
                                    <Button
                                      size="small"
                                      type="text"
                                      icon={<DownloadOutlined style={{ color: '#fff' }} />}
                                      onClick={() => downloadImage(im.url)}
                                    />
                                  </Tooltip>
                                  <Popconfirm title="删除该图片？" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => handleDeleteImage(detail.id, im.id)}>
                                    <Button size="small" type="text" icon={<DeleteOutlined style={{ color: '#fff' }} />} />
                                  </Popconfirm>
                                </Space>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </Space>
                  </Image.PreviewGroup>
                )
              })()}
            </div>
            <div>
              <Typography.Title level={5}>出处引用（点击回溯原文）</Typography.Title>
              <List
                size="small"
                bordered
                dataSource={detail.refs}
                locale={{ emptyText: '无出处记录' }}
                renderItem={(r) => {
                  const ch = chapters.find((c) => c.id === r.chapterId)
                  return (
                    <List.Item style={{ cursor: 'pointer' }} onClick={() => setRefModal(r)}>
                      <Space direction="vertical" size={0}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {ch ? `${books.find((b) => b.id === ch.bookId)?.title ?? ''} · ${ch.title}` : '（章节不在库中）'}
                        </Typography.Text>
                        <Typography.Text>「{r.excerpt}」</Typography.Text>
                      </Space>
                    </List.Item>
                  )
                }}
              />
            </div>
          </Space>
        )}
        {detail && editing && (
          <Form form={editForm} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="aliases" label="别名">
              <Select mode="tags" placeholder="输入后回车添加" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea autoSize={{ minRows: 4 }} />
            </Form.Item>
            {detail.type === 'character' && (
              <>
                <Form.Item name="styleNote" label="语言风格描述">
                  <Input.TextArea autoSize={{ minRows: 2 }} />
                </Form.Item>
                <Form.Item name="styleExamples" label="台词例句（每行一句）">
                  <Input.TextArea autoSize={{ minRows: 3 }} />
                </Form.Item>
              </>
            )}
          </Form>
        )}
      </Drawer>

      <Modal
        title="原文出处"
        open={!!refModal}
        footer={null}
        onCancel={() => setRefModal(null)}
        width={640}
      >
        {refModal &&
          (() => {
            const ch = chapters.find((c) => c.id === refModal.chapterId)
            if (!ch) return <Typography.Text type="secondary">章节不在库中（可能来自导入会话）</Typography.Text>
            const idx = ch.content.indexOf(refModal.excerpt.replace(/^「|」$/g, ''))
            const center = idx >= 0 ? idx : 0
            const slice = ch.content.slice(Math.max(0, center - 120), center + 240)
            return (
              <div className="prose-view">
                <Typography.Title level={5}>{ch.title}</Typography.Title>
                …{slice}…
              </div>
            )
          })()}
      </Modal>

      <Modal
        title="从章节提取设定"
        open={extractOpen}
        onOk={runExtract}
        confirmLoading={extracting}
        onCancel={() => !extracting && setExtractOpen(false)}
        okText={extracting ? '提取中…' : '开始提取'}
        cancelButtonProps={{ disabled: extracting }}
      >
        <Form form={extractForm} layout="vertical" initialValues={{ bookId: currentBookId }} style={{ marginTop: 8 }}>
          <Form.Item name="bookId" label="选择书籍" rules={[{ required: true }]}>
            <Select
              disabled={extracting}
              options={books.map((b) => ({
                value: b.id,
                label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}·${chapters.filter((c) => c.bookId === b.id).length} 章）`,
              }))}
            />
          </Form.Item>
          {extracting && extractProgress && (
            <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
              <Progress
                percent={Math.round((extractProgress.current / extractProgress.total) * 100)}
                status="active"
              />
              <Typography.Text type="secondary">
                {extractProgress.stage === 'extracting' && `正在分块提取：${extractProgress.current}/${extractProgress.total}`}
                {extractProgress.stage === 'merging' && `正在合并去重：${extractProgress.current}/${extractProgress.total}`}
                {extractProgress.stage === 'embedding' && `正在生成向量：${extractProgress.current}/${extractProgress.total}`}
                {extractProgress.message && ` - ${extractProgress.message}`}
              </Typography.Text>
            </Space>
          )}
          {!extracting && (
            <Typography.Text type="secondary">
              流程：LLM 分块抽取 → 合并去重 → embedding 相似度检测 → 生成卡片（含出处引用）
            </Typography.Text>
          )}
        </Form>
      </Modal>

      {cardEditor && (
        <CardEditorModal
          initialMode={cardEditor.mode}
          books={books}
          providers={providers}
          defaultTextNodeId={defaultTextNodeId}
          defaultBookId={currentBookId || books[0]?.id}
          onClose={() => setCardEditor(null)}
          onSaved={handleCardSaved}
        />
      )}

      {batchCardId && (() => {
        const bc = cards.find((c) => c.id === batchCardId)
        if (!bc) return null
        return (
          <ImageBatchModal
            card={bc}
            providers={providers}
            defaultTextNodeId={defaultTextNodeId}
            defaultImageNodeId={defaultImageNodeId}
            onClose={() => setBatchCardId(null)}
            onSaveImage={(img) => handleSaveImage(bc.id, img)}
          />
        )
      })()}
    </div>
  )
}
