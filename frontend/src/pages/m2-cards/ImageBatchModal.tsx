// M2 设定卡片 · 批量生图队列（暂存区模型）。
// 步骤 1：文本节点出一组提示词（可编辑）→ 步骤 2：图片节点并发生图 → 队列里看大图/保存/删除/重试。
// 「保存」=采纳进卡片相册（立即落库）；「删除」=从队列丢弃；关闭时未保存的图自动丢弃（归档文件留盘）。
import { useEffect, useRef, useState } from 'react'
import { App, Button, Image, Input, InputNumber, Modal, Select, Space, Spin, Tag, Tooltip, Typography, Upload } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  CheckCircleTwoTone,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { CardImage, EntityCard, ProviderNode } from '../../services/types'
import { generateCardImagePrompts, generateOneCardImage, runImageBatch } from '../../services/api'
import { NodePickerButton } from '../../components/node-picker/NodePickerButton'
import { PromptEditorButton } from '../../components/PromptEditorButton'
import { useModuleNode } from '../../hooks/useModuleNode'
import type { CardImageParams, BatchItemStatus } from '../../services/api'
import { genId, useAppStore } from '../../store/appStore'

interface QItem {
  id: string
  label: string
  prompt: string
  status: BatchItemStatus
  url?: string
  error?: string
  saved?: boolean
}

interface Props {
  card: EntityCard
  providers: ProviderNode[]
  defaultTextNodeId?: string
  defaultImageNodeId?: string
  onClose: () => void
  /** 保存单张图到卡片相册（立即落库由父组件处理）。 */
  onSaveImage: (img: CardImage) => void
}

const GROUP_PRESETS = ['表情差分', '全身形象', '场景背景', '服饰差分', '其他']

