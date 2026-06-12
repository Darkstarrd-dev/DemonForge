import { useMemo, useState } from 'react'
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Form,
  Input,
  List,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useAppStore, genId } from '../../store/appStore'
import { simulateCharacter } from '../../services/api'
import type { SimScene } from '../../services/types'

export default function M3SimulatePage() {
  const { message } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const cards = useAppStore((s) => s.cards)
  const scenes = useAppStore((s) => s.scenes)
  const fragments = useAppStore((s) => s.fragments)
  const setState = useAppStore((s) => s.setState)

  const bookScenes = scenes.filter((sc) => sc.bookId === currentBookId)
  const [sceneId, setSceneId] = useState<string | null>(bookScenes[0]?.id ?? null)
  const [creating, setCreating] = useState(bookScenes.length === 0)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [candidates, setCandidates] = useState<string[]>([])
  const [form] = Form.useForm<Omit<SimScene, 'id' | 'bookId' | 'createdAt'>>()

  const scene = scenes.find((sc) => sc.id === sceneId) ?? null
  const characters = cards.filter((c) => c.bookId === currentBookId && c.type === 'character')
  const target = cards.find((c) => c.id === targetId) ?? null
  const sceneFragments = fragments
    .filter((f) => f.sceneId === sceneId && f.adoptedText)
    .sort((a, b) => a.order - b.order)

  // 上下文召回 mock：场景/目标文本命中非人物卡的名称即召回
  const recalled = useMemo(() => {
    if (!scene) return []
    const text = scene.desc + scene.goal + scene.prevSummary
    const pool = cards.filter((c) => c.bookId === currentBookId && c.type !== 'character')
    const hits = pool.filter((c) => text.includes(c.name) || c.aliases.some((a) => text.includes(a)))
    return hits.length ? hits : pool.slice(0, 2)
  }, [scene, cards, currentBookId])

  const saveScene = async () => {
    const values = await form.validateFields()
    const newScene: SimScene = {
      id: genId('scene'),
      bookId: currentBookId,
      createdAt: new Date().toISOString(),
      ...values,
    }
    setState({ scenes: [...scenes, newScene] })
    setSceneId(newScene.id)
    setCreating(false)
    message.success('场景已保存')
  }

  const run = async () => {
    if (!scene || !target) return
    setGenerating(true)
    setCandidates(['', ''])
    const results = await simulateCharacter(scene, target, (idx, acc) =>
      setCandidates((prev) => prev.map((c, i) => (i === idx ? acc : c))),
    )
    setCandidates(results.map((r) => r.text))
    setGenerating(false)
  }

  const adopt = (text: string) => {
    if (!scene || !target) return
    const maxOrder = Math.max(0, ...fragments.filter((f) => f.sceneId === scene.id).map((f) => f.order))
    setState({
      fragments: [
        ...fragments,
        {
          id: genId('frag'),
          sceneId: scene.id,
          characterId: target.id,
          candidates: candidates.map((c) => ({ id: genId('cand'), text: c })),
          adoptedText: text,
          order: maxOrder + 1,
          createdAt: new Date().toISOString(),
        },
      ],
    })
    setCandidates([])
    message.success(`已采纳「${target.name}」的推演片段，加入场景序列（可换角色继续推演）`)
  }

  const moveFragment = (fragId: string, dir: -1 | 1) => {
    const ordered = [...sceneFragments]
    const idx = ordered.findIndex((f) => f.id === fragId)
    const swap = idx + dir
    if (swap < 0 || swap >= ordered.length) return
    const a = ordered[idx]
    const b = ordered[swap]
    setState({
      fragments: fragments.map((f) =>
        f.id === a.id ? { ...f, order: b.order } : f.id === b.id ? { ...f, order: a.order } : f,
      ),
    })
  }

  return (
    <Row gutter={16}>
      {/* 左：场景设置 */}
      <Col span={8}>
        <Card
          size="small"
          title="场景"
          extra={
            <Space>
              <Select
                size="small"
                style={{ minWidth: 150 }}
                placeholder="选择已有场景"
                value={creating ? undefined : sceneId}
                options={bookScenes.map((sc) => ({ value: sc.id, label: sc.desc.slice(0, 18) + '…' }))}
                onChange={(v) => {
                  setSceneId(v)
                  setCreating(false)
                  setCandidates([])
                }}
              />
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields()
                  setCreating(true)
                }}
              >
                新建
              </Button>
            </Space>
          }
        >
          {creating ? (
            <Form form={form} layout="vertical" size="small">
              <Form.Item name="desc" label="场景描述" rules={[{ required: true }]}>
                <Input.TextArea autoSize={{ minRows: 3 }} placeholder="时间、地点、在场状况……" />
              </Form.Item>
              <Form.Item name="goal" label="本场目标" rules={[{ required: true }]}>
                <Input.TextArea autoSize={{ minRows: 2 }} placeholder="这场戏要达成什么" />
              </Form.Item>
              <Form.Item name="prevSummary" label="前情摘要">
                <Input.TextArea autoSize={{ minRows: 2 }} />
              </Form.Item>
              <Form.Item name="presentCharacterIds" label="在场角色" rules={[{ required: true }]}>
                <Select
                  mode="multiple"
                  options={characters.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="选择在场角色"
                />
              </Form.Item>
              <Button type="primary" onClick={saveScene}>
                保存场景
              </Button>
            </Form>
          ) : scene ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{scene.desc}</Typography.Paragraph>
              <Typography.Text type="secondary">目标：{scene.goal}</Typography.Text>
              <Typography.Text type="secondary">前情：{scene.prevSummary || '—'}</Typography.Text>
              <div>
                在场：
                {scene.presentCharacterIds.map((id) => {
                  const c = cards.find((x) => x.id === id)
                  return c ? (
                    <Tag key={id} color={id === targetId ? 'blue' : 'default'}>
                      {c.name}
                    </Tag>
                  ) : null
                })}
              </div>
            </Space>
          ) : (
            <Empty description="新建一个场景开始推演" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {scene && (
          <Card size="small" title="目标角色（一次只推演一个）" style={{ marginTop: 12 }}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择本次推演的角色"
              value={targetId}
              onChange={(v) => {
                setTargetId(v)
                setCandidates([])
              }}
              options={scene.presentCharacterIds.map((id) => ({
                value: id,
                label: cards.find((c) => c.id === id)?.name ?? id,
              }))}
            />
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              block
              style={{ marginTop: 12 }}
              disabled={!target}
              loading={generating}
              onClick={run}
            >
              {generating ? '推演生成中…' : '生成推演候选（mock 流式）'}
            </Button>
          </Card>
        )}
      </Col>

      {/* 中：上下文组装 + 候选 */}
      <Col span={9}>
        {scene && target ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card size="small" title="上下文组装预览（Context Assembler，M3/M4/M5 共用组件）">
              <Collapse
                size="small"
                items={[
                  {
                    key: 'target',
                    label: (
                      <span>
                        目标角色卡（全量） <Tag color="blue">{target.name}</Tag>
                      </span>
                    ),
                    children: (
                      <Space direction="vertical" size={4}>
                        {Object.entries(target.fields).map(([k, v]) => (
                          <Typography.Text key={k} style={{ fontSize: 13 }}>
                            {k}：{v}
                          </Typography.Text>
                        ))}
                        <Typography.Text style={{ fontSize: 13 }}>{target.description}</Typography.Text>
                        {target.styleNote && (
                          <Typography.Text style={{ fontSize: 13 }}>
                            <Tag color="purple">风格</Tag>
                            {target.styleNote}
                          </Typography.Text>
                        )}
                        {target.styleExamples?.map((ex, i) => (
                          <Typography.Text key={i} type="secondary" style={{ fontSize: 13 }}>
                            例句：{ex}
                          </Typography.Text>
                        ))}
                      </Space>
                    ),
                  },
                  {
                    key: 'others',
                    label: `在场其他角色卡（摘要级）× ${scene.presentCharacterIds.length - 1}`,
                    children: scene.presentCharacterIds
                      .filter((id) => id !== target.id)
                      .map((id) => {
                        const c = cards.find((x) => x.id === id)
                        return c ? (
                          <Typography.Paragraph key={id} style={{ fontSize: 13, marginBottom: 6 }}>
                            <b>{c.name}</b>：{c.description.slice(0, 50)}…
                          </Typography.Paragraph>
                        ) : null
                      }),
                  },
                  {
                    key: 'recall',
                    label: `场景相关设定（向量检索召回，mock）× ${recalled.length}`,
                    children: recalled.map((c) => (
                      <Typography.Paragraph key={c.id} style={{ fontSize: 13, marginBottom: 6 }}>
                        <Tag>{c.type}</Tag>
                        <b>{c.name}</b>：{c.description.slice(0, 44)}…
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          （召回依据：场景文本命中 / 向量相似）
                        </Typography.Text>
                      </Typography.Paragraph>
                    )),
                  },
                  {
                    key: 'prev',
                    label: '前情摘要 + 本场目标',
                    children: (
                      <Typography.Paragraph style={{ fontSize: 13, marginBottom: 0 }}>
                        {scene.prevSummary || '（无前情）'}
                        <br />
                        目标：{scene.goal}
                      </Typography.Paragraph>
                    ),
                  },
                ]}
              />
            </Card>

            {(candidates.length > 0 || generating) && (
              <Card size="small" title="推演候选（人工挑选采纳）">
                <Tabs
                  items={candidates.map((text, i) => ({
                    key: String(i),
                    label: `候选 ${String.fromCharCode(65 + i)}`,
                    children: (
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div
                          className="prose-view"
                          style={{ minHeight: 120, maxHeight: 260, overflow: 'auto', background: '#fafafa', padding: 10, borderRadius: 6 }}
                        >
                          {text || '…'}
                        </div>
                        <Space>
                          <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            disabled={generating}
                            onClick={() => adopt(text)}
                          >
                            采纳此候选
                          </Button>
                          <Button icon={<ReloadOutlined />} disabled={generating} onClick={run}>
                            重新生成
                          </Button>
                        </Space>
                      </Space>
                    ),
                  }))}
                />
              </Card>
            )}
          </Space>
        ) : (
          <Empty description="选择场景与目标角色后，这里展示上下文组装与生成候选" style={{ marginTop: 80 }} />
        )}
      </Col>

      {/* 右：场景序列 */}
      <Col span={7}>
        <Card size="small" title={`场景序列（已采纳片段 × ${sceneFragments.length}，供 M4 章节生成引用）`}>
          <List
            dataSource={sceneFragments}
            locale={{ emptyText: '推演并采纳片段后，在此编排成场景序列' }}
            renderItem={(f, idx) => {
              const c = cards.find((x) => x.id === f.characterId)
              return (
                <List.Item key={f.id} style={{ display: 'block' }}>
                  <Space style={{ marginBottom: 4, width: '100%', justifyContent: 'space-between' }}>
                    <Space size={6}>
                      <Avatar size="small" style={{ background: '#1677ff' }}>
                        {c?.name?.[0]}
                      </Avatar>
                      <Typography.Text strong>{c?.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        #{idx + 1}
                      </Typography.Text>
                    </Space>
                    <Space size={0}>
                      <Button type="text" size="small" icon={<ArrowUpOutlined />} onClick={() => moveFragment(f.id, -1)} />
                      <Button type="text" size="small" icon={<ArrowDownOutlined />} onClick={() => moveFragment(f.id, 1)} />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setState({ fragments: fragments.filter((x) => x.id !== f.id) })}
                      />
                    </Space>
                  </Space>
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
                    style={{ fontSize: 13, marginBottom: 0, whiteSpace: 'pre-wrap' }}
                  >
                    {f.adoptedText}
                  </Typography.Paragraph>
                </List.Item>
              )
            }}
          />
        </Card>
      </Col>
    </Row>
  )
}
