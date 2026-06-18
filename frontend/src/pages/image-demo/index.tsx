import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, App, Button, Card, Col, Empty, Input, Row, Select, Space, Tag, Typography } from 'antd'
import { DownloadOutlined, PictureOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { generateImage } from '../../services/api'
import type { ProviderNode } from '../../services/types'

// 服务商下拉：当前仅 ModelScope，前向预留多服务商。
const PROVIDERS = [{ value: 'modelscope', label: 'ModelScope' }]

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

  // 仅展示「文生图」且启用的节点
  const imageNodes = useMemo(
    () => providers.filter((p) => p.nodeType === 'image' && p.enabled),
    [providers],
  )

  const [provider, setProvider] = useState<string>('modelscope')
  const [nodeId, setNodeId] = useState<string | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusText, setStatusText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const acRef = useRef<AbortController | null>(null)

  // 卸载时取消进行中的请求
  useEffect(() => () => acRef.current?.abort(), [])

  // 若选中节点已被删除/改为文本类型，则视为未选（派生而非 effect 重置，避免 setState-in-effect）
  const selectedNode: ProviderNode | undefined = imageNodes.find((n) => n.id === nodeId)
  const effectiveNodeId = selectedNode ? nodeId : undefined

  const handleGenerate = async () => {
    if (!selectedNode) {
      message.warning('请先选择一个文生图节点')
      return
    }
    if (!prompt.trim()) {
      message.warning('请输入文生图 prompt')
      return
    }
    // 取消上一次请求（若有）
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    setPhase('idle')
    setStatusText('')
    setImage(null)
    setError(null)

    try {
      await generateImage(
        {
          baseURL: selectedNode.baseURL,
          apiKey: selectedNode.apiKey,
          model: selectedNode.model,
          prompt: prompt.trim(),
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
            setImage(dataUrl)
            setPhase('done')
            setStatusText('')
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

  const handleDownload = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image
    a.download = `image-demo-${Date.now()}.jpg`
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
        </Typography.Paragraph>

        <Row gutter={16}>
          <Col span={8}>
            <Typography.Text type="secondary">服务商</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={provider}
              onChange={setProvider}
              options={PROVIDERS}
            />
          </Col>
          <Col span={16}>
            <Typography.Text type="secondary">
              文生图节点{selectedNode ? `（模型：${selectedNode.model || '—'}）` : ''}
            </Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={effectiveNodeId}
              onChange={setNodeId}
              placeholder="选择文生图节点"
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
        </Row>

        <div style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">Prompt</Typography.Text>
          <Input.TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder="描述要生成的图片，如：A golden cat"
            disabled={busy}
            style={{ marginTop: 4 }}
          />
        </div>

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
              disabled={!selectedNode || !prompt.trim()}
              loading={false}
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

      <Card title="结果" extra={image && <Button icon={<DownloadOutlined />} onClick={handleDownload}>下载</Button>}>
        {image ? (
          <img
            src={image}
            alt="生成结果"
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block' }}
          />
        ) : (
          <Empty description={busy ? PHASE_TEXT[phase] : '尚未生成图片'} />
        )}
      </Card>
    </Space>
  )
}