export default function ImageBatchModal({
  card,
  providers,
  onClose,
  onSaveImage,
}: Props) {
  const { message } = App.useApp()

  const [textNodeId, setTextNodeId] = useState('')
  const [imageNodeId, setImageNodeId] = useState('')
  // 实际生效节点：未手动选则走 moduleMapping 默认（需求7：默认显示默认）
  const { nodeId: resolvedTextNodeId } = useModuleNode('m2Extract', 'text', textNodeId || undefined)
  const { nodeId: resolvedImageNodeId } = useModuleNode('m2CardImage', 'image', imageNodeId || undefined)
  const [intent, setIntent] = useState('')
  const [group, setGroup] = useState<string>('表情差分')
  const [count, setCount] = useState(6)
  const [concurrency, setConcurrency] = useState(2)

  // 生图参数（按协议）
  const [size, setSize] = useState('1024x1024')
  const [xaiAspectRatio, setXaiAspectRatio] = useState('1:1')
  const [xaiResolution, setXaiResolution] = useState('2k')

  const [items, setItems] = useState<QItem[]>([])
  const [phase, setPhase] = useState<'prompts' | 'running'>('prompts')
  const [promptLoading, setPromptLoading] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  const acRef = useRef<AbortController | null>(null)

  // 卸载清理：父组件非 onCancel 路径卸载（如切走路由）时中止在途批量生图，避免向已卸载组件 setState。
  useEffect(() => () => acRef.current?.abort(), [])

  // 参考图（角色一致化）：可从本卡相册勾选 + 本地上传，传给生图 imageInputs
  const albumImages = card.images ?? []
  const [refImages, setRefImages] = useState<string[]>([])
  const uploadedRefs = refImages.filter((u) => !albumImages.some((im) => im.url === u))
  const toggleRef = (url: string) =>
    setRefImages((arr) => (arr.includes(url) ? arr.filter((u) => u !== url) : [...arr, url]))
  const handleUploadRef = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setRefImages((arr) => [...arr, reader.result as string])
    reader.onerror = () => message.error('图片读取失败')
    reader.readAsDataURL(file)
    return false // 阻止 antd 自动上传
  }

  const imageNode = providers.find((p) => p.id === resolvedImageNodeId)
  const protocol = imageNode?.protocol ?? 'modelscope'

  const buildParams = (): CardImageParams => ({
    size,
    xaiAspectRatio,
    xaiResolution,
    ...(refImages.length ? { imageInputs: refImages } : {}),
  })

  const patchItem = (idx: number, patch: Partial<QItem>) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  // ===== 步骤 1：生成提示词 =====
  const genPrompts = async () => {
    if (!intent.trim()) {
      message.warning('请填写用途/意图，例如「6 个表情差分」')
      return
    }
    const node = providers.find((p) => p.id === resolvedTextNodeId)
    if (!node) {
      message.warning('请选择文本节点')
      return
    }
    setPromptLoading(true)
    try {
      const cardDesc = `${card.name}（${card.type}）：${card.description}\n${Object.entries(card.fields)
        .map(([k, v]) => `${k}：${v}`)
        .join('；')}`
      const prompts = await generateCardImagePrompts(node, {
        cardDescription: cardDesc,
        intent: intent.trim(),
        count,
        ...(useAppStore.getState().promptOverrides['m2-card-image-prompts']
          ? { systemPrompt: useAppStore.getState().promptOverrides['m2-card-image-prompts'] }
          : {}),
      })
      if (prompts.length === 0) {
        message.warning('未生成到提示词，请调整意图后重试')
        return
      }
      setItems(
        prompts.map((p) => ({ id: genId('qi'), label: p.label, prompt: p.prompt, status: 'pending' as const })),
      )
      message.success(`已生成 ${prompts.length} 条提示词，可编辑后开始生成`)
    } catch (e) {
      message.error(`提示词生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPromptLoading(false)
    }
  }

  // ===== 步骤 2：批量生图 =====
  const startBatch = async () => {
    if (!imageNode) {
      message.warning('请选择图片节点')
      return
    }
    const valid = items.filter((it) => it.prompt.trim())
    if (valid.length === 0) {
      message.warning('没有可用的提示词')
      return
    }
    setPhase('running')
    setBatchRunning(true)
    setItems((arr) => arr.map((it) => ({ ...it, status: 'pending', url: undefined, error: undefined, saved: false })))
    const ac = new AbortController()
    acRef.current = ac
    try {
      await runImageBatch(
        imageNode,
        items.map((it) => it.prompt),
        {
          concurrency,
          params: buildParams(),
          onUpdate: ({ index, status, url, error }) => patchItem(index, { status, url, error }),
        },
        ac.signal,
      )
    } finally {
      setBatchRunning(false)
      acRef.current = null
    }
  }

  // 单项重试
  const retryItem = async (idx: number) => {
    if (!imageNode) return
    const it = items[idx]
    if (!it) return
    patchItem(idx, { status: 'generating', error: undefined })
    try {
      const url = await generateOneCardImage(imageNode, it.prompt, buildParams())
      patchItem(idx, { status: 'done', url, saved: false })
    } catch (e) {
      patchItem(idx, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }

  // 保存单项到卡片
  const saveItem = (idx: number) => {
    const it = items[idx]
    if (!it?.url) return
    const img: CardImage = {
      id: genId('img'),
      url: it.url,
      prompt: it.prompt,
      group: group.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    onSaveImage(img)
    patchItem(idx, { saved: true })
    message.success(`已保存到「${group || '默认'}」分组`)
  }

  const removeItem = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx))

  const handleClose = () => {
    acRef.current?.abort()
    onClose()
  }

  return (
    <Modal
      title={`批量生成图片 · ${card.name}`}
      open
      width={920}
      onCancel={handleClose}
      footer={[
        <Button key="close" onClick={handleClose}>
          关闭
        </Button>,
      ]}
    >
      <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
        {/* 配置区 */}
        <Space wrap>
          <span>
            文本节点：
            <NodePickerButton
              moduleKey="m2Extract"
              kind="text"
              value={textNodeId || undefined}
              onChange={setTextNodeId}
              style={{ width: 200, marginLeft: 4, verticalAlign: 'middle' }}
            />
          </span>
          <span>
            图片节点：
            <NodePickerButton
              moduleKey="m2CardImage"
              kind="image"
              value={imageNodeId || undefined}
              onChange={setImageNodeId}
              style={{ width: 220, marginLeft: 4, verticalAlign: 'middle' }}
            />
          </span>
          <PromptEditorButton promptKey="m2-card-image-prompts" label="编辑提示词提示词" />
        </Space>

        <Space wrap>
          <span>
            用途/意图：
            <Input
              size="small"
              style={{ width: 260, marginLeft: 4 }}
              placeholder="如：6 个表情差分 / 不同角度全身像"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
          </span>
          <span>
            分组：
            <Select
              size="small"
              style={{ width: 150, marginLeft: 4 }}
              value={group}
              onChange={setGroup}
              options={GROUP_PRESETS.map((g) => ({ value: g, label: g }))}
            />
          </span>
          <span>
            数量：
            <InputNumber size="small" min={1} max={30} value={count} onChange={(v) => setCount(v ?? 6)} style={{ marginLeft: 4 }} />
          </span>
          <span>
            并发：
            <InputNumber size="small" min={1} max={8} value={concurrency} onChange={(v) => setConcurrency(v ?? 2)} style={{ marginLeft: 4 }} />
          </span>
        </Space>

        {/* 生图参数（按协议） */}
        <Space wrap>
          {protocol === 'xai' ? (
            <>
              <span>
                比例：
                <Select
                  size="small"
                  style={{ width: 100, marginLeft: 4 }}
                  value={xaiAspectRatio}
                  onChange={setXaiAspectRatio}
                  options={['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4'].map((v) => ({ value: v, label: v }))}
                />
              </span>
              <span>
                分辨率：
                <Select
                  size="small"
                  style={{ width: 90, marginLeft: 4 }}
                  value={xaiResolution}
                  onChange={setXaiResolution}
                  options={['1k', '2k', '4k'].map((v) => ({ value: v, label: v }))}
                />
              </span>
            </>
          ) : (
            <span>
              尺寸：
              <Select
                size="small"
                style={{ width: 150, marginLeft: 4 }}
                value={size}
                onChange={setSize}
                options={['1024x1024', '1024x1536', '1536x1024', '768x1024', '1024x768'].map((v) => ({ value: v, label: v }))}
              />
            </span>
          )}
          <Button
            type="primary"
            ghost
            size="small"
            icon={<ThunderboltOutlined />}
            loading={promptLoading}
            onClick={genPrompts}
          >
            生成提示词
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={batchRunning}
            disabled={items.length === 0}
            onClick={startBatch}
          >
            开始生成（{items.length}）
          </Button>
        </Space>

        {/* 参考图（角色一致化） */}
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            参考图（角色一致化，可选；按协议走图生图/edits，GPT 走 /images/edits）：已选 {refImages.length}
          </Typography.Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' }}>
            {albumImages.map((im) => (
              <div
                key={im.id}
                onClick={() => toggleRef(im.url)}
                title={im.prompt}
                style={{
                  cursor: 'pointer',
                  width: 56,
                  height: 56,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: refImages.includes(im.url) ? '2px solid #1677ff' : '1px solid var(--ant-color-border, #d9d9d9)',
                }}
              >
                <img src={im.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
            {uploadedRefs.map((url) => (
              <div
                key={url}
                style={{ position: 'relative', width: 56, height: 56, borderRadius: 6, overflow: 'hidden', border: '2px solid #1677ff' }}
              >
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined style={{ color: '#fff' }} />}
                  onClick={() => toggleRef(url)}
                  style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.45)' }}
                />
              </div>
            ))}
            <Upload accept="image/*" multiple beforeUpload={handleUploadRef} showUploadList={false}>
              <Button size="small" icon={<PlusOutlined />}>上传</Button>
            </Upload>
          </div>
        </div>

        {/* 队列 */}
        <Spin spinning={promptLoading} tip="生成提示词中…">
          {items.length === 0 ? (
            <Typography.Text type="secondary">先「生成提示词」，或手动添加提示词后开始生成。</Typography.Text>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  style={{ border: '1px solid var(--ant-color-border, #eee)', borderRadius: 8, padding: 8, position: 'relative' }}
                >
                  <Space size={4} style={{ marginBottom: 4 }}>
                    <Tag color="geekblue" style={{ margin: 0 }}>{it.label || `#${idx + 1}`}</Tag>
                    {it.saved && <CheckCircleTwoTone twoToneColor="#52c41a" />}
                  </Space>
                  {/* 缩略图 / 状态 */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      background: 'rgba(127,127,127,0.08)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      marginBottom: 6,
                    }}
                  >
                    {it.status === 'done' && it.url ? (
                      <Image src={it.url} width="100%" height="100%" style={{ objectFit: 'contain' }} />
                    ) : it.status === 'generating' ? (
                      <Spin />
                    ) : it.status === 'failed' ? (
                      <Tooltip title={it.error}>
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>生成失败</Typography.Text>
                      </Tooltip>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>待生成</Typography.Text>
                    )}
                  </div>
                  {/* 提示词（编辑 / 展示） */}
                  {phase === 'prompts' ? (
                    <Input.TextArea
                      size="small"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      value={it.prompt}
                      onChange={(e) => patchItem(idx, { prompt: e.target.value })}
                    />
                  ) : (
                    <Tooltip title={it.prompt}>
                      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 12, marginBottom: 4 }}>
                        {it.prompt}
                      </Typography.Paragraph>
                    </Tooltip>
                  )}
                  {/* 操作 */}
                  <Space size={2} style={{ marginTop: 4 }}>
                    {it.status === 'done' && (
                      <Tooltip title="保存到卡片">
                        <Button size="small" type="text" icon={<SaveOutlined />} disabled={it.saved} onClick={() => saveItem(idx)} />
                      </Tooltip>
                    )}
                    {phase === 'running' && it.status !== 'generating' && (
                      <Tooltip title="重试">
                        <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryItem(idx)} />
                      </Tooltip>
                    )}
                    <Tooltip title="从队列删除">
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(idx)} />
                    </Tooltip>
                  </Space>
                </div>
              ))}
              {phase === 'prompts' && (
                <Button
                  type="dashed"
                  style={{ height: 'auto', minHeight: 120 }}
                  icon={<PlusOutlined />}
                  onClick={() => setItems((arr) => [...arr, { id: genId('qi'), label: '', prompt: '', status: 'pending' }])}
                >
                  添加提示词
                </Button>
              )}
            </div>
          )}
        </Spin>
      </Space>
    </Modal>
  )
}
