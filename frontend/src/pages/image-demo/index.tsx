import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, App, Button, Card, Col, Collapse, Empty, Image, Input, InputNumber, Popconfirm, Row, Select, Space, Tag, Typography } from 'antd'
import { DownloadOutlined, DeleteOutlined, PictureOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { generateImage } from '../../services/api'
import { genId } from '../../store/appStore'
import type { ProviderNode } from '../../services/types'

// 服务商下拉：当前仅 ModelScope，前向预留多服务商。
const PROVIDERS = [{ value: 'modelscope', label: 'ModelScope' }]

// 常用分辨率预设（ModelScope / Z-Image-Turbo 支持）。值格式 '<width>x<height>'，
// 即 ModelScope payload 的 size 字段（按官方示例首选字符串格式）。
const RESOLUTIONS = [
  { value: '1024x1024', label: '1024×1024（1:1 方形）' },
  { value: '1280x720', label: '1280×720（16:9 横）' },
  { value: '720x1280', label: '720×1280（9:16 竖）' },
  { value: '1024x768', label: '1024×768（4:3）' },
  { value: '768x1024', label: '768×1024（3:4）' },
]

type Phase = 'idle' | 'submitted' | 'polling' | 'done' | 'error'

const PHASE_TEXT: Record<Phase, string> = {
  idle: '',
  submitted: '已提交任务，等待排队…',
  polling: '生成中…',
  done: '生成完成',
  error: '生成失败',
}

export default function ImageDemoPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const providers = useAppStore((s) => s.providers)
  const imageGallery = useAppStore((s) => s.imageGallery)
  const imageDemoForm = useAppStore((s) => s.imageDemoForm)
  const setState = useAppStore((s) => s.setState)
  const addImage = useAppStore((s) => s.addImage)
  const deleteImage = useAppStore((s) => s.deleteImage)

  // 仅展示「文生图」且启用的节点
  const imageNodes = useMemo(
    () => providers.filter((p) => p.nodeType === 'image' && p.enabled),
    [providers],
  )

  // 运行态（仅内存，不持久化）
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusText, setStatusText] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 调试信息：后端实际发给 ModelScope 的 payload + ModelScope 各阶段返回的响应
  const [debugPayload, setDebugPayload] = useState<string>('')
  const [debugResponses, setDebugResponses] = useState<string>('')
  const acRef = useRef<AbortController | null>(null)

  // 卸载时取消进行中的请求
  useEffect(() => () => acRef.current?.abort(), [])

  // 若选中节点已被删除/改为文本类型，则视为未选（派生而非 effect 重置，避免 setState-in-effect）
  const selectedNode: ProviderNode | undefined = imageNodes.find((n) => n.id === imageDemoForm.nodeId)
  const effectiveNodeId = selectedNode ? imageDemoForm.nodeId : undefined
  const isModelScope = imageDemoForm.provider === 'modelscope'

  // 表单 patch 写入 store（持久化）。setFields 会触发 settings 回写的 debounce。
  const setForm = (patch: Partial<typeof imageDemoForm>) =>
    setState({ imageDemoForm: { ...imageDemoForm, ...patch } })

  const handleGenerate = async () => {
    if (!selectedNode) {
      message.warning('请先选择一个文生图节点')
      return
    }
    if (!imageDemoForm.prompt.trim()) {
      message.warning('请输入文生图 prompt')
      return
    }
    // 取消上一次请求（若有）
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    setPhase('idle')
    setStatusText('')
    setPreview(null)
    setError(null)
    setDebugPayload('')
    setDebugResponses('')

    // 仅 ModelScope 透传分辨率 size（resolution 字符串即 ModelScope 的 size 字段）
    const size = isModelScope ? imageDemoForm.resolution : undefined

    try {
      await generateImage(
        {
          baseURL: selectedNode.baseURL,
          apiKey: selectedNode.apiKey,
          model: selectedNode.model,
          prompt: imageDemoForm.prompt.trim(),
          ...(size ? { size } : {}),
          ...(imageDemoForm.negativePrompt?.trim() ? { negativePrompt: imageDemoForm.negativePrompt.trim() } : {}),
          ...(typeof imageDemoForm.steps === 'number' && imageDemoForm.steps > 0 ? { steps: imageDemoForm.steps } : {}),
          ...(typeof imageDemoForm.guidance === 'number' ? { guidance: imageDemoForm.guidance } : {}),
          ...(typeof imageDemoForm.seed === 'number' ? { seed: imageDemoForm.seed } : {}),
        },
        {
          submitted: ({ taskId }) => {
            setPhase('submitted')
            setStatusText(`任务 ${taskId.slice(0, 12)}… 已提交，等待排队`)
          },
          polling: ({ status, attempt }) => {
            setPhase('polling')
            setStatusText(`${status}（第 ${attempt} 次轮询）`)
          },
          done: ({ image: dataUrl }) => {
            setPreview(dataUrl)
            setPhase('done')
            setStatusText('')
            // 落入历史库（持久化到 SQLite image_gallery 表）
            addImage({
              id: genId('img'),
              dataUrl,
              prompt: imageDemoForm.prompt.trim(),
              modelName: selectedNode.model,
              nodeId: selectedNode.id,
              ...(size ? { size } : {}),
              ...(imageDemoForm.negativePrompt?.trim() ? { negativePrompt: imageDemoForm.negativePrompt.trim() } : {}),
              ...(typeof imageDemoForm.steps === 'number' && imageDemoForm.steps > 0 ? { steps: imageDemoForm.steps } : {}),
              ...(typeof imageDemoForm.guidance === 'number' ? { guidance: imageDemoForm.guidance } : {}),
              ...(typeof imageDemoForm.seed === 'number' ? { seed: imageDemoForm.seed } : {}),
              createdAt: new Date().toISOString(),
            })
          },
          debug: ({ stage, payload, response, error: dbgError }) => {
            // payload 仅在 submit/fetchImage 阶段有；展示后端实际发给 ModelScope 的请求体
            if (payload !== undefined) {
              setDebugPayload(JSON.stringify(payload, null, 2))
            }
            // 响应体逐次追加，带时间戳与阶段标记，便于看完整轮询过程
            const ts = new Date().toLocaleTimeString()
            const respBlock = response !== undefined ? JSON.stringify(response, null, 2) : '(无响应体)'
            const errLine = dbgError ? `\n  ⚠ ${dbgError}` : ''
            setDebugResponses((prev) => `${prev}[${ts}] ${stage}${errLine}\n${respBlock}\n\n`)
          },
        },
        ac.signal,
      )
    } catch (e) {
      if (ac.signal.aborted) {
        setPhase('idle')
        setStatusText('')
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase('error')
      setStatusText('')
    } finally {
      if (acRef.current === ac) acRef.current = null
    }
  }

  const handleCancel = () => {
    acRef.current?.abort()
    acRef.current = null
    setPhase('idle')
    setStatusText('')
  }

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${name}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const busy = phase === 'submitted' || phase === 'polling'

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={<Space><PictureOutlined /> 文生图 Demo</Space>}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          选择标记为「文生图」的节点 + 服务商（当前仅 ModelScope），输入 prompt 生成图片。
          文生图节点需在
          <Typography.Link onClick={() => navigate('/settings')}> 系统设置 </Typography.Link>
          中新建并填写 Token、模型（如 Tongyi-MAI/Z-Image-Turbo）、Base URL。
          已选的节点 / Prompt / 分辨率与生成历史会自动保存，切换页面或重启后不丢失。
        </Typography.Paragraph>

        <Row gutter={16}>
          <Col span={8}>
            <Typography.Text type="secondary">服务商</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={imageDemoForm.provider}
              onChange={(v) => setForm({ provider: v })}
              options={PROVIDERS}
            />
          </Col>
          <Col span={isModelScope ? 8 : 16}>
            <Typography.Text type="secondary">
              文生图节点{selectedNode ? `（模型：${selectedNode.model || '—'}）` : ''}
            </Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={effectiveNodeId}
              onChange={(v) => setForm({ nodeId: v })}
              placeholder="选择文生图节点"
              allowClear
              notFoundContent={
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="无可用文生图节点"
                  style={{ margin: '8px 0' }}
                />
              }
              options={imageNodes.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.model || '（未设模型）'}`,
              }))}
            />
          </Col>
          {isModelScope && (
            <Col span={8}>
              <Typography.Text type="secondary">分辨率</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={imageDemoForm.resolution}
                onChange={(v) => setForm({ resolution: v })}
                options={RESOLUTIONS}
              />
            </Col>
          )}
        </Row>

        <div style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">Prompt</Typography.Text>
          <Input.TextArea
            value={imageDemoForm.prompt}
            onChange={(e) => setForm({ prompt: e.target.value })}
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder="描述要生成的图片，如：A golden cat"
            disabled={busy}
            style={{ marginTop: 4 }}
          />
        </div>

        {/* 可选参数（ModelScope）：反向提示词 / 步数 / 引导系数 / 种子。折叠默认展开。 */}
        {isModelScope && (
          <Collapse
            defaultActiveKey={['adv']}
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'adv',
                label: '可选参数（negative_prompt / steps / guidance / seed）',
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                      <Typography.Text type="secondary">反向提示词（negative_prompt）</Typography.Text>
                      <Input.TextArea
                        value={imageDemoForm.negativePrompt ?? ''}
                        onChange={(e) => setForm({ negativePrompt: e.target.value })}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        placeholder="描述要避免的内容，如：lowres, bad anatomy"
                        disabled={busy}
                        style={{ marginTop: 4 }}
                      />
                    </div>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Typography.Text type="secondary">采样步数 steps</Typography.Text>
                        <InputNumber
                          style={{ width: '100%', marginTop: 4 }}
                          min={1}
                          max={100}
                          value={imageDemoForm.steps}
                          onChange={(v) => setForm({ steps: v ?? undefined })}
                          placeholder="如 9（Z-Image-Turbo 默认）"
                          disabled={busy}
                        />
                      </Col>
                      <Col span={8}>
                        <Typography.Text type="secondary">引导系数 guidance</Typography.Text>
                        <InputNumber
                          style={{ width: '100%', marginTop: 4 }}
                          min={0}
                          max={20}
                          step={0.5}
                          value={imageDemoForm.guidance}
                          onChange={(v) => setForm({ guidance: v ?? undefined })}
                          placeholder="如 4.0"
                          disabled={busy}
                        />
                      </Col>
                      <Col span={8}>
                        <Typography.Text type="secondary">随机种子 seed</Typography.Text>
                        <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                          <InputNumber
                            style={{ width: 'calc(100% - 32px)' }}
                            min={0}
                            value={imageDemoForm.seed}
                            onChange={(v) => setForm({ seed: v ?? undefined })}
                            placeholder="留空=随机"
                            disabled={busy}
                          />
                          <Button
                            icon={<ReloadOutlined />}
                            disabled={busy}
                            onClick={() => setForm({ seed: Math.floor(Math.random() * 1_000_000) })}
                            title="随机生成一个种子"
                          />
                        </Space.Compact>
                      </Col>
                    </Row>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      以上参数留空则不发送，由 ModelScope 使用模型默认值。参数会随表单自动保存。
                    </Typography.Text>
                  </Space>
                ),
              },
            ]}
          />
        )}

        <Space style={{ marginTop: 16 }}>
          {busy ? (
            <Button danger onClick={handleCancel}>
              取消
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PictureOutlined />}
              onClick={handleGenerate}
              disabled={!selectedNode || !imageDemoForm.prompt.trim()}
            >
              生成
            </Button>
          )}
          {busy && (
            <Tag color="processing" style={{ marginLeft: 8 }}>
              {PHASE_TEXT[phase]} {statusText && <span style={{ opacity: 0.8 }}>· {statusText}</span>}
            </Tag>
          )}
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="生成失败"
          description={error}
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* 本次生成的即时预览（运行中） */}
      {(busy || preview) && (
        <Card title="本次生成">
          {preview ? (
            <img
              src={preview}
              alt="生成结果"
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block' }}
            />
          ) : (
            <Empty description={PHASE_TEXT[phase]} />
          )}
        </Card>
      )}

      {/* 调试信息：后端实际发给 ModelScope 的 payload + ModelScope 各阶段返回的响应。
          排障核心——出错时可直接看到 HTTP 错误码与服务端原始响应体。 */}
      {(debugPayload || debugResponses || busy) && (
        <Card
          title="调试信息"
          extra={
            (debugPayload || debugResponses) && (
              <Button size="small" onClick={() => { setDebugPayload(''); setDebugResponses('') }}>
                清空
              </Button>
            )
          }
        >
          <Row gutter={16}>
            <Col span={12}>
              <Typography.Text type="secondary">后端发送的 Payload（发给 ModelScope）</Typography.Text>
              <Input.TextArea
                value={debugPayload}
                readOnly
                autoSize={{ minRows: 8, maxRows: 20 }}
                placeholder="点击「生成」后这里显示后端实际发给 ModelScope 的 JSON payload"
                style={{ marginTop: 4, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              />
            </Col>
            <Col span={12}>
              <Typography.Text type="secondary">ModelScope 返回的响应（提交 + 轮询追加）</Typography.Text>
              <Input.TextArea
                value={debugResponses}
                readOnly
                autoSize={{ minRows: 8, maxRows: 20 }}
                placeholder="点击「生成」后这里按时间顺序追加 ModelScope 的返回响应（task_id、轮询状态、图片 URL 等）"
                style={{ marginTop: 4, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 历史图片（持久化，可逐张删除） */}
      <Card
        title={`生成历史（${imageGallery.length}）`}
        extra={
          imageGallery.length > 0 && (
            <Popconfirm
              title="清空全部历史"
              description="将删除全部生成图片，此操作不可撤销。"
              okText="清空"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => imageGallery.forEach((i) => deleteImage(i.id))}
            >
              <Button danger icon={<DeleteOutlined />}>
                清空全部
              </Button>
            </Popconfirm>
          )
        }
      >
        {imageGallery.length === 0 ? (
          <Empty description="尚未生成图片" />
        ) : (
          <Row gutter={[16, 16]}>
            {imageGallery.map((img) => {
              const resLabel = img.size
                ? img.size
                : img.width && img.height
                  ? `${img.width}×${img.height}`
                  : '默认尺寸'
              return (
                <Col key={img.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    size="small"
                    cover={<Image src={img.dataUrl} alt={img.prompt} style={{ objectFit: 'contain', maxHeight: 280, background: '#fafafa' }} />}
                    actions={[
                      <Button
                        key="download"
                        type="text"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => downloadImage(img.dataUrl, `image-demo-${img.id}`)}
                      />,
                      <Popconfirm
                        key="delete"
                        title="删除这张图片？"
                        okText="删除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() => deleteImage(img.id)}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]}
                  >
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2, tooltip: img.prompt }}
                      style={{ marginBottom: 4, fontSize: 12 }}
                    >
                      {img.prompt}
                    </Typography.Paragraph>
                    <Space size={4} wrap>
                      <Tag style={{ marginRight: 0 }}>{resLabel}</Tag>
                      <Tag color="blue" style={{ marginRight: 0 }}>{img.modelName}</Tag>
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </Card>
    </Space>
  )
}
